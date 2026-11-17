import { formatDateTime } from "../../lib/dateFmt";
import { formatDuration, formatVnd } from "../../lib/labels";
import { VietQr } from "./VietQr";

export interface ExitReceiptProps {
  site: string;
  plate: string;
  enteredAt: string;
  exitedAt: string;
  durationMinutes: number;
  amountVnd: number;
  method: string;
  receiptCode: string;
  waiveReason?: string;
  timeZone?: string | null;
}

export const methodText = (m: string): string =>
  m === "cash" ? "Tiền mặt" : m === "bank_qr" ? "Chuyển khoản" : m === "waived" ? "Miễn phí" : m;

export function ExitReceipt(p: ExitReceiptProps) {
  return (
    <div className="print-doc" data-testid="exit-receipt">
      <h1>BIÊN LAI GỬI XE</h1>
      <div>{p.site}</div>
      <hr />
      <div>Biển số</div>
      <div className="print-big">{p.plate}</div>
      <div>Giờ vào</div>
      <div>{formatDateTime(p.enteredAt, p.timeZone)}</div>
      <div>Giờ ra</div>
      <div>{formatDateTime(p.exitedAt, p.timeZone)}</div>
      <div>Thời gian gửi</div>
      <div>{formatDuration(p.durationMinutes)}</div>
      <div>Số tiền</div>
      <div className="print-big">{formatVnd(p.amountVnd)}</div>
      <div>Hình thức</div>
      <div>{methodText(p.method)}</div>
      {p.waiveReason ? <div>Lý do: {p.waiveReason}</div> : null}
      <div className="print-qr">
        <VietQr payload={p.receiptCode} size={160} />
      </div>
      <div className="print-code">{p.receiptCode}</div>
    </div>
  );
}
