import { useCallback, useEffect, useRef, useState } from "react";
import {
  getStatus,
  manualClose,
  manualLock,
  manualOpen,
  manualPlate,
  manualUnlock,
  onEvent,
  onStatus,
  resync,
  type AccessEvent,
  type EdgeStatus,
} from "../lib/tauri";
import GateStateBadge from "../components/GateStateBadge";
import EventFeed from "../components/EventFeed";

export default function OperatorScreen() {
  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    getStatus().then((s) => s && setStatus(s));
    const un1 = onStatus(setStatus);
    const un2 = onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, 100)));
    const poll = setInterval(() => {
      getStatus().then((s) => s && setStatus(s));
    }, 2000);
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      clearInterval(poll);
    };
  }, []);

  const act = (fn: () => Promise<unknown>, ok: string) => {
    fn()
      .then(() => notify(ok))
      .catch((e) => notify(`Lỗi: ${e}`));
  };

  const enterPlate = () => {
    const p = window.prompt("Nhập biển số (vd: 30E-892.41)");
    if (p?.trim()) act(() => manualPlate(p.trim()), `Đã gửi biển ${p.trim()}`);
  };

  const s = status;
  const isLocked = s?.gateState === "locked";
  const isFault = s?.gateState === "fault";

  return (
    <main className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <h1 className="text-lg font-bold">ParkVision Edge</h1>
        <div className="flex items-center gap-4 text-sm">
          <span
            className={`rounded-full px-3 py-1 font-semibold ${
              s?.mqttConnected
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-amber-500/20 text-amber-400"
            }`}
          >
            {s?.mqttConnected ? "Trực tuyến" : "Ngoại tuyến"}
          </span>
          <span className="text-zinc-400">
            Whitelist: <b className="text-zinc-200">{s?.whitelistCount ?? "…"}</b>
          </span>
          <span className="text-zinc-400">
            Hàng chờ: <b className="text-zinc-200">{s?.outboxDepth ?? "…"}</b>
          </span>
          <span className="text-xs text-zinc-500">
            Đồng bộ:{" "}
            {s?.lastSyncAt ? new Date(s.lastSyncAt).toLocaleTimeString("vi-VN") : "—"}
          </span>
        </div>
      </header>

      <div className="flex flex-1 gap-6 p-6">
        {/* Gate status */}
        <section className="flex flex-1 flex-col items-center justify-center gap-6 rounded-xl border border-zinc-800 bg-zinc-900/40">
          {s && <GateStateBadge state={s.gateState} />}

          {/* Arm visual — rotated bar pivots at left */}
          <div className="relative h-40 w-64">
            <div className="absolute bottom-8 left-2 h-16 w-4 rounded bg-zinc-600" />
            <div
              className="absolute bottom-24 left-4 h-3 w-48 origin-left rounded bg-gradient-to-r from-red-500 via-zinc-100 to-red-500 transition-transform duration-500"
              style={{ transform: `rotate(-${s?.armAngleDeg ?? 0}deg)` }}
            />
          </div>

          <div className="grid grid-cols-3 gap-6 text-center text-sm">
            <div>
              <div className="text-2xl font-bold">{s?.armAngleDeg ?? 0}°</div>
              <div className="text-zinc-500">Góc cánh</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{s?.motorTempC?.toFixed(1) ?? "—"}°C</div>
              <div className="text-zinc-500">Nhiệt độ motor</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{s?.upsBattery ?? "—"}%</div>
              <div className="text-zinc-500">UPS</div>
            </div>
          </div>

          <div
            className={`rounded-full px-4 py-1 text-sm font-medium ${
              s?.loopActive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
            }`}
          >
            Vòng từ: {s?.loopActive ? "Có xe" : "Trống"}
          </div>
        </section>

        {/* Right column */}
        <aside className="flex w-[26rem] flex-col gap-4">
          {s?.lastPlate && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="text-xs text-zinc-500">Biển số gần nhất</div>
              <div className="mt-1 flex items-center justify-between">
                <span className="font-mono text-2xl font-bold tracking-wider">{s.lastPlate}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    s.lastDecision === "allow"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {s.lastDecision === "allow" ? "Cho phép" : s.lastReason ?? "Từ chối"}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1">
            <h2 className="mb-2 text-sm font-semibold text-zinc-400">Sự kiện ra/vào</h2>
            <EventFeed events={events} />
          </div>

          {/* Controls — manual ops must work offline per spec §6.4 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => act(manualOpen, "Mở barrier")}
              disabled={isLocked || isFault}
              className="rounded-lg bg-emerald-600 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-40"
            >
              Mở cần
            </button>
            <button
              onClick={() => act(manualClose, "Đóng barrier")}
              disabled={isLocked || isFault}
              className="rounded-lg bg-zinc-700 py-3 font-semibold hover:bg-zinc-600 disabled:opacity-40"
            >
              Đóng cần
            </button>
            <button
              onClick={enterPlate}
              className="rounded-lg border border-zinc-700 py-2 text-sm hover:bg-zinc-800"
            >
              Nhập biển số
            </button>
            <button
              onClick={() => act(() => resync().then((m) => notify(m)), "Đồng bộ xong")}
              className="rounded-lg border border-zinc-700 py-2 text-sm hover:bg-zinc-800"
            >
              Đồng bộ lại
            </button>
            <button
              onClick={() => act(isLocked ? manualUnlock : manualLock, isLocked ? "Đã mở khóa" : "Đã khóa")}
              className={`col-span-2 rounded-lg py-2 text-sm font-medium ${
                isLocked ? "bg-orange-600 hover:bg-orange-500" : "border border-orange-700/50 text-orange-400 hover:bg-orange-950"
              }`}
            >
              {isLocked ? "Mở khóa barrier" : "Khóa barrier"}
            </button>
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
