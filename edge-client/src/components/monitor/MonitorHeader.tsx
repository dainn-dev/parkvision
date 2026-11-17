import { useEffect, useState } from "react";
import { Download, Settings } from "lucide-react";
import { checkUpdate, type EdgeStatus } from "../../lib/tauri";
import { Logo } from "../ui/Logo";

const SIX_HOURS = 6 * 60 * 60 * 1000;

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useAvailableVersion(): string | null {
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const check = () => {
      checkUpdate()
        .then((u) => alive && setVersion(u.availableVersion))
        .catch(() => {});
    };
    check();
    const t = setInterval(check, SIX_HOURS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  return version;
}

export interface MonitorHeaderProps {
  status: EdgeStatus | null;
  siteName?: string | null;
  onOpenSettings: () => void;
}

export function MonitorHeader({ status, siteName, onOpenSettings }: MonitorHeaderProps) {
  const now = useNow();
  const available = useAvailableVersion();

  const time = now.toLocaleTimeString("vi-VN", { hour12: false });
  const date = now.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const connected = status ? status.mqttConnected : null;

  return (
    <header className="flex min-h-14 items-center justify-between gap-4 border-b border-ink-850 px-5 py-2">
      <div className="flex items-center gap-2">
        <Logo size={24} className="text-accent" />
        <span className="font-bold">{siteName ?? "Edge Gate"}</span>
      </div>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[18px] font-semibold">{time}</span>
        <span className="text-[13px] text-fg-muted">{date}</span>
      </div>
      <div className="flex items-center gap-3">
        {available ? (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex min-h-11 items-center"
          >
            <span
              className="flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium"
              style={{ background: "#1B2A4D", color: "#BCD0FF" }}
            >
              <Download aria-hidden size={14} />
              Có bản cập nhật {available}
            </span>
          </button>
        ) : null}
        <span className="flex items-center gap-2 rounded-full bg-ink-900 px-3 py-1 text-[13px]">
          <span
            aria-hidden
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-accent" : "bg-alert"}`}
          />
          {connected === null ? "Đang kết nối…" : connected ? "Đã kết nối" : "Mất kết nối"}
        </span>
        <button
          type="button"
          aria-label="Thiết lập"
          onClick={onOpenSettings}
          className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-ink-800 text-fg"
        >
          <Settings aria-hidden size={20} />
        </button>
      </div>
    </header>
  );
}
