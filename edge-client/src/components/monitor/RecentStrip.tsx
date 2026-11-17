import { formatHms } from "../../lib/dateFmt";
import { plateText, recentTag, type GateLabel, type RecentTone } from "../../lib/labels";
import type { AccessEvent } from "../../lib/tauri";

export const TAG_COLOR: Record<RecentTone, string> = {
  allow: "#8FB0FF",
  deny: "#FF9A6B",
  fee: "#F5C53D",
};

export function EventTag({ event }: { event: AccessEvent }) {
  const tag = recentTag(event);
  return (
    <span className="text-xs font-bold" style={{ color: TAG_COLOR[tag.tone] }}>
      {tag.text}
    </span>
  );
}

export function laneShort(
  labels: Record<string, GateLabel>,
  e: AccessEvent,
): string {
  return (e.gateId ? labels[e.gateId]?.short : undefined) ?? "";
}

export interface RecentStripProps {
  events: AccessEvent[];
  labels: Record<string, GateLabel>;
  timeZone?: string | null;
  onShowAll: () => void;
}

export function RecentStrip({ events, labels, timeZone, onShowAll }: RecentStripProps) {
  const recent = events.slice(0, 6);
  return (
    <div className="px-5 pb-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-semibold tracking-[0.04em] text-fg-muted">LƯỢT GẦN ĐÂY</h3>
        <button
          type="button"
          onClick={onShowAll}
          className="min-h-11 px-2 text-[13px] font-semibold text-allow-fg underline"
        >
          Xem tất cả
        </button>
      </div>
      {recent.length === 0 ? (
        <div className="text-sm text-fg-dim">Chưa có lượt nào kể từ khi mở ứng dụng.</div>
      ) : (
        <div className="flex gap-2 overflow-hidden">
          {recent.map((e, i) => (
            <div
              key={`${e.at}-${i}`}
              data-testid="recent-chip"
              className="flex min-w-[200px] shrink-0 flex-col rounded-[10px] border border-ink-800 bg-ink-900 px-3 py-2"
            >
              <span className={`font-mono font-bold ${e.plate ? "" : "text-fg-muted"}`}>
                {plateText(e.plate)}
              </span>
              <span className="text-xs text-fg-muted">
                {formatHms(e.at, timeZone)}
                {laneShort(labels, e) ? ` · ${laneShort(labels, e)}` : ""}
              </span>
              <EventTag event={e} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
