import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MqttConfig {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  tls: boolean;
}

export interface CameraBinding {
  cameraId: string;
  purpose: string;
  streamUrl: string;
}

export interface GateBinding {
  gateId: string;
  laneId: string | null;
  direction: "entry" | "exit";
  cameras: CameraBinding[];
}

export interface EdgeConfig {
  version: number;
  tenantId: string;
  siteId: string;
  deviceId: string;
  apiKey: string;
  apiBaseUrl: string;
  mqtt: MqttConfig;
  gates: GateBinding[];
}

export type GateState =
  | "closed"
  | "opening"
  | "open"
  | "closing"
  | "locked"
  | "fault";

export interface GateStatus {
  gateId: string;
  direction: "entry" | "exit" | string;
  gateState: GateState;
  armAngleDeg: number;
  motorTempC: number;
  loopActive: boolean;
  upsBattery: number;
  lastPlate: string | null;
  lastDecision: string | null;
  lastReason: string | null;
}

export interface EdgeStatus {
  mqttConnected: boolean;
  whitelistCount: number;
  outboxDepth: number;
  lastSyncAt: string | null;
  gates: GateStatus[];
}

export interface AccessEvent {
  plate: string;
  gateId?: string;
  direction: string;
  decision: "allow" | "deny";
  reason: string;
  at: string;
}

export interface LockStatus {
  enabled: boolean;
  locked: boolean;
}

// ---------- commands ----------

export const getConfig = () => invoke<EdgeConfig | null>("get_config");

export const activate = (apiBaseUrl: string, code: string) =>
  invoke<void>("activate", {
    args: { apiBaseUrl, code, deviceInfo: { hostname: window.location.hostname || null } },
  });

export const deprovision = () => invoke<void>("deprovision");

/// Public IP the backend sees for this device (for activation-code IP pinning).
export const detectPublicIp = (apiBaseUrl: string) =>
  invoke<string>("detect_public_ip", { apiBaseUrl });

export const getStatus = () => invoke<EdgeStatus | null>("get_status");
export const resync = () => invoke<string>("resync");

// gateId omitted → primary gate
export const manualOpen = (gateId?: string) =>
  invoke<void>("manual_open", { gateId: gateId ?? null });
export const manualClose = (gateId?: string) =>
  invoke<void>("manual_close", { gateId: gateId ?? null });
export const manualLock = (gateId?: string) =>
  invoke<void>("manual_lock", { gateId: gateId ?? null });
export const manualUnlock = (gateId?: string) =>
  invoke<void>("manual_unlock", { gateId: gateId ?? null });
export const manualPlate = (plate: string, gateId?: string) =>
  invoke<void>("manual_plate", { plate, gateId: gateId ?? null });

export const setLockPassword = (password: string | null) =>
  invoke<LockStatus>("set_lock_password", { password });
export const unlock = (password: string) =>
  invoke<boolean>("unlock", { password });
export const lockNow = () => invoke<LockStatus>("lock_now");
export const lockStatus = () => invoke<LockStatus>("lock_status");

// ---------- events ----------

export const onStatus = (cb: (s: EdgeStatus) => void): Promise<UnlistenFn> =>
  listen<EdgeStatus>("edge://status", (e) => cb(e.payload));

export const onEvent = (cb: (e: AccessEvent) => void): Promise<UnlistenFn> =>
  listen<AccessEvent>("edge://event", (e) => cb(e.payload));

/// Fired when the tenant admin revokes the device credential — the app
/// wipes local config; the UI must return to the activation screen.
export const onDeprovisioned = (cb: () => void): Promise<UnlistenFn> =>
  listen("edge://deprovisioned", () => cb());
