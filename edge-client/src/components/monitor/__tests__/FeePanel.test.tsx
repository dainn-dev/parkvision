import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeePanel } from "../FeePanel";
import { PaidBanner } from "../PaidBanner";
import { EntryPhotoOverlay } from "../EntryPhotoOverlay";
import type { BankAccount, FeeQuote } from "../../../lib/tauri";

const at = (h: number, m: number) => new Date(2026, 10, 16, h, m, 0).toISOString();
const quote: FeeQuote = {
  sessionId: "s1",
  plate: "51A12345",
  enteredAt: at(8, 12),
  exitedAt: at(10, 42),
  durationMinutes: 150,
  amountVnd: 25000,
  entryGateId: null,
  entryImageKey: null,
  payCode: "PV1A2B3C4D",
  bankReceivedVnd: null,
};
const bank: BankAccount = { bin: "970422", accountNumber: "0123456789" };

function setup(over: Partial<{ quote: FeeQuote; bank: BankAccount | null; busy: boolean }> = {}) {
  const onSettle = vi.fn();
  const onWaive = vi.fn();
  render(
    <FeePanel
      quote={over.quote ?? quote}
      bank={over.bank === undefined ? bank : over.bank}
      gateName="Cổng ra 1"
      onSettle={onSettle}
      onWaive={onWaive}
      busy={over.busy ?? false}
    />,
  );
  return { onSettle, onWaive };
}

describe("FeePanel", () => {
  it("shows amount, times and duration", () => {
    setup();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("THU PHÍ XE VÃNG LAI")).toBeInTheDocument();
    expect(screen.getByText("25.000 đ")).toBeInTheDocument();
    expect(screen.getByText("08:12")).toBeInTheDocument();
    expect(screen.getByText("10:42")).toBeInTheDocument();
    expect(screen.getByText("2 giờ 30 phút")).toBeInTheDocument();
  });

  it("cash is selected by default and settles as cash", async () => {
    const { onSettle } = setup();
    expect(screen.getByRole("radio", { name: "Tiền mặt" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Đã thu 25.000 đ · Mở barrier" }));
    expect(onSettle).toHaveBeenCalledWith("cash");
  });

  it("choosing QR shows the code and settles as bank_qr", async () => {
    const { onSettle } = setup();
    expect(screen.queryByRole("img", { name: "Mã QR chuyển khoản" })).toBeNull();
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản QR" }));
    expect(screen.getByRole("img", { name: "Mã QR chuyển khoản" })).toBeInTheDocument();
    expect(screen.getByText(/Đưa mã cho tài xế quét/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Đã thu/ }));
    expect(onSettle).toHaveBeenCalledWith("bank_qr");
  });

  it("QR is disabled without a bank account", () => {
    setup({ bank: null });
    expect(screen.getByRole("radio", { name: "Chuyển khoản QR" })).toBeDisabled();
    expect(screen.getByText("Chưa cấu hình tài khoản nhận tiền")).toBeInTheDocument();
  });

  it("no tariff disables paying but allows waiving", async () => {
    const { onWaive } = setup({ quote: { ...quote, amountVnd: null } });
    expect(screen.getByText("Chưa có bảng giá")).toBeInTheDocument();
    expect(screen.queryByText("0 đ")).toBeNull();
    expect(screen.getByRole("button", { name: /Đã thu/ })).toBeDisabled();
    expect(screen.getByRole("radio", { name: "Tiền mặt" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    await userEvent.type(screen.getByLabelText("Lý do miễn phí"), "Khách VIP");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận miễn phí" }));
    expect(onWaive).toHaveBeenCalledWith("Khách VIP");
  });

  it("short transfer shows the missing amount", async () => {
    setup({ quote: { ...quote, bankReceivedVnd: 20000 } });
    await userEvent.click(screen.getByRole("radio", { name: "Chuyển khoản QR" }));
    expect(screen.getByText(/Đã nhận 20\.000 đ — còn thiếu 5\.000 đ\./)).toBeInTheDocument();
  });

  it("waive requires a non-blank reason and passes it trimmed", async () => {
    const { onWaive } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Miễn phí — Cổng ra 1")).toBeInTheDocument();
    const confirm = within(dialog).getByRole("button", { name: "Xác nhận miễn phí" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Lý do miễn phí"), "   ");
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("Lý do miễn phí"), "  Xe cứu hộ  ");
    await userEvent.click(confirm);
    expect(onWaive).toHaveBeenCalledWith("Xe cứu hộ");
  });

  it("busy disables every button", () => {
    setup({ busy: true });
    for (const b of screen.getAllByRole("button")) expect(b).toBeDisabled();
    for (const r of screen.getAllByRole("radio")) expect(r).toBeDisabled();
  });
});

describe("PaidBanner and EntryPhotoOverlay", () => {
  it("shows paid amount and method", () => {
    render(<PaidBanner reason="walk_in_paid" amountVnd={25000} method="bank_qr" />);
    expect(screen.getByText("ĐÃ THU PHÍ · MỜI QUA")).toBeInTheDocument();
    expect(screen.getByText("25.000 đ · Chuyển khoản")).toBeInTheDocument();
  });
  it("shows waived text", () => {
    render(<PaidBanner reason="walk_in_waived" amountVnd={null} method="waived" />);
    expect(screen.getByText("MIỄN PHÍ · MỜI QUA")).toBeInTheDocument();
  });
  it("entry overlay shows caption, with and without photo and gate", () => {
    const { rerender } = render(<EntryPhotoOverlay src={null} enteredAt={at(8, 12)} entryGateName="Cổng vào 1" />);
    expect(screen.getByText("Không có ảnh lúc vào")).toBeInTheDocument();
    expect(screen.getByText("Lúc vào · 08:12 · Cổng vào 1")).toBeInTheDocument();
    rerender(<EntryPhotoOverlay src="blob:x" enteredAt={at(8, 12)} />);
    expect(screen.getByText("Lúc vào · 08:12")).toBeInTheDocument();
    expect(screen.getByAltText("Ảnh xe lúc vào")).toBeInTheDocument();
  });
});
