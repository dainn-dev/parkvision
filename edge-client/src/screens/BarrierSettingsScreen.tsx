import { useEffect, useMemo, useState } from "react";
import {
  barrierProbe,
  barrierReadInputs,
  barrierTestOutput,
  getBarrierProfiles,
  listSerialPorts,
  saveConfig,
  type BarrierConfig,
  type BarrierPreset,
  type EdgeConfig,
  type GateBinding,
  type RelayBackendConfig,
} from "../lib/tauri";

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm outline-none focus:border-sky-500";
const label = "mb-1 block text-xs font-medium text-zinc-400";

const BACKEND_KINDS: { value: RelayBackendConfig["type"]; label: string }[] = [
  { value: "hikvision", label: "Camera Hikvision (alarm-out ISAPI)" },
  { value: "dahua", label: "Camera Dahua (alarm-out CGI)" },
  { value: "serial", label: "USB relay (LCUS / Modbus RTU)" },
  { value: "modbusTcp", label: "Relay mạng Modbus TCP" },
  { value: "zkC3", label: "ZKTeco C3/inBIO (TCP 4370)" },
];

const BRAND_LABEL: Record<string, string> = {
  bisen: "Bisen",
  faac: "FAAC",
  came: "CAME",
  mag: "MAG",
  zkteco: "ZKTeco",
  wonsun: "Wonsun",
  generic: "Generic (khô tiếp điểm)",
};

function defaultBackend(kind: RelayBackendConfig["type"]): RelayBackendConfig {
  switch (kind) {
    case "hikvision":
      return { type: "hikvision", host: "", port: 80, username: "admin", password: "" };
    case "dahua":
      return { type: "dahua", host: "", port: 80, username: "admin", password: "", strobe: false };
    case "serial":
      return { type: "serial", port: "", protocol: "lcus", baud: 9600, unitId: 1 };
    case "modbusTcp":
      return { type: "modbusTcp", host: "", port: 502, unitId: 1 };
    case "zkC3":
      return { type: "zkC3", host: "", port: 4370, password: "", output: "aux" };
  }
}

function defaultBarrier(): BarrierConfig {
  return {
    backend: defaultBackend("hikvision"),
    brand: "generic",
    outputs: { open: 1, close: 2, stop: null, power: null },
    inputs: null,
    overrides: {},
  };
}

const num = (v: string): number | null => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
};

interface Props {
  cfg: EdgeConfig;
  gate: GateBinding;
  onSaved: (cfg: EdgeConfig) => void;
  onClose: () => void;
}

export default function BarrierSettingsScreen({ cfg, gate, onSaved, onClose }: Props) {
  const [enabled, setEnabled] = useState(gate.barrier != null);
  const [draft, setDraft] = useState<BarrierConfig>(() =>
    gate.barrier ? structuredClone(gate.barrier) : defaultBarrier(),
  );
  const [presets, setPresets] = useState<BarrierPreset[]>([]);
  const [comPorts, setComPorts] = useState<string[]>([]);
  const [inputs, setInputs] = useState<boolean[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    getBarrierProfiles().then(setPresets).catch(() => {});
    listSerialPorts().then(setComPorts).catch(() => {});
  }, []);

  const preset = useMemo(
    () => presets.find((p) => p.brand === draft.brand)?.profile,
    [presets, draft.brand],
  );

  // Live input readout — poll the configured backend while the screen is open.
  useEffect(() => {
    if (!enabled || !draft.inputs) return;
    let stop = false;
    const poll = () =>
      barrierReadInputs(draft)
        .then((v) => !stop && setInputs(v))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 1000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [enabled, draft]);

  const setBackend = (b: RelayBackendConfig) => setDraft((d) => ({ ...d, backend: b }));
  const kind = draft.backend.type;
  const serial =
    kind === "serial"
      ? (draft.backend as Extract<RelayBackendConfig, { type: "serial" }>)
      : null;

  const run = (key: string, fn: () => Promise<unknown>, okText: string) => {
    setBusy(key);
    setMsg(null);
    fn()
      .then((r) => setMsg({ ok: true, text: r ? `${okText} (${r})` : okText }))
      .catch((e) => setMsg({ ok: false, text: String(e) }))
      .finally(() => setBusy(null));
  };

  const save = () =>
    run("save", async () => {
      const gates = cfg.gates.map((g) =>
        g.gateId === gate.gateId ? { ...g, barrier: enabled ? draft : null } : g,
      );
      const next = { ...cfg, gates };
      await saveConfig(next);
      onSaved(next);
      onClose();
    }, "Đã lưu");

  const outputField = (
    key: "open" | "close" | "stop" | "power",
    text: string,
    required = false,
  ) => (
    <label className="block">
      <span className={label}>{text}</span>
      <input
        className={input}
        type="number"
        min={1}
        placeholder={required ? "1" : "—"}
        value={draft.outputs[key] ?? ""}
        onChange={(e) =>
          setDraft((d) => ({ ...d, outputs: { ...d.outputs, [key]: num(e.target.value) } }))
        }
      />
    </label>
  );

  const inputField = (key: "openLimit" | "closedLimit" | "loop", text: string) => (
    <label className="block">
      <span className={label}>
        {text}
        {inputs && draft.inputs?.[key] != null && (
          <span
            className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${
              inputs[(draft.inputs[key] ?? 1) - 1]
                ? "bg-emerald-500/30 text-emerald-300"
                : "bg-zinc-700 text-zinc-400"
            }`}
          >
            {inputs[(draft.inputs[key] ?? 1) - 1] ? "ON" : "OFF"}
          </span>
        )}
      </span>
      <input
        className={input}
        type="number"
        min={1}
        placeholder="—"
        value={draft.inputs?.[key] ?? ""}
        onChange={(e) =>
          setDraft((d) => ({
            ...d,
            inputs: { openLimit: null, closedLimit: null, loop: null, ...d.inputs, [key]: num(e.target.value) },
          }))
        }
      />
    </label>
  );

  const hostUserPass = (b: Extract<RelayBackendConfig, { host: string }>, showStrobe: boolean) => (
    <>
      <label className="block">
        <span className={label}>Địa chỉ IP</span>
        <input
          className={input}
          placeholder="192.168.1.64"
          value={b.host}
          onChange={(e) => setBackend({ ...b, host: e.target.value })}
        />
      </label>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className={label}>Port</span>
          <input
            className={input}
            type="number"
            value={b.port}
            onChange={(e) => setBackend({ ...b, port: num(e.target.value) ?? b.port })}
          />
        </label>
        {"username" in b && (
          <label className="block">
            <span className={label}>Tài khoản</span>
            <input
              className={input}
              value={b.username}
              onChange={(e) => setBackend({ ...b, username: e.target.value })}
            />
          </label>
        )}
        {"unitId" in b && (
          <label className="block">
            <span className={label}>Unit ID</span>
            <input
              className={input}
              type="number"
              min={1}
              max={247}
              value={b.unitId}
              onChange={(e) => setBackend({ ...b, unitId: num(e.target.value) ?? 1 })}
            />
          </label>
        )}
        {"password" in b && (
          <label className="block">
            <span className={label}>Mật khẩu</span>
            <input
              className={input}
              type="password"
              value={b.password}
              onChange={(e) => setBackend({ ...b, password: e.target.value })}
            />
          </label>
        )}
      </div>
      {showStrobe && "strobe" in b && (
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={b.strobe}
            onChange={(e) => setBackend({ ...b, strobe: e.target.checked })}
          />
          Camera ITC — dùng lệnh openStrobe thay AlarmOut
        </label>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
          <h2 className="font-bold">
            Cài đặt barrier — {gate.direction === "entry" ? "Cổng vào" : gate.direction === "exit" ? "Cổng ra" : gate.gateId}
          </h2>
          <button onClick={onClose} className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {/* Mode toggle */}
          <div className="flex gap-2">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setEnabled(v)}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  enabled === v
                    ? "border-sky-500 bg-sky-500/10 text-sky-300"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {v ? "Relay thật" : "Mô phỏng (không phần cứng)"}
              </button>
            ))}
          </div>

          {enabled && (
            <>
              {/* Backend */}
              <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Phương thức điều khiển
                </h3>
                <select
                  className={input}
                  value={kind}
                  onChange={(e) =>
                    setBackend(
                      defaultBackend(e.target.value as RelayBackendConfig["type"]),
                    )
                  }
                >
                  {BACKEND_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>

                {(kind === "hikvision" || kind === "dahua") &&
                  hostUserPass(draft.backend as never, kind === "dahua")}
                {kind === "modbusTcp" &&
                  hostUserPass(draft.backend as never, false)}
                {kind === "zkC3" && (
                  <>
                    {hostUserPass(draft.backend as never, false)}
                    <label className="block">
                      <span className={label}>Terminal trên panel C3</span>
                      <select
                        className={input}
                        value={(draft.backend as { output: string }).output}
                        onChange={(e) =>
                          setBackend({
                            ...(draft.backend as Extract<RelayBackendConfig, { type: "zkC3" }>),
                            output: e.target.value as "aux" | "door",
                          })
                        }
                      >
                        <option value="aux">Aux relay (AUX1–AUX4)</option>
                        <option value="door">Door lock relay</option>
                      </select>
                    </label>
                  </>
                )}

                {kind === "serial" && serial && (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={label}>Cổng COM</span>
                        <input
                          className={input}
                          list="com-ports"
                          placeholder="COM3"
                          value={serial.port}
                          onChange={(e) => setBackend({ ...serial, port: e.target.value })}
                        />
                        <datalist id="com-ports">
                          {comPorts.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                      </label>
                      <label className="block">
                        <span className={label}>Giao thức</span>
                        <select
                          className={input}
                          value={serial.protocol}
                          onChange={(e) =>
                            setBackend({
                              ...serial,
                              protocol: e.target.value as "lcus" | "modbusRtu",
                            })
                          }
                        >
                          <option value="lcus">LCUS (board 4 kênh phổ biến)</option>
                          <option value="modbusRtu">Modbus RTU</option>
                        </select>
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className={label}>Baud</span>
                        <select
                          className={input}
                          value={serial.baud}
                          onChange={(e) =>
                            setBackend({ ...serial, baud: num(e.target.value) ?? 9600 })
                          }
                        >
                          {[9600, 19200, 38400, 57600, 115200].map((b) => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className={label}>Unit ID (Modbus)</span>
                        <input
                          className={input}
                          type="number"
                          min={1}
                          max={247}
                          value={serial.unitId}
                          onChange={(e) =>
                            setBackend({ ...serial, unitId: num(e.target.value) ?? 1 })
                          }
                        />
                      </label>
                    </div>
                  </>
                )}
              </section>

              {/* Brand preset */}
              <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Hãng barrier
                </h3>
                <select
                  className={input}
                  value={draft.brand}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, brand: e.target.value as BarrierConfig["brand"] }))
                  }
                >
                  {presets.map((p) => (
                    <option key={p.brand} value={p.brand}>
                      {BRAND_LABEL[p.brand] ?? p.brand}
                      {p.profile.verified ? "" : " *"}
                    </option>
                  ))}
                </select>
                {preset && (
                  <div className="rounded-md bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                    <div className="whitespace-pre-line font-mono">{preset.wiringHint}</div>
                    <div className="mt-1 text-zinc-500">
                      Xung {preset.pulseMs} ms · hành trình {preset.travelSec}s
                      {preset.verified ? (
                        <span className="ml-2 text-emerald-400">· đã kiểm chứng tại site</span>
                      ) : (
                        <span className="ml-2 text-amber-500">
                          · preset mặc định — cần QA phần cứng thực tế
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className={label}>Độ rộng xung (ms, để trống = preset)</span>
                    <input
                      className={input}
                      type="number"
                      placeholder={preset ? String(preset.pulseMs) : ""}
                      value={draft.overrides.pulseMs ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          overrides: { ...d.overrides, pulseMs: num(e.target.value) },
                        }))
                      }
                    />
                  </label>
                  <label className="block">
                    <span className={label}>Thời gian hành trình (s, để trống = preset)</span>
                    <input
                      className={input}
                      type="number"
                      step="0.5"
                      placeholder={preset ? String(preset.travelSec) : ""}
                      value={draft.overrides.travelSec ?? ""}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          overrides: {
                            ...d.overrides,
                            travelSec: e.target.value ? parseFloat(e.target.value) : null,
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </section>

              {/* Output map */}
              <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Đầu ra relay (kênh 1-based)
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  {outputField("open", "OPEN", true)}
                  {outputField("close", "CLOSE")}
                  {outputField("stop", "STOP")}
                  {outputField("power", "POWER")}
                </div>
              </section>

              {/* Input map */}
              <section className="space-y-3 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Đầu vào phản hồi (tuỳ chọn)
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {inputField("openLimit", "Limit mở")}
                  {inputField("closedLimit", "Limit đóng")}
                  {inputField("loop", "Vòng từ")}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Để trống toàn bộ → ước lượng vị trí theo thời gian hành trình.
                </p>
              </section>

              {/* Test */}
              <section className="space-y-2 rounded-lg border border-zinc-800 p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                  Kiểm tra kết nối
                </h3>
                <div className="grid grid-cols-4 gap-2">
                  <button
                    onClick={() => run("probe", () => barrierProbe(draft), "Kết nối OK")}
                    disabled={busy != null}
                    className="rounded-md bg-sky-600 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40"
                  >
                    {busy === "probe" ? "…" : "Kiểm tra"}
                  </button>
                  {(
                    [
                      ["open", draft.outputs.open, "Test MỞ"],
                      ["close", draft.outputs.close, "Test ĐÓNG"],
                      ["stop", draft.outputs.stop, "Test DỪNG"],
                    ] as const
                  ).map(([key, out, text]) => (
                    <button
                      key={key}
                      onClick={() =>
                        out != null &&
                        run(`test-${key}`, () => barrierTestOutput(draft, out), `Đã phát xung ${key.toUpperCase()}`)
                      }
                      disabled={busy != null || out == null}
                      className="rounded-md border border-zinc-600 py-2 text-sm font-semibold hover:bg-zinc-800 disabled:opacity-40"
                    >
                      {busy === `test-${key}` ? "…" : text}
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {msg && (
            <div
              className={`rounded-md border px-3 py-2 text-sm ${
                msg.ok
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : "border-red-500/40 bg-red-500/10 text-red-400"
              }`}
            >
              {msg.text}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3">
          <button onClick={onClose} className="rounded-md px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800">
            Huỷ
          </button>
          <button
            onClick={save}
            disabled={busy != null}
            className="rounded-md bg-emerald-600 px-5 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40"
          >
            {busy === "save" ? "Đang lưu…" : "Lưu"}
          </button>
        </div>
      </div>
    </div>
  );
}
