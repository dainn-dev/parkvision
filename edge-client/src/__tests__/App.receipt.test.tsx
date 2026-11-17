import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EdgeData } from "../lib/useEdgeData";
import type { FeeQuote, GateStatus } from "../lib/tauri";

vi.mock("../lib/tauri", () => ({
  getConfig: vi.fn(),
  lockStatus: vi.fn(),
  onDeprovisioned: vi.fn(),
  captureImage: vi.fn(),
  manualOpen: vi.fn(),
  manualClose: vi.fn(),
  manualUnlock: vi.fn(),
  manualPlate: vi.fn(),
  admitWalkIn: vi.fn(),
  settleWalkIn: vi.fn(),
  checkUpdate: vi.fn(),
}));
vi.mock("../lib/printDocs", () => ({
  printEntryTicket: vi.fn(),
  printExitReceipt: vi.fn(),
}));

const live = vi.hoisted(() => ({ data: null as unknown, listeners: new Set<() => void>() }));
vi.mock("../lib/useEdgeData", async () => {
  const React = await import("react");
  return {
    useEdgeData: () => {
      const [, force] = React.useReducer((n: number) => n + 1, 0);
      React.useEffect(() => {
        live.listeners.add(force);
        return () => void live.listeners.delete(force);
      }, []);
      return live.data;
    },
  };
});
vi.mock("../screens/SettingsScreen", () => ({
  default: (p: { onBack: () => void }) => (
    <div>
      settings screen<button onClick={p.onBack}>to-monitor</button>
    </div>
  ),
}));

import * as tauri from "../lib/tauri";
import * as print from "../lib/printDocs";
import App from "../App";

const m = vi.mocked(tauri);
const p = vi.mocked(print);

const quote: FeeQuote = {
  sessionId: "11111111-2222-3333-4444-555555555555",
  plate: "51A12345",
  enteredAt: new Date(2026, 10, 16, 8, 12).toISOString(),
  exitedAt: new Date(2026, 10, 16, 10, 42).toISOString(),
  durationMinutes: 150,
  amountVnd: 25000,
  entryGateId: null,
  entryImageKey: null,
  payCode: "PV1A2B3C4D",
  bankReceivedVnd: null,
};

function gate(over: Partial<GateStatus>): GateStatus {
  return {
    gateId: "g1",
    direction: "exit",
    gateState: "closed",
    armAngleDeg: 0,
    motorTempC: 0,
    loopActive: false,
    upsBattery: 100,
    barrierLinkOk: true,
    lastPlate: "51A12345",
    lastDecision: "deny",
    lastReason: "plate_not_registered",
    pendingFee: null,
    lastAmountVnd: null,
    lastMethod: null,
    lastAt: new Date(2026, 10, 16, 10, 42).toISOString(),
    lastPlateImageKey: null,
    ...over,
  };
}

function publish(g: GateStatus) {
  live.data = {
    status: { mqttConnected: true, whitelistCount: 0, outboxDepth: 0, lastSyncAt: null, gates: [g] },
    cfg: { gates: [{ gateId: "g1", laneId: null, direction: "exit", cameras: [], barrier: null }] },
    events: [],
    cameras: {},
    lock: null,
    payment: null,
    setCfg: vi.fn(),
    setLock: vi.fn(),
    refreshFromServer: vi.fn(),
  } as unknown as EdgeData;
  act(() => live.listeners.forEach((f) => f()));
}

beforeEach(() => {
  vi.resetAllMocks();
  live.listeners.clear();
  m.onDeprovisioned.mockResolvedValue((() => {}) as never);
  m.getConfig.mockResolvedValue({} as never);
  m.lockStatus.mockResolvedValue({ enabled: false, locked: false } as never);
  m.captureImage.mockResolvedValue(new ArrayBuffer(0));
  m.checkUpdate.mockResolvedValue({ currentVersion: "1", availableVersion: null, notes: null });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  live.data = null;
});

describe("App — receipts while Settings is open", () => {
  it("a fee settled during Settings prints once and the reprint stays available", async () => {
    live.data = {
      status: {
        mqttConnected: true,
        whitelistCount: 0,
        outboxDepth: 0,
        lastSyncAt: null,
        gates: [gate({ pendingFee: quote })],
      },
      cfg: { gates: [{ gateId: "g1", laneId: null, direction: "exit", cameras: [], barrier: null }] },
      events: [],
      cameras: {},
      lock: null,
      payment: null,
      setCfg: vi.fn(),
      setLock: vi.fn(),
      refreshFromServer: vi.fn(),
    } as unknown as EdgeData;
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Thiết lập" }));
    expect(screen.getByText(/settings screen/)).toBeInTheDocument();

    publish(
      gate({
        pendingFee: null,
        lastReason: "walk_in_paid",
        lastDecision: "allow",
        lastMethod: "bank_qr",
        lastAmountVnd: 25000,
      }),
    );
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByText("to-monitor"));
    expect(p.printExitReceipt).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "In biên lai" })).toBeEnabled();
  });
});
