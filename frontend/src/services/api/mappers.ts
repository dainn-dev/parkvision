/**
 * Maps backend DTOs (camelCase, lowercase enums) onto the UI's richer types
 * (UPPERCASE enums, display-friendly fields). Fields the backend does not
 * carry get safe defaults.
 */
import type {
  AccessEventOut,
  AuditLogOut,
  DeviceOut,
  FeatureFlagOut,
  GateOut,
  IncidentOut,
  PlanOut,
  PlatformAdminOut,
  PlatformSettingOut,
  RuleOut,
  SessionOut,
  SiteOut,
  TenantOut,
  UserOut,
  VehicleOut,
  InfraHealth,
} from './index';
import type {
  ActiveSession,
  AuditLogItem,
  EdgeDeviceHealth,
  FeatureFlag,
  GateHealth,
  OperationalIncident,
  PlatformAdmin,
  PlatformSettings,
  ServiceHealthItem,
  Tenant,
} from '../../types/platform';
import type {
  AccessEvent,
  RegisteredVehicle,
  TenantAccessRule,
  TenantInvitation,
  TenantMember,
  TenantSite,
  TenantUser,
  TenantVehicle,
  UserAuditLog,
} from '../../types/tenant';

const upper = <T extends string>(s: string | null | undefined, fallback: T): T =>
  ((s ?? '').toUpperCase() || fallback) as T;

// ---------- Platform ----------

export const mapTenant = (t: TenantOut): Tenant => ({
  id: t.id,
  name: t.name,
  code: t.slug,
  email: t.contactEmail ?? '',
  phone: (t.settings as any)?.phone ?? '',
  timezone: (t.settings as any)?.timezone ?? 'Asia/Ho_Chi_Minh',
  status: upper(t.status, 'TRIAL'),
  administrator: {
    id: (t.settings as any)?.administratorId ?? '',
    name: (t.settings as any)?.administratorName ?? '',
    email: (t.settings as any)?.administratorEmail ?? '',
    phone: (t.settings as any)?.administratorPhone,
  },
  statistics: {
    usersCount: (t.settings as any)?.stats?.usersCount ?? 0,
    vehiclesCount: (t.settings as any)?.stats?.vehiclesCount ?? 0,
    camerasCount: (t.settings as any)?.stats?.camerasCount ?? 0,
    gatesCount: (t.settings as any)?.stats?.gatesCount ?? 0,
    edgeDevicesCount: (t.settings as any)?.stats?.edgeDevicesCount ?? 0,
    eventsCount: (t.settings as any)?.stats?.eventsCount ?? 0,
    storageUsedGb: (t.settings as any)?.stats?.storageUsedGb ?? 0,
  },
  createdAt: t.createdAt,
  lastActivityAt: t.updatedAt,
});

export const mapPlatformAdmin = (a: PlatformAdminOut): PlatformAdmin => ({
  id: a.id,
  name: a.fullName,
  email: a.email,
  role: upper(a.role, 'PLATFORM_SUPPORT'),
  status: upper(a.status, 'ACTIVE'),
  mfaEnabled: a.mfaEnabled,
  lastLoginAt: a.lastLoginAt ?? '',
  createdAt: a.createdAt,
  failedLoginAttempts: 0,
});

export const mapSession = (
  s: SessionOut,
  userLookup?: (userId: string) => { name?: string; email?: string } | undefined,
): ActiveSession => {
  const u = userLookup?.(s.userId);
  return {
    id: s.id,
    userId: s.userId,
    userName: u?.name ?? s.userId.slice(0, 8),
    userEmail: u?.email ?? '',
    userType: s.userType === 'platform_admin' ? 'PLATFORM_ADMIN' : 'TENANT_ADMIN',
    tenantId: s.tenantId ?? undefined,
    tenantName: undefined,
    device: s.userAgent ?? '',
    browser: s.userAgent ?? '',
    os: '',
    ipAddress: s.ip ?? '',
    riskLevel: 'NORMAL',
    createdTime: s.createdAt,
    lastActive: s.lastSeenAt ?? s.createdAt,
  };
};

export const mapFeatureFlag = (f: FeatureFlagOut): FeatureFlag => ({
  id: f.key,
  key: f.key,
  name: f.description || f.key,
  description: f.description ?? '',
  enabled: f.enabled,
  environment: 'production',
  rolloutPercentage: 100,
  rules: f.tenantOverrides ? [{ tenantIds: Object.keys(f.tenantOverrides) }] : [],
  updatedAt: '',
  updatedBy: '',
});

/** Merge rows of {key, value} settings into the UI's nested PlatformSettings shape. */
export const settingsFromRows = (
  rows: PlatformSettingOut[],
  base: PlatformSettings,
): PlatformSettings => {
  const merged: PlatformSettings = { ...base };
  for (const r of rows) {
    const key = r.key as keyof PlatformSettings;
    if (key in merged && r.value && typeof r.value === 'object') {
      (merged as any)[key] = {
        ...(merged as any)[key],
        ...(r.value as object),
      };
    }
  }
  return merged;
};

const serviceCategory = (name: string): ServiceHealthItem['category'] =>
  name === 'postgres' ? 'database' : name === 's3' ? 'storage' : name === 'mqtt' || name === 'redis' ? 'realtime' : 'core';

export const mapInfraHealth = (h: InfraHealth): ServiceHealthItem[] =>
  Object.entries(h.checks ?? {}).map(([name, c]) => ({
    id: `svc-${name}`,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    category: serviceCategory(name),
    status: (c.status === 'up' ? 'HEALTHY' : 'DOWN') as ServiceHealthItem['status'],
    responseTimeMs: Math.round(c.latencyMs ?? 0),
    uptimePercent: null,
    errorRatePercent: 0,
    details: c.error,
    lastChecked: new Date().toISOString(),
  }));

export const mapAuditLog = (a: AuditLogOut): AuditLogItem => ({
  id: a.id,
  timestamp: a.createdAt,
  category:
    a.actorType === 'platform_admin' ? 'PLATFORM_ADMIN' : a.actorType === 'system' ? 'SYSTEM' : 'TENANT_MANAGEMENT',
  action: a.action,
  actorName: a.actorEmail ?? a.actorId ?? 'system',
  actorEmail: a.actorEmail ?? '',
  actorType: a.actorType === 'platform_admin' ? 'PLATFORM_ADMIN' : a.actorType === 'system' ? 'SYSTEM' : 'TENANT_ADMIN',
  tenantName: undefined,
  resourceType: a.resourceType ?? '',
  resourceId: a.resourceId ?? '',
  result: 'SUCCESS',
  source: 'WEB',
  ipAddress: a.ip ?? '',
  requestId: '',
  traceId: '',
  metadata: a.details,
});

// ---------- Tenant ----------

export const mapSite = (s: SiteOut, tenantId: string, tenantName = ''): TenantSite => ({
  id: s.id,
  name: s.name,
  code: s.code ?? s.name.slice(0, 8).toUpperCase().replace(/\s+/g, '-'),
  tenantId,
  tenantName,
  address: s.address ?? '',
  status: s.status === 'active' ? 'HEALTHY' : 'INACTIVE',
  cameraCount: 0,
  onlineCameraCount: 0,
  gateCount: 0,
  onlineGateCount: 0,
  edgeDeviceCount: 0,
  onlineEdgeDeviceCount: 0,
  vehicleCount: 0,
  todayAccessCount: 0,
  lanesCount: 0,
  operatingHours: s.timezone,
  capacity: s.capacity ?? undefined,
  currentOccupancy: s.currentOccupancy ?? undefined,
  coordinates:
    s.latitude != null && s.longitude != null
      ? { lat: s.latitude, lng: s.longitude }
      : undefined,
  createdAt: s.createdAt,
  description: '',
});

export const mapGate = (g: GateOut, tenantId: string, tenantName = ''): GateHealth => ({
  id: g.id,
  gateName: g.name,
  tenantId,
  tenantName,
  status: g.status === 'offline' ? 'OFFLINE' : g.status === 'fault' ? 'DEGRADED' : 'ONLINE',
  eventsPerMin: 0,
  averageLatencyMs: 0,
  successRatePercent: 0,
  lastHeartbeat: g.lastStateChangeAt ?? g.createdAt,
  laneId: g.laneId ?? undefined,
  siteId: g.siteId ?? undefined,
  edgeDeviceId: g.edgeDeviceId ?? undefined,
  rawStatus: g.status ?? 'closed',
  lastTelemetry: g.lastTelemetry ?? undefined,
});

export const mapDevice = (d: DeviceOut, tenantId: string, tenantName = ''): EdgeDeviceHealth => ({
  id: d.id,
  deviceName: d.name,
  tenantId,
  tenantName,
  siteId: d.siteId ?? undefined,
  status: upper(d.status, 'OFFLINE') as EdgeDeviceHealth['status'],
  cpuPercent: 0,
  memoryPercent: 0,
  diskPercent: 0,
  version: d.firmwareVersion ?? '',
  connectedCameras: 0,
  eventsPerMin: 0,
  lastHeartbeat: d.lastHeartbeatAt ?? d.createdAt,
});

const plateOf = (v: VehicleOut): TenantVehicle['currentPlate'] => ({
  id: `${v.id}-plate`,
  number: v.plateNumber,
  normalizedPlate: v.plateNumber.toUpperCase().replace(/[^A-Z0-9]/g, ''),
  country: 'VN',
  status: v.status === 'active' ? 'ACTIVE' : 'INACTIVE',
  validFrom: v.validFrom ?? v.createdAt,
  validTo: v.validTo ?? undefined,
  registeredAt: v.createdAt,
});

export const mapVehicle = (v: VehicleOut, tenantId: string): TenantVehicle => ({
  id: v.id,
  tenantId,
  name: v.plateNumber,
  make: '',
  model: v.vehicleType ?? '',
  type: upper(v.vehicleType, 'CAR') as TenantVehicle['type'],
  status: upper(v.status, 'ACTIVE') as TenantVehicle['status'],
  currentPlate: plateOf(v),
  previousPlates: [],
  memberId: null,
  member: v.ownerName
    ? {
        id: v.id,
        code: '',
        name: v.ownerName,
        email: v.ownerContact ?? '',
        type: 'OTHER' as const,
        status: 'ACTIVE' as const,
      }
    : null,
  accessStatus: v.status === 'active' ? 'ALLOWED' : 'SUSPENDED',
  description: (v as any).notes ?? undefined,
  createdAt: v.createdAt,
  updatedAt: v.createdAt,
});

export const mapRegisteredVehicle = (v: VehicleOut): RegisteredVehicle => ({
  id: v.id,
  plate: v.plateNumber,
  ownerName: v.ownerName ?? '',
  model: v.vehicleType ?? '',
  type: v.vehicleType ?? 'car',
  siteId: undefined,
  status: v.status === 'active' ? 'ACTIVE' : 'BLOCKED',
  registeredAt: v.createdAt,
});

export const mapRule = (r: RuleOut, siteName?: string): TenantAccessRule => {
  const cond = (r.conditions ?? {}) as Record<string, unknown>;
  const sched = (r.schedule ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    tenantId: undefined,
    code: upper(r.ruleType, 'CUSTOM'),
    name: r.name,
    description: (cond.description as string) ?? undefined,
    action: r.ruleType === 'blacklist' || r.ruleType === 'deny' ? 'DENY' : 'ALLOW',
    priority: r.priority,
    status: r.active ? 'ACTIVE' : 'INACTIVE',
    target: {
      type: 'ALL_VEHICLES',
      licensePlate: cond.plateNumber as string | undefined,
      memberGroup: cond.memberGroup as string | undefined,
      notes: cond.notes as string | undefined,
    },
    scope: {
      allSites: !r.siteId,
      siteIds: r.siteId ? [r.siteId] : [],
      siteNames: siteName ? [siteName] : undefined,
      allGates: !(cond.gateIds as string[] | undefined)?.length,
      gateIds: (cond.gateIds as string[] | undefined) ?? [],
    },
    schedule: {
      type: (sched.type as TenantAccessRule['schedule']['type']) ?? 'ALWAYS',
      timezone: (sched.timezone as string) ?? undefined,
      summaryText: (sched.summary as string) ?? undefined,
    },
    validFrom: (sched.startDate as string) ?? undefined,
    validUntil: (sched.endDate as string) ?? null,
    sites: r.siteId ? [r.siteId] : [],
    gates: (cond.gateIds as string[] | undefined) ?? [],
    type: r.ruleType,
    scheduleSummary: (sched.summary as string) ?? undefined,
    createdAt: r.createdAt,
    updatedAt: r.createdAt,
  };
};

export const mapUser = (u: UserOut): TenantUser => ({
  id: u.id,
  name: u.fullName,
  email: u.email,
  username: u.email,
  role: upper(u.role, 'MEMBER') as TenantUser['role'],
  status: upper(u.status, 'ACTIVE') as TenantUser['status'],
  membership: null,
  lastLoginAt: u.lastLoginAt ?? undefined,
  createdAt: '',
});

export const mapMember = (u: UserOut): TenantMember => ({
  id: u.id,
  name: u.fullName,
  email: u.email,
  role: upper(u.role, 'MEMBER'),
  siteAccess: [],
  status: u.status === 'active' ? 'ACTIVE' : 'PENDING',
  createdAt: '',
});

export const mapInvitation = (u: UserOut): TenantInvitation => ({
  id: u.id,
  email: u.email,
  fullName: u.fullName,
  role: upper(u.role, 'MEMBER') as TenantInvitation['role'],
  invitedBy: '',
  status: 'PENDING',
  sentAt: '',
  expiresAt: '',
});

export const mapAccessEvent = (
  e: AccessEventOut,
  lookup?: { siteName?: string; gateName?: string; laneName?: string },
): AccessEvent => ({
  id: e.id,
  timestamp: e.occurredAt,
  timeFormatted: new Date(e.occurredAt).toTimeString().split(' ')[0],
  plate: e.plateNumber ?? '',
  plateConfidence: e.confidence ?? 0,
  detectionConfidence: e.confidence ?? 0,
  plateImageCrop: e.plateImageUrl ?? undefined,
  overviewImage: e.overviewImageUrl ?? undefined,
  siteId: e.siteId ?? '',
  siteName: lookup?.siteName ?? '',
  gateId: e.gateId ?? '',
  gateName: lookup?.gateName ?? '',
  laneName: lookup?.laneName ?? '',
  direction: upper(e.direction, 'IN') as AccessEvent['direction'],
  decision: upper(e.decision, 'UNKNOWN') as AccessEvent['decision'],
  reason: e.reason ?? undefined,
  verifiedBy: e.source,
});

export const mapIncident = (
  i: IncidentOut,
  lookup?: { siteName?: string; gateName?: string; tenantName?: string },
): OperationalIncident => ({
  id: i.id,
  title: lookup?.gateName ? `${i.type} @ ${lookup.gateName}` : i.type,
  severity: upper(i.severity, 'MEDIUM') as OperationalIncident['severity'],
  status: upper(i.status, 'OPEN') as OperationalIncident['status'],
  resourceId: i.gateId ?? i.id,
  resourceType: 'GATE',
  tenantName: lookup?.tenantName,
  description: i.description ?? '',
  startedAt: i.detectedAt,
  updatedAt: i.resolvedAt ?? i.acknowledgedAt ?? i.detectedAt,
  resolutionNote: i.resolutionNotes ?? undefined,
  assignedTo: i.acknowledgedBy ?? undefined,
});

export const mapUserAuditLog = (a: AuditLogOut): UserAuditLog => ({
  id: a.id,
  action: 'USER_UPDATED',
  actorName: a.actorEmail ?? a.actorId ?? 'system',
  targetUserName: (a.details as any)?.targetUserName ?? '',
  description: a.action,
  timestamp: a.createdAt,
});

export const mapPlan = (p: PlanOut) => ({
  code: p.code,
  name: p.name,
  description: p.description ?? '',
  priceMonthlyCents: p.priceMonthlyCents,
  currency: p.currency,
  limits: p.limits as Record<string, number>,
});
