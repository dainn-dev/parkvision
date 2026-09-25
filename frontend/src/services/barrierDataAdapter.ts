/**
 * Adapts live PlatformContext collections (sites, gates, edge devices,
 * incidents, access events) into the visualization shapes consumed by
 * BarrierMapVisualization. Replaces the former INITIAL_TENANT_BARRIER_SITES
 * mock dataset — everything here is derived from API data.
 */

import type {
  BarrierAlertEvent,
  BarrierDirection,
  BarrierGateItem,
  BarrierHealth,
  BarrierStatus,
  TenantSiteBarrierLocation,
} from '../types/barrier';
import type { AccessEvent, TenantSite } from '../types/tenant';
import type {
  EdgeDeviceHealth,
  GateHealth,
  GateTelemetrySnapshot,
  OperationalIncident,
} from '../types/platform';
import type { LaneOut } from '../services/api';

const VIETNAM_DEFAULT_COORDS = { lat: 10.7769, lng: 106.7009 }; // HCMC

/** Rough linear projection of lng/lat into the 600x700 map viewport space. */
const projectToMap = (lat: number, lng: number): { x: number; y: number } => ({
  x: Math.min(580, Math.max(20, 440 + (lng - 106.77) * 70)),
  y: Math.min(680, Math.max(20, 980 - lat * 39)),
});

const deriveRegion = (lat: number | undefined, address: string): 'NORTH' | 'CENTRAL' | 'SOUTH' => {
  if (lat !== undefined) {
    if (lat >= 19) return 'NORTH';
    if (lat >= 12) return 'CENTRAL';
    return 'SOUTH';
  }
  const a = address.toLowerCase();
  if (/(hà nội|ha noi|hanoi|bắc ninh|hải phòng|haiphong)/.test(a)) return 'NORTH';
  if (/(đà nẵng|da nang|huế|hue|quy nhơn|nha trang|đà lạt|dalat)/.test(a)) return 'CENTRAL';
  return 'SOUTH';
};

const deriveCity = (address: string): string => {
  const parts = address.split(',').map(p => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
};

const mapGateStatus = (rawStatus: string | undefined, teleState: string | null | undefined): BarrierStatus => {
  const s = (rawStatus && rawStatus !== 'unknown' ? rawStatus : teleState) ?? 'unknown';
  switch (s) {
    case 'open': return 'OPEN';
    case 'closed': return 'CLOSED';
    case 'locked': return 'LOCKED';
    case 'opening':
    case 'closing': return 'IN_MOTION';
    case 'fault': return 'STUCK';
    default: return 'MAINTENANCE';
  }
};

const mapLaneDirection = (dir: string | undefined): BarrierDirection =>
  dir === 'entry' ? 'IN' : dir === 'exit' ? 'OUT' : 'BIDIRECTIONAL';

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.length > 0 ? v : undefined;

const formatRelative = (iso: string | undefined): string => {
  if (!iso) return 'Chưa có';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return `${Math.max(1, Math.round(diff / 1000))} giây trước`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)} phút trước`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)} giờ trước`;
  return new Date(t).toLocaleString('vi-VN');
};

const todayStart = new Date();
todayStart.setHours(0, 0, 0, 0);

export interface BuildBarrierSitesInput {
  tenantSites: TenantSite[];
  gates: GateHealth[];
  edgeDevices: EdgeDeviceHealth[];
  incidents: OperationalIncident[];
  accessEvents: AccessEvent[];
  lanes: LaneOut[];
}

export const buildBarrierSites = (input: BuildBarrierSitesInput): TenantSiteBarrierLocation[] => {
  const { tenantSites, gates, edgeDevices, incidents, accessEvents, lanes } = input;
  const openIncidents = incidents.filter(i => i.status !== 'RESOLVED');

  return tenantSites.map((site, siteIndex) => {
    const siteGates = gates.filter(g => g.siteId === site.id);
    const siteDevice = edgeDevices.find(d => d.siteId === site.id);
    const gateItems: BarrierGateItem[] = siteGates.map((g, idx) => {
      const tele: GateTelemetrySnapshot | undefined = g.lastTelemetry;
      const p = tele?.payload ?? {};
      const gateIncidents = openIncidents.filter(i => i.resourceId === g.id);
      const worstIncident = gateIncidents.find(i => i.severity === 'CRITICAL' || i.severity === 'HIGH')
        ?? gateIncidents[0];
      const lane = lanes.find(l => l.id === g.laneId);

      let health: BarrierHealth;
      if (g.status === 'OFFLINE') health = 'OFFLINE';
      else if (worstIncident && (worstIncident.severity === 'CRITICAL' || worstIncident.severity === 'HIGH')) health = 'CRITICAL';
      else if (worstIncident || g.status === 'DEGRADED') health = 'WARNING';
      else health = 'HEALTHY';

      const status = mapGateStatus(g.rawStatus, tele?.state);
      const lastEvent = accessEvents.find(e => e.gateId === g.id);
      const todayCycles = accessEvents.filter(
        e => e.gateId === g.id && Date.parse(e.timestamp) >= todayStart.getTime(),
      ).length;
      const stuckIncident = gateIncidents.find(i => /stuck|obstacle|fault/i.test(i.title));
      const offlineIncident = gateIncidents.find(i => /offline/i.test(i.title));

      return {
        id: g.id,
        code: g.gateName.toUpperCase().replace(/[^A-Z0-9]+/g, '-').slice(0, 16) || `GATE-${idx + 1}`,
        name: g.gateName,
        siteId: site.id,
        siteName: site.name,
        tenantId: site.tenantId,
        tenantName: site.tenantName,
        direction: mapLaneDirection(lane?.direction),
        barrierType: 'SERVO_FAST_0_6S',
        status,
        health,
        armAngleDeg: num(p.armAngleDeg, status === 'OPEN' ? 90 : 0),
        loopDetectorActive: bool(p.loopDetectorActive, false),
        cameraConnected: bool(p.cameraConnected, bool(lane?.cameraUrl, false)),
        cameraName: lane?.name ?? 'Camera ANPR',
        lastPlate: str(p.plateNumber) ?? lastEvent?.plate ?? '—',
        lastConfidence: num(p.confidence, lastEvent?.plateConfidence ?? 0),
        lastPassageTime: formatRelative(lastEvent?.timestamp ?? tele?.recordedAt),
        dailyCycles: todayCycles,
        motorTempC: num(p.motorTempC, 0),
        averageLatencyMs: num(p.averageLatencyMs, g.averageLatencyMs || 0),
        powerSource: str(p.powerSource) === 'UPS_BATTERY' ? 'UPS_BATTERY' : 'MAINS_220V',
        upsBatteryPercent: num(p.upsBatteryPercent, 100),
        warningNote: worstIncident?.description || undefined,
        stuckSince: status === 'STUCK' ? formatRelative(worstIncident?.startedAt ?? g.lastHeartbeat) : undefined,
        stuckReason: stuckIncident?.description,
        offlineSince: health === 'OFFLINE' ? formatRelative(offlineIncident?.startedAt ?? g.lastHeartbeat) : undefined,
        offlineReason: offlineIncident?.description ?? (health === 'OFFLINE' ? 'Mất heartbeat với Edge Gateway' : undefined),
      };
    });

    const lat = site.coordinates?.lat ?? VIETNAM_DEFAULT_COORDS.lat - 0.15 * siteIndex;
    const lng = site.coordinates?.lng ?? VIETNAM_DEFAULT_COORDS.lng + 0.15 * siteIndex;
    const onlineCount = gateItems.filter(x => x.health !== 'OFFLINE').length;
    const openCount = gateItems.filter(x => x.status === 'OPEN').length;
    const edgeStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE' =
      siteDevice?.status === 'OFFLINE' ? 'OFFLINE'
        : siteDevice?.status === 'DEGRADED' ? 'DEGRADED'
        : siteDevice ? 'ONLINE' : 'OFFLINE';

    let overallHealth: BarrierHealth = 'HEALTHY';
    if (edgeStatus === 'OFFLINE' || gateItems.some(x => x.health === 'OFFLINE')) overallHealth = 'OFFLINE';
    else if (gateItems.some(x => x.health === 'CRITICAL')) overallHealth = 'CRITICAL';
    else if (gateItems.some(x => x.health === 'WARNING') || edgeStatus === 'DEGRADED') overallHealth = 'WARNING';

    const siteIncident = openIncidents.find(i => gateItems.some(g => g.id === i.resourceId));

    return {
      id: site.id,
      code: site.code,
      name: site.name,
      tenantId: site.tenantId,
      tenantName: site.tenantName,
      city: deriveCity(site.address),
      region: deriveRegion(site.coordinates?.lat, site.address),
      address: site.address,
      coordinates: { lat, lng },
      mapCoordinates: projectToMap(lat, lng),
      capacity: site.capacity ?? 0,
      currentOccupancy: site.currentOccupancy ?? 0,
      overallHealth: siteIncident && overallHealth === 'HEALTHY' ? 'WARNING' : overallHealth,
      onlineGateCount: onlineCount,
      totalGateCount: gateItems.length,
      openGateCount: openCount,
      edgeGatewayId: siteDevice?.id ?? '',
      edgeGatewayStatus: edgeStatus,
      edgeLatencyMs: 0,
      gates: gateItems,
    };
  });
};

/** Open incidents → in-app alert stack entries for the map header/drawer. */
export const buildBarrierAlerts = (
  incidents: OperationalIncident[],
  sites: TenantSiteBarrierLocation[],
): BarrierAlertEvent[] =>
  incidents
    .filter(i => i.status !== 'RESOLVED')
    .map(i => {
      const site = sites.find(s => s.gates.some(g => g.id === i.resourceId));
      const gate = site?.gates.find(g => g.id === i.resourceId);
      const isOffline = /offline/i.test(i.title);
      return {
        id: i.id,
        type: isOffline ? 'OFFLINE' : 'STUCK',
        severity: i.severity === 'CRITICAL' || i.severity === 'HIGH' ? 'CRITICAL' : 'WARNING',
        siteId: site?.id ?? '',
        siteName: site?.name ?? '',
        gateId: i.resourceId,
        gateCode: gate?.code ?? '',
        gateName: gate?.name ?? i.title,
        tenantId: site?.tenantId ?? '',
        tenantName: site?.tenantName ?? i.tenantName ?? '',
        timestamp: formatRelative(i.startedAt),
        title: i.title,
        message: i.description,
        armAngleDeg: gate?.armAngleDeg,
        motorTempC: gate?.motorTempC,
        suggestedAction: isOffline
          ? 'Kiểm tra nguồn UPS và khởi động lại dịch vụ Edge Gateway'
          : 'Kiểm tra cơ cấu cần và cảm biến dòng motor tại hiện trường',
        resolved: false,
        acknowledged: i.status === 'ACKNOWLEDGED',
      };
    });

/** Rolling requests/min per gate — fed into the anomaly detector as observedReqPerMin. */
export const gateRequestRates = (accessEvents: AccessEvent[]): Map<string, number> => {
  const cutoff = Date.now() - 5 * 60_000;
  const counts = new Map<string, number>();
  accessEvents.forEach(e => {
    if (Date.parse(e.timestamp) >= cutoff && e.gateId) {
      counts.set(e.gateId, (counts.get(e.gateId) ?? 0) + 1);
    }
  });
  const rates = new Map<string, number>();
  counts.forEach((count, gateId) => rates.set(gateId, count / 5));
  return rates;
};
