import { useCallback, useEffect, useRef, useState } from "react";
import {
  getConfig,
  getStatus,
  lockNow,
  lockStatus,
  onCamera,
  onEvent,
  onStatus,
  resync,
  type AccessEvent,
  type EdgeConfig,
  type EdgeStatus,
  type LockStatus,
} from "../lib/tauri";
import GatePanel from "../components/GatePanel";
import EventFeed from "../components/EventFeed";

export default function OperatorScreen({ onLocked }: { onLocked?: () => void }) {
  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [cfg, setCfg] = useState<EdgeConfig | null>(null);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [lock, setLock] = useState<LockStatus | null>(null);
  // cameraId → latest preview JPEG (b64) + worker/stream state
  const [cameras, setCameras] = useState<
    Record<string, { jpeg?: string; state?: string; detail?: string }>
  >({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const notify = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    getStatus().then((s) => s && setStatus(s));
    getConfig().then(setCfg).catch(() => {});
    lockStatus().then(setLock).catch(() => {});
    const un1 = onStatus(setStatus);
    const un2 = onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, 100)));
    const un3 = onCamera((e) =>
      setCameras((prev) => {
        const cur = prev[e.cameraId] ?? {};
        return {
          ...prev,
          [e.cameraId]:
            e.type === "camera.preview"
              ? { ...cur, jpeg: e.jpeg, state: "live" }
              : { ...cur, state: e.state, detail: e.detail },
        };
      })
    );
    const poll = setInterval(() => {
      getStatus().then((s) => s && setStatus(s));
    }, 2000);
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      clearInterval(poll);
    };
  }, []);

  const act = (fn: () => Promise<unknown>, ok: string) => {
    fn()
      .then(() => notify(ok))
      .catch((e) => notify(`Lỗi: ${e}`));
  };

  const s = status;

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
          <button
            onClick={() => act(() => resync().then((m) => notify(m)), "Đồng bộ xong")}
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          >
            Đồng bộ lại
          </button>
          {lock?.enabled && (
            <button
              onClick={() => {
                lockNow()
                  .then(() => onLocked?.())
                  .catch((e) => notify(`Lỗi: ${e}`));
              }}
              className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
            >
              Khoá màn hình
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 gap-6 p-6">
        {/* One panel per configured gate — entry/exit run side by side */}
        <div className="flex flex-1 gap-6">
          {(s?.gates ?? []).map((g) => (
            <GatePanel
              key={g.gateId}
              gate={g}
              cameras={
                cfg?.gates.find((b) => b.gateId === g.gateId)?.cameras ?? []
              }
              camLive={cameras}
              onAction={act}
            />
          ))}
          {s && s.gates.length === 0 && (
            <div className="flex flex-1 items-center justify-center rounded-xl border border-zinc-800 text-zinc-500">
              Thiết bị chưa được gán cổng nào.
            </div>
          )}
        </div>

        {/* Right column — recent scans */}
        <aside className="flex w-[24rem] flex-col">
          <h2 className="mb-2 text-sm font-semibold text-zinc-400">
            Sự kiện ra/vào <span className="text-zinc-600">({events.length})</span>
          </h2>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <EventFeed events={events} gates={s?.gates ?? []} />
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
