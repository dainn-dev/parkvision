import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tauri", () => ({
  manualOpen: vi.fn(),
  manualClose: vi.fn(),
  manualUnlock: vi.fn(),
  manualPlate: vi.fn(),
  captureImage: vi.fn(),
  admitWalkIn: vi.fn(),
  settleWalkIn: vi.fn(),
  checkUpdate: vi.fn(),
}));
vi.mock("../../lib/printDocs", () => ({
  printEntryTicket: vi.fn(),
  printExitReceipt: vi.fn(),
}));

import * as tauri from "../../lib/tauri";
import MonitorScreen from "../MonitorScreen";
import type { EdgeData } from "../../lib/useEdgeData";
import type { AccessEvent, EdgeConfig, FeeQuote, GateStatus, SitePaymentInfo } from "../../lib/tauri";

const m = vi.mocked(tauri);

function gate(id: string, direction: string, over: Partial<GateStatus> = {}): GateStatus {
  return {
    gateId: id,
    direction,
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
    lastAt: null,
    lastPlateImageKey: null,
    ...over,
  };
}

function event(i: number, over: Partial<AccessEvent> = {}): AccessEvent {
  return {
    plate: `51A${10000 + i}`,
    gateId: "g1",
    direction: "entry",
    decision: "allow",
    reason: "vehicle_registered",
    at: new Date(2026, 10, 16, 10, 0, i).toISOString(),
    ...over,
  };
}

interface DataOpts extends Partial<EdgeData> {
  gates?: GateStatus[];
  mqtt?: boolean;
  outbox?: number;
}

function dataOf(o: DataOpts = {}): EdgeData {
  const { gates: g, mqtt, outbox, ...rest } = o;
  const gates = g ?? [gate("g1", "entry"), gate("g2", "exit")];
  const cfg = {
    gates: gates.map((x) => ({
      gateId: x.gateId,
      laneId: null,
      direction: x.direction,
      cameras: [],
      barrier: null,
    })),
  } as unknown as EdgeConfig;
  return {
    status: {
      mqttConnected: mqtt ?? true,
      whitelistCount: 0,
      outboxDepth: outbox ?? 0,
      lastSyncAt: null,
      gates,
    },
    cfg,
    events: [],
    cameras: {},
    lock: null,
    payment: null,
    setCfg: vi.fn(),
    setLock: vi.fn(),
    refreshFromServer: vi.fn(),
    ...rest,
  } as EdgeData;
}

function setup(data: EdgeData = dataOf()) {
  const onOpenSettings = vi.fn();
  const notify = vi.fn();
  const view = render(<MonitorScreen data={data} onOpenSettings={onOpenSettings} notify={notify} />);
  return { ...view, onOpenSettings, notify };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.checkUpdate.mockResolvedValue({ currentVersion: "1.0.0", availableVersion: null, notes: null });
  m.captureImage.mockResolvedValue(new ArrayBuffer(0));
});

describe("MonitorScreen", () => {
  it("renders one lane per gate with derived names", () => {
    setup();
    expect(screen.getByRole("heading", { name: "Cổng vào 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Cổng ra 1" })).toBeInTheDocument();
  });

  it("single gate renders one lane; three gates render three", () => {
    const one = setup(dataOf({ gates: [gate("g1", "entry")] }));
    expect(one.container.querySelectorAll("section h2")).toHaveLength(1);
    one.unmount();
    const three = setup(dataOf({ gates: [gate("g1", "entry"), gate("g2", "exit"), gate("g3", "exit")] }));
    expect(three.container.querySelectorAll("section h2")).toHaveLength(3);
    expect(screen.getByTestId("lanes-grid").className).toContain("overflow-y-auto");
  });

  it("offline shows the banner, pill text and pending count", () => {
    const off = setup(dataOf({ mqtt: false, outbox: 4 }));
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Mất kết nối server");
    expect(banner).toHaveTextContent("Đang chờ gửi: 4 sự kiện.");
    expect(screen.getByText("Mất kết nối", { exact: true })).toBeInTheDocument();
    off.unmount();
    setup(dataOf({ mqtt: true }));
    expect(screen.queryByText(/Mất kết nối server/)).toBeNull();
    expect(screen.getByText("Đã kết nối")).toBeInTheDocument();
  });

  it("recent strip shows at most six, newest first, with tags", () => {
    const events = [
      event(8, { plate: "", decision: "deny", reason: "no_plate_detected" }),
      event(7, { decision: "deny", reason: "vehicle_expired" }),
      ...[6, 5, 4, 3, 2, 1].map((i) => event(i)),
    ];
    setup(dataOf({ events }));
    const chips = screen.getAllByTestId("recent-chip");
    expect(chips).toHaveLength(6);
    expect(within(chips[0]).getByText("Không đọc được")).toBeInTheDocument();
    expect(within(chips[1]).getByText("HẾT HẠN")).toBeInTheDocument();
  });

  it("Xem tất cả opens the drawer with every event", async () => {
    const events = Array.from({ length: 8 }, (_, i) => event(8 - i));
    setup(dataOf({ events }));
    await userEvent.click(screen.getByRole("button", { name: "Xem tất cả" }));
    const dialog = screen.getByRole("dialog", { name: "Lượt ra vào" });
    expect(within(dialog).getAllByTestId("event-row")).toHaveLength(8);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Lượt ra vào" })).toBeNull();
  });

  it("settings button calls onOpenSettings", async () => {
    const { onOpenSettings } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Thiết lập" }));
    expect(onOpenSettings).toHaveBeenCalled();
  });

  it("update chip appears only when a newer version exists", async () => {
    m.checkUpdate.mockResolvedValue({ currentVersion: "1.0.0", availableVersion: "1.5.0", notes: null });
    const a = setup();
    const chip = await screen.findByRole("button", { name: /Có bản cập nhật 1\.5\.0/ });
    await userEvent.click(chip);
    expect(a.onOpenSettings).toHaveBeenCalled();
    a.unmount();

    m.checkUpdate.mockResolvedValue({ currentVersion: "1.0.0", availableVersion: null, notes: null });
    const b = setup();
    await waitFor(() => expect(m.checkUpdate).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("button", { name: /Có bản cập nhật/ })).toBeNull();
    b.unmount();

    m.checkUpdate.mockRejectedValue(new Error("offline"));
    const c = setup();
    await waitFor(() => expect(m.checkUpdate).toHaveBeenCalledTimes(3));
    expect(screen.queryByRole("button", { name: /Có bản cập nhật/ })).toBeNull();
    expect(c.notify).not.toHaveBeenCalled();
  });

  it("a failed command surfaces as a notification", async () => {
    m.manualOpen.mockRejectedValue("relay offline");
    const { notify } = setup(dataOf({ gates: [gate("g1", "entry")] }));
    await userEvent.click(screen.getByRole("button", { name: "Mở barrier" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Lỗi: relay offline"));
  });

  it("a successful command notifies the ok message", async () => {
    m.manualOpen.mockResolvedValue(undefined);
    const { notify } = setup(dataOf({ gates: [gate("g1", "entry")] }));
    await userEvent.click(screen.getByRole("button", { name: "Mở barrier" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Đã gửi lệnh mở"));
  });

  it("a walk-in failure shows exactly one Lỗi prefix", async () => {
    m.admitWalkIn.mockRejectedValue(new Error("gate locked"));
    const { notify } = setup(
      dataOf({
        gates: [
          gate("g1", "entry", {
            lastPlate: "51A99999",
            lastDecision: "deny",
            lastReason: "plate_not_registered",
          }),
        ],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Cho xe vãng lai vào" }));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify).toHaveBeenCalledWith("Lỗi: gate locked");
  });

  it("fee tags render amber and show the amount", () => {
    const events = [
      event(3, { reason: "walk_in_waived" }),
      event(2, { reason: "walk_in_paid", amountVnd: 15000 }),
      event(1, { reason: "walk_in_fee_due", decision: "deny" }),
    ];
    setup(dataOf({ events }));
    for (const text of ["CHỜ THU PHÍ", "THU 15.000 đ", "MIỄN PHÍ"]) {
      expect(screen.getByText(text)).toHaveStyle({ color: "#F5C53D" });
    }
  });

  it("header shows the site name or falls back", () => {
    const payment: SitePaymentInfo = { bankAccount: null, timezone: "Asia/Ho_Chi_Minh", siteName: "Bãi xe A" };
    const a = setup(dataOf({ payment }));
    expect(screen.getByText("Bãi xe A")).toBeInTheDocument();
    a.unmount();
    setup(dataOf({ payment: null }));
    expect(screen.getByText("Edge Gate")).toBeInTheDocument();
  });

  it("a pending fee on the exit lane leaves the entry lane unchanged", () => {
    const fee: FeeQuote = {
      sessionId: "11111111-2222-3333-4444-555555555555",
      plate: "51A12345",
      enteredAt: new Date(2026, 10, 16, 8, 0).toISOString(),
      exitedAt: new Date(2026, 10, 16, 10, 0).toISOString(),
      durationMinutes: 120,
      amountVnd: 20000,
      entryGateId: null,
      entryImageKey: null,
      payCode: "PV1A2B3C4D",
      bankReceivedVnd: null,
    };
    setup(
      dataOf({
        gates: [
          gate("g1", "entry", { lastPlate: "30E89241", lastDecision: "allow", lastReason: "vehicle_registered" }),
          gate("g2", "exit", {
            lastPlate: "51A12345",
            lastDecision: "deny",
            lastReason: "walk_in_fee_due",
            pendingFee: fee,
          }),
        ],
      }),
    );
    expect(screen.getAllByRole("radiogroup")).toHaveLength(1);
    expect(screen.getByText("MỜI QUA")).toBeInTheDocument();
  });
});
