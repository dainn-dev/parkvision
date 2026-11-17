import { describe, expect, it } from "vitest";
import {
  barrierStateText,
  formatDuration,
  formatVnd,
  gateLabels,
  methodText,
  payCode,
  plateText,
  reasonText,
  recentTag,
  walkInErrorText,
} from "../labels";

describe("walk-in labels", () => {
  it("formats VND", () => {
    expect(formatVnd(25000)).toBe("25.000 đ");
    expect(formatVnd(0)).toBe("0 đ");
    expect(formatVnd(1250000)).toBe("1.250.000 đ");
  });
  it("formats duration", () => {
    expect(formatDuration(150)).toBe("2 giờ 30 phút");
    expect(formatDuration(45)).toBe("45 phút");
    expect(formatDuration(120)).toBe("2 giờ");
  });
  it("explains walk-in reasons", () => {
    expect(reasonText("walk_in_fee_due")).toBe("Xe vãng lai — chờ thu phí");
    expect(reasonText("walk_in_paid")).toBe("Xe vãng lai — đã thu phí");
    expect(reasonText("walk_in_waived")).toBe("Xe vãng lai — miễn phí");
  });
  it("tags walk-in events with the fee tone", () => {
    const base = { decision: "deny", reason: "walk_in_fee_due" };
    expect(recentTag(base)).toEqual({ text: "CHỜ THU PHÍ", tone: "fee" });
    expect(recentTag({ decision: "allow", reason: "walk_in_paid", amountVnd: 25000 })).toEqual({
      text: "THU 25.000 đ",
      tone: "fee",
    });
    expect(recentTag({ decision: "allow", reason: "walk_in_waived" })).toEqual({
      text: "MIỄN PHÍ",
      tone: "fee",
    });
  });
  it("keeps the baseline tags", () => {
    expect(recentTag({ decision: "allow", reason: "vehicle_registered" })).toEqual({ text: "QUA", tone: "allow" });
    expect(recentTag({ decision: "deny", reason: "vehicle_expired" })).toEqual({ text: "HẾT HẠN", tone: "deny" });
    expect(recentTag({ decision: "deny", reason: "plate_not_registered" })).toEqual({ text: "TỪ CHỐI", tone: "deny" });
    expect(reasonText("vehicle_registered")).toBe("Xe đã đăng ký");
    expect(reasonText("rule:Khách VIP")).toBe("Theo quy tắc: Khách VIP");
    expect(reasonText("something_new")).toBe("something_new");
    expect(reasonText(null)).toBe("");
  });
});

describe("gate labels and helpers", () => {
  it("numbers gates per direction", () => {
    const l = gateLabels([
      { gateId: "a", direction: "entry" },
      { gateId: "b", direction: "exit" },
      { gateId: "c", direction: "entry" },
      { gateId: "d", direction: "both" },
    ]);
    expect(l.a).toEqual({ name: "Cổng vào 1", short: "Vào 1", badge: "VÀO" });
    expect(l.b).toEqual({ name: "Cổng ra 1", short: "Ra 1", badge: "RA" });
    expect(l.c.name).toBe("Cổng vào 2");
    expect(l.d).toEqual({ name: "Cổng 1", short: "Cổng 1", badge: "CỔNG" });
  });
  it("barrier state text", () => {
    expect(barrierStateText("closed")).toBe("đã đóng");
    expect(barrierStateText("opening")).toBe("đang mở");
    expect(barrierStateText("open")).toBe("đã mở");
    expect(barrierStateText("closing")).toBe("đang đóng");
    expect(barrierStateText("locked")).toBe("đã khóa");
    expect(barrierStateText("fault")).toBe("lỗi");
  });
  it("plate text and fee tag", () => {
    expect(plateText("")).toBe("Không đọc được");
    expect(plateText(null)).toBe("Không đọc được");
    expect(plateText("51A12345")).toBe("51A12345");
    expect(recentTag({ decision: "allow", reason: "walk_in_paid", amountVnd: 15000 })).toEqual({
      text: "THU 15.000 đ",
      tone: "fee",
    });
  });
  it("payCode", () => {
    expect(payCode("0a1b2c3d-0000-0000-0000-000000000000")).toBe("PV0A1B2C3D");
  });
  it("methodText", () => {
    expect(methodText("cash")).toBe("Tiền mặt");
    expect(methodText("bank_qr")).toBe("Chuyển khoản");
    expect(methodText("waived")).toBe("Miễn phí");
    expect(methodText(null)).toBe("");
  });
  it("walkInErrorText", () => {
    expect(walkInErrorText("already settled")).toBe("Phiên này đã được thu.");
    expect(walkInErrorText("no fee pending")).toBe("Không còn khoản phí chờ thu.");
    expect(walkInErrorText("amount unknown")).toBe("Chưa có bảng giá, chưa thể thu tiền.");
    expect(walkInErrorText("reason required")).toBe("Cần nhập lý do miễn phí.");
    expect(walkInErrorText(new Error("boom"))).toBe("boom");
    expect(walkInErrorText("gate locked")).toBe("gate locked");
  });
});
