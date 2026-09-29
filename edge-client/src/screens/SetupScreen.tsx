import { useState } from "react";
import { provision, type EdgeConfig } from "../lib/tauri";

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";

const EMPTY: EdgeConfig = {
  tenantId: "",
  siteId: "",
  gateId: "",
  laneId: "",
  deviceId: "",
  apiKey: "",
  apiBaseUrl: "",
  mqtt: { host: "", port: 1883, username: "", password: "", tls: false },
  laneDirection: "entry",
  cameraRtspUrl: "",
};

export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [cfg, setCfg] = useState<EdgeConfig>(EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof EdgeConfig, v: unknown) =>
    setCfg((c) => ({ ...c, [k]: v }));
  const setMqtt = (k: keyof EdgeConfig["mqtt"], v: unknown) =>
    setCfg((c) => ({ ...c, mqtt: { ...c.mqtt, [k]: v } }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const normalized: EdgeConfig = {
      ...cfg,
      laneId: cfg.laneId?.trim() ? cfg.laneId : null,
      cameraRtspUrl: cfg.cameraRtspUrl?.trim() ? cfg.cameraRtspUrl : null,
      mqtt: {
        ...cfg.mqtt,
        username: cfg.mqtt.username?.trim() ? cfg.mqtt.username : null,
        password: cfg.mqtt.password?.trim() ? cfg.mqtt.password : null,
      },
    };
    try {
      await provision(normalized);
      onDone();
    } catch (ex) {
      setErr(String(ex));
    } finally {
      setBusy(false);
    }
  };

  const field = (label: string, el: React.ReactNode) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-400">{label}</span>
      {el}
    </label>
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form
        onSubmit={submit}
        className="w-full max-w-2xl space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h1 className="text-xl font-bold">ParkVision Edge — Cấu hình thiết bị</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Nhập thông tin định danh do backend cấp cho gate/lane này.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {field("Tenant ID", <input required className={input} value={cfg.tenantId} onChange={(e) => set("tenantId", e.target.value)} />)}
          {field("Site ID", <input required className={input} value={cfg.siteId} onChange={(e) => set("siteId", e.target.value)} />)}
          {field("Gate ID", <input required className={input} value={cfg.gateId} onChange={(e) => set("gateId", e.target.value)} />)}
          {field("Lane ID (tuỳ chọn)", <input className={input} value={cfg.laneId ?? ""} onChange={(e) => set("laneId", e.target.value)} />)}
          {field("Device ID", <input required className={input} value={cfg.deviceId} onChange={(e) => set("deviceId", e.target.value)} />)}
          {field(
            "Chiều làn",
            <select className={input} value={cfg.laneDirection} onChange={(e) => set("laneDirection", e.target.value)}>
              <option value="entry">Vào (entry)</option>
              <option value="exit">Ra (exit)</option>
            </select>,
          )}
          {field("API Base URL", <input required className={input} placeholder="https://api.example.com/api/v1" value={cfg.apiBaseUrl} onChange={(e) => set("apiBaseUrl", e.target.value)} />)}
          {field("API Key", <input required type="password" className={input} value={cfg.apiKey} onChange={(e) => set("apiKey", e.target.value)} />)}
        </div>

        <h2 className="pt-2 text-sm font-semibold text-zinc-300">MQTT Broker</h2>
        <div className="grid grid-cols-4 gap-3">
          {field("Host", <input required className={input} value={cfg.mqtt.host} onChange={(e) => setMqtt("host", e.target.value)} />)}
          {field("Port", <input required type="number" className={input} value={cfg.mqtt.port} onChange={(e) => setMqtt("port", Number(e.target.value))} />)}
          {field("Username", <input className={input} value={cfg.mqtt.username ?? ""} onChange={(e) => setMqtt("username", e.target.value)} />)}
          {field("Password", <input type="password" className={input} value={cfg.mqtt.password ?? ""} onChange={(e) => setMqtt("password", e.target.value)} />)}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            className="h-4 w-4 accent-emerald-500"
            checked={cfg.mqtt.tls}
            onChange={(e) => setMqtt("tls", e.target.checked)}
          />
          Dùng TLS (mqtts, port 8883)
        </label>

        {field("RTSP Camera URL (tuỳ chọn)", <input className={input} placeholder="rtsp://…" value={cfg.cameraRtspUrl ?? ""} onChange={(e) => set("cameraRtspUrl", e.target.value)} />)}

        {err && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {err}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2.5 font-semibold hover:bg-emerald-500 disabled:opacity-50"
        >
          {busy ? "Đang khởi động…" : "Lưu và khởi động"}
        </button>
      </form>
    </main>
  );
}
