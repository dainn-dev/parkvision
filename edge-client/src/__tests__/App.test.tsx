import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/tauri", () => ({
  getConfig: vi.fn(),
  lockStatus: vi.fn(),
  onDeprovisioned: vi.fn(),
}));

const dataHook = vi.hoisted(() => ({ mounts: 0 }));
vi.mock("../lib/useEdgeData", async () => {
  const React = await import("react");
  return {
    useEdgeData: () => {
      React.useEffect(() => {
        dataHook.mounts += 1;
      }, []);
      return { status: null, cfg: null, events: [], cameras: {}, lock: null, payment: null };
    },
  };
});

vi.mock("../screens/ActivationScreen", () => ({
  default: (p: { revoked: boolean; onDone: (n: "monitor" | "settings") => void }) => (
    <div>
      <span>activation revoked={String(p.revoked)}</span>
      <button onClick={() => p.onDone("monitor")}>done-monitor</button>
      <button onClick={() => p.onDone("settings")}>done-settings</button>
    </div>
  ),
}));
vi.mock("../screens/LockScreen", () => ({
  default: (p: { onUnlocked: () => void }) => (
    <div>
      lock screen<button onClick={p.onUnlocked}>unlock</button>
    </div>
  ),
}));
vi.mock("../screens/MonitorScreen", () => ({
  default: (p: { onOpenSettings: () => void; notify: (m: string) => void }) => (
    <div>
      monitor screen
      <button onClick={p.onOpenSettings}>to-settings</button>
      <button onClick={() => p.notify("xin chào")}>toast</button>
    </div>
  ),
}));
vi.mock("../screens/SettingsScreen", () => ({
  default: (p: { onBack: () => void }) => (
    <div>
      settings screen<button onClick={p.onBack}>to-monitor</button>
    </div>
  ),
}));

import * as tauri from "../lib/tauri";
import App from "../App";

const m = vi.mocked(tauri);
let deprovisioned: () => void;

beforeEach(() => {
  dataHook.mounts = 0;
  vi.resetAllMocks();
  m.onDeprovisioned.mockImplementation(((cb: () => void) => {
    deprovisioned = cb;
    return Promise.resolve(() => {});
  }) as never);
  m.lockStatus.mockResolvedValue({ enabled: false, locked: false } as never);
});

describe("App", () => {
  it("no config shows activation without the revoked notice", async () => {
    m.getConfig.mockResolvedValue(null as never);
    render(<App />);
    expect(await screen.findByText("activation revoked=false")).toBeInTheDocument();
  });

  it("config and unlocked shows monitoring", async () => {
    m.getConfig.mockResolvedValue({} as never);
    render(<App />);
    expect(await screen.findByText(/monitor screen/)).toBeInTheDocument();
  });

  it("config and locked shows the lock screen", async () => {
    m.getConfig.mockResolvedValue({} as never);
    m.lockStatus.mockResolvedValue({ enabled: true, locked: true } as never);
    render(<App />);
    expect(await screen.findByText(/lock screen/)).toBeInTheDocument();
  });

  it("deprovision while in settings returns to activation with revoked set", async () => {
    m.getConfig.mockResolvedValue({} as never);
    render(<App />);
    await userEvent.click(await screen.findByText("to-settings"));
    expect(screen.getByText(/settings screen/)).toBeInTheDocument();
    act(() => deprovisioned());
    expect(await screen.findByText("activation revoked=true")).toBeInTheDocument();
  });

  it.each([
    ["done-settings", /settings screen/],
    ["done-monitor", /monitor screen/],
  ])("finishing activation via %s opens that screen and clears revoked", async (btn, next) => {
    m.getConfig.mockResolvedValue(null as never);
    render(<App />);
    act(() => deprovisioned());
    expect(await screen.findByText("activation revoked=true")).toBeInTheDocument();
    await userEvent.click(screen.getByText(btn));
    expect(await screen.findByText(next)).toBeInTheDocument();
    act(() => deprovisioned());
    expect(await screen.findByText("activation revoked=true")).toBeInTheDocument();
  });

  it("activation after revoke then done clears revoked on later activation", async () => {
    m.getConfig.mockResolvedValue(null as never);
    render(<App />);
    act(() => deprovisioned());
    await userEvent.click(await screen.findByText("done-monitor"));
    await screen.findByText(/monitor screen/);
    expect(screen.queryByText("activation revoked=true")).toBeNull();
  });

  it("a late initial check does not override a deprovision that already happened", async () => {
    let resolveCfg: (v: never) => void = () => {};
    m.getConfig.mockReturnValue(new Promise((r) => (resolveCfg = r as never)) as never);
    render(<App />);
    await waitFor(() => expect(m.onDeprovisioned).toHaveBeenCalled());
    act(() => deprovisioned());
    expect(await screen.findByText("activation revoked=true")).toBeInTheDocument();
    await act(async () => {
      resolveCfg({} as never);
    });
    expect(screen.getByText("activation revoked=true")).toBeInTheDocument();
    expect(screen.queryByText(/monitor screen/)).toBeNull();
  });

  it("monitoring stays mounted but hidden while settings is shown", async () => {
    m.getConfig.mockResolvedValue({} as never);
    render(<App />);
    await userEvent.click(await screen.findByText("to-settings"));
    const monitor = screen.getByText(/monitor screen/).closest("[data-testid='monitor-host']");
    expect(monitor).toHaveAttribute("hidden");
    expect(monitor).toHaveAttribute("aria-hidden", "true");
    await userEvent.click(screen.getByText("to-monitor"));
    expect(monitor).not.toHaveAttribute("hidden");
  });

  it("monitoring and settings share one data hook", async () => {
    m.getConfig.mockResolvedValue({} as never);
    render(<App />);
    await userEvent.click(await screen.findByText("to-settings"));
    await userEvent.click(screen.getByText("to-monitor"));
    await screen.findByText(/monitor screen/);
    expect(dataHook.mounts).toBe(1);
  });

  it("shows a status toast from either screen", async () => {
    m.getConfig.mockResolvedValue({} as never);
    render(<App />);
    await userEvent.click(await screen.findByText("toast"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("xin chào"));
  });
});
