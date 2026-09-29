import {
  manualClose,
  manualLock,
  manualOpen,
  manualPlate,
  manualUnlock,
  type GateStatus,
} from "../lib/tauri";
import GateStateBadge from "./GateStateBadge";

interface Props {
  gate: GateStatus;
  onAction: (fn: () => Promise<unknown>, ok: string) => void;
}

export default function GatePanel({ gate, onAction }: Props) {
  const isLocked = gate.gateState === "locked";
  const isFault = gate.gateState === "fault";
  const gid = gate.gateId;

  const enterPlate = () => {
    const p = window.prompt("Nhập biển số (vd: 30E-892.41)");
    if (p?.trim())
      onAction(() => manualPlate(p.trim(), gid), `Đã gửi biển ${p.trim()}`);
  };

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex w-full items-center justify-between">
        <span
          className={`rounded-full px-3 py-0.5 text-xs font-bold ${
            gate.direction === "entry"
              ? "bg-sky-500/20 text-sky-400"
              : "bg-violet-500/20 text-violet-400"
          }`}
        >
          {gate.direction === "entry" ? "CỔNG VÀO" : gate.direction === "exit" ? "CỔNG RA" : "CỔNG"}
        </span>
        <GateStateBadge state={gate.gateState} />
      </div>

      {/* Arm visual — rotated bar pivots at left */}
      <div className="relative h-32 w-56">
        <div className="absolute bottom-6 left-2 h-14 w-4 rounded bg-zinc-600" />
        <div
          className="absolute bottom-20 left-4 h-3 w-40 origin-left rounded bg-gradient-to-r from-red-500 via-zinc-100 to-red-500 transition-transform duration-500"
          style={{ transform: `rotate(-${gate.armAngleDeg}deg)` }}
        />
      </div>

      <div className="grid w-full grid-cols-3 gap-4 text-center text-sm">
        <div>
          <div className="text-xl font-bold">{gate.armAngleDeg}°</div>
          <div className="text-zinc-500">Góc cánh</div>
        </div>
        <div>
          <div className="text-xl font-bold">{gate.motorTempC?.toFixed(1) ?? "—"}°C</div>
          <div className="text-zinc-500">Nhiệt độ</div>
        </div>
        <div>
          <div className="text-xl font-bold">{gate.upsBattery ?? "—"}%</div>
          <div className="text-zinc-500">UPS</div>
        </div>
      </div>

      <div
        className={`rounded-full px-4 py-1 text-sm font-medium ${
          gate.loopActive ? "bg-emerald-500/20 text-emerald-400" : "bg-zinc-800 text-zinc-500"
        }`}
      >
        Vòng từ: {gate.loopActive ? "Có xe" : "Trống"}
      </div>

      {gate.lastPlate && (
        <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-lg font-bold tracking-wider">{gate.lastPlate}</span>
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${
                gate.lastDecision === "allow"
                  ? "bg-emerald-500/20 text-emerald-400"
                  : "bg-red-500/20 text-red-400"
              }`}
              title={gate.lastReason ?? undefined}
            >
              {gate.lastDecision === "allow" ? "Cho phép" : gate.lastReason ?? "Từ chối"}
            </span>
          </div>
        </div>
      )}

      {/* Manual ops must work offline per spec §6.4 */}
      <div className="grid w-full grid-cols-2 gap-2">
        <button
          onClick={() => onAction(() => manualOpen(gid), "Mở barrier")}
          disabled={isLocked || isFault}
          className="rounded-lg bg-emerald-600 py-2.5 font-semibold hover:bg-emerald-500 disabled:opacity-40"
        >
          Mở cần
        </button>
        <button
          onClick={() => onAction(() => manualClose(gid), "Đóng barrier")}
          disabled={isLocked || isFault}
          className="rounded-lg bg-zinc-700 py-2.5 font-semibold hover:bg-zinc-600 disabled:opacity-40"
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
          onClick={() =>
            onAction(
              isLocked ? () => manualUnlock(gid) : () => manualLock(gid),
              isLocked ? "Đã mở khóa" : "Đã khóa",
            )
          }
          className={`rounded-lg py-2 text-sm font-medium ${
            isLocked
              ? "bg-orange-600 hover:bg-orange-500"
              : "border border-orange-700/50 text-orange-400 hover:bg-orange-950"
          }`}
        >
          {isLocked ? "Mở khóa barrier" : "Khóa barrier"}
        </button>
      </div>
    </section>
  );
}
