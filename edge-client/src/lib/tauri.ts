import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface MqttConfig {
  host: string;
  port: number;
  username: string | null;
  password: string | null;
  tls: boolean;
}

export interface EdgeConfig {
  tenantId: string;
  siteId: string;
  gateId: string;
  laneId: string | null;
  deviceId: string;
  apiKey: string;
  apiBaseUrl: string;
  mqtt: MqttConfig;
  laneDirection: "entry" | "exit";
  cameraRtspUrl: string | null;
}

export type GateState =
  | "closed"
  | "opening"
  | "open"
  | "closing"
  | "locked"
  | "fault";

export interface EdgeStatus {
  gateState: GateState;
  armAngleDeg: number;
  motorTempC: number;
  loopActive: boolean;
  upsBattery: number;
  mqttConnected: boolean;
  whitelistCount: number;
  outboxDepth: number;
  lastPlate: string | null;
  lastDecision: string | null;
  lastReason: string | null;
  lastSyncAt: string | null;
}

export interface AccessEvent {
  plate: string;
  direction: string;
  decision: "allow" | "deny";
  reason: string;
  at: string;
}

export const getConfig = () => invoke<EdgeConfig | null>("get_config");
export const provision = (cfg: EdgeConfig) => invoke<void>("provision", { cfg });
export const getStatus = () => invoke<EdgeStatus | null>("get_status");
export const manualOpen = () => invoke<void>("manual_open");
export const manualClose = () => invoke<void>("manual_close");
export const manualLock = () => invoke<void>("manual_lock");
export const manualUnlock = () => invoke<void>("manual_unlock");
export const manualPlate = (plate: string) =>
  invoke<void>("manual_plate", { plate });
export const resync = () => invoke<string>("resync");

export const onStatus = (cb: (s: EdgeStatus) => void): Promise<UnlistenFn> =>
  listen<EdgeStatus>("edge://status", (e) => cb(e.payload));

export const onEvent = (cb: (e: AccessEvent) => void): Promise<UnlistenFn> =>
  listen<AccessEvent>("edge://event", (e) => cb(e.payload));
