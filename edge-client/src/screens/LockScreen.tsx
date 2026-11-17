import { useState } from "react";
import { Logo } from "../components/ui/Logo";
import { unlock } from "../lib/tauri";

export default function LockScreen({ onUnlocked }: { onUnlocked: () => void }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      if (await unlock(password)) {
        onUnlocked();
      } else {
        setErr("Sai mật khẩu.");
        setPassword("");
      }
    } catch {
      setErr("Không mở khoá được. Thử lại.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-950 p-6 text-fg">
      <div className="flex w-full flex-col items-center gap-6">
        <div className="flex items-center gap-3 text-accent">
          <Logo size={32} />
          <span className="text-[18px] font-bold text-white">Edge Gate</span>
        </div>

        <form
          onSubmit={submit}
          className="w-full max-w-[360px] space-y-4 rounded-[16px] bg-card p-8 text-text"
        >
          <div>
            <h1 className="text-[22px] font-bold">Màn hình đang khóa</h1>
            <p className="mt-1 text-[14px] text-text-muted">Nhập mật khẩu để tiếp tục.</p>
          </div>

          <input
            autoFocus
            type="password"
            required
            aria-label="Mật khẩu"
            className="min-h-[52px] w-full rounded-lg border border-field bg-white px-3 outline-none focus:border-brand"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {err && <div className="text-[13px] text-warn-ink">{err}</div>}

          <button
            type="submit"
            disabled={busy}
            className="min-h-[52px] w-full rounded-lg bg-brand font-semibold text-white hover:bg-[#163E9E] disabled:opacity-50"
          >
            Mở khóa
          </button>
        </form>
      </div>
    </main>
  );
}
