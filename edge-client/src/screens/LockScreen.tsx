import { useState } from "react";
import { unlock } from "../lib/tauri";

const input =
  "w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-emerald-500";

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
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 p-6 text-zinc-100">
      <form
        onSubmit={submit}
        className="w-full max-w-xs space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
      >
        <div>
          <h1 className="text-xl font-bold">ParkVision Edge</h1>
          <p className="mt-1 text-sm text-zinc-400">Màn hình đang khoá. Nhập mật khẩu để tiếp tục.</p>
        </div>

        <input
          autoFocus
          type="password"
          required
          className={input}
          placeholder="Mật khẩu"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {err && <div className="text-sm text-red-400">{err}</div>}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-emerald-600 py-2.5 font-semibold hover:bg-emerald-500 disabled:opacity-50"
        >
          Mở khoá
        </button>
      </form>
    </main>
  );
}
