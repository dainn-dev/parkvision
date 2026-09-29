import { useEffect, useRef, useState } from "react";
import { activate, detectPublicIp, setLockPassword } from "../lib/tauri";

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";

/** Normalize typed activation codes: trim, uppercase, allow spaces. */
function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

export default function SetupScreen({ onDone }: { onDone: () => void }) {
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  type IpState = "idle" | "loading" | "ok" | "failed";
  const [publicIp, setPublicIp] = useState<string | null>(null);
  const [ipState, setIpState] = useState<IpState>("idle");
  const ipTimer = useRef<ReturnType<typeof setTimeout>>(null);

  const detectIp = async () => {
    const url = apiBaseUrl.trim();
    if (!/^https?:\/\/.+/.test(url)) return;
    setIpState("loading");
    try {
      setPublicIp(await detectPublicIp(url));
      setIpState("ok");
    } catch {
      setPublicIp(null);
      setIpState("failed");
    }
  };

  // Debounce-detect the IP the server sees once a plausible URL is typed —
  // this is the address the tenant admin pins on the activation code.
  useEffect(() => {
    if (ipTimer.current) clearTimeout(ipTimer.current);
    const url = apiBaseUrl.trim();
    if (!/^https?:\/\/.+/.test(url)) {
      setIpState("idle");
      setPublicIp(null);
      return;
    }
    ipTimer.current = setTimeout(detectIp, 600);
    return () => {
      if (ipTimer.current) clearTimeout(ipTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBaseUrl]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await activate(apiBaseUrl.trim(), normalizeCode(code));
      // Optional kiosk lock — local only, never sent to the server.
      if (password.trim()) {
        await setLockPassword(password);
      }
      onDone();
    } catch (ex) {
      const msg = String(ex);
      // Friendly Vietnamese copy for the common failures; keep raw detail
      // out of the UI for anything else (never echo server bodies).
      if (msg.includes("invalid activation code")) setErr("Mã kích hoạt không đúng.");
      else if (msg.includes("expired")) setErr("Mã kích hoạt đã hết hạn.");
      else if (msg.includes("409")) setErr("Mã kích hoạt đã được sử dụng.");
      else if (msg.includes("403")) setErr("Thiết bị không được phép kích hoạt từ địa chỉ IP này.");
      else if (msg.includes("cannot reach server")) setErr("Không kết nối được server.");
      else setErr("Kích hoạt thất bại. Kiểm tra lại mã và URL server.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form
        onSubmit={submit}
        className="w-full max-w-md space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h1 className="text-xl font-bold">ParkVision Edge — Kích hoạt thiết bị</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Nhập mã kích hoạt do quản trị viên cấp. Mã chỉ dùng một lần —
            thông tin cổng, làn và camera sẽ tự động được tải về.
          </p>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Địa chỉ server</span>
          <input
            required
            className={input}
            placeholder="http://localhost:8000/api/v1"
            value={apiBaseUrl}
            onChange={(e) => setApiBaseUrl(e.target.value)}
          />
          {ipState !== "idle" && (
            <span className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
              IP server nhìn thấy thiết bị:
              {ipState === "loading" && <span className="text-zinc-400">đang kiểm tra…</span>}
              {ipState === "ok" && (
                <>
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-emerald-400 select-all">
                    {publicIp}
                  </code>
                  <button
                    type="button"
                    title="Sao chép IP"
                    onClick={() => publicIp && navigator.clipboard.writeText(publicIp)}
                    className="text-zinc-500 hover:text-zinc-300"
                  >
                    ⧉
                  </button>
                </>
              )}
              {ipState === "failed" && (
                <>
                  <span className="text-amber-500">không lấy được — kiểm tra URL/server</span>
                  <button
                    type="button"
                    onClick={detectIp}
                    className="rounded border border-zinc-700 px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
                  >
                    Thử lại
                  </button>
                </>
              )}
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">Mã kích hoạt</span>
          <input
            required
            className={`${input} font-mono tracking-widest uppercase`}
            placeholder="XXXX-XXXX-XXXX"
            maxLength={20}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-400">
            Mật khẩu khoá màn hình (tuỳ chọn)
          </span>
          <input
            type="password"
            className={input}
            placeholder="Để trống nếu không cần khoá"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <span className="mt-1 block text-[11px] text-zinc-500">
            Chỉ khoá giao diện trên thiết bị này — quản trị viên vẫn thu hồi
            quyền truy cập từ dashboard.
          </span>
        </label>

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
          {busy ? "Đang kích hoạt…" : "Kích hoạt"}
        </button>
      </form>
    </main>
  );
}
