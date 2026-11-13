import type { EdgeDeviceHealth } from '../types/platform';
import type { TenantEdgeDevice } from '../types/tenant';

/** Realtime heartbeat delta as published by the backend MQTT bridge. */
export interface HeartbeatMessage {
  deviceId?: string;
  cpuUsagePct?: number;
  ramUsagePct?: number;
  storageUsagePct?: number;
  latencyMs?: number | null;
  firmwareVersion?: string;
}

/**
 * Immutable merge of a heartbeat delta into a tenant device row.
 * A field absent from the message is left untouched — a legacy/partial
 * heartbeat must never zero out a previously known metric.
 */
export function mergeHeartbeatIntoTenantDevice(
  previous: TenantEdgeDevice,
  message: HeartbeatMessage,
  receivedAt: string
): TenantEdgeDevice {
  return {
    ...previous,
    status: 'ONLINE',
    cpuUsagePct: message.cpuUsagePct ?? previous.cpuUsagePct,
    ramUsagePct: message.ramUsagePct ?? previous.ramUsagePct,
    storageUsagePct: message.storageUsagePct ?? previous.storageUsagePct,
    latencyMs: 'latencyMs' in message ? message.latencyMs : previous.latencyMs,
    firmwareVersion: message.firmwareVersion ?? previous.firmwareVersion,
    lastHeartbeatAt: receivedAt,
  };
}

/** Same merge semantics for the platform fleet's device health rows. */
export function mergeHeartbeatIntoEdgeDeviceHealth(
  previous: EdgeDeviceHealth,
  message: HeartbeatMessage,
  receivedAt: string
): EdgeDeviceHealth {
  return {
    ...previous,
    status: 'ONLINE',
    cpuPercent: message.cpuUsagePct ?? previous.cpuPercent,
    memoryPercent: message.ramUsagePct ?? previous.memoryPercent,
    diskPercent: message.storageUsagePct ?? previous.diskPercent,
    version: message.firmwareVersion ?? previous.version,
    lastHeartbeat: receivedAt,
  };
}
