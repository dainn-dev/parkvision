import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { EventsDrawer } from "../components/monitor/EventsDrawer";
import { LaneCard } from "../components/monitor/LaneCard";
import { MonitorHeader } from "../components/monitor/MonitorHeader";
import { RecentStrip } from "../components/monitor/RecentStrip";
import { gateLabels } from "../lib/labels";
import type { EdgeData } from "../lib/useEdgeData";

export interface MonitorScreenProps {
  data: EdgeData;
  onOpenSettings: () => void;
  notify: (msg: string) => void;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function MonitorScreen({ data, onOpenSettings, notify }: MonitorScreenProps) {
  const { status, cfg, events, cameras, payment } = data;
  const [drawer, setDrawer] = useState(false);

  const gates = status?.gates ?? [];
  const labels = gateLabels(cfg?.gates ?? gates);
  const gateName = (id: string | null | undefined) => (id ? labels[id]?.name : undefined);
  const tz = payment?.timezone ?? null;

  // `fn` must run synchronously and always: LaneCard's double-settle guard relies on it.
  const onAction = (fn: () => Promise<unknown>, okMessage: string) => {
    fn().then(
      () => notify(okMessage),
      (e) => notify("Lỗi: " + errorText(e)),
    );
  };

  const crowded = gates.length >= 3;
  const offline = status != null && !status.mqttConnected;

  return (
    <div className="flex h-screen flex-col bg-ink-950 text-fg">
      <MonitorHeader status={status} siteName={payment?.siteName} onOpenSettings={onOpenSettings} />

      {offline ? (
        <div
          role="status"
          className="flex items-center gap-2 bg-offline-bg px-5 py-2 text-[13px] text-offline-fg"
        >
          <TriangleAlert aria-hidden size={16} />
          <span>
            Mất kết nối server. Ra vào vẫn hoạt động theo dữ liệu trên máy; sự kiện được lưu và gửi
            lại khi có mạng.
            {status.outboxDepth > 0 ? ` Đang chờ gửi: ${status.outboxDepth} sự kiện.` : ""}
          </span>
        </div>
      ) : null}

      <main
        data-testid="lanes-grid"
        className={`grid min-h-0 flex-1 gap-4 px-5 py-4 ${crowded ? "overflow-y-auto" : ""}`}
        style={
          crowded
            ? { gridTemplateColumns: "repeat(auto-fit, minmax(480px, 1fr))", gridAutoRows: "minmax(520px, auto)" }
            : {
                gridTemplateColumns: `repeat(${Math.max(gates.length, 1)}, minmax(0, 1fr))`,
                // One bounded row: each card scrolls inside instead of growing past the recent strip.
                gridTemplateRows: "minmax(0, 1fr)",
              }
        }
      >
        {gates.length === 0 ? (
          <div className="flex items-center justify-center text-fg-muted">
            Thiết bị chưa được gán cổng nào.
          </div>
        ) : (
          gates.map((g) => (
            <LaneCard
              key={g.gateId}
              gate={g}
              label={labels[g.gateId] ?? gateLabels([g])[g.gateId]}
              cameras={cfg?.gates.find((x) => x.gateId === g.gateId)?.cameras ?? []}
              camLive={cameras}
              payment={payment}
              gateName={gateName}
              onAction={onAction}
            />
          ))
        )}
      </main>

      <RecentStrip events={events} labels={labels} timeZone={tz} onShowAll={() => setDrawer(true)} />

      {drawer ? (
        <EventsDrawer events={events} labels={labels} timeZone={tz} onClose={() => setDrawer(false)} />
      ) : null}
    </div>
  );
}
