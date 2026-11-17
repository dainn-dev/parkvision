import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../lib/tauri", () => ({
  manualOpen: vi.fn(),
  manualClose: vi.fn(),
  manualUnlock: vi.fn(),
  manualPlate: vi.fn(),
  captureImage: vi.fn(),
  admitWalkIn: vi.fn(),
  settleWalkIn: vi.fn(),
}));
vi.mock("../../../lib/printDocs", () => ({
  printEntryTicket: vi.fn(),
  printExitReceipt: vi.fn(),
}));

import * as tauri from "../../../lib/tauri";
import * as print from "../../../lib/printDocs";
import { LaneCard } from "../LaneCard";
import { payCode } from "../../../lib/labels";
import type { GateStatus, FeeQuote, SitePaymentInfo, CameraBinding } from "../../../lib/tauri";
import type { GateLabel } from "../../../lib/labels";

const m = vi.mocked(tauri);
const p = vi.mocked(print);

const at = (d: number, h: number, mi: number, s = 0) => new Date(2026, 10, d, h, mi, s).toISOString();

const quote: FeeQuote = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  plate: "51A12345",
  enteredAt: at(16, 8, 12),
  exitedAt: at(16, 10, 42),
  durationMinutes: 150,
  amountVnd: 25000,
  entryGateId: null,
  entryImageKey: null,
  payCode: "PV1A2B3C4D",
  bankReceivedVnd: null,
};

const ENTERED_AT = "2026-11-16T01:02:03.000Z";

const entryLabel: GateLabel = { name: "Cổng vào 1", short: "Vào 1", badge: "VÀO" };
const exitLabel: GateLabel = { name: "Cổng ra 1", short: "Ra 1", badge: "RA" };
const cam: CameraBinding = { cameraId: "c1", purpose: "plate", streamUrl: "rtsp://x" };

function gateOf(over: Partial<GateStatus> = {}): GateStatus {
  return {
    gateId: "g1",
    direction: "entry",
    gateState: "closed",
    armAngleDeg: 0,
    motorTempC: 0,
    loopActive: false,
    upsBattery: 100,
    barrierLinkOk: true,
    lastPlate: null,
    lastDecision: null,
    lastReason: null,
    pendingFee: null,
    lastAmountVnd: null,
    lastMethod: null,
    lastAt: at(16, 10, 42, 9),
    lastPlateImageKey: null,
    ...over,
  };
}

interface Opts {
  label?: GateLabel;
  cameras?: CameraBinding[];
  camLive?: Record<string, { jpeg?: string; state?: string; detail?: string }>;
  payment?: SitePaymentInfo | null;
  gateName?: (id: string | null | undefined) => string | undefined;
}

function ui(gate: GateStatus, onAction: ReturnType<typeof vi.fn>, o: Opts = {}) {
  return (
    <LaneCard
      gate={gate}
      label={o.label ?? (gate.direction === "exit" ? exitLabel : entryLabel)}
      cameras={o.cameras ?? [cam]}
      camLive={o.camLive ?? {}}
      payment={o.payment === undefined ? null : o.payment}
      gateName={o.gateName ?? (() => undefined)}
      onAction={onAction as never}
    />
  );
}

function setup(over: Partial<GateStatus> = {}, o: Opts = {}) {
  const onAction = vi.fn();
  const view = render(ui(gateOf(over), onAction, o));
  const rerender = (next: Partial<GateStatus>, o2: Opts = o) =>
    view.rerender(ui(gateOf(next), onAction, o2));
  return { ...view, onAction, rerender };
}

/** The function LaneCard handed to onAction on call `n`. */
const fnOf = (onAction: ReturnType<typeof vi.fn>, n = 0) =>
  onAction.mock.calls[n][0] as () => Promise<unknown>;

/** Runs the function inside act, since settling updates component state. */
const run = (onAction: ReturnType<typeof vi.fn>, n = 0) =>
  act(async () => {
    await fnOf(onAction, n)();
  });
/** Same, but returns the rejection reason. */
const runRejected = async (onAction: ReturnType<typeof vi.fn>, n = 0) => {
  let reason: unknown = "did not reject";
  await act(async () => {
    await fnOf(onAction, n)().catch((e) => {
      reason = e;
    });
  });
  return reason;
};

beforeEach(() => {
  vi.resetAllMocks();
  m.captureImage.mockResolvedValue(new ArrayBuffer(0));
  m.admitWalkIn.mockResolvedValue({ sessionId: "new-session-id-0000", enteredAt: ENTERED_AT });
  m.settleWalkIn.mockResolvedValue(undefined);
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
});

describe("LaneCard — basics (redesign Task 5)", () => {
  it("allowed reading shows plate, MỜI QUA and Mở barrier", () => {
    setup({
      gateState: "open",
      lastPlate: "51A12345",
      lastDecision: "allow",
      lastReason: "vehicle_registered",
    });
    expect(screen.getByText("51A12345")).toBeInTheDocument();
    expect(within(screen.getByRole("status")).getByText("MỜI QUA")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mở barrier" })).toBeInTheDocument();
    expect(screen.getByText(/Barrier:/)).toHaveTextContent("Barrier: đã mở");
  });

  it("denied reading shows the reason and Mở thủ công", () => {
    setup({
      direction: "exit",
      lastPlate: "51A12345",
      lastDecision: "deny",
      lastReason: "plate_not_registered",
    });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("TỪ CHỐI");
    expect(alert).toHaveTextContent("Xe chưa đăng ký");
    expect(screen.getByRole("button", { name: "Mở thủ công" })).toBeInTheDocument();
  });

  it("locked gate disables close and offers unlock", async () => {
    const { onAction } = setup({ gateState: "locked" });
    expect(screen.getByRole("button", { name: "Đóng" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Mở barrier" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Mở khóa barrier" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã mở khóa");
    await run(onAction);
    expect(m.manualUnlock).toHaveBeenCalledWith("g1");
  });

  it("fault gate disables open and close", () => {
    setup({ gateState: "fault" });
    expect(screen.getByRole("button", { name: "Mở barrier" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeDisabled();
    expect(screen.getByText("Barrier đang báo lỗi — kiểm tra thiết bị.")).toBeInTheDocument();
  });

  it("no cameras shows Chưa gán camera and no img", () => {
    setup({}, { cameras: [] });
    expect(screen.getByText("Chưa gán camera")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("stream error shows the worker detail", () => {
    setup({}, { camLive: { c1: { state: "worker_error", detail: "camera offline" } } });
    expect(screen.getByText("camera offline")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("missing capture falls back to placeholder", async () => {
    m.captureImage.mockRejectedValue("gone");
    setup({ lastPlateImageKey: "k1", lastPlate: "51A12345", lastDecision: "allow" });
    expect(await screen.findByText("Chưa có ảnh")).toBeInTheDocument();
    expect(m.captureImage).toHaveBeenCalledWith("k1");
  });

  it("without a capture key the capture is not requested", () => {
    setup({ lastPlateImageKey: null, lastPlate: "51A12345", lastDecision: "allow" });
    expect(m.captureImage).not.toHaveBeenCalled();
    expect(screen.getByText("Chưa có ảnh")).toBeInTheDocument();
  });

  it("empty plate reads Không đọc được", () => {
    setup({ lastPlate: "", lastDecision: "deny", lastReason: "no_plate_detected" });
    expect(screen.getByText("Không đọc được")).toBeInTheDocument();
  });

  it("no reading yet shows Chờ biển số… and no banner", () => {
    setup({ lastDecision: null });
    expect(screen.getByText("Chờ biển số…")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("manual plate is trimmed, upper-cased and sent for this gate", async () => {
    const { onAction } = setup();
    await userEvent.click(
      screen.getByRole("button", { name: "Nhập biển số tay cho Cổng vào 1" }),
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Nhập biển số tay — Cổng vào 1");
    await userEvent.type(within(dialog).getByRole("textbox"), " 30e-892.41 {Enter}");
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi biển 30E-892.41");
    await run(onAction);
    expect(m.manualPlate).toHaveBeenCalledWith("30E-892.41", "g1");
  });

  it("open button only reports that the command was sent", async () => {
    const { onAction } = setup({ gateState: "closed" });
    await userEvent.click(screen.getByRole("button", { name: "Mở barrier" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi lệnh mở");
    await run(onAction);
    expect(m.manualOpen).toHaveBeenCalledWith("g1");
    expect(screen.getByText(/Barrier:/)).toHaveTextContent("Barrier: đã đóng");
  });

  it("close sends the close command", async () => {
    const { onAction } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Đóng" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi lệnh đóng");
    await run(onAction);
    expect(m.manualClose).toHaveBeenCalledWith("g1");
  });

  it("relay link loss is shown", () => {
    setup({ barrierLinkOk: false });
    expect(screen.getByText("Mất kết nối relay")).toBeInTheDocument();
  });

  it("live frame is shown with the LIVE chip; chips switch camera", async () => {
    const cams: CameraBinding[] = [
      { cameraId: "c1", purpose: "plate", streamUrl: "x" },
      { cameraId: "c2", purpose: "overview", streamUrl: "y" },
    ];
    setup(
      {},
      {
        cameras: cams,
        camLive: {
          c1: { jpeg: "AAA", state: "live" },
          c2: { jpeg: "BBB", state: "live" },
        },
      },
    );
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    const img = screen.getByAltText("Cổng vào 1 — camera trực tiếp");
    expect(img.getAttribute("src")).toContain("AAA");
    await userEvent.click(screen.getByRole("button", { name: "CAM TOÀN CẢNH" }));
    expect(screen.getByAltText("Cổng vào 1 — camera trực tiếp").getAttribute("src")).toContain(
      "BBB",
    );
  });
});

describe("LaneCard — walk-in admission", () => {
  const unregistered: Partial<GateStatus> = {
    direction: "entry",
    lastPlate: "51A12345",
    lastDecision: "deny",
    lastReason: "plate_not_registered",
  };

  it("unregistered plate at entry offers Cho xe vãng lai vào and calls admitWalkIn", async () => {
    const { onAction } = setup(unregistered);
    expect(screen.getByRole("alert")).toHaveTextContent("TỪ CHỐI");
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã cho xe vãng lai vào");
    await run(onAction);
    expect(m.admitWalkIn).toHaveBeenCalledWith("g1", "51A12345");
  });

  it("manual open stays reachable beside the admission button", async () => {
    const { onAction } = setup(unregistered);
    await userEvent.click(screen.getByRole("button", { name: "Mở thủ công" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi lệnh mở");
    await run(onAction);
    expect(m.manualOpen).toHaveBeenCalledWith("g1");
  });

  it("successful admission prints the entry ticket", async () => {
    const { onAction } = setup(unregistered, { payment: null });
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await run(onAction);
    expect(p.printEntryTicket).toHaveBeenCalledTimes(1);
    expect(p.printEntryTicket).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: "51A12345",
        gateName: "Cổng vào 1",
        ticketCode: payCode("new-session-id-0000"),
        enteredAt: ENTERED_AT,
      }),
    );
  });

  it("after admission the button is gone for that reading; a new reading offers it again", async () => {
    const { onAction, rerender } = setup(unregistered);
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await run(onAction);
    expect(screen.queryByRole("button", { name: "Cho xe vãng lai vào" })).toBeNull();
    rerender({ ...unregistered, lastAt: at(16, 10, 50) });
    expect(screen.getByRole("button", { name: "Cho xe vãng lai vào" })).toBeInTheDocument();
  });

  it("print failure after admission does not undo it", async () => {
    p.printEntryTicket.mockImplementation(() => {
      throw new Error("no printer");
    });
    const { onAction } = setup(unregistered);
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await expect(fnOf(onAction)()).resolves.toEqual({ sessionId: "new-session-id-0000", enteredAt: ENTERED_AT });
    expect(onAction).toHaveBeenCalledTimes(2);
    await expect(fnOf(onAction, 1)()).rejects.toBe("Không in được — kiểm tra máy in.");
  });

  it("an admission failure is passed through walkInErrorText", async () => {
    m.admitWalkIn.mockRejectedValue("gate busy");
    const { onAction } = setup(unregistered);
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await expect(fnOf(onAction)()).rejects.toBe("gate busy");
    expect(p.printEntryTicket).not.toHaveBeenCalled();
  });

  it("an empty plate disables admission and says why", () => {
    setup({ ...unregistered, lastPlate: "" });
    expect(screen.getByRole("button", { name: "Cho xe vãng lai vào" })).toBeDisabled();
    expect(screen.getByText("Nhập biển số tay trước khi cho xe vào.")).toBeInTheDocument();
  });

  it("unregistered plate at exit without a session still shows TỪ CHỐI and Mở thủ công", () => {
    setup({ ...unregistered, direction: "exit" });
    expect(screen.getByRole("alert")).toHaveTextContent("TỪ CHỐI");
    expect(screen.getByRole("button", { name: "Mở thủ công" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cho xe vãng lai vào" })).toBeNull();
  });

  it("blacklisted plate at entry does not offer admission", () => {
    setup({ ...unregistered, lastReason: "vehicle_blacklisted" });
    expect(screen.queryByRole("button", { name: "Cho xe vãng lai vào" })).toBeNull();
    expect(screen.getByRole("button", { name: "Mở thủ công" })).toBeInTheDocument();
  });

  it("print uses the site name, falling back to Edge Gate", async () => {
    const pay: SitePaymentInfo = {
      bankAccount: null,
      timezone: "Asia/Ho_Chi_Minh",
      siteName: "Bãi xe A",
    };
    const a = setup(unregistered, { payment: pay });
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await run(a.onAction);
    expect(p.printEntryTicket).toHaveBeenLastCalledWith(
      expect.objectContaining({ site: "Bãi xe A" }),
    );
    a.unmount();

    const b = setup(unregistered, { payment: null });
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await run(b.onAction);
    expect(p.printEntryTicket).toHaveBeenLastCalledWith(
      expect.objectContaining({ site: "Edge Gate" }),
    );
  });
});

describe("LaneCard — fee panel, settlement, receipt", () => {
  const pending = (q: Partial<FeeQuote> = {}): Partial<GateStatus> => ({
    direction: "exit",
    lastPlate: "51A12345",
    lastDecision: "deny",
    lastReason: "walk_in_fee_due",
    pendingFee: { ...quote, ...q },
  });
  const paid = (over: Partial<GateStatus> = {}): Partial<GateStatus> => ({
    direction: "exit",
    lastPlate: "51A12345",
    lastDecision: "allow",
    lastReason: "walk_in_paid",
    lastMethod: "bank_qr",
    lastAmountVnd: 25000,
    pendingFee: null,
    ...over,
  });
  const settleBtn = () => screen.getByRole("button", { name: "Đã thu 25.000 đ · Mở barrier" });

  it("pending fee replaces the decision banner and keeps Mở thủ công", async () => {
    const { onAction } = setup(pending());
    expect(screen.getByText("THU PHÍ XE VÃNG LAI")).toBeInTheDocument();
    expect(screen.queryByText("TỪ CHỐI")).toBeNull();
    expect(screen.getByText(/Xe vãng lai \(chưa đăng ký\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Mở thủ công" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi lệnh mở");
  });

  it("settling calls settleWalkIn for this session and gate", async () => {
    const { onAction } = setup(pending());
    await userEvent.click(settleBtn());
    expect(onAction.mock.calls[0][1]).toBe("Đã thu tiền — mở barrier");
    await run(onAction);
    expect(m.settleWalkIn).toHaveBeenCalledWith("g1", quote.sessionId, "cash", undefined);
  });

  it("waiving sends the trimmed reason", async () => {
    const { onAction } = setup(pending());
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    await userEvent.type(screen.getByLabelText("Lý do miễn phí"), "  xe khách VIP ");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận miễn phí" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã miễn phí — mở barrier");
    await run(onAction);
    expect(m.settleWalkIn).toHaveBeenCalledWith("g1", quote.sessionId, "waived", "xe khách VIP");
  });

  it("settle failure is reported through onAction and the panel stays", async () => {
    m.settleWalkIn.mockRejectedValue("network down");
    const { onAction } = setup(pending());
    await userEvent.click(settleBtn());
    expect(await runRejected(onAction)).toBe("network down");
    expect(screen.getByText("THU PHÍ XE VÃNG LAI")).toBeInTheDocument();
    expect(settleBtn()).toBeEnabled();
  });

  it("second settle reports a plain message and keeps the panel", async () => {
    m.settleWalkIn.mockRejectedValue(new Error("already settled"));
    const { onAction } = setup(pending());
    await userEvent.click(settleBtn());
    expect(await runRejected(onAction)).toBe("Phiên này đã được thu.");
    expect(screen.getByText("THU PHÍ XE VÃNG LAI")).toBeInTheDocument();
  });

  it("double click settles once", async () => {
    let release!: () => void;
    m.settleWalkIn.mockReturnValue(new Promise<void>((r) => (release = r)));
    const onAction = vi.fn((fn: () => Promise<unknown>) => void fn().catch(() => {}));
    render(ui(gateOf(pending()), onAction));
    await userEvent.dblClick(settleBtn());
    expect(m.settleWalkIn).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
    await act(async () => release());
  });

  it("settled lane shows ĐÃ THU PHÍ · MỜI QUA with amount and method", () => {
    setup(paid({ lastMethod: "cash" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("ĐÃ THU PHÍ · MỜI QUA");
    expect(status).toHaveTextContent("25.000 đ · Tiền mặt");
    expect(screen.getByRole("button", { name: "In biên lai" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Đóng" })).toBeInTheDocument();
  });

  it("In biên lai prints the exit receipt", async () => {
    const { rerender } = setup(pending());
    rerender(paid({ lastMethod: "cash" }));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1); // automatic
    await userEvent.click(screen.getByRole("button", { name: "In biên lai" }));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(2); // reprint
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: "51A12345",
        method: "cash",
        amountVnd: 25000,
        receiptCode: "PV1A2B3C4D",
      }),
    );
  });

  it("bank transfer settling without a click switches to the paid banner", async () => {
    const { rerender } = setup(pending(), { payment: null });
    expect(screen.getByText("THU PHÍ XE VÃNG LAI")).toBeInTheDocument();
    rerender(paid());
    expect(screen.queryByText("THU PHÍ XE VÃNG LAI")).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("ĐÃ THU PHÍ · MỜI QUA");
    expect(status).toHaveTextContent("25.000 đ · Chuyển khoản");
    await userEvent.click(screen.getByRole("button", { name: "In biên lai" }));
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        site: "Edge Gate",
        plate: quote.plate,
        enteredAt: quote.enteredAt,
        exitedAt: quote.exitedAt,
        durationMinutes: 150,
        amountVnd: 25000,
        method: "bank_qr",
      }),
    );
  });

  it("auto settlement while the waive dialog is open leaves the paid banner, no dialog", async () => {
    const { rerender } = setup(pending());
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    rerender(paid());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("ĐÃ THU PHÍ · MỜI QUA");
  });

  it("receipt button is disabled when no quote was seen", () => {
    setup(paid());
    const btn = screen.getByRole("button", { name: "In biên lai" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", "Không có dữ liệu biên lai");
    expect(p.printExitReceipt).not.toHaveBeenCalled();
  });

  it("waive reason reaches the automatic receipt when the status arrives before settleWalkIn resolves", async () => {
    let finish: () => void = () => {};
    m.settleWalkIn.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const { onAction, rerender } = setup(pending());
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    await userEvent.type(screen.getByLabelText("Lý do miễn phí"), "khách VIP");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận miễn phí" }));
    let done: Promise<unknown> = Promise.resolve();
    act(() => {
      done = fnOf(onAction)();
    });
    rerender(paid({ lastReason: "walk_in_waived", lastMethod: "waived", lastAmountVnd: 0 }));
    await act(async () => {
      finish();
      await done;
    });
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ method: "waived", waiveReason: "khách VIP" }),
    );
  });

  it("a waived visit's receipt carries the reason and no amount", async () => {
    const { onAction, rerender } = setup(pending());
    await userEvent.click(screen.getByRole("button", { name: "Miễn phí" }));
    await userEvent.type(screen.getByLabelText("Lý do miễn phí"), "khách VIP");
    await userEvent.click(screen.getByRole("button", { name: "Xác nhận miễn phí" }));
    await run(onAction);
    rerender(paid({ lastReason: "walk_in_waived", lastMethod: "waived", lastAmountVnd: 0 }));
    expect(screen.getByRole("status")).toHaveTextContent("MIỄN PHÍ · MỜI QUA");
    await userEvent.click(screen.getByRole("button", { name: "In biên lai" }));
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ method: "waived", amountVnd: 0, waiveReason: "khách VIP" }),
    );
  });

  it("a receipt print failure is surfaced and can be retried", async () => {
    const { onAction, rerender } = setup(pending());
    rerender(paid());
    p.printExitReceipt.mockClear();
    p.printExitReceipt.mockImplementationOnce(() => {
      throw new Error("spooler");
    });
    await userEvent.click(screen.getByRole("button", { name: "In biên lai" }));
    expect(await runRejected(onAction)).toBe("Không in được — kiểm tra máy in.");
    await userEvent.click(screen.getByRole("button", { name: "In biên lai" }));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(2);
  });

  it("times are shown in the site time zone", () => {
    const pay: SitePaymentInfo = {
      bankAccount: null,
      timezone: "Asia/Ho_Chi_Minh",
      siteName: null,
    };
    const q = { enteredAt: "2026-11-16T01:12:00Z", exitedAt: "2026-11-16T03:42:00Z" };
    setup(pending(q), { payment: pay });
    expect(screen.getAllByText("08:12").length).toBeGreaterThan(0);
    expect(screen.getByText("10:42")).toBeInTheDocument();
  });

  it("earlier-day entry shows the date", () => {
    const y = at(15, 22, 5);
    setup(pending({ enteredAt: y, durationMinutes: 760 }));
    expect(screen.getByText(/^\d{2}\/\d{2} \d{2}:\d{2}$/)).toHaveTextContent("15/11 22:05");
  });

  it("cash settle prints the receipt exactly once, even after the paid state arrives", async () => {
    const { onAction, rerender } = setup(pending());
    await userEvent.click(settleBtn());
    await run(onAction);
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        plate: quote.plate,
        method: "cash",
        amountVnd: 25000,
        receiptCode: "PV1A2B3C4D",
      }),
    );
    rerender(paid({ lastMethod: "cash" }));
    rerender(paid({ lastMethod: "cash" }));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
  });

  it("bank transfer auto settlement prints once with the remembered quote", () => {
    const { rerender } = setup(pending(), { payment: null });
    expect(p.printExitReceipt).not.toHaveBeenCalled();
    rerender(paid());
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
    expect(p.printExitReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        site: "Edge Gate",
        plate: quote.plate,
        enteredAt: quote.enteredAt,
        exitedAt: quote.exitedAt,
        durationMinutes: 150,
        amountVnd: 25000,
        method: "bank_qr",
        receiptCode: "PV1A2B3C4D",
      }),
    );
    rerender(paid());
    rerender(paid({ lastAt: at(16, 10, 43) }));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
  });

  it("a print failure after settle still reports the settlement as successful", async () => {
    p.printExitReceipt.mockImplementation(() => {
      throw new Error("spooler");
    });
    const { onAction } = setup(pending());
    await userEvent.click(settleBtn());
    await act(async () => {
      await expect(fnOf(onAction)()).resolves.toBeUndefined();
    });
    expect(m.settleWalkIn).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(2);
    expect(await runRejected(onAction, 1)).toBe("Không in được — kiểm tra máy in.");
  });

  it("manual open is available in the paid state", async () => {
    const { onAction } = setup(paid());
    await userEvent.click(screen.getByRole("button", { name: "Mở thủ công" }));
    expect(onAction.mock.calls[0][1]).toBe("Đã gửi lệnh mở");
    await run(onAction);
    expect(m.manualOpen).toHaveBeenCalledWith("g1");
  });

  it("camera chips meet the 44 px touch target", () => {
    const cams: CameraBinding[] = [
      { cameraId: "c1", purpose: "plate", streamUrl: "x" },
      { cameraId: "c2", purpose: "overview", streamUrl: "y" },
    ];
    setup({}, { cameras: cams });
    for (const name of ["CAM BIỂN SỐ", "CAM TOÀN CẢNH"]) {
      const chip = screen.getByRole("button", { name });
      expect(chip.className).toContain("min-h-[44px]");
      expect(chip.className).toContain("min-w-[44px]");
    }
  });

  it("entry photo overlay without a key or on another device", () => {
    const gateName = vi.fn((id: string | null | undefined) =>
      id === "ge" ? "Cổng vào 1" : undefined,
    );

    const a = setup(pending({ entryImageKey: null, entryGateId: "other-device" }), { gateName });
    expect(screen.getByText("Không có ảnh lúc vào")).toBeInTheDocument();
    expect(screen.getByText("Lúc vào · 08:12")).toBeInTheDocument();
    expect(m.captureImage).not.toHaveBeenCalled();
    a.unmount();

    setup(pending({ entryImageKey: null, entryGateId: "ge" }), { gateName });
    expect(screen.getByText("Lúc vào · 08:12 · Cổng vào 1")).toBeInTheDocument();
  });

  it("entry photo is loaded when a key exists, and stays after settlement", async () => {
    const { rerender } = setup(pending({ entryImageKey: "entry-1.jpg" }));
    expect(await screen.findByAltText("Ảnh xe lúc vào")).toBeInTheDocument();
    expect(m.captureImage).toHaveBeenCalledWith("entry-1.jpg");
    rerender(paid());
    expect(await screen.findByAltText("Ảnh xe lúc vào")).toBeInTheDocument();
  });

  it("an entry lane never shows the entry-photo overlay", () => {
    setup({ ...pending(), direction: "entry" });
    expect(screen.queryByText(/Lúc vào/)).toBeNull();
  });

  it("a failing entry photo load falls back to the text", async () => {
    m.captureImage.mockRejectedValue("gone");
    setup(pending({ entryImageKey: "k" }));
    await waitFor(() => expect(screen.getByText("Không có ảnh lúc vào")).toBeInTheDocument());
  });
});
