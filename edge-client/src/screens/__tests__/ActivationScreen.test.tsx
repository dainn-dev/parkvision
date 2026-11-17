import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/tauri", () => ({
  activate: vi.fn(),
  detectPublicIp: vi.fn(),
  getConfig: vi.fn(),
  onCamera: vi.fn(),
}));

import * as tauri from "../../lib/tauri";
import ActivationScreen from "../ActivationScreen";

const m = vi.mocked(tauri);

const cfg = {
  gates: [
    {
      gateId: "g1",
      laneId: null,
      direction: "entry",
      cameras: [{ cameraId: "c1", purpose: "anpr", streamUrl: "rtsp://x" }],
      barrier: null,
    },
    { gateId: "g2", laneId: null, direction: "exit", cameras: [], barrier: null },
  ],
} as unknown as tauri.EdgeConfig;

beforeEach(() => {
  vi.resetAllMocks();
  m.detectPublicIp.mockResolvedValue("1.2.3.4");
  m.getConfig.mockResolvedValue(cfg);
  m.onCamera.mockResolvedValue(() => {});
});

describe("ActivationScreen", () => {
  it("shows the revoked notice only when revoked", () => {
    const { unmount } = render(<ActivationScreen revoked onDone={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("Thiết bị đã bị thu hồi");
    unmount();
    render(<ActivationScreen revoked={false} onDone={vi.fn()} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("has no server or lock-password field", () => {
    render(<ActivationScreen revoked={false} onDone={vi.fn()} />);
    expect(screen.queryByLabelText(/server/i)).toBeNull();
    expect(screen.queryByLabelText(/mật khẩu/i)).toBeNull();
  });

  it("normalizes the code and shows step 2 from the fetched config", async () => {
    m.activate.mockResolvedValue(undefined);
    render(<ActivationScreen revoked={false} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Mã kích hoạt"), " ab12 cd34 ");
    await userEvent.click(screen.getByRole("button", { name: "Kích hoạt" }));
    expect(await screen.findByText("Đã nhận cấu hình từ server")).toBeTruthy();
    expect(m.activate).toHaveBeenCalledWith("AB12CD34");
    expect(screen.getByText("Cổng vào 1")).toBeTruthy();
    expect(screen.getByText("Cổng ra 1")).toBeTruthy();
    expect(screen.getByText("0/2")).toBeTruthy();
    expect(screen.getByText("Chưa gán camera")).toBeTruthy();
  });

  it("maps a rejected activation to friendly copy", async () => {
    m.activate.mockRejectedValue("invalid activation code");
    render(<ActivationScreen revoked={false} onDone={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Mã kích hoạt"), "abcd");
    await userEvent.click(screen.getByRole("button", { name: "Kích hoạt" }));
    expect(await screen.findByText("Mã kích hoạt không đúng.")).toBeTruthy();
    expect(screen.getByText("BƯỚC 1/2")).toBeTruthy();
  });

  it("step 2 buttons report the chosen destination", async () => {
    m.activate.mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(<ActivationScreen revoked={false} onDone={onDone} />);
    await userEvent.type(screen.getByLabelText("Mã kích hoạt"), "abcd");
    await userEvent.click(screen.getByRole("button", { name: "Kích hoạt" }));
    await waitFor(() => screen.getByText("Đã nhận cấu hình từ server"));
    await userEvent.click(screen.getByRole("button", { name: "Bắt đầu giám sát" }));
    expect(onDone).toHaveBeenLastCalledWith("monitor");
    await userEvent.click(screen.getByRole("button", { name: "Thiết lập relay" }));
    expect(onDone).toHaveBeenLastCalledWith("settings");
  });
});
