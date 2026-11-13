import { describe, expect, it } from 'vitest';
import type { DeviceOut } from './api';
import { mapDeviceSnapshot } from './deviceSnapshot';

const device = {
  id: 'device-1',
  siteId: 'site-1',
  name: 'Edge 1',
  deviceKey: 'key-1',
  deviceSerial: null,
  hardwareModel: null,
  mac: null,
  ipAddress: null,
  mqttClientId: null,
  firmwareVersion: '1.4.2',
  cpuUsagePct: 42,
  ramUsagePct: 53,
  storageUsagePct: 37,
  latencyMs: 18,
  status: 'online',
  lastHeartbeatAt: '2026-11-13T10:00:00Z',
  createdAt: '2026-11-01T00:00:00Z',
} as DeviceOut;

describe('mapDeviceSnapshot', () => {
  it('maps REST reconnect snapshots into both device collections', () => {
    const state = mapDeviceSnapshot(
      [device],
      1,
      'tenant-1',
      'Tenant',
      new Map([['site-1', 'Main Lot']]),
    );

    expect(state.total).toBe(1);
    expect(state.edgeDevices[0]).toMatchObject({
      id: 'device-1', cpuPercent: 42, memoryPercent: 53, diskPercent: 37,
      version: '1.4.2', lastHeartbeat: '2026-11-13T10:00:00Z',
    });
    expect(state.tenantDevices[0]).toMatchObject({
      id: 'device-1', siteName: 'Main Lot', cpuUsagePct: 42,
      ramUsagePct: 53, storageUsagePct: 37, latencyMs: 18,
      firmwareVersion: '1.4.2', lastHeartbeatAt: '2026-11-13T10:00:00Z',
    });
  });

  it('uses an empty site label when a reconnect snapshot has no matching site', () => {
    const state = mapDeviceSnapshot([device], 1, 'tenant-1', 'Tenant', new Map());
    expect(state.tenantDevices[0].siteName).toBe('');
  });
});
