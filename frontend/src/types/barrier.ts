export type BarrierStatus = 'OPEN' | 'CLOSED' | 'LOCKED' | 'IN_MOTION' | 'MAINTENANCE' | 'STUCK';
export type BarrierHealth = 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'OFFLINE';
export type BarrierDirection = 'IN' | 'OUT' | 'BIDIRECTIONAL';
export type BarrierType = 'SERVO_FAST_0_6S' | 'HEAVY_BOOM_1_5S' | 'PNEUMATIC_COMMERCIAL';

export interface BarrierAlertEvent {
  id: string;
  type: 'STUCK' | 'OFFLINE';
  severity: 'CRITICAL' | 'WARNING';
  siteId: string;
  siteName: string;
  gateId: string;
  gateCode: string;
  gateName: string;
  tenantId: string;
  tenantName: string;
  timestamp: string;
  title: string;
  message: string;
  armAngleDeg?: number;
  motorTempC?: number;
  suggestedAction: string;
  resolved: boolean;
  resolvedAt?: string;
  acknowledged?: boolean;
}

export interface BarrierGateItem {
  id: string;
  code: string;
  name: string;
  siteId: string;
  siteName: string;
  tenantId: string;
  tenantName: string;
  direction: BarrierDirection;
  barrierType: BarrierType;
  status: BarrierStatus;
  health: BarrierHealth;
  armAngleDeg: number; // 0 = fully closed (down), 90 = fully open (up)
  loopDetectorActive: boolean;
  cameraConnected: boolean;
  cameraName: string;
  lastPlate: string;
  lastConfidence: number;
  lastPassageTime: string;
  dailyCycles: number;
  motorTempC: number;
  averageLatencyMs: number;
  powerSource: 'MAINS_220V' | 'UPS_BATTERY';
  upsBatteryPercent: number;
  warningNote?: string;
  stuckSince?: string;
  stuckReason?: string;
  offlineSince?: string;
  offlineReason?: string;
}

export interface TenantSiteBarrierLocation {
  id: string;
  code: string;
  name: string;
  tenantId: string;
  tenantName: string;
  city: string;
  region: 'NORTH' | 'CENTRAL' | 'SOUTH';
  address: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  // Pre-projected tactical SVG coordinates for crisp rendering in canvas/SVG
  mapCoordinates: {
    x: number;
    y: number;
  };
  capacity: number;
  currentOccupancy: number;
  overallHealth: BarrierHealth;
  onlineGateCount: number;
  totalGateCount: number;
  openGateCount: number;
  edgeGatewayId: string;
  edgeGatewayStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  edgeLatencyMs: number;
  gates: BarrierGateItem[];
}
