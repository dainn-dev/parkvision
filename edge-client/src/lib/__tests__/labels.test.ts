import { describe, expect, it } from "vitest";
import { formatDuration, formatVnd, reasonText, recentTag } from "../labels";

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
