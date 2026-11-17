import { useId, useRef, useState } from "react";
import { Keyboard } from "lucide-react";
import { formatHms } from "../../lib/dateFmt";
import {
  barrierStateText,
  payCode,
  plateText,
  reasonText,
  walkInErrorText,
  type GateLabel,
} from "../../lib/labels";
import { printEntryTicket, printExitReceipt } from "../../lib/printDocs";
import {
  admitWalkIn,
  manualClose,
  manualOpen,
  manualPlate,
  manualUnlock,
  settleWalkIn,
  type CameraBinding,
  type FeeQuote,
  type GateStatus,
  type SitePaymentInfo,
} from "../../lib/tauri";
import type { CamLiveInfo } from "../../lib/useEdgeData";
import { DirectionBadge } from "../ui/DirectionBadge";
import { CameraView } from "./CameraView";
import { CaptureThumb, useCaptureUrl } from "./CaptureThumb";
import { DecisionBanner } from "./DecisionBanner";
import { EntryPhotoOverlay } from "./EntryPhotoOverlay";
import { FeePanel } from "./FeePanel";
import { ManualPlateDialog } from "./ManualPlateDialog";
import { PaidBanner } from "./PaidBanner";

const PRINT_FAILED = "Không in được — kiểm tra máy in.";

export interface LaneCardProps {
  gate: GateStatus;
  label: GateLabel;
  cameras: CameraBinding[];
  camLive: Record<string, CamLiveInfo>;
  /** Bank account, time zone and site name; null until known. */
  payment: SitePaymentInfo | null;
  /** Local gate id -> display name; undefined when the gate is not on this device. */
  gateName: (gateId: string | null | undefined) => string | undefined;
  onAction: (fn: () => Promise<unknown>, okMessage: string) => void;
}

const btnBase = "min-h-[52px] rounded-[10px] px-3 text-[15px] disabled:opacity-40";
const primaryBtn = `${btnBase} bg-fg font-bold text-ink-950`;
const outlineBtn = `${btnBase} border border-ink-700 font-semibold text-fg`;
const textBtn =
  "min-h-[44px] self-start rounded-md px-2 text-sm font-semibold text-allow-fg underline disabled:opacity-40";

export function LaneCard({ gate, label, cameras, camLive, payment, gateName, onAction }: LaneCardProps) {
  const titleId = useId();
  const [plateDialog, setPlateDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const id = gate.gateId;
  const tz = payment?.timezone ?? null;
  const site = payment?.siteName ?? "Edge Gate";

  // The edge clears `pendingFee` at settlement, but the receipt still needs it
  // (including after a bank transfer settled without any click).
  const lastQuote = useRef<FeeQuote | null>(null);
  if (gate.pendingFee) lastQuote.current = gate.pendingFee;
  const waiveReasons = useRef<Record<string, string>>({});

  const pending = gate.pendingFee ?? null;
  const paidReason =
    !pending && (gate.lastReason === "walk_in_paid" || gate.lastReason === "walk_in_waived")
      ? gate.lastReason
      : null;
  // Only trust the remembered quote if it belongs to the plate on this lane now.
  const remembered =
    lastQuote.current && lastQuote.current.plate === gate.lastPlate ? lastQuote.current : null;
  const quote = pending ?? (paidReason ? remembered : null);

  const isEntry = gate.direction === "entry";
  const locked = gate.gateState === "locked";
  const fault = gate.gateState === "fault";
  const blocked = locked || fault;
  const denied = gate.lastDecision === "deny";
  const canAdmit =
    isEntry && !pending && denied && gate.lastReason === "plate_not_registered";

  const entryPhoto = useCaptureUrl(!isEntry ? quote?.entryImageKey : null);

  const open = () => onAction(() => manualOpen(id), "Đã gửi lệnh mở");
  const close = () => onAction(() => manualClose(id), "Đã gửi lệnh đóng");
  const unlock = () => onAction(() => manualUnlock(id), "Đã mở khóa");

  const printFailed = () => onAction(() => Promise.reject(PRINT_FAILED), "");

  const admit = () => {
    if (inFlight.current) return;
    const plate = gate.lastPlate ?? "";
    onAction(async () => {
      inFlight.current = true;
      try {
        let sessionId: string;
        try {
          sessionId = await admitWalkIn(id, plate);
        } catch (e) {
          throw walkInErrorText(e);
        }
        // Admission is done; a printer problem must never undo it.
        try {
          printEntryTicket({
            site,
            plate,
            enteredAt: new Date().toISOString(),
            gateName: label.name,
            ticketCode: payCode(sessionId),
            timeZone: tz,
          });
        } catch {
          printFailed();
        }
        return sessionId;
      } finally {
        inFlight.current = false;
      }
    }, "Đã cho xe vãng lai vào");
  };

  const settle = (method: "cash" | "bank_qr" | "waived", reason?: string) => {
    const q = gate.pendingFee;
    if (!q || inFlight.current) return;
    onAction(
      async () => {
        inFlight.current = true;
        setBusy(true);
        try {
          await settleWalkIn(id, q.sessionId, method, reason);
          if (reason) waiveReasons.current[q.sessionId] = reason;
        } catch (e) {
          throw walkInErrorText(e);
        } finally {
          inFlight.current = false;
          setBusy(false);
        }
      },
      method === "waived" ? "Đã miễn phí — mở barrier" : "Đã thu tiền — mở barrier",
    );
  };

  const printReceipt = () => {
    const q = remembered;
    if (!q || !paidReason) return;
    const waived = paidReason === "walk_in_waived";
    const method = gate.lastMethod ?? (waived ? "waived" : "cash");
    try {
      printExitReceipt({
        site,
        plate: q.plate,
        enteredAt: q.enteredAt,
        exitedAt: q.exitedAt,
        durationMinutes: q.durationMinutes,
        amountVnd: method === "waived" ? 0 : (gate.lastAmountVnd ?? q.amountVnd ?? 0),
        method,
        receiptCode: q.payCode,
        waiveReason: method === "waived" ? waiveReasons.current[q.sessionId] : undefined,
        timeZone: tz,
      });
    } catch {
      printFailed();
    }
  };

  const keyboardBtn = (
    <button
      type="button"
      aria-label={`Nhập biển số tay cho ${label.name}`}
      onClick={() => setPlateDialog(true)}
      className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[10px] border border-ink-700 text-fg"
    >
      <Keyboard aria-hidden size={22} />
    </button>
  );
  const closeBtn = (
    <button type="button" disabled={blocked} onClick={close} className={outlineBtn} style={{ flex: 1 }}>
      Đóng
    </button>
  );
  const unlockBtn = (cls: string, style?: React.CSSProperties) => (
    <button type="button" onClick={unlock} className={cls} style={style}>
      Mở khóa barrier
    </button>
  );

  const hasReading = gate.lastDecision != null || pending != null;
  const readingPlate = pending?.plate ?? gate.lastPlate;
  const readingText = pending ? "Xe vãng lai (chưa đăng ký)" : reasonText(gate.lastReason);
  const readingTime = gate.lastAt ? formatHms(gate.lastAt, tz) : "";

  let actions;
  if (pending) {
    actions = (
      <div className="flex flex-col gap-1">
        {locked ? (
          unlockBtn(textBtn)
        ) : (
          <button type="button" disabled={fault} onClick={open} className={textBtn}>
            Mở thủ công
          </button>
        )}
      </div>
    );
  } else if (paidReason) {
    actions = (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!remembered}
            title={remembered ? undefined : "Không có dữ liệu biên lai"}
            onClick={printReceipt}
            className={primaryBtn}
            style={{ flex: 2 }}
          >
            In biên lai
          </button>
          {closeBtn}
          {keyboardBtn}
        </div>
        {locked ? unlockBtn(textBtn) : null}
      </div>
    );
  } else {
    const plateEmpty = !(gate.lastPlate ?? "").trim();
    let primary;
    if (locked) {
      primary = unlockBtn(primaryBtn, { flex: 2 });
    } else if (canAdmit) {
      primary = (
        <button
          type="button"
          disabled={fault || plateEmpty}
          onClick={admit}
          className={primaryBtn}
          style={{ flex: 2 }}
        >
          Cho xe vãng lai vào
        </button>
      );
    } else {
      primary = (
        <button type="button" disabled={fault} onClick={open} className={primaryBtn} style={{ flex: 2 }}>
          {denied ? "Mở thủ công" : "Mở barrier"}
        </button>
      );
    }
    actions = (
      <div className="flex flex-col gap-1">
        <div className="flex gap-2">
          {primary}
          {closeBtn}
          {keyboardBtn}
        </div>
        {canAdmit && !locked ? (
          <div className="flex items-center gap-3">
            <button type="button" disabled={fault} onClick={open} className={textBtn}>
              Mở thủ công
            </button>
            {plateEmpty ? (
              <span className="text-sm text-fg-muted">Nhập biển số tay trước khi cho xe vào.</span>
            ) : null}
          </div>
        ) : null}
        {fault ? (
          <div className="text-sm text-deny-fg">Barrier đang báo lỗi — kiểm tra thiết bị.</div>
        ) : null}
      </div>
    );
  }

  return (
    <section
      aria-labelledby={titleId}
      className="flex min-h-0 flex-col gap-3 overflow-y-auto rounded-[14px] border border-ink-800 bg-ink-900 p-3 text-fg"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <DirectionBadge direction={gate.direction} tone="dark" />
          <h2 id={titleId} className="text-base font-bold">
            {label.name}
          </h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-fg-muted">
          {gate.barrierLinkOk === false ? (
            <span className="rounded-md bg-ink-850 px-2 py-0.5 text-xs font-semibold text-deny-fg">
              Mất kết nối relay
            </span>
          ) : null}
          <span>
            Barrier: <b className="text-fg">{barrierStateText(gate.gateState)}</b>
          </span>
        </div>
      </header>

      <CameraView cameras={cameras} camLive={camLive} gateName={label.name}>
        {!isEntry && quote ? (
          <EntryPhotoOverlay
            src={entryPhoto}
            enteredAt={quote.enteredAt}
            entryGateName={gateName(quote.entryGateId)}
            timeZone={tz}
          />
        ) : null}
      </CameraView>

      {hasReading ? (
        <div className="flex items-center gap-3">
          <CaptureThumb imageKey={gate.lastPlateImageKey} />
          <div className="min-w-0">
            <span
              className="inline-block rounded-md bg-plate px-3 font-mono text-[32px] font-bold leading-[42px] text-ink-950"
              style={{ border: "2px solid #0E1014", outline: "1px solid #5B5F69" }}
            >
              {plateText(readingPlate)}
            </span>
            <div className="mt-1 text-sm text-fg-muted">
              {readingTime ? `${readingTime} · ` : ""}
              {readingText}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <CaptureThumb imageKey={gate.lastPlateImageKey} />
          <span className="text-fg-dim">Chờ biển số…</span>
        </div>
      )}

      {pending ? (
        <FeePanel
          quote={pending}
          bank={payment?.bankAccount ?? null}
          gateName={label.name}
          busy={busy}
          timeZone={tz}
          onSettle={(m) => settle(m)}
          onWaive={(reason) => settle("waived", reason)}
        />
      ) : paidReason ? (
        <PaidBanner reason={paidReason} amountVnd={gate.lastAmountVnd} method={gate.lastMethod} />
      ) : gate.lastDecision != null ? (
        <DecisionBanner decision={gate.lastDecision} reason={gate.lastReason} />
      ) : null}

      {actions}

      {plateDialog ? (
        <ManualPlateDialog
          gateName={label.name}
          onClose={() => setPlateDialog(false)}
          onSubmit={(p) => onAction(() => manualPlate(p, id), `Đã gửi biển ${p}`)}
        />
      ) : null}
    </section>
  );
}
