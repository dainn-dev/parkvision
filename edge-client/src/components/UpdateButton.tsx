import { useEffect, useState } from "react";
import {
  checkUpdate,
  installUpdate,
  onUpdateProgress,
  type UpdateInfo,
  type UpdateProgress,
} from "../lib/tauri";

type Phase = "idle" | "checking" | "installing";

type Props = { notify: (message: string) => void };

/** Settings control: check for a newer build, then install it on request. */
export default function UpdateButton({ notify }: Props) {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<UpdateProgress | null>(null);

  useEffect(() => {
    const unlisten = onUpdateProgress(setProgress);
    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  const check = async () => {
    setPhase("checking");
    try {
      const next = await checkUpdate();
      setInfo(next);
      if (!next.availableVersion) notify(`Đang dùng bản mới nhất (${next.currentVersion})`);
    } catch {
      notify("Không kiểm tra được bản cập nhật. Kiểm tra kết nối mạng.");
    } finally {
      setPhase("idle");
    }
  };

  const install = async () => {
    if (!info?.availableVersion) return;
    const ok = window.confirm(
      `Cập nhật lên phiên bản ${info.availableVersion}?\n\n` +
        "Ứng dụng sẽ tự khởi động lại trong khoảng 1 phút. " +
        "Trong lúc đó cổng không nhận lệnh và không đọc biển số."
    );
    if (!ok) return;
    setPhase("installing");
    setProgress(null);
    try {
      await installUpdate();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("gate busy")) notify("Có cổng đang mở hoặc đang chạy. Đóng cổng rồi thử lại.");
      else if (msg.includes("no update available")) notify("Không còn bản cập nhật nào.");
      else notify("Cập nhật thất bại. Thử lại sau.");
      setPhase("idle");
    }
  };

  if (phase === "installing") {
    const pct =
      progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;
    return (
      <span className="text-sm text-brand-ink">
        {pct === null ? "Đang tải bản cập nhật…" : `Đang tải bản cập nhật… ${pct}%`}
      </span>
    );
  }

  if (info?.availableVersion) {
    return (
      <button
        onClick={install}
        title={info.notes ?? undefined}
        className="min-h-11 rounded-lg bg-brand px-3 text-sm font-semibold text-white hover:bg-[#163E9E]"
      >
        Cập nhật {info.availableVersion}
      </button>
    );
  }

  return (
    <button
      onClick={check}
      disabled={phase === "checking"}
      className="min-h-11 rounded-lg border border-field px-3 text-sm font-semibold hover:bg-paper disabled:opacity-50"
    >
      {phase === "checking" ? "Đang kiểm tra…" : "Kiểm tra cập nhật"}
    </button>
  );
}
