import UpdateButton from "../UpdateButton";

type Props = {
  mqttConnected: boolean;
  lastSyncAt: string | null;
  onResync: () => void;
  onLock: () => void;
  notify: (message: string) => void;
};

export default function DeviceSettings({ mqttConnected, lastSyncAt, onResync, onLock, notify }: Props) {
  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">Thiết bị</h3>
      <div className="grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
        <div>
          <span className="text-xs text-zinc-500">MQTT</span>
          <p className={mqttConnected ? "text-emerald-400" : "text-amber-400"}>
            {mqttConnected ? "Trực tuyến" : "Ngoại tuyến"}
          </p>
        </div>
        <div>
          <span className="text-xs text-zinc-500">Đồng bộ gần nhất</span>
          <p>{lastSyncAt ? new Date(lastSyncAt).toLocaleString("vi-VN") : "Chưa đồng bộ"}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={onResync} className="min-h-11 rounded-md border border-zinc-700 px-3 text-sm hover:bg-zinc-800">
          Đồng bộ lại
        </button>
        <UpdateButton notify={notify} />
        <button type="button" onClick={onLock} className="min-h-11 rounded-md border border-zinc-700 px-3 text-sm hover:bg-zinc-800">
          Khoá màn hình
        </button>
      </div>
    </section>
  );
}
