// Vietnamese display helpers. The redesign plan (Task 1) owns the full file
// (gateLabels, barrierStateText, plateText); this holds the pieces needed by
// walk-in fee collection and must be merged with it.

export function formatVnd(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} đ`;
}

export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} phút`;
  if (r === 0) return `${h} giờ`;
  return `${h} giờ ${r} phút`;
}

const REASONS: Record<string, string> = {
  vehicle_registered: "Xe đã đăng ký",
  plate_not_registered: "Xe chưa đăng ký",
  vehicle_blacklisted: "Xe trong danh sách đen",
  vehicle_suspended: "Xe đang bị tạm ngưng",
  vehicle_not_yet_valid: "Chưa đến ngày hiệu lực",
  vehicle_expired: "Xe hết hạn đăng ký",
  anti_passback: "Xe vừa qua cổng cùng chiều",
  no_plate_detected: "Không đọc được biển số",
  walk_in_fee_due: "Xe vãng lai — chờ thu phí",
  walk_in_paid: "Xe vãng lai — đã thu phí",
  walk_in_waived: "Xe vãng lai — miễn phí",
};

export function reasonText(reason: string | null | undefined): string {
  if (!reason) return "";
  if (reason.startsWith("rule:")) return `Theo quy tắc: ${reason.slice(5)}`;
  return REASONS[reason] ?? reason;
}

export type RecentTone = "allow" | "deny" | "fee";

export function recentTag(e: {
  decision: string;
  reason: string;
  amountVnd?: number | null;
}): { text: string; tone: RecentTone } {
  switch (e.reason) {
    case "walk_in_fee_due":
      return { text: "CHỜ THU PHÍ", tone: "fee" };
    case "walk_in_paid":
      return { text: `THU ${formatVnd(e.amountVnd ?? 0)}`, tone: "fee" };
    case "walk_in_waived":
      return { text: "MIỄN PHÍ", tone: "fee" };
  }
  if (e.decision === "allow") return { text: "QUA", tone: "allow" };
  if (e.reason === "vehicle_expired") return { text: "HẾT HẠN", tone: "deny" };
  return { text: "TỪ CHỐI", tone: "deny" };
}
