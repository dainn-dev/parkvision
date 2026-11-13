import type { DeviceOut } from './api';
import { mapDevice, mapTenantDevice } from './api/mappers';
import type { EdgeDeviceHealth } from '../types/platform';
import type { TenantEdgeDevice } from '../types/tenant';

export interface DeviceSnapshotState {
  edgeDevices: EdgeDeviceHealth[];
  tenantDevices: TenantEdgeDevice[];
  total: number;
}

export function mapDeviceSnapshot(
  devices: DeviceOut[],
  total: number,
  tenantId: string,
  tenantName: string,
  siteNames: ReadonlyMap<string, string>,
): DeviceSnapshotState {
  return {
    edgeDevices: devices.map((device) => mapDevice(device, tenantId, tenantName)),
    tenantDevices: devices.map((device) => mapTenantDevice(device, siteNames.get(device.siteId) ?? '')),
    total,
  };
}
