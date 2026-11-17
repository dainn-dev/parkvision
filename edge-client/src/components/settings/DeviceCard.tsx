import { useEffect, useState } from "react";
import {
  deviceIp,
  lockNow,
  setLockPassword,
  walkInToday,
  type EdgeConfig,
  type EdgeStatus,
  type LockStatus,
  type WalkInSummary,
} from "../../lib/tauri";
import { formatVnd } from "../../lib/labels";
import UpdateButton from "../UpdateButton";

interface Props {
  cfg: EdgeConfig;
  status: EdgeStatus | null;
  lock: LockStatus | null;
  onLockChanged: (lock: LockStatus) => void;
  onLocked: () => void;
  notify: (msg: string) => void;
}

function host(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

const btn =
  "min-h-11 rounded-lg border border-field px-3 text-sm font-semibold hover:bg-paper disabled:opacity-50";

export default function DeviceCard({ cfg, status, lock, onLockChanged, onLocked, notify }: Props) {
  const [ip, setIp] = useState<string>("—");
  const [totals, setTotals] = useState<WalkInSummary | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    deviceIp()
      .then((v) => alive && setIp(v ?? "—"))
      .catch(() => {});
    walkInToday()
      .then((v) => alive && setTotals(v))
      .catch(() => alive && setTotals(null));
    return () => {
      alive = false;
    };
  }, []);

  const savePassword = async () => {
    if (password.length < 4) {
      setPwError("Mật khẩu khóa phải có ít nhất 4 ký tự.");
      return;
    }
    setPwError(null);
    try {
      onLockChanged(await setLockPassword(password));
      setPassword("");
      notify("Đã lưu mật khẩu khóa");
    } catch (e) {
      setPwError(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const disableLock = async () => {
    try {
      onLockChanged(await setLockPassword(null));
      notify("Đã tắt khóa màn hình");
    } catch (e) {
      setPwError(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const lockScreen = async () => {
    try {
      onLockChanged(await lockNow());
      onLocked();
    } catch (e) {
      setPwError(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const loading = totals === undefined;
  const cash = totals
    ? `${totals.cashCount} xe · ${formatVnd(totals.cashTotalVnd)}`
    : loading ? "… xe · …" : "— xe · —";
  const bank = totals
    ? `${totals.bankQrCount} xe · ${formatVnd(totals.bankQrTotalVnd)}`
    : loading ? "… xe · …" : "— xe · —";
  const waived = totals ? `${totals.waivedCount} xe` : loading ? "… xe" : "— xe";

  const cell = (title: string, value: string | number, mono = false) => (
    <div>
      <dt className="text-text-muted">{title}</dt>
      <dd className={mono ? "font-mono text-xs" : undefined}>{value}</dd>
    </div>
  );

  return (
    <section className="rounded-xl border border-line bg-card p-5">
      <dl
        className="grid gap-x-4 gap-y-3 text-sm"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
      >
        {cell("Trạm", cfg.siteId, true)}
        {cell("Server", host(cfg.apiBaseUrl), true)}
        {cell("IP thiết bị", ip, true)}
        {cell("Sự kiện chờ gửi", status?.outboxDepth ?? "—")}
        {cell("Xe trong danh sách", status?.whitelistCount ?? "—")}
      </dl>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h4 className="mb-2 text-sm font-bold">Thu phí hôm nay (thiết bị này)</h4>
        <ul className="space-y-1 text-sm">
          <li>{`Tiền mặt: ${cash}`}</li>
          <li>{`Chuyển khoản: ${bank}`}</li>
          <li>{`Miễn phí: ${waived}`}</li>
        </ul>
      </div>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h4 className="mb-2 text-sm font-bold">Khóa màn hình</h4>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block">
            <span className="mb-1 block text-xs text-text-muted">Mật khẩu khóa</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="min-h-11 rounded-lg border border-field bg-card px-3 text-sm"
            />
          </label>
          <button type="button" className={btn} onClick={() => void savePassword()}>
            Lưu mật khẩu
          </button>
          {lock?.enabled && (
            <>
              <button type="button" className={btn} onClick={() => void disableLock()}>
                Tắt khóa
              </button>
              <button type="button" className={btn} onClick={() => void lockScreen()}>
                Khóa ngay
              </button>
            </>
          )}
        </div>
        {pwError && <p className="mt-2 text-sm text-warn-ink">{pwError}</p>}
      </div>

      <div className="mt-4 border-t border-line-soft pt-4">
        <h4 className="mb-2 text-sm font-bold">Phiên bản</h4>
        <UpdateButton notify={notify} />
      </div>
    </section>
  );
}
