import { Check } from "lucide-react";
import { formatVnd } from "../../lib/labels";

export function PaidBanner({
  reason,
  amountVnd,
  method,
}: {
  reason: "walk_in_paid" | "walk_in_waived";
  amountVnd: number | null | undefined;
  method: string | null | undefined;
}) {
  const waived = reason === "walk_in_waived";
  const methodLabel = method === "bank_qr" ? "Chuyển khoản" : "Tiền mặt";
  return (
    <div
      role="status"
      className="flex items-center gap-3 rounded-[10px] px-4 py-3.5 text-white"
      style={{ background: "#1F6FEB" }}
    >
      <Check aria-hidden size={28} />
      <div>
        <div className="text-xl font-extrabold">
          {waived ? "MIỄN PHÍ · MỜI QUA" : "ĐÃ THU PHÍ · MỜI QUA"}
        </div>
        {waived ? null : (
          <div className="text-[15px] font-medium">
            {formatVnd(amountVnd ?? 0)} · {methodLabel}
          </div>
        )}
      </div>
    </div>
  );
}
