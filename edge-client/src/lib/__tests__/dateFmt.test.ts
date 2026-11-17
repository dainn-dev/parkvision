import { describe, expect, it } from "vitest";
import { formatDateTime, formatHm, formatHmOrDay, formatHms } from "../dateFmt";

const VN = "Asia/Ho_Chi_Minh";

describe("dateFmt with a time zone", () => {
  it("formatHm uses the given zone", () => {
    expect(formatHm("2026-11-16T01:12:00Z", VN)).toBe("08:12");
    expect(formatHm("2026-11-16T01:12:00Z", "UTC")).toBe("01:12");
  });

  it("formatHms includes seconds", () => {
    expect(formatHms("2026-11-16T01:12:09Z", VN)).toBe("08:12:09");
  });

  it("formatDateTime uses the given zone, across a date boundary", () => {
    expect(formatDateTime("2026-11-16T20:05:30Z", VN)).toBe("03:05:30 17/11/2026");
  });

  it("midnight is 00, not 24", () => {
    expect(formatHm("2026-11-16T17:00:00Z", VN)).toBe("00:00");
  });

  it("formatHmOrDay compares days in the given zone", () => {
    // 23:30 UTC on the 15th is 06:30 on the 16th in Vietnam: same day as the exit.
    expect(formatHmOrDay("2026-11-15T23:30:00Z", "2026-11-16T03:00:00Z", VN)).toBe("06:30");
    // ...but a different day in UTC.
    expect(formatHmOrDay("2026-11-15T23:30:00Z", "2026-11-16T03:00:00Z", "UTC")).toBe("15/11 23:30");
  });

  it("an invalid zone falls back to device-local rather than throwing", () => {
    expect(formatHm("2026-11-16T01:12:00Z", "Not/AZone")).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("dateFmt without a time zone", () => {
  it("stays device-local", () => {
    const d = new Date(2026, 10, 16, 8, 12, 5);
    expect(formatHm(d.toISOString())).toBe("08:12");
    expect(formatHms(d.toISOString())).toBe("08:12:05");
    expect(formatDateTime(d.toISOString())).toBe("08:12:05 16/11/2026");
  });
});
