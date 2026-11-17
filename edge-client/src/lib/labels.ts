// Vietnamese display helpers for the operator UI.

import type { GateState } from "./tauri";

export interface GateLabel {
  name: string;
  short: string;
  badge: "VÀO" | "RA" | "CỔNG";
}

/** Derive display names locally, numbered per direction in input order. */
export function gateLabels(
  gates: { gateId: string; direction: string }[],
): Record<string, GateLabel> {
  const counts = { entry: 0, exit: 0, both: 0 };
  const out: Record<string, GateLabel> = {};
  for (const g of gates) {
    if (g.direction === "entry") {
      const n = ++counts.entry;
      out[g.gateId] = { name: `Cổng vào ${n}`, short: `Vào ${n}`, badge: "VÀO" };
    } else if (g.direction === "exit") {
      const n = ++counts.exit;
      out[g.gateId] = { name: `Cổng ra ${n}`, short: `Ra ${n}`, badge: "RA" };
    } else {
      const n = ++counts.both;
      out[g.gateId] = { name: `Cổng ${n}`, short: `Cổng ${n}`, badge: "CỔNG" };
    }
  }
  return out;
}

const BARRIER_STATES: Record<string, string> = {
  closed: "đã đóng",
  opening: "đang mở",
  open: "đã mở",
  closing: "đang đóng",
  locked: "đã khóa",
  fault: "lỗi",
};

export function barrierStateText(state: GateState): string {
  return BARRIER_STATES[state] ?? state;
}

export function plateText(plate: string | null | undefined): string {
  return plate ? plate : "Không đọc được";
}

/** Short code a driver can quote: "PV" + first 8 hex chars of the session id. */
export function payCode(sessionId: string): string {
  return "PV" + sessionId.replace(/-/g, "").slice(0, 8).toUpperCase();
}

export function methodText(m: string | null | undefined): string {
  switch (m) {
    case "cash":
      return "Tiền mặt";
    case "bank_qr":
      return "Chuyển khoản";
    case "waived":
      return "Miễn phí";
    default:
      return "";
  }
}

const WALK_IN_ERRORS: Record<string, string> = {
  "already settled": "Phiên này đã được thu.",
  "no fee pending": "Không còn khoản phí chờ thu.",
  "amount unknown": "Chưa có bảng giá, chưa thể thu tiền.",
  "reason required": "Cần nhập lý do miễn phí.",
};

/** Friendly text for known walk-in errors; otherwise the bare message (caller adds any prefix). */
export function walkInErrorText(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return WALK_IN_ERRORS[msg] ?? msg;
}

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
