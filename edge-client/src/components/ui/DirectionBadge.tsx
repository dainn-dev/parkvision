import { gateLabels } from "../../lib/labels";

export function DirectionBadge({ direction, tone }: { direction: string; tone: "dark" | "light" }) {
  const badge = gateLabels([{ gateId: "x", direction }]).x.badge;
  const entry = direction === "entry";
  const cls =
    tone === "dark"
      ? `${entry ? "bg-allow" : "bg-ink-700"} text-white text-[12px] font-extrabold px-2 py-0.5 rounded-md`
      : `${entry ? "bg-brand-soft text-brand-ink" : "bg-line-soft text-[#3A3D45]"} text-[11px] font-bold px-1.5 py-px rounded-sm`;
  return <span className={cls}>{badge}</span>;
}
