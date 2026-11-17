import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tauri", () => ({
  getStatus: vi.fn(),
  getConfig: vi.fn(),
  lockStatus: vi.fn(),
  onStatus: vi.fn(),
  onEvent: vi.fn(),
  onCamera: vi.fn(),
  resync: vi.fn(),
  sitePaymentInfo: vi.fn(),
}));

import * as tauri from "../tauri";
import { useEdgeData } from "../useEdgeData";

const m = vi.mocked(tauri);

const status = { gates: [{ gateId: "g1" }] } as unknown as tauri.EdgeStatus;
const cfg = { gates: [] } as unknown as tauri.EdgeConfig;
const lock = { locked: false } as unknown as tauri.LockStatus;
const pay = (timezone: string) =>
  ({ bankAccount: null, timezone, siteName: "Bãi A" }) as tauri.SitePaymentInfo;

let onStatusCb: (s: tauri.EdgeStatus) => void;
let onEventCb: (e: tauri.AccessEvent) => void;
let onCameraCb: (e: tauri.CameraEvent) => void;
let un1: ReturnType<typeof vi.fn>;
let un2: ReturnType<typeof vi.fn>;
let un3: ReturnType<typeof vi.fn>;

beforeEach(() => {
  un1 = vi.fn();
  un2 = vi.fn();
  un3 = vi.fn();
  m.getStatus.mockResolvedValue(status);
  m.getConfig.mockResolvedValue(cfg);
  m.lockStatus.mockResolvedValue(lock);
  m.resync.mockResolvedValue("ok");
  m.sitePaymentInfo.mockResolvedValue(pay("Asia/Ho_Chi_Minh"));
  m.onStatus.mockImplementation((cb) => {
    onStatusCb = cb;
    return Promise.resolve(un1 as never);
  });
  m.onEvent.mockImplementation((cb) => {
    onEventCb = cb;
    return Promise.resolve(un2 as never);
  });
  m.onCamera.mockImplementation((cb) => {
    onCameraCb = cb;
    return Promise.resolve(un3 as never);
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("useEdgeData", () => {
  it("loads status, config and lock on mount", async () => {
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.status).toEqual(status));
    await waitFor(() => expect(result.current.cfg).toEqual(cfg));
    await waitFor(() => expect(result.current.lock).toEqual(lock));
  });

  it("caps events at 100, newest first", async () => {
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() => {
      for (let i = 0; i < 101; i++) {
        onEventCb({ id: `e${i}` } as unknown as tauri.AccessEvent);
      }
    });
    expect(result.current.events).toHaveLength(100);
    expect((result.current.events[0] as unknown as { id: string }).id).toBe("e100");
  });

  it("merges camera preview and status events", async () => {
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.status).toEqual(status));
    act(() =>
      onCameraCb({ type: "camera.preview", cameraId: "c1", jpeg: "AAA", width: 1, height: 1 }),
    );
    expect(result.current.cameras.c1).toEqual({ jpeg: "AAA", state: "live" });
    act(() =>
      onCameraCb({ type: "camera.status", cameraId: "c1", state: "error", detail: "boom" }),
    );
    expect(result.current.cameras.c1).toEqual({ jpeg: "AAA", state: "error", detail: "boom" });
  });

  it("refreshFromServer resyncs then re-reads config", async () => {
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.cfg).toEqual(cfg));
    const next = { gates: [{ gateId: "x" }] } as unknown as tauri.EdgeConfig;
    m.getConfig.mockResolvedValue(next);
    m.resync.mockClear();
    let msg = "";
    await act(async () => {
      msg = await result.current.refreshFromServer();
    });
    expect(msg).toBe("ok");
    expect(m.resync).toHaveBeenCalledTimes(1);
    expect(result.current.cfg).toEqual(next);
  });

  it("unlistens all three on unmount", async () => {
    const { unmount } = renderHook(() => useEdgeData());
    await waitFor(() => expect(m.onCamera).toHaveBeenCalled());
    unmount();
    await waitFor(() => {
      expect(un1).toHaveBeenCalled();
      expect(un2).toHaveBeenCalled();
      expect(un3).toHaveBeenCalled();
    });
  });

  it("exposes payment and refreshes it on the status poll", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.payment).toEqual(pay("Asia/Ho_Chi_Minh")));
    m.sitePaymentInfo.mockResolvedValue(pay("UTC"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await waitFor(() => expect(result.current.payment?.timezone).toBe("UTC"));
  });

  it("keeps payment null when sitePaymentInfo rejects, without breaking other fields", async () => {
    m.sitePaymentInfo.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useEdgeData());
    await waitFor(() => expect(result.current.status).toEqual(status));
    await waitFor(() => expect(result.current.cfg).toEqual(cfg));
    await waitFor(() => expect(m.sitePaymentInfo).toHaveBeenCalled());
    expect(result.current.payment).toBeNull();
    expect(onStatusCb).toBeDefined();
  });
});
