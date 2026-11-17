import { formatDateTime } from "../../lib/dateFmt";
import { VietQr } from "./VietQr";

export interface EntryTicketProps {
  site: string;
  plate: string;
  enteredAt: string;
  gateName: string;
  ticketCode: string;
}

export function EntryTicket(p: EntryTicketProps) {
  return (
    <div className="print-doc" data-testid="entry-ticket">
      <h1>PHIẾU VÀO</h1>
      <div>{p.site}</div>
      <hr />
      <div>Biển số</div>
      <div className="print-big">{p.plate}</div>
      <div>Giờ vào</div>
      <div>{formatDateTime(p.enteredAt)}</div>
      <div>Cổng vào</div>
      <div>{p.gateName}</div>
      <div className="print-qr">
        <VietQr payload={p.ticketCode} size={160} />
      </div>
      <div className="print-code">{p.ticketCode}</div>
    </div>
  );
}
