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
import EventFeed from "../components/EventFeed";
import CameraWorkspace from "../components/operator/CameraWorkspace";
import GateStatusDock from "../components/operator/GateStatusDock";
import QuickActions from "../components/operator/QuickActions";
import UpdateButton from "../components/UpdateButton";
import SettingsModal from "../components/operator/SettingsModal";
import { Settings } from "lucide-react";

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
  const [barrierGateId, setBarrierGateId] = useState<string | null>(null);
  const [selectedCameraId, setSelectedCameraId] = useState<string | undefined>();
  const [isEventsOpen, setIsEventsOpen] = useState(false);
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
  const primaryGate = s?.gates[0];
  const workspaceCameras = primaryGate ? cfg?.gates.find((gate) => gate.gateId === primaryGate.gateId)?.cameras ?? [] : [];

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
            onClick={() =>
              act(
                () =>
                  resync().then(async (m) => {
                    // Re-read config so gate/camera bindings changed on the
                    // server show up without restarting the kiosk app.
                    setCfg(await getConfig());
                    return m;
                  }),
                "Đồng bộ xong"
              )
            }
            className="rounded-md border border-zinc-700 px-2 py-1 text-xs hover:bg-zinc-800"
          >
            Đồng bộ lại
          </button>
          <UpdateButton notify={notify} />
          {cfg && primaryGate && <button type="button" aria-label="Cài đặt" title="Cài đặt" onClick={() => setBarrierGateId(primaryGate.gateId)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-zinc-700 hover:bg-zinc-800"><Settings className="size-4" /></button>}
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

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <CameraWorkspace cameras={workspaceCameras} camLive={cameras} selectedCameraId={selectedCameraId} onSelectCamera={setSelectedCameraId} />
        <GateStatusDock gates={s?.gates ?? []} />
        {primaryGate && <QuickActions gate={primaryGate} onAction={act} />}
        <button type="button" aria-label="Mở sự kiện ra vào" onClick={() => setIsEventsOpen(true)} className="min-h-11 rounded-lg border border-zinc-700 px-3 text-sm hover:bg-zinc-800">Sự kiện ra/vào ({events.length})</button>
      </div>
      {isEventsOpen && <aside className="fixed inset-y-0 right-0 z-30 flex w-96 max-w-full flex-col border-l border-zinc-800 bg-zinc-950 p-4 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-zinc-300">Sự kiện ra/vào</h2><button type="button" aria-label="Đóng sự kiện" onClick={() => setIsEventsOpen(false)} className="min-h-11 min-w-11 rounded-lg hover:bg-zinc-800">✕</button></div><div className="min-h-0 flex-1 overflow-y-auto pr-1"><EventFeed events={events} gates={s?.gates ?? []} /></div></aside>}

      {cfg && barrierGateId && (
        <SettingsModal
          cfg={cfg}
          gate={cfg.gates.find((g) => g.gateId === barrierGateId)!}
          mqttConnected={s?.mqttConnected ?? false}
          lastSyncAt={s?.lastSyncAt ?? null}
          onSaved={setCfg}
          onClose={() => setBarrierGateId(null)}
          onResync={() => act(() => resync().then(async (m) => { setCfg(await getConfig()); return m; }), "Đồng bộ xong")}
          onLock={() => lockNow().then(() => onLocked?.()).catch((e) => notify(`Lỗi: ${e}`))}
          notify={notify}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 rounded-lg bg-zinc-800 px-4 py-2 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
