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
    return dir === "entry" ? "Vào" : dir === "exit" ? "Ra" : e.direction;
  };
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-800 p-1">
      {events.map((e, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded px-3 py-2 text-sm hover:bg-zinc-900"
        >
          <span className="font-mono font-semibold">{e.plate}</span>
          <span className="text-zinc-400">{gateLabel(e)}</span>
          <span
            className={`rounded px-2 py-0.5 text-xs font-semibold ${
              e.decision === "allow"
                ? "bg-emerald-500/20 text-emerald-400"
                : "bg-red-500/20 text-red-400"
            }`}
          >
            {e.decision === "allow" ? "Cho phép" : "Từ chối"}
          </span>
          <span className="w-40 truncate text-right text-xs text-zinc-500" title={e.reason}>
            {e.reason}
          </span>
          <span className="text-xs text-zinc-600">
            {new Date(e.at).toLocaleTimeString("vi-VN")}
          </span>
        </div>
      ))}
    </div>
  );
}
