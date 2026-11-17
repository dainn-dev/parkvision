import { useState } from "react";
import { Coins } from "lucide-react";
import { formatHmOrDay, formatHm } from "../../lib/dateFmt";
import { formatDuration, formatVnd } from "../../lib/labels";
import type { BankAccount, FeeQuote } from "../../lib/tauri";
import { buildVietQrPayload } from "../../lib/vietqr";
import { VietQr } from "./VietQr";
import { WaiveDialog } from "./WaiveDialog";

const AMBER = "#F5B700";

export interface FeePanelProps {
  quote: FeeQuote;
  bank: BankAccount | null;
  gateName: string;
  onSettle: (method: "cash" | "bank_qr") => void;
  onWaive: (reason: string) => void;
  busy: boolean;
  /** IANA zone for the times shown; device-local when omitted. */
  timeZone?: string | null;
}

export function FeePanel({ quote, bank, gateName, onSettle, onWaive, busy, timeZone }: FeePanelProps) {
  const [method, setMethod] = useState<"cash" | "bank_qr">("cash");
  const [waiving, setWaiving] = useState(false);
  const amount = quote.amountVnd;
  const hasAmount = amount != null;
  const received = quote.bankReceivedVnd;
  const short = hasAmount && received != null && received < amount;

  const option = (value: "cash" | "bank_qr", label: string, disabled: boolean) => {
    const selected = method === value;
    return (
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        disabled={disabled}
        onClick={() => setMethod(value)}
        className="flex-1 rounded-lg bg-white px-3 py-2 text-left font-semibold disabled:opacity-50"
        style={{
          color: "#1A1400",
          border: selected ? `2px solid ${AMBER}` : "2px solid transparent",
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div role="alert" className="rounded-[10px] p-3.5" style={{ background: AMBER, color: "#1A1400" }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[20px] font-extrabold">
          <Coins aria-hidden size={22} />
          THU PHÍ XE VÃNG LAI
        </div>
        <div className="font-mono text-[34px] font-bold">
          {hasAmount ? formatVnd(amount) : "Chưa có bảng giá"}
        </div>
      </div>
      <div className="mt-1 text-sm">
        Vào <b>{formatHmOrDay(quote.enteredAt, quote.exitedAt, timeZone)}</b> · Ra{" "}
        <b>{formatHm(quote.exitedAt, timeZone)}</b> · Gửi <b>{formatDuration(quote.durationMinutes)}</b>
      </div>

      <div role="radiogroup" aria-label="Hình thức thanh toán" className="mt-2 flex gap-2">
        {option("cash", "Tiền mặt", busy || !hasAmount)}
        {option("bank_qr", "Chuyển khoản QR", busy || !hasAmount || bank == null)}
      </div>
      {bank == null ? (
        <div className="mt-1 text-xs">Chưa cấu hình tài khoản nhận tiền</div>
      ) : null}

      {method === "bank_qr" && bank != null && hasAmount ? (
        <div className="mt-2 flex items-center gap-3">
          <VietQr
            size={160}
            payload={buildVietQrPayload({
              bin: bank.bin,
              accountNumber: bank.accountNumber,
              amountVnd: amount,
              memo: quote.payCode,
            })}
          />
          <div className="text-sm">
            <div>Đưa mã cho tài xế quét. Tự xác nhận khi nhận đủ tiền.</div>
            {short ? (
              <div className="mt-1 font-semibold">
                Đã nhận {formatVnd(received)} — còn thiếu {formatVnd(amount - received)}.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          disabled={busy || !hasAmount}
          onClick={() => onSettle(method)}
          className="rounded-lg px-3 py-3 text-base font-extrabold text-white disabled:opacity-40"
          style={{ flex: 3, background: "#1A1400" }}
        >
          {hasAmount ? `Đã thu ${formatVnd(amount)} · Mở barrier` : "Đã thu · Mở barrier"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setWaiving(true)}
          className="rounded-lg border-2 px-3 py-3 font-bold disabled:opacity-40"
          style={{ flex: 1, borderColor: "#1A1400" }}
        >
          Miễn phí
        </button>
      </div>

      {waiving ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[420px]">
            <WaiveDialog
              gateName={gateName}
              busy={busy}
              onCancel={() => setWaiving(false)}
              onConfirm={(reason) => {
                setWaiving(false);
                onWaive(reason);
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
