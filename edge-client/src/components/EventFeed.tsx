import type { AccessEvent, GateStatus } from "../lib/tauri";

interface Props {
  events: AccessEvent[];
  gates?: GateStatus[];
}

export default function EventFeed({ events, gates = [] }: Props) {
  if (events.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-zinc-800 text-sm text-zinc-500">
        Chưa có sự kiện
      </div>
    );
  }
  const gateLabel = (e: AccessEvent) => {
    const g = e.gateId ? gates.find((x) => x.gateId === e.gateId) : undefined;
    const dir = g?.direction ?? e.direction;
    return dir === "entry" ? "VÀO" : dir === "exit" ? "RA" : dir?.toUpperCase();
  };
  return (
    <div className="space-y-1.5 overflow-y-auto">
      {events.map((e, i) => (
        <div
          key={i}
          className={`rounded-lg border-l-4 bg-zinc-900/60 px-3 py-2 ${
            e.decision === "allow" ? "border-emerald-500" : "border-red-500"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-base font-bold tracking-wider">
              {e.plate}
            </span>
            <span className="text-[11px] text-zinc-500">
              {new Date(e.at).toLocaleTimeString("vi-VN")}
            </span>
          </div>
          <div className="mt-0.5 flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-400">{gateLabel(e)}</span>
            <span
              className={`font-semibold ${
                e.decision === "allow" ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {e.decision === "allow" ? "Cho phép" : "Từ chối"}
            </span>
          </div>
          {e.reason && (
            <div className="mt-0.5 truncate text-[11px] text-zinc-500" title={e.reason}>
              {e.reason}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
