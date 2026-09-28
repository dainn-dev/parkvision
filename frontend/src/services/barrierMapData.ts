import {
  BarrierAlertEvent,
  BarrierGateItem,
  BarrierStatus,
  BarrierType,
  TenantSiteBarrierLocation,
} from '../types/barrier';
import {
  AccessEvent,
  TenantSite,
} from '../types/tenant';
import {
  EdgeDeviceHealth,
  GateHealth,
  OperationalIncident,
  LiveGateFrame,
} from '../types/platform';
import type { LaneOut } from './api';

// ---------------------------------------------------------------------------
// Geography: project real lat/lng into the stylised 600x700 tactical SVG frame.
// Fitted against the mock catalogue points (HCMC 440/560, Hanoi 380/160,
// Da Nang 440/360, Hai Phong 410/175) — approximate but lands pins on-map.
// ---------------------------------------------------------------------------
const MAP_W = 600;
const MAP_H = 700;

export function projectLatLng(lat: number, lng: number): { x: number; y: number } {
  const x = -8.43 * lat + 28.99 * lng - 2562.3;
  const y = 980.6 - 39.02 * lat;
  return {
    x: Math.round(Math.min(560, Math.max(120, x))),
    y: Math.round(Math.min(660, Math.max(60, y))),
  };
}

// Sites that carry no GPS coordinates get a deterministic slot along the
// country's spine so pins stay stable across renders.
function scatterFor(seed: string): { x: number; y: number } {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  h = Math.abs(h);
  return {
    x: 360 + (h % 120) - 60, // 300..420-ish column
    y: 170 + ((h >> 7) % 400), // 170..570 down the country
  };
}

const NORTH_CITIES = /(hà nội|hanoi|ha noi|hải phòng|hai phong|quảng ninh|quang ninh|bắc ninh|bac ninh|hải dương|nam định|thái nguyên|lào cai|sapa|điện biên)/i;
const CENTRAL_CITIES = /(đà nẵng|da nang|huế|hue|quảng nam|quang nam|nha trang|khánh hòa|khanh hoa|đà lạt|da lat|lâm đồng|lam dong|quy nhơn|nghệ an|nghe an|hà tĩnh|thanh hóa|thanh hoa|vinh)/i;

export function extractCity(address: string | null | undefined): string {
  if (!address) return '—';
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '—';
}

export function deriveRegion(text: string | null | undefined): 'NORTH' | 'CENTRAL' | 'SOUTH' {
  const t = (text ?? '').toLowerCase();
  if (NORTH_CITIES.test(t)) return 'NORTH';
  if (CENTRAL_CITIES.test(t)) return 'CENTRAL';
  return 'SOUTH';
}

export function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return '—';
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
}

export function gateCodeFor(gateId: string): string {
  return `G-${gateId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

function mapGateStatus(raw: string | undefined): BarrierStatus {
  switch ((raw ?? '').toLowerCase()) {
    case 'open': return 'OPEN';
    case 'opening':
    case 'closing': return 'IN_MOTION';
    case 'locked': return 'LOCKED';
    case 'fault': return 'STUCK';
    case 'closed': return 'CLOSED';
    default: return 'CLOSED';
  }
}

function mapGateHealth(gate: GateHealth, raw: string | undefined): BarrierGateItem['health'] {
  if (raw === 'fault') return 'CRITICAL';
  if (raw === 'unknown') return 'OFFLINE';
  if (gate.status === 'OFFLINE') return 'OFFLINE';
  if (gate.status === 'DEGRADED') return 'WARNING';
  return 'HEALTHY';
}

function mapBarrierType(gateType: string | undefined): BarrierType {
  if (/heavy|truck|container/i.test(gateType ?? '')) return 'HEAVY_BOOM_1_5S';
  if (/pneumatic/i.test(gateType ?? '')) return 'PNEUMATIC_COMMERCIAL';
  return 'SERVO_FAST_0_6S';
}

function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === '1' || v === 1) return true;
  if (v === 'false' || v === '0' || v === 0) return false;
  return undefined;
}

export interface BuildBarrierLocationsInput {
  tenantSites: TenantSite[];
  gates: GateHealth[];
  edgeDevices: EdgeDeviceHealth[];
  incidents: OperationalIncident[];
  accessEvents: AccessEvent[];
  lanes: LaneOut[];
  liveFrames: Record<string, LiveGateFrame>;
  pendingCommands: Record<string, { command: string; issuedAt: number }>;
}

export function buildBarrierLocations(input: BuildBarrierLocationsInput): TenantSiteBarrierLocation[] {
  const { tenantSites, gates, edgeDevices, incidents, accessEvents, lanes, liveFrames, pendingCommands } = input;

  const lanesById = new Map(lanes.map((l) => [l.id, l]));
  const lanesBySite = new Map<string, LaneOut[]>();
  lanes.forEach((l) => {
    const arr = lanesBySite.get(l.siteId) ?? [];
    arr.push(l);
    lanesBySite.set(l.siteId, arr);
  });

  const openIncidentsByGate = new Map<string, OperationalIncident[]>();
  incidents
    .filter((i) => i.status !== 'RESOLVED')
    .forEach((i) => {
      const arr = openIncidentsByGate.get(i.resourceId) ?? [];
      arr.push(i);
      openIncidentsByGate.set(i.resourceId, arr);
    });

  const gatesBySite = new Map<string, GateHealth[]>();
  gates.forEach((g) => {
    if (!g.siteId) return;
    const arr = gatesBySite.get(g.siteId) ?? [];
    arr.push(g);
    gatesBySite.set(g.siteId, arr);
  });

  const devicesById = new Map(edgeDevices.map((d) => [d.id, d]));

  const latestEventByGate = new Map<string, AccessEvent>();
  const todayCycles = new Map<string, number>();
  const today = new Date().toDateString();
  accessEvents.forEach((e) => {
    if (!e.gateId) return;
    if (!latestEventByGate.has(e.gateId)) latestEventByGate.set(e.gateId, e);
    if (new Date(e.timestamp).toDateString() === today) {
      todayCycles.set(e.gateId, (todayCycles.get(e.gateId) ?? 0) + 1);
    }
  });

  return tenantSites.map((site) => {
    const siteGates = gatesBySite.get(site.id) ?? [];
    const siteLanes = lanesBySite.get(site.id) ?? [];

    // Edge gateway for this site: prefer a device referenced by its gates.
    const edgeDevice = siteGates
      .map((g) => (g.edgeDeviceId ? devicesById.get(g.edgeDeviceId) : undefined))
      .find((d): d is EdgeDeviceHealth => !!d);

    const gateItems: BarrierGateItem[] = siteGates.map((g) => {
      const lane = g.laneId ? lanesById.get(g.laneId) : siteLanes[0];
      const live = liveFrames[g.id];
      const status = mapGateStatus(live?.state ?? g.rawStatus);
      const health = mapGateHealth(g, live?.state ?? g.rawStatus);
      const gateIncidents = openIncidentsByGate.get(g.id) ?? [];
      const stuckIncident = gateIncidents.find((i) => /stuck|jam|fault|motor|block/i.test(`${i.title} ${i.description}`));
      const offlineIncident = gateIncidents.find((i) => /offline|heartbeat|connect|link/i.test(`${i.title} ${i.description}`));
      const lastEvent = latestEventByGate.get(g.id);
      const pending = pendingCommands[g.id];

      return {
        id: g.id,
        code: gateCodeFor(g.id),
        name: g.gateName,
        siteId: site.id,
        siteName: site.name,
        tenantId: site.tenantId,
        tenantName: site.tenantName,
        direction: (lane?.direction === 'exit' ? 'OUT' : 'IN') as BarrierGateItem['direction'],
        barrierType: mapBarrierType(g.rawType),
        status,
        health,
        armAngleDeg: num(live?.armAngleDeg) ?? (status === 'OPEN' ? 90 : status === 'IN_MOTION' ? 45 : status === 'STUCK' ? 45 : 0),
        loopDetectorActive: bool(live?.loopDetectorActive) ?? false,
        cameraConnected: Boolean(lane?.cameraUrl),
        cameraName: lane?.name ?? '—',
        lastPlate: lastEvent?.plate || '—',
        lastConfidence: lastEvent?.plateConfidence ?? 0,
        lastPassageTime: lastEvent ? relTime(lastEvent.timestamp) : '—',
        dailyCycles: todayCycles.get(g.id) ?? 0,
        motorTempC: num(live?.motorTempC) ?? 0,
        averageLatencyMs: num(live?.averageLatencyMs) ?? g.averageLatencyMs ?? 0,
        powerSource: live?.powerSource === 'UPS_BATTERY' ? 'UPS_BATTERY' : 'MAINS_220V',
        upsBatteryPercent: num(live?.upsBatteryPercent) ?? 100,
        warningNote: pending ? `Đang chờ xác nhận lệnh ${pending.command.toUpperCase()}...` : undefined,
        stuckSince: stuckIncident ? relTime(stuckIncident.startedAt) : undefined,
        stuckReason: stuckIncident?.description,
        offlineSince: offlineIncident ? relTime(offlineIncident.startedAt) : undefined,
        offlineReason: offlineIncident?.description,
      };
    });

    const totalGateCount = gateItems.length;
    const onlineGateCount = gateItems.filter((x) => x.health !== 'OFFLINE').length;
    const openGateCount = gateItems.filter((x) => x.status === 'OPEN').length;
    const allOffline = totalGateCount > 0 && onlineGateCount === 0;
    const anyCritical = gateItems.some((x) => x.health === 'CRITICAL' || x.status === 'STUCK');
    const anyWarning = gateItems.some((x) => x.health === 'WARNING' || x.health === 'OFFLINE');
    const overallHealth: TenantSiteBarrierLocation['overallHealth'] = allOffline
      ? 'OFFLINE'
      : anyCritical
        ? 'CRITICAL'
        : anyWarning
          ? 'WARNING'
          : 'HEALTHY';

    const coords = site.coordinates;
    const mapCoordinates = coords ? projectLatLng(coords.lat, coords.lng) : scatterFor(site.id);
    const city = extractCity(site.address);

    return {
      id: site.id,
      code: site.code || site.id.slice(0, 8).toUpperCase(),
      name: site.name,
      tenantId: site.tenantId,
      tenantName: site.tenantName,
      city,
      region: deriveRegion(`${city} ${site.address ?? ''}`),
      address: site.address ?? '—',
      coordinates: coords ?? { lat: 16.05, lng: 106.4 },
      mapCoordinates,
      capacity: site.capacity ?? 0,
      currentOccupancy: site.currentOccupancy ?? 0,
      overallHealth,
      onlineGateCount,
      totalGateCount,
      openGateCount,
      edgeGatewayId: edgeDevice?.deviceName ?? '—',
      edgeGatewayStatus: edgeDevice?.status ?? 'OFFLINE',
      edgeLatencyMs: edgeDevice
        ? Math.max(0, Math.round((Date.now() - new Date(edgeDevice.lastHeartbeat).getTime()) / 1000))
        : 0,
      gates: gateItems,
    };
  });
}

// ---------------------------------------------------------------------------
// Operational incidents -> BarrierAlertEvent for the alert drawer/toasts.
// ---------------------------------------------------------------------------
export interface IncidentLookup {
  siteNameOf: (id?: string | null) => string | undefined;
  gateNameOf: (id?: string | null) => string | undefined;
  gateSiteIdOf: (gateId?: string | null) => string | undefined;
  tenantName: string;
  tenantId: string;
}

export function incidentToBarrierAlert(inc: OperationalIncident, lk: IncidentLookup): BarrierAlertEvent {
  const gateId = inc.resourceId;
  const siteId = lk.gateSiteIdOf(gateId) ?? '';
  const isStuck = /stuck|jam|fault|motor|block|kẹt/i.test(`${inc.title} ${inc.description}`);
  const type: BarrierAlertEvent['type'] = isStuck ? 'STUCK' : 'OFFLINE';
  const severity: BarrierAlertEvent['severity'] = inc.severity === 'CRITICAL' || inc.severity === 'HIGH' ? 'CRITICAL' : 'WARNING';
  const gateName = lk.gateNameOf(gateId) ?? gateId;
  const siteName = lk.siteNameOf(siteId) ?? '—';

  return {
    id: inc.id,
    type,
    severity,
    siteId,
    siteName,
    gateId,
    gateCode: gateCodeFor(gateId),
    gateName,
    tenantId: lk.tenantId,
    tenantName: inc.tenantName ?? lk.tenantName,
    timestamp: relTime(inc.startedAt),
    title: isStuck ? 'Barrier Bị Kẹt Cần Cơ Học' : 'Barrier Mất Tín Hiệu (Offline)',
    message: inc.description || inc.title,
    suggestedAction: isStuck
      ? 'Gửi lệnh rơ-le khởi động lại hoặc nâng cần cưỡng bức'
      : 'Kiểm tra kết nối Edge Gateway và heartbeat thiết bị',
    resolved: inc.status === 'RESOLVED',
    resolvedAt: inc.status === 'RESOLVED' ? relTime(inc.updatedAt) : undefined,
    acknowledged: inc.status === 'ACKNOWLEDGED',
  };
}

// Rolling observed request rate (events/min) over a sliding window — real input
// for the anomaly detector instead of synthesized sine-wave values.
export function observedReqPerMin(events: AccessEvent[], gateId: string, windowMin = 5): number {
  const cutoff = Date.now() - windowMin * 60_000;
  const count = events.filter((e) => e.gateId === gateId && new Date(e.timestamp).getTime() >= cutoff).length;
  return count / windowMin;
}
