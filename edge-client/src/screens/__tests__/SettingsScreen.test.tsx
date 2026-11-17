import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tauri", () => ({
  saveConfig: vi.fn(),
  barrierProbe: vi.fn(),
  barrierTestOutput: vi.fn(),
  listSerialPorts: vi.fn(),
  getBarrierProfiles: vi.fn(),
  manualLock: vi.fn(),
  manualUnlock: vi.fn(),
  setLockPassword: vi.fn(),
  lockNow: vi.fn(),
  deviceIp: vi.fn(),
  walkInToday: vi.fn(),
}));
vi.mock("../BarrierSettingsScreen", () => ({ default: () => <div>Barrier form</div> }));
vi.mock("../../components/UpdateButton", () => ({ default: () => <div>Update button</div> }));

import * as tauri from "../../lib/tauri";
import SettingsScreen from "../SettingsScreen";
import type { EdgeData } from "../../lib/useEdgeData";
import type { BarrierConfig, EdgeConfig, EdgeStatus, GateBinding, GateStatus } from "../../lib/tauri";

const m = vi.mocked(tauri);

function barrier(over: Partial<BarrierConfig> = {}): BarrierConfig {
  return {
    backend: { type: "serial", port: "COM3", protocol: "lcus", baud: 9600, unitId: 1 },
    brand: "bisen",
    outputs: { open: 1, close: 2, stop: null, power: null },
    inputs: null,
    overrides: {},
    ...over,
  };
}

function gateBinding(id: string, direction: "entry" | "exit", b: BarrierConfig | null): GateBinding {
  return {
    gateId: id,
    laneId: null,
    direction,
    cameras: [{ cameraId: `cam-${id}`, purpose: "plate", streamUrl: "rtsp://x" }],
    barrier: b,
  };
}

function gateStatus(id: string, over: Partial<GateStatus> = {}): GateStatus {
  return {
    gateId: id,
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
    lastAt: null,
    lastPlateImageKey: null,
    ...over,
  };
}

function makeCfg(gates: GateBinding[], over: Partial<EdgeConfig> = {}): EdgeConfig {
  return {
    version: 3,
    tenantId: "t1",
    siteId: "site-1",
    deviceId: "dev-1",
    apiKey: "secret-key",
    apiBaseUrl: "https://api.example.test/api/v1",
    mqtt: { host: "mqtt.example.test", port: 1883, username: null, password: null, tls: false },
    gates,
    ...over,
  };
}

function dataOf(o: { cfg?: EdgeConfig; status?: Partial<EdgeStatus>; lock?: EdgeData["lock"] } = {}): EdgeData {
  const cfg = o.cfg ?? makeCfg([gateBinding("g1", "entry", barrier())]);
  return {
    status: {
      mqttConnected: true,
      whitelistCount: 12,
      outboxDepth: 0,
      lastSyncAt: null,
      gates: cfg.gates.map((g) => gateStatus(g.gateId, { direction: g.direction })),
      ...o.status,
    },
    cfg,
    events: [],
    cameras: { "cam-g1": { state: "live" } },
    lock: o.lock ?? { enabled: false, locked: false },
    payment: null,
    setCfg: vi.fn(),
    setLock: vi.fn(),
    refreshFromServer: vi.fn().mockResolvedValue("ok"),
  };
}

function renderScreen(data: EdgeData, props: Partial<{ onBack: () => void; onLocked: () => void; notify: (s: string) => void }> = {}) {
  const notify = props.notify ?? vi.fn();
  render(
    <SettingsScreen data={data} onBack={props.onBack ?? vi.fn()} onLocked={props.onLocked ?? vi.fn()} notify={notify} />,
  );
  return { notify };
}

beforeEach(() => {
  vi.resetAllMocks();
  m.listSerialPorts.mockResolvedValue(["COM3", "COM5"]);
  m.getBarrierProfiles.mockResolvedValue([]);
  m.deviceIp.mockResolvedValue("192.168.1.20");
  m.walkInToday.mockResolvedValue({
    cashCount: 0,
    cashTotalVnd: 0,
    bankQrCount: 0,
    bankQrTotalVnd: 0,
    waivedCount: 0,
  });
  m.saveConfig.mockResolvedValue(undefined);
});

describe("SettingsScreen", () => {
  it("shows server-managed panel and refreshes", async () => {
    const data = dataOf();
    const { notify } = renderScreen(data);
    await userEvent.click(screen.getByRole("button", { name: "Làm mới từ server" }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith("Đã làm mới từ server"));
    expect(data.refreshFromServer).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/chưa đồng bộ/)).toBeInTheDocument();
  });

  it("gate without a barrier offers setup and has no test buttons", async () => {
    renderScreen(dataOf({ cfg: makeCfg([gateBinding("g1", "entry", null)]) }));
    expect(screen.getByText("Chưa nối relay — barrier đang chạy mô phỏng.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Thiết lập relay" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mở thử" })).toBeNull();
  });

  it("probe success and failure update the status line", async () => {
    renderScreen(dataOf());
    expect(screen.getByText("Chưa kiểm tra kết nối")).toBeInTheDocument();
    m.barrierProbe.mockResolvedValueOnce("serial");
    await userEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(await screen.findByText("Board đã phản hồi")).toBeInTheDocument();
    m.barrierProbe.mockRejectedValueOnce("timeout");
    await userEvent.click(screen.getByRole("button", { name: "Kiểm tra" }));
    expect(await screen.findByText("Không kết nối được: timeout")).toBeInTheDocument();
  });

  it("Đóng thử is disabled when no close output is wired", async () => {
    const cfg = makeCfg([gateBinding("g1", "entry", barrier({ outputs: { open: 1, close: null, stop: null, power: null } }))]);
    renderScreen(dataOf({ cfg }));
    expect(screen.getByRole("button", { name: "Đóng thử" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Mở thử" })).toBeEnabled();
  });

  it("changing the serial port saves the merged config", async () => {
    const g2 = gateBinding("g2", "exit", barrier());
    const cfg = makeCfg([gateBinding("g1", "entry", barrier()), g2]);
    const data = dataOf({ cfg });
    renderScreen(data);
    await screen.findAllByRole("option", { name: "COM5" });
    const select = screen.getByLabelText("Cổng serial cho Cổng vào 1");
    await userEvent.selectOptions(select, "COM5");
    await waitFor(() => expect(m.saveConfig).toHaveBeenCalledTimes(1));
    const saved = m.saveConfig.mock.calls[0][0];
    const b1 = saved.gates[0].barrier!.backend;
    expect(b1.type === "serial" && b1.port).toBe("COM5");
    expect(saved.gates[1]).toBe(g2);
    expect(saved.apiKey).toBe(cfg.apiKey);
    expect(saved.mqtt).toBe(cfg.mqtt);
    expect(saved.deviceId).toBe(cfg.deviceId);
    await waitFor(() => expect(data.setCfg).toHaveBeenCalledWith(saved));
  });

  it("locked gate offers unlock", async () => {
    const data = dataOf();
    data.status!.gates[0] = gateStatus("g1", { gateState: "locked" });
    m.manualUnlock.mockResolvedValue(undefined);
    renderScreen(data);
    await userEvent.click(screen.getByRole("button", { name: "Mở khóa barrier" }));
    expect(m.manualUnlock).toHaveBeenCalledWith("g1");
  });

  it("lock password shorter than four characters is rejected", async () => {
    renderScreen(dataOf());
    await userEvent.type(screen.getByLabelText("Mật khẩu khóa"), "123");
    await userEvent.click(screen.getByRole("button", { name: "Lưu mật khẩu" }));
    expect(screen.getByText("Mật khẩu khóa phải có ít nhất 4 ký tự.")).toBeInTheDocument();
    expect(m.setLockPassword).not.toHaveBeenCalled();
  });

  it("device card shows server host and pending events", async () => {
    renderScreen(dataOf({ status: { outboxDepth: 7 } }));
    expect(screen.getByText("api.example.test")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(await screen.findByText("192.168.1.20")).toBeInTheDocument();
  });

  it("device card shows today's cash and transfer totals", async () => {
    m.walkInToday.mockResolvedValue({
      cashCount: 2,
      cashTotalVnd: 35000,
      bankQrCount: 1,
      bankQrTotalVnd: 30000,
      waivedCount: 1,
    });
    renderScreen(dataOf());
    expect(await screen.findByText("Tiền mặt: 2 xe · 35.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Chuyển khoản: 1 xe · 30.000 đ")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí: 1 xe")).toBeInTheDocument();
  });

  it("totals failure leaves the rest of the card intact", async () => {
    m.walkInToday.mockRejectedValue(new Error("down"));
    renderScreen(dataOf({ status: { outboxDepth: 7 } }));
    expect(await screen.findByText("Tiền mặt: — xe · —")).toBeInTheDocument();
    expect(screen.getByText("Chuyển khoản: — xe · —")).toBeInTheDocument();
    expect(screen.getByText("Miễn phí: — xe")).toBeInTheDocument();
    expect(screen.getByText("api.example.test")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lưu mật khẩu" })).toBeInTheDocument();
  });

  it("back button calls onBack", async () => {
    const onBack = vi.fn();
    renderScreen(dataOf(), { onBack });
    await userEvent.click(screen.getByRole("button", { name: "Quay lại giám sát" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
