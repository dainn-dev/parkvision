import { describe, expect, it } from 'vitest';
import type { EdgeDeviceHealth } from '../types/platform';
import type { TenantEdgeDevice } from '../types/tenant';
import { mergeHeartbeatIntoEdgeDeviceHealth, mergeHeartbeatIntoTenantDevice } from './heartbeat';

const tenantDevice: TenantEdgeDevice = {
  id: 'device-1',
  siteId: 'site-1',
  siteName: 'Site',
  name: 'Edge',
  deviceKey: 'key',
  firmwareVersion: '1.0.0',
  status: 'OFFLINE',
  cpuUsagePct: 10,
  ramUsagePct: 20,
  storageUsagePct: 30,
  latencyMs: 12,
  lastHeartbeatAt: '2026-11-13T09:00:00Z',
  createdAt: '2026-11-01T00:00:00Z',
};

const fleetDevice: EdgeDeviceHealth = {
  id: 'device-1',
  deviceName: 'Edge',
  tenantId: 'tenant-1',
  tenantName: 'Tenant',
  status: 'OFFLINE',
  cpuPercent: 10,
  memoryPercent: 20,
  diskPercent: 30,
  version: '1.0.0',
  connectedCameras: 0,
  eventsPerMin: 0,
  lastHeartbeat: '2026-11-13T09:00:00Z',
};

describe('heartbeat merges', () => {
  it('merges all heartbeat resource fields into tenant and fleet devices', () => {
    const message = {
      deviceId: 'device-1',
      cpuUsagePct: 49,
      ramUsagePct: 53,
      storageUsagePct: 37,
      latencyMs: 42,
      firmwareVersion: '1.4.2',
    };
    const receivedAt = '2026-11-13T10:00:00Z';

    expect(mergeHeartbeatIntoTenantDevice(tenantDevice, message, receivedAt)).toMatchObject({
      status: 'ONLINE', cpuUsagePct: 49, ramUsagePct: 53, storageUsagePct: 37,
      latencyMs: 42, firmwareVersion: '1.4.2', lastHeartbeatAt: receivedAt,
    });
    expect(mergeHeartbeatIntoEdgeDeviceHealth(fleetDevice, message, receivedAt)).toMatchObject({
      status: 'ONLINE', cpuPercent: 49, memoryPercent: 53, diskPercent: 37,
      version: '1.4.2', lastHeartbeat: receivedAt,
    });
  });

  it('preserves existing fields for a partial legacy heartbeat', () => {
    const result = mergeHeartbeatIntoTenantDevice(
      tenantDevice,
      { deviceId: 'device-1', cpuUsagePct: 44 },
      '2026-11-13T10:00:00Z',
    );

    expect(result.cpuUsagePct).toBe(44);
    expect(result.ramUsagePct).toBe(20);
    expect(result.storageUsagePct).toBe(30);
    expect(result.latencyMs).toBe(12);
    expect(result.firmwareVersion).toBe('1.0.0');
  });

  it('keeps an explicit null latency as no valid sample', () => {
    const result = mergeHeartbeatIntoTenantDevice(
      tenantDevice,
      { deviceId: 'device-1', latencyMs: null },
      '2026-11-13T10:00:00Z',
    );
    expect(result.latencyMs).toBeNull();
  });
});
