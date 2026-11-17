import { useState } from "react";
import { ChevronLeft, CloudDownload } from "lucide-react";
import type { EdgeData } from "../lib/useEdgeData";
import { gateLabels } from "../lib/labels";
import GateSettingsCard from "../components/settings/GateSettingsCard";
import DeviceCard from "../components/settings/DeviceCard";

interface Props {
  data: EdgeData;
  onBack: () => void;
  onLocked: () => void;
  notify: (msg: string) => void;
}

function formatSync(iso: string | null | undefined): string {
  if (!iso) return "chưa đồng bộ";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "chưa đồng bộ";
  const hm = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dm = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return `${hm} ${dm}`;
}

export default function SettingsScreen({ data, onBack, onLocked, notify }: Props) {
  const { cfg, status, lock } = data;
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await data.refreshFromServer();
      notify("Đã làm mới từ server");
    } catch (e) {
      notify(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setRefreshing(false);
    }
  };

  const labels = cfg ? gateLabels(cfg.gates) : {};

  return (
    <div className="min-h-screen bg-paper text-text">
      <header className="flex min-h-14 items-center gap-4 bg-ink-950 px-5 text-fg">
        <button
          type="button"
          onClick={onBack}
          className="flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-800 px-3 text-sm font-semibold hover:bg-ink-900"
        >
          <ChevronLeft size={18} aria-hidden="true" />
          Quay lại giám sát
        </button>
        <h1 className="text-lg font-bold">Thiết lập</h1>
      </header>

      <main className="mx-auto flex max-w-[1120px] flex-col gap-5 px-5 pb-10 pt-6">
        <section className="flex items-start gap-4 rounded-xl border border-line bg-card p-5">
          <CloudDownload size={24} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" />
          <div className="flex-1">
            <h2 className="font-bold">Cấu hình do server quản lý</h2>
            <p className="mt-1 text-text-muted">
              Số cổng và camera được tải từ server. Muốn thay đổi, hãy sửa trên trang quản trị. Cập nhật lần cuối:{" "}
              {formatSync(status?.lastSyncAt)}.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="min-h-11 rounded-lg border border-field px-4 text-sm font-semibold hover:bg-paper disabled:opacity-50"
          >
            {refreshing ? "Đang làm mới…" : "Làm mới từ server"}
          </button>
        </section>

        <h2 className="text-lg font-bold">Cổng</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))" }}>
          {cfg &&
            cfg.gates.map((gate) => (
              <GateSettingsCard
                key={gate.gateId}
                cfg={cfg}
                gate={gate}
                label={labels[gate.gateId]}
                status={status?.gates.find((g) => g.gateId === gate.gateId)}
                camLive={data.cameras}
                onSaved={data.setCfg}
                notify={notify}
              />
            ))}
        </div>

        <h2 className="text-lg font-bold">Thiết bị</h2>
        {cfg && (
          <DeviceCard
            cfg={cfg}
            status={status}
            lock={lock}
            onLockChanged={data.setLock}
            onLocked={onLocked}
            notify={notify}
          />
        )}
      </main>
    </div>
  );
}
