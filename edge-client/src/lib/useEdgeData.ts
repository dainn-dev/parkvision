import { useCallback, useEffect, useState } from "react";
import {
  getConfig,
  getStatus,
  lockStatus,
  onCamera,
  onEvent,
  onStatus,
  resync,
  sitePaymentInfo,
  type AccessEvent,
  type EdgeConfig,
  type EdgeStatus,
  type LockStatus,
  type SitePaymentInfo,
} from "./tauri";

export interface CamLiveInfo {
  jpeg?: string;
  state?: string;
  detail?: string;
}

export interface EdgeData {
  status: EdgeStatus | null;
  cfg: EdgeConfig | null;
  /** Newest first, capped at 100. */
  events: AccessEvent[];
  /** Keyed by cameraId. */
  cameras: Record<string, CamLiveInfo>;
  lock: LockStatus | null;
  /** Site tariff/bank info; null until loaded or when the read fails. */
  payment: SitePaymentInfo | null;
  setCfg(cfg: EdgeConfig): void;
  setLock(lock: LockStatus): void;
  /** resync(), then re-read config. Resolves with the resync message. */
  refreshFromServer(): Promise<string>;
}

export function useEdgeData(): EdgeData {
  const [status, setStatus] = useState<EdgeStatus | null>(null);
  const [cfg, setCfg] = useState<EdgeConfig | null>(null);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  const [lock, setLock] = useState<LockStatus | null>(null);
  const [cameras, setCameras] = useState<Record<string, CamLiveInfo>>({});
  const [payment, setPayment] = useState<SitePaymentInfo | null>(null);

  useEffect(() => {
    const loadPayment = () => {
      sitePaymentInfo()
        .then(setPayment)
        .catch(() => {});
    };
    getStatus().then((s) => s && setStatus(s));
    getConfig().then(setCfg).catch(() => {});
    lockStatus().then(setLock).catch(() => {});
    loadPayment();
    const un1 = onStatus(setStatus);
    const un2 = onEvent((e) => setEvents((prev) => [e, ...prev].slice(0, 100)));
    const un3 = onCamera((e) =>
      setCameras((prev) => {
        const cur = prev[e.cameraId] ?? {};
        return {
          ...prev,
          [e.cameraId]:
            e.type === "camera.preview"
              ? { ...cur, jpeg: e.jpeg, state: "live" }
              : { ...cur, state: e.state, detail: e.detail },
        };
      }),
    );
    const poll = setInterval(() => {
      getStatus().then((s) => s && setStatus(s));
      loadPayment();
    }, 2000);
    return () => {
      un1.then((f) => f());
      un2.then((f) => f());
      un3.then((f) => f());
      clearInterval(poll);
    };
  }, []);

  const refreshFromServer = useCallback(async () => {
    const msg = await resync();
    const next = await getConfig();
    if (next) setCfg(next);
    return msg;
  }, []);

  return { status, cfg, events, cameras, lock, payment, setCfg, setLock, refreshFromServer };
}
