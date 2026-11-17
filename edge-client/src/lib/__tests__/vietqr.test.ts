import { describe, expect, it } from "vitest";
import { buildVietQrPayload, crc16ccitt } from "../vietqr";

const args = { bin: "970422", accountNumber: "0123456789", amountVnd: 25000, memo: "PV1A2B3C4D" };

describe("vietqr", () => {
  it("crc16ccitt matches the standard check value", () => {
    expect(crc16ccitt("123456789")).toBe("29B1");
  });
  it("payload ends with a CRC that matches its own body", () => {
    const p = buildVietQrPayload(args);
    expect(p.slice(-8, -4)).toBe("6304");
    expect(p.slice(-4)).toBe(crc16ccitt(p.slice(0, -4)));
  });
  it("payload contains the bin, account number, amount and memo", () => {
    const p = buildVietQrPayload(args);
    expect(p).toContain("0006970422");
    expect(p).toContain("01100123456789");
    expect(p).toContain("540525000");
    expect(p).toContain("0810PV1A2B3C4D");
    expect(p.startsWith("000201010212")).toBe(true);
    expect(p).toContain("0010A000000727");
    expect(p).toContain("0208QRIBFTTA");
    expect(p).toContain("5303704");
    expect(p).toContain("5802VN");
  });
  it("amount is written without separators", () => {
    const p = buildVietQrPayload({ ...args, amountVnd: 1250000 });
    expect(p).toContain("54071250000");
    expect(p).not.toMatch(/54\d\d[\d]*[.,]/);
  });
});
