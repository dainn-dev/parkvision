import { useState } from "react";
import {
  manualClose,
  manualLock,
  manualOpen,
  manualPlate,
  manualUnlock,
  type CameraBinding,
  type GateStatus,
} from "../lib/tauri";
import GateStateBadge from "./GateStateBadge";

interface Props {
  gate: GateStatus;
  cameras: CameraBinding[];
  onAction: (fn: () => Promise<unknown>, ok: string) => void;
}

const PURPOSE_LABEL: Record<string, string> = {
  plate: "CAM BIỂN SỐ",
  overview: "CAM TOÀN CẢNH",
};

function cameraHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export default function GatePanel({ gate, cameras, onAction }: Props) {
  const isLocked = gate.gateState === "locked";
  const isFault = gate.gateState === "fault";
  const gid = gate.gateId;
  const [plateInput, setPlateInput] = useState("");
  const [showEntry, setShowEntry] = useState(false);

  const allowed = gate.lastDecision === "allow";
  const hasPlate = !!gate.lastPlate;

  const submitPlate = () => {
    const p = plateInput.trim().toUpperCase();
    if (!p) return;
    setPlateInput("");
    setShowEntry(false);
    onAction(() => manualPlate(p, gid), `Đã gửi biển ${p}`);
  };

  return (
    <section className="relative flex flex-1 flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
      {/* Header — direction + gate state */}
      <div className="flex items-center justify-between px-4 py-2.5">
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

      {/* Camera tiles — RTSP can't render in WebView2; slots stay ready for a
          streaming gateway (mediamtx/go2rtc) or captured frames later. */}
      <div className="grid min-h-44 flex-1 auto-rows-fr grid-cols-1 gap-2 px-4">
        {(cameras.length ? cameras : [null]).map((c, i) => (
          <div
            key={c?.cameraId ?? i}
            className="flex min-h-32 flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-950 p-2.5"
          >
            <span className="text-[10px] font-semibold tracking-wide text-zinc-500">
              {c ? (PURPOSE_LABEL[c.purpose] ?? c.purpose.toUpperCase()) : "CAMERA"}
            </span>
            <span className="self-center text-xs text-zinc-700">
              {c ? "Chưa có tín hiệu" : "Chưa gán camera"}
            </span>
            {c ? (
              <span className="truncate font-mono text-[10px] text-zinc-600" title={c.streamUrl}>
                {cameraHost(c.streamUrl) || c.streamUrl}
              </span>
            ) : (
              <span />
            )}
          </div>
        ))}
      </div>

      {/* Last scanned plate — the guard's primary readout */}
      <div className="px-4 pt-3">
        <div
          className={`rounded-lg border-2 px-4 py-3 text-center ${
            !hasPlate
              ? "border-zinc-800"
              : allowed
                ? "border-emerald-600 bg-emerald-950/40"
                : "border-red-600 bg-red-950/40"
          }`}
        >
          {hasPlate ? (
            <>
              <div
                className={`text-xs font-bold tracking-widest ${
                  allowed ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {allowed ? "MỜI XE QUA" : "TỪ CHỐI"}
              </div>
              <div className="mt-1 font-mono text-4xl font-black tracking-wider text-zinc-50">
                {gate.lastPlate}
              </div>
              {gate.lastReason && (
                <div className="mt-1 truncate text-xs text-zinc-400" title={gate.lastReason}>
                  {gate.lastReason}
                </div>
              )}
            </>
          ) : (
            <div className="py-3 text-sm text-zinc-600">Chờ biển số…</div>
          )}
        </div>
      </div>

      {/* Compact arm + telemetry strip */}
      <div className="mt-3 flex items-center gap-3 px-4">
        <div className="relative h-14 w-24 shrink-0">
          <div className="absolute bottom-1 left-1 h-7 w-2 rounded-sm bg-zinc-600" />
          <div
            className="absolute bottom-7 left-2 h-1.5 w-20 origin-left rounded bg-gradient-to-r from-red-500 via-zinc-100 to-red-500 transition-transform duration-500"
            style={{ transform: `rotate(-${gate.armAngleDeg}deg)` }}
          />
        </div>
        <div className="grid flex-1 grid-cols-4 gap-1 text-center text-[11px]">
          <div>
            <div className="font-bold">{gate.armAngleDeg}°</div>
            <div className="text-zinc-500">Góc</div>
          </div>
          <div>
            <div className="font-bold">{gate.motorTempC?.toFixed(0) ?? "—"}°</div>
            <div className="text-zinc-500">Nhiệt</div>
          </div>
          <div>
            <div className="font-bold">{gate.upsBattery ?? "—"}%</div>
            <div className="text-zinc-500">UPS</div>
          </div>
          <div>
            <div
              className={`font-bold ${gate.loopActive ? "text-emerald-400" : "text-zinc-500"}`}
            >
              {gate.loopActive ? "Có xe" : "Trống"}
            </div>
            <div className="text-zinc-500">Vòng từ</div>
          </div>
        </div>
      </div>

      {/* Actions — big touch targets for guards */}
      <div className="mt-auto flex flex-col gap-2 p-4">
        <button
          onClick={() => onAction(() => manualOpen(gid), "Mở barrier")}
          disabled={isLocked || isFault}
          className="rounded-lg bg-emerald-600 py-3 text-base font-bold hover:bg-emerald-500 disabled:opacity-40"
        >
          MỞ CẦN
        </button>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onAction(() => manualClose(gid), "Đóng barrier")}
            disabled={isLocked || isFault}
            className="rounded-lg bg-zinc-700 py-2 text-sm font-semibold hover:bg-zinc-600 disabled:opacity-40"
          >
            Đóng cần
          </button>
          <button
            onClick={() => setShowEntry((v) => !v)}
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
            {isLocked ? "Mở khóa" : "Khóa barrier"}
          </button>
        </div>
        {showEntry && (
          <div className="absolute inset-x-4 bottom-[8.5rem] z-10 flex gap-2 rounded-lg border border-zinc-600 bg-zinc-900 p-2 shadow-2xl">
            <input
              autoFocus
              value={plateInput}
              onChange={(e) => setPlateInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitPlate();
                if (e.key === "Escape") setShowEntry(false);
              }}
              placeholder="VD: 30E-892.41"
              className="flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono uppercase tracking-wider outline-none focus:border-sky-500"
            />
            <button
              onClick={submitPlate}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold hover:bg-sky-500"
            >
              Gửi
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
