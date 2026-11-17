import { useEffect, useState } from "react";
import {
  barrierProbe,
  barrierTestOutput,
  listSerialPorts,
  manualLock,
  manualUnlock,
  saveConfig,
  type BarrierConfig,
  type EdgeConfig,
  type GateBinding,
  type GateStatus,
  type RelayBackendConfig,
} from "../../lib/tauri";
import type { CamLiveInfo } from "../../lib/useEdgeData";
import { barrierStateText, type GateLabel } from "../../lib/labels";
import { DirectionBadge } from "../ui/DirectionBadge";
import BarrierSettingsScreen from "../../screens/BarrierSettingsScreen";

const BRAND_LABEL: Record<string, string> = {
  bisen: "Bisen",
  faac: "FAAC",
  came: "CAME",
  mag: "MAG",
  zkteco: "ZKTeco",
  wonsun: "Wonsun",
  generic: "Generic (khô tiếp điểm)",
};

const PURPOSE_LABEL: Record<string, string> = {
  plate: "Đọc biển số",
  monitor: "Giám sát",
  overview: "Toàn cảnh",
};

const LIVE_STATES = new Set(["live", "connected", "ready"]);

function backendSummary(b: RelayBackendConfig): string {
  switch (b.type) {
    case "serial":
      return `USB relay · ${b.port || "chưa chọn cổng"}`;
    case "hikvision":
      return `Hikvision · ${b.host}`;
    case "dahua":
      return `Dahua · ${b.host}`;
    case "modbusTcp":
      return `Modbus TCP · ${b.host}`;
    case "zkC3":
      return `ZKTeco C3 · ${b.host}`;
  }
}

type Line = { tone: "warn" | "ok"; text: string };

interface Props {
  cfg: EdgeConfig;
  gate: GateBinding;
  label: GateLabel;
  status: GateStatus | undefined;
  camLive: Record<string, CamLiveInfo>;
  onSaved: (cfg: EdgeConfig) => void;
  notify: (msg: string) => void;
}

const btn =
  "min-h-11 rounded-lg border border-field px-3 text-sm font-semibold hover:bg-paper disabled:opacity-50";

export default function GateSettingsCard({ cfg, gate, label, status, camLive, onSaved, notify }: Props) {
  const [ports, setPorts] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [line, setLine] = useState<Line>({ tone: "warn", text: "Chưa kiểm tra kết nối" });
  const [formOpen, setFormOpen] = useState(false);

  const barrier = gate.barrier;
  const backend = barrier?.backend;
  const isSerial = backend?.type === "serial";

  useEffect(() => {
    if (!isSerial) return;
    listSerialPorts()
      .then(setPorts)
      .catch(() => {});
  }, [isSerial]);

  const run = async (key: string, fn: () => Promise<unknown>, okLine: string) => {
    setBusy(key);
    try {
      await fn();
      setLine({ tone: "ok", text: okLine });
    } catch (e) {
      setLine({ tone: "warn", text: `Không kết nối được: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(null);
    }
  };

  const changePort = async (port: string) => {
    if (!barrier || barrier.backend.type !== "serial") return;
    const nextBarrier: BarrierConfig = { ...barrier, backend: { ...barrier.backend, port } };
    const gates = cfg.gates.map((g) => (g.gateId === gate.gateId ? { ...g, barrier: nextBarrier } : g));
    const next: EdgeConfig = { ...cfg, gates };
    try {
      await saveConfig(next);
      onSaved(next);
      notify(`Đã lưu cổng ${port}`);
    } catch (e) {
      notify(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const toggleLock = async () => {
    try {
      if (status?.gateState === "locked") await manualUnlock(gate.gateId);
      else await manualLock(gate.gateId);
    } catch (e) {
      notify(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const portOptions = isSerial && backend.port && !ports.includes(backend.port) ? [backend.port, ...ports] : ports;
  const locked = status?.gateState === "locked";

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-base font-bold">{label.name}</h3>
        <DirectionBadge direction={gate.direction} tone="light" />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div>
          <dt className="text-text-muted">Camera</dt>
          <dd>
            {gate.cameras.length === 0 && "Chưa gán"}
            {gate.cameras.map((c) => {
              const live = LIVE_STATES.has(camLive[c.cameraId]?.state ?? "");
              return (
                <div key={c.cameraId}>
                  {PURPOSE_LABEL[c.purpose] ?? c.purpose}{" "}
                  {live ? (
                    <span className="text-brand-ink">· trực tuyến</span>
                  ) : (
                    <span className="text-warn-ink">· mất tín hiệu</span>
                  )}
                </div>
              );
            })}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Barrier</dt>
          <dd>{barrier ? (BRAND_LABEL[barrier.brand] ?? barrier.brand) : "Mô phỏng"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Hướng</dt>
          <dd className="font-mono">{gate.direction}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Mã cổng</dt>
          <dd className="select-all break-all font-mono text-xs">{gate.gateId}</dd>
        </div>
      </dl>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h4 className="mb-2 text-sm font-bold">Kết nối relay trên máy này</h4>
        {barrier == null || backend == null ? (
          <>
            <p className="mb-2 text-sm text-text-muted">Chưa nối relay — barrier đang chạy mô phỏng.</p>
            <button type="button" className={btn} onClick={() => setFormOpen(true)}>
              Thiết lập relay
            </button>
          </>
        ) : (
          <>
            <p className="mb-2 text-sm">{backendSummary(backend)}</p>
            {isSerial && (
              <label className="mb-2 block">
                <span className="sr-only">{`Cổng serial cho ${label.name}`}</span>
                <select
                  aria-label={`Cổng serial cho ${label.name}`}
                  className="min-h-11 w-full rounded-lg border border-field bg-card px-3 text-sm"
                  value={backend.port}
                  onChange={(e) => void changePort(e.target.value)}
                >
                  {backend.port === "" && <option value="">Chọn cổng…</option>}
                  {portOptions.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={btn}
                disabled={busy != null}
                onClick={() => run("probe", () => barrierProbe(barrier), "Board đã phản hồi")}
              >
                Kiểm tra
              </button>
              <button
                type="button"
                className={btn}
                disabled={busy != null}
                onClick={() =>
                  run("open", () => barrierTestOutput(barrier, barrier.outputs.open), "Đã phát xung mở")
                }
              >
                Mở thử
              </button>
              <button
                type="button"
                className={btn}
                disabled={busy != null || barrier.outputs.close == null}
                onClick={() =>
                  barrier.outputs.close != null &&
                  run("close", () => barrierTestOutput(barrier, barrier.outputs.close as number), "Đã phát xung đóng")
                }
              >
                Đóng thử
              </button>
              <button type="button" className={btn} onClick={() => setFormOpen(true)}>
                Cấu hình relay…
              </button>
            </div>
            <p className={`mt-2 text-sm ${line.tone === "ok" ? "text-brand-ink" : "text-warn-ink"}`}>{line.text}</p>
            <p className="mt-1 text-xs text-text-muted">Mở thử và Đóng thử sẽ làm barrier chuyển động thật.</p>
          </>
        )}
      </div>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h4 className="mb-2 text-sm font-bold">Khóa barrier</h4>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm">Barrier: {status ? barrierStateText(status.gateState) : "—"}</span>
          <button type="button" className={btn} onClick={() => void toggleLock()}>
            {locked ? "Mở khóa barrier" : "Khóa barrier"}
          </button>
        </div>
      </div>

      {formOpen && (
        <BarrierSettingsScreen cfg={cfg} gate={gate} onSaved={onSaved} onClose={() => setFormOpen(false)} />
      )}
    </section>
  );
}
