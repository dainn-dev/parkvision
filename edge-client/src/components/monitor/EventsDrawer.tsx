import { useEffect } from "react";
import { formatHms } from "../../lib/dateFmt";
import { plateText, reasonText, type GateLabel } from "../../lib/labels";
import type { AccessEvent } from "../../lib/tauri";
import { EventTag, laneShort } from "./RecentStrip";

export function EventsList({
  events,
  labels,
  timeZone,
}: {
  events: AccessEvent[];
  labels: Record<string, GateLabel>;
  timeZone?: string | null;
}) {
  if (events.length === 0) {
    return <div className="py-8 text-center text-sm text-fg-dim">Chưa có lượt nào.</div>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {events.map((e, i) => (
        <li
          key={`${e.at}-${i}`}
          data-testid="event-row"
          className="rounded-[10px] border border-ink-800 bg-ink-900 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-2">
            <span className={`font-mono font-bold ${e.plate ? "" : "text-fg-muted"}`}>
              {plateText(e.plate)}
            </span>
            <EventTag event={e} />
          </div>
          <div className="text-xs text-fg-muted">
            {formatHms(e.at, timeZone)}
            {laneShort(labels, e) ? ` · ${laneShort(labels, e)}` : ""}
          </div>
          {e.reason ? (
            <div className="truncate text-xs text-fg-dim" title={reasonText(e.reason)}>
              {reasonText(e.reason)}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export interface EventsDrawerProps {
  events: AccessEvent[];
  labels: Record<string, GateLabel>;
  timeZone?: string | null;
  onClose: () => void;
}

export function EventsDrawer({ events, labels, timeZone, onClose }: EventsDrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <aside
      role="dialog"
      aria-label="Lượt ra vào"
      className="fixed inset-y-0 right-0 z-30 flex w-96 flex-col border-l border-ink-800 bg-ink-950 p-4 text-fg shadow-2xl"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-bold">Lượt ra vào</h2>
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-ink-900"
        >
          ✕
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <EventsList events={events} labels={labels} timeZone={timeZone} />
      </div>
    </aside>
  );
}
