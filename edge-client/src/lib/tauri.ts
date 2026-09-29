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

// ---------- barrier relay config (local, per gate) ----------

export type BarrierBrand =
  | "bisen"
  | "faac"
  | "came"
  | "mag"
  | "zkteco"
  | "wonsun"
  | "generic";

export type ContactMode = "openCloseStop" | "toggle";

export type AutoClose = { type: "board" } | { type: "edge"; delaySec: number };

export type RelayBackendConfig =
  | { type: "hikvision"; host: string; port: number; username: string; password: string }
  | {
      type: "dahua";
      host: string;
      port: number;
      username: string;
      password: string;
      strobe: boolean;
    }
  | {
      type: "serial";
      port: string;
      protocol: "lcus" | "modbusRtu";
      baud: number;
      unitId: number;
    }
  | { type: "modbusTcp"; host: string; port: number; unitId: number }
  | { type: "zkC3"; host: string; port: number; password: string };

/** 1-based relay indices. */
export interface OutputMap {
  open: number;
  close: number | null;
  stop: number | null;
  power: number | null;
}

/** 1-based digital-input indices; null = not wired. */
export interface InputMap {
  openLimit: number | null;
  closedLimit: number | null;
  loop: number | null;
}

export interface ProfileOverrides {
  pulseMs?: number | null;
  travelSec?: number | null;
  mode?: ContactMode | null;
  autoClose?: AutoClose | null;
  boardHoldSec?: number | null;
  pollMs?: number | null;
}

export interface BarrierConfig {
  backend: RelayBackendConfig;
  brand: BarrierBrand;
  outputs: OutputMap;
  inputs: InputMap | null;
  overrides: ProfileOverrides;
}

export interface GateBinding {
  gateId: string;
  laneId: string | null;
  direction: "entry" | "exit";
  cameras: CameraBinding[];
  /** Local relay wiring; null → simulated barrier. */
  barrier: BarrierConfig | null;
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
  /** false while the relay backend is unreachable (contact HAL only). */
  barrierLinkOk: boolean;
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
/// Persist config; if the runtime is up it is rebooted with the new config.
export const saveConfig = (cfg: EdgeConfig) => invoke<void>("save_config", { cfg });

// ---------- barrier relay setup ----------

export interface BarrierProfile {
  pulseMs: number;
  travelSec: number;
  mode: ContactMode;
  autoClose: AutoClose;
  boardHoldSec: number;
  pollMs: number;
  wiringHint: string;
  verified: boolean;
}

export interface BarrierPreset {
  brand: BarrierBrand;
  profile: BarrierProfile;
}

export const listSerialPorts = () => invoke<string[]>("list_serial_ports");
export const getBarrierProfiles = () => invoke<BarrierPreset[]>("get_barrier_profiles");
/// Resolves to the backend kind on success; rejects with a message otherwise.
export const barrierProbe = (cfg: BarrierConfig) => invoke<string>("barrier_probe", { cfg });
export const barrierTestOutput = (cfg: BarrierConfig, output: number) =>
  invoke<void>("barrier_test_output", { cfg, output });
export const barrierReadInputs = (cfg: BarrierConfig) =>
  invoke<boolean[] | null>("barrier_read_inputs", { cfg });

export const activate = (apiBaseUrl: string, code: string) =>
  invoke<void>("activate", {
    args: { apiBaseUrl, code, deviceInfo: { hostname: window.location.hostname || null } },
  });

export const deprovision = () => invoke<void>("deprovision");

/// Public IP the backend sees for this device (for activation-code IP pinning).
export const detectPublicIp = (apiBaseUrl: string) =>
  invoke<string>("detect_public_ip", { apiBaseUrl });

/// This device's primary local IP — shown in the corner badge.
export const deviceIp = () => invoke<string | null>("device_ip");

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

/** Camera worker events — `camera.preview` carries a base64 JPEG,
 *  `camera.status` carries the worker/stream state. */
export type CameraEvent =
  | { type: "camera.preview"; cameraId: string; jpeg: string; width: number; height: number }
  | { type: "camera.status"; cameraId: string; state: string; detail: string };

export const onCamera = (cb: (e: CameraEvent) => void): Promise<UnlistenFn> =>
  listen<CameraEvent>("edge://camera", (e) => cb(e.payload));

/// Fired when the tenant admin revokes the device credential — the app
/// wipes local config; the UI must return to the activation screen.
export const onDeprovisioned = (cb: () => void): Promise<UnlistenFn> =>
  listen("edge://deprovisioned", () => cb());
