import type { GateState } from "../lib/tauri";

const LABELS: Record<GateState, string> = {
  closed: "ĐÓNG",
  opening: "ĐANG MỞ",
  open: "MỞ",
  closing: "ĐANG ĐÓNG",
  locked: "KHÓA",
  fault: "LỖI",
};

const COLORS: Record<GateState, string> = {
  closed: "bg-zinc-600",
  opening: "bg-amber-500",
  open: "bg-emerald-500",
  closing: "bg-amber-500",
  locked: "bg-orange-600",
  fault: "bg-red-600",
};

export default function GateStateBadge({ state }: { state: GateState }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold tracking-wide text-white ${COLORS[state]}`}
    >
      <span className="h-2 w-2 rounded-full bg-white/80 animate-pulse" />
      {LABELS[state]}
    </span>
  );
}
