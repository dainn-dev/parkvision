import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EntryTicket } from "../EntryTicket";
import { printEntryTicket, printExitReceipt } from "../../../lib/printDocs";

const entered = new Date(2026, 10, 16, 8, 12, 0).toISOString();
const exited = new Date(2026, 10, 16, 10, 42, 0).toISOString();

afterEach(() => vi.restoreAllMocks());

describe("EntryTicket", () => {
  it("shows full entry date-time and gate", () => {
    render(<EntryTicket site="Bãi A" plate="51A12345" enteredAt={entered} gateName="Cổng vào 1" ticketCode="PV1A2B3C4D" />);
    expect(screen.getByText("PHIẾU VÀO")).toBeInTheDocument();
    expect(screen.getByText("08:12:00 16/11/2026")).toBeInTheDocument();
    expect(screen.getByText("Cổng vào 1")).toBeInTheDocument();
    expect(screen.getByText("51A12345")).toBeInTheDocument();
    expect(screen.getByText("PV1A2B3C4D")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Mã QR chuyển khoản" })).toBeInTheDocument();
  });

  it("printEntryTicket and printExitReceipt each call window.print once", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    printEntryTicket({ site: "Bãi A", plate: "51A12345", enteredAt: entered, gateName: "Cổng vào 1", ticketCode: "PV1" });
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.getElementById("print-root")?.textContent).toContain("PHIẾU VÀO");
    printExitReceipt({
      site: "Bãi A", plate: "51A12345", enteredAt: entered, exitedAt: exited,
      durationMinutes: 150, amountVnd: 30000, method: "cash", receiptCode: "PV1",
    });
    expect(print).toHaveBeenCalledTimes(2);
    expect(document.getElementById("print-root")?.textContent).toContain("BIÊN LAI GỬI XE");
  });
});
