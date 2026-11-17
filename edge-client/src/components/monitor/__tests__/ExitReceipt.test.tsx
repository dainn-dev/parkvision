import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExitReceipt } from "../ExitReceipt";

const entered = new Date(2026, 10, 16, 8, 12, 0).toISOString();
const exited = new Date(2026, 10, 16, 10, 42, 0).toISOString();
const base = {
  site: "Bãi A", plate: "51A12345", enteredAt: entered, exitedAt: exited,
  durationMinutes: 150, amountVnd: 30000, receiptCode: "PV1A2B3C4D",
};

describe("ExitReceipt", () => {
  it("shows full entry and exit date-time", () => {
    render(<ExitReceipt {...base} method="cash" />);
    expect(screen.getByText("08:12:00 16/11/2026")).toBeInTheDocument();
    expect(screen.getByText("10:42:00 16/11/2026")).toBeInTheDocument();
    expect(screen.getByText("2 giờ 30 phút")).toBeInTheDocument();
    expect(screen.getByText("30.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Tiền mặt")).toBeInTheDocument();
  });

  it("shows Miễn phí and its reason for a waived visit", () => {
    render(<ExitReceipt {...base} amountVnd={0} method="waived" waiveReason="Khách của chủ bãi" />);
    expect(screen.getByText("Miễn phí")).toBeInTheDocument();
    expect(screen.getByText(/Khách của chủ bãi/)).toBeInTheDocument();
  });

  it("prints times in the given time zone", () => {
    render(
      <ExitReceipt
        {...base}
        method="cash"
        enteredAt="2026-11-16T01:12:00Z"
        exitedAt="2026-11-16T03:42:00Z"
        timeZone="Asia/Ho_Chi_Minh"
      />,
    );
    expect(screen.getByText("08:12:00 16/11/2026")).toBeInTheDocument();
    expect(screen.getByText("10:42:00 16/11/2026")).toBeInTheDocument();
  });
});
