import { useEffect, useState } from "react";
import { DirectionBadge } from "../components/ui/DirectionBadge";
import { Logo } from "../components/ui/Logo";
import { gateLabels } from "../lib/labels";
import { activate, detectPublicIp, getConfig, onCamera } from "../lib/tauri";
import type { EdgeConfig } from "../lib/tauri";

/** Normalize typed activation codes: trim, uppercase, allow spaces. */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/** Friendly Vietnamese copy for the common failures; never echo server bodies. */
function activationError(ex: unknown): string {
  const msg = String(ex);
  if (msg.includes("invalid activation code")) return "Mã kích hoạt không đúng.";
  if (msg.includes("expired")) return "Mã kích hoạt đã hết hạn.";
  if (msg.includes("409")) return "Mã kích hoạt đã được sử dụng.";
  if (msg.includes("403")) return "Thiết bị không được phép kích hoạt từ địa chỉ IP này.";
  if (msg.includes("no gates bound"))
    return "Thiết bị chưa được gán cổng nào. Yêu cầu quản trị viên gán cổng trước khi kích hoạt.";
  if (msg.includes("cannot reach server")) return "Không kết nối được server.";
  return "Kích hoạt thất bại. Kiểm tra lại mã kích hoạt.";
}

const LIVE_STATES = new Set(["live", "connected", "ready"]);

type IpState = "idle" | "loading" | "ok" | "failed";

export default function ActivationScreen({
  revoked,
  onDone,
}: {
  revoked: boolean;
  onDone: (next: "monitor" | "settings") => void;
}) {
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [ipState, setIpState] = useState<IpState>("idle");
  const [cfg, setCfg] = useState<EdgeConfig | null>(null);
  const [liveCameras, setLiveCameras] = useState<Set<string>>(new Set());

  const detectIp = async () => {
    setIpState("loading");
    try {
      setPublicIp(await detectPublicIp());
      setIpState("ok");
    } catch {
      setPublicIp(null);
      setIpState("failed");
    }
  };

  // The address the tenant admin pins on the activation code.
  useEffect(() => {
    void detectIp();
  }, []);

  // Camera readiness is only meaningful once the runtime is up (step 2).
  useEffect(() => {
    if (!cfg) return;
    const un = onCamera((e) => {
      if (e.type === "camera.status" && LIVE_STATES.has(e.state)) {
        setLiveCameras((prev) => new Set(prev).add(e.cameraId));
      }
    });
    return () => {
      void un.then((f) => f());
    };
  }, [cfg]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await activate(normalizeCode(code));
      const fresh = await getConfig();
      if (!fresh) throw new Error("no config");
      setCfg(fresh);
    } catch (ex) {
      setErr(activationError(ex));
    } finally {
      setBusy(false);
    }
  };

  const wide = cfg !== null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 p-6 text-fg">
      <div className="flex w-full flex-col items-center gap-6">
        <div className="flex items-center gap-3 text-accent">
          <Logo size={32} />
          <span className="text-[18px] font-bold text-white">Edge Gate</span>
        </div>

        {revoked && !cfg && (
          <div
            role="alert"
            className="w-full max-w-[520px] rounded-[12px] bg-notice-bg p-4 text-notice-fg"
          >
            <div className="font-bold">Thiết bị đã bị thu hồi</div>
            <p className="mt-1 text-[13px]">
              Server đã thu hồi quyền của thiết bị. Cấu hình đã xóa, dữ liệu và ảnh cục bộ vẫn
              được giữ. Nhập mã mới để kích hoạt lại.
            </p>
          </div>
        )}

        {cfg ? (
          <StepTwo cfg={cfg} liveCameras={liveCameras} onDone={onDone} />
        ) : (
          <form
            onSubmit={submit}
            className="w-full max-w-[520px] rounded-[16px] bg-card p-8 text-text"
          >
            <div className="text-[12px] font-bold tracking-wider text-text-muted">BƯỚC 1/2</div>
            <h1 className="mt-1 text-[22px] font-bold">Kích hoạt thiết bị</h1>
            <p className="mt-2 text-[14px] text-text-muted">
              Nhập mã kích hoạt từ trang quản trị. Số cổng và camera của trạm sẽ được tải về từ
              server.
            </p>

            <label className="mt-5 block">
              <span className="mb-1 block text-[13px] font-semibold">Mã kích hoạt</span>
              <input
                required
                autoFocus
                className="min-h-[52px] w-full rounded-lg border border-field bg-white px-3 font-mono text-[18px] uppercase tracking-[0.08em] outline-none focus:border-brand"
                placeholder="XXXX-XXXX-XXXX"
                maxLength={20}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>

            {ipState !== "idle" && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px] text-text-muted">
                IP server nhìn thấy thiết bị:
                {ipState === "loading" && <span>đang kiểm tra…</span>}
                {ipState === "ok" && (
                  <>
                    <code className="select-all rounded bg-paper px-1.5 py-0.5 font-mono text-text">
                      {publicIp}
                    </code>
                    <button
                      type="button"
                      aria-label="Sao chép IP"
                      title="Sao chép IP"
                      onClick={() => publicIp && navigator.clipboard.writeText(publicIp)}
                      className="min-h-[44px] min-w-[44px] text-text-muted hover:text-text"
                    >
                      ⧉
                    </button>
                  </>
                )}
                {ipState === "failed" && (
                  <>
                    <span className="text-warn-ink">không lấy được — kiểm tra kết nối mạng</span>
                    <button
                      type="button"
                      onClick={detectIp}
                      className="min-h-[44px] rounded-lg border border-field px-3 text-text-muted hover:bg-paper"
                    >
                      Thử lại
                    </button>
                  </>
                )}
              </p>
            )}

            {err && (
              <div className="mt-4 rounded-lg bg-notice-bg px-3 py-2 text-[13px] text-notice-fg">
                {err}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="mt-5 min-h-[52px] w-full rounded-lg bg-brand font-semibold text-white hover:bg-[#163E9E] disabled:opacity-50"
            >
              {busy ? "Đang kích hoạt…" : "Kích hoạt"}
            </button>
          </form>
        )}

        <p
          className={`text-center text-[12px] text-[#A9ADB6] ${wide ? "max-w-[560px]" : "max-w-[520px]"}`}
        >
          Màn hình này chỉ hiện ở lần mở đầu tiên, hoặc khi thiết bị bị thu hồi.
        </p>
      </div>
    </main>
  );
}

function StepTwo({
  cfg,
  liveCameras,
  onDone,
}: {
  cfg: EdgeConfig;
  liveCameras: Set<string>;
  onDone: (next: "monitor" | "settings") => void;
}) {
  const labels = gateLabels(cfg.gates);
  const cameraCount = cfg.gates.reduce((n, g) => n + g.cameras.length, 0);
  const relayCount = cfg.gates.filter((g) => g.barrier != null).length;

  return (
    <div className="w-full max-w-[560px] rounded-[16px] bg-card p-8 text-text">
      <div className="text-[12px] font-bold tracking-wider text-text-muted">BƯỚC 2/2</div>
      <h1 className="mt-1 text-[22px] font-bold">Đã nhận cấu hình từ server</h1>
      <p className="mt-2 text-[14px] text-text-muted">
        Kiểm tra lại trước khi bắt đầu giám sát. Muốn thay đổi cổng hoặc camera, hãy sửa trên
        trang quản trị.
      </p>

      <div className="mt-5 grid grid-cols-3 gap-3 rounded-lg bg-paper p-4">
        <Stat label="Cổng" value={String(cfg.gates.length)} />
        <Stat label="Camera" value={String(cameraCount)} />
        <Stat label="Relay đã nối" value={`${relayCount}/${cfg.gates.length}`} />
      </div>

      <ul className="mt-4 divide-y divide-line-soft">
        {cfg.gates.map((g) => {
          const connected = g.cameras.some((c) => liveCameras.has(c.cameraId));
          return (
            <li key={g.gateId} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  <span>{labels[g.gateId].name}</span>
                  <DirectionBadge direction={g.direction} tone="light" />
                </div>
                <div className="text-[12px] text-text-muted">
                  {g.cameras.length} camera ·{" "}
                  {g.barrier ? "Relay đã thiết lập" : "Relay chưa thiết lập (mô phỏng)"}
                </div>
              </div>
              {g.cameras.length === 0 ? (
                <span className="text-[13px] text-text-muted">Chưa gán camera</span>
              ) : connected ? (
                <span className="text-[13px] font-semibold text-brand-ink">Camera đã kết nối</span>
              ) : (
                <span className="text-[13px] text-text-muted">Đang chờ camera…</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex gap-3">
        <button
          type="button"
          onClick={() => onDone("settings")}
          className="min-h-[52px] flex-1 rounded-lg border border-field font-semibold text-text hover:bg-paper"
        >
          Thiết lập relay
        </button>
        <button
          type="button"
          onClick={() => onDone("monitor")}
          className="min-h-[52px] flex-[2] rounded-lg bg-brand font-semibold text-white hover:bg-[#163E9E]"
        >
          Bắt đầu giám sát
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[12px] text-text-muted">{label}</div>
      <div className="font-mono text-[20px] font-bold">{value}</div>
    </div>
  );
}
