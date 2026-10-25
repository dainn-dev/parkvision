/**
 * Maps backend DTOs (camelCase, lowercase enums) onto the UI's richer types
 * (UPPERCASE enums, display-friendly fields). Fields the backend does not
 * carry get safe defaults.
 */
import type {
  AccessEventOut,
  ApiCredentialOut,
  AuditLogOut,
  CameraOut,
  DeviceOut,
  FeatureFlagOut,
  GateOut,
  IncidentOut,
  LoginEventOut,
  PlanOut,
  PlatformAdminOut,
  PlatformSettingOut,
  RuleOut,
  SecurityAlertOut,
  SessionOut,
  SiteOut,
  TenantOut,
  TelemetrySnapshotOut,
  UserOut,
  VehicleOut,
  InfraHealth,
} from './index';
import type {
  ActiveSession,
  ApiCredential,
  AuditLogItem,
  CameraHealth,
  EdgeDeviceHealth,
  FeatureFlag,
  GateHealth,
  PlatformFleet,
  LoginActivityEvent,
  OperationalIncident,
  PlatformAdmin,
  PlatformSettings,
  SecurityAlert,
  ServiceHealthItem,
  Tenant,
} from '../../types/platform';
import type {
  AccessEvent,
  RegisteredVehicle,
  TenantAccessRule,
  TenantEdgeDevice,
  TenantInvitation,
  TenantMember,
  TenantMemberProfile,
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
  phone: t.phone ?? '',
  timezone: t.timezone || 'Asia/Ho_Chi_Minh',
  status: upper(t.status, 'TRIAL'),
  administrator: {
    id: t.administrator?.id ?? '',
    name: t.administrator?.name ?? '',
    email: t.administrator?.email ?? '',
    phone: t.administrator?.phone ?? undefined,
  },
  statistics: {
    usersCount: t.statistics?.usersCount ?? 0,
    vehiclesCount: t.statistics?.vehiclesCount ?? 0,
    camerasCount: t.statistics?.camerasCount ?? 0,
    gatesCount: t.statistics?.gatesCount ?? 0,
    edgeDevicesCount: t.statistics?.edgeDevicesCount ?? 0,
    eventsCount: t.statistics?.eventsCount ?? 0,
    storageUsedGb: t.statistics?.storageUsedGb ?? t.storageUsedGb ?? 0,
  },
  storageQuotaGb: t.storageQuotaGb ?? 0,
  createdAt: t.createdAt,
  lastActivityAt: t.lastActivityAt ?? t.updatedAt,
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

const parseUserAgent = (ua: string | null | undefined): { browser: string; os: string; device: string } => {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  return {
    browser: /Edg\//.test(ua)
      ? 'Edge'
      : /OPR\//.test(ua)
        ? 'Opera'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Firefox\//.test(ua)
            ? 'Firefox'
            : /Safari\//.test(ua)
              ? 'Safari'
              : 'Unknown',
    os: /Windows NT/.test(ua)
      ? 'Windows'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad|iPod/.test(ua)
          ? 'iOS'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : 'Unknown',
    device: /iPad|Tablet/.test(ua) ? 'Tablet' : /Mobile|Android|iPhone/.test(ua) ? 'Mobile' : 'Desktop',
  };
};

export const mapSession = (
  s: SessionOut,
  userLookup?: (userId: string) => { name?: string; email?: string } | undefined,
): ActiveSession => {
  const u = userLookup?.(s.userId);
  const ua = parseUserAgent(s.userAgent);
  return {
    id: s.id,
    userId: s.userId,
    userName: s.userName || u?.name || s.userEmail || u?.email || 'Unknown user',
    userEmail: s.userEmail ?? u?.email ?? '',
    userType:
      s.userType === 'platform_admin'
        ? 'PLATFORM_ADMIN'
        : s.userType === 'driver'
          ? 'DRIVER'
          : 'TENANT_ADMIN',
    tenantId: s.tenantId ?? undefined,
    tenantName: s.tenantName ?? undefined,
    device: ua.device,
    browser: ua.browser,
    os: ua.os,
    ipAddress: s.ip ?? '',
    riskLevel: (s.riskLevel ?? 'normal').toUpperCase() === 'SUSPICIOUS' ? 'SUSPICIOUS' : (s.riskLevel ?? 'normal').toUpperCase() === 'IMPERSONATED' ? 'HIGH_RISK' : 'NORMAL',
    createdTime: s.createdAt,
    lastActive: s.lastSeenAt ?? s.createdAt,
    mfaVerified: s.mfaVerified,
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
  updatedAt: Number.isNaN(Date.parse(f.updatedAt)) ? '' : f.updatedAt,
  updatedBy: f.updatedByEmail ?? 'System',
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

const AUDIT_CATEGORIES: AuditLogItem['category'][] = [
  'AUTHENTICATION',
  'TENANT_MANAGEMENT',
  'PLATFORM_ADMIN',
  'SECURITY',
  'CONFIGURATION',
  'MONITORING',
  'CREDENTIAL',
  'SYSTEM',
];

/** Rows written before the category column existed are classified by action. */
const auditCategory = (a: AuditLogOut): AuditLogItem['category'] => {
  const stored = (a.category ?? '').toUpperCase() as AuditLogItem['category'];
  if (AUDIT_CATEGORIES.includes(stored)) return stored;
  const action = a.action ?? '';
  if (action.startsWith('auth.')) return 'AUTHENTICATION';
  if (action.startsWith('platform.tenant')) return 'TENANT_MANAGEMENT';
  if (action.startsWith('platform.admin')) return 'PLATFORM_ADMIN';
  if (action.startsWith('platform.setting') || action.startsWith('platform.flag') || action.startsWith('tenant.settings'))
    return 'CONFIGURATION';
  if (action.startsWith('incident.') || action.startsWith('device.') || action.startsWith('edge_device.'))
    return 'MONITORING';
  if (action.startsWith('camera.') || action.startsWith('gate.')) return 'MONITORING';
  if (action.startsWith('api_credential.')) return 'CREDENTIAL';
  if (action.startsWith('session.')) return 'SECURITY';
  if (action.startsWith('audit.')) return 'SYSTEM';
  return a.actorType === 'platform_admin' ? 'PLATFORM_ADMIN' : 'TENANT_MANAGEMENT';
};

const auditResult = (action: string): AuditLogItem['result'] => {
  if (/failed|locked/.test(action)) return 'FAILED';
  if (/denied|forbidden/.test(action)) return 'DENIED';
  return 'SUCCESS';
};

export const mapAuditLog = (a: AuditLogOut): AuditLogItem => ({
  id: a.id,
  timestamp: a.createdAt,
  category: auditCategory(a),
  action: a.action,
  actorName: a.actorEmail ?? a.actorId ?? 'system',
  actorEmail: a.actorEmail ?? '',
  actorType: a.actorType === 'platform_admin' ? 'PLATFORM_ADMIN' : a.actorType === 'system' ? 'SYSTEM' : 'TENANT_ADMIN',
  tenantName: undefined,
  resourceType: a.resourceType ?? '',
  resourceId: a.resourceId ?? '',
  result: auditResult(a.action ?? ''),
  source: 'WEB',
  ipAddress: a.ip ?? '',
  requestId: '',
  traceId: '',
  metadata: a.details,
});

export const mapSecurityAlert = (a: SecurityAlertOut): SecurityAlert => {
  const ev = (a.evidence ?? {}) as Record<string, unknown>;
  return {
    id: a.id,
    type: upper(a.type, 'SUSPICIOUS_LOGIN') as SecurityAlert['type'],
    severity: upper(a.severity, 'MEDIUM') as SecurityAlert['severity'],
    status: upper(a.status, 'OPEN') as SecurityAlert['status'],
    subjectEmail: a.subjectEmail ?? '',
    subjectUserType: a.subjectUserType ?? '',
    detectedAt: a.detectedAt,
    sourceIp: a.sourceIp ?? '',
    clientBrowser: a.clientBrowser ?? '',
    evidence: {
      failedAttempts: typeof ev.failedAttempts === 'number' ? ev.failedAttempts : undefined,
      timeWindowMinutes: typeof ev.timeWindowMinutes === 'number' ? ev.timeWindowMinutes : undefined,
      location: typeof ev.location === 'string' ? ev.location : undefined,
      details: typeof ev.details === 'string' ? ev.details : undefined,
    },
  };
};

export const mapLoginEvent = (e: LoginEventOut, tenantName?: string): LoginActivityEvent => ({
  id: e.id,
  timestamp: e.timestamp,
  userEmail: e.userEmail ?? '',
  userType:
    e.userType === 'PLATFORM_ADMIN'
      ? 'PLATFORM_ADMIN'
      : e.userType === 'TENANT_USER'
        ? 'MEMBER'
        : e.userType === 'DRIVER'
          ? 'DRIVER'
          : 'SYSTEM',
  tenantName,
  result: upper(e.result, 'FAILED') as LoginActivityEvent['result'],
  sourceIp: e.sourceIp ?? '',
  clientDevice: e.clientDevice ?? '',
  failureReason: e.failureReason ?? undefined,
});

// ---------- Tenant ----------

const siteOperatingHoursLabel = (oh: SiteOut['operatingHours'] | undefined): string => {
  if (!oh || typeof oh !== 'object') return '';
  const o = oh as Record<string, unknown>;
  if (typeof o.label === 'string') return o.label;
  if (o.isOpen24_7 === true) return '24/7';
  return '';
};

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
  operatingHours: siteOperatingHoursLabel(s.operatingHours),
  managerName: s.managerName ?? undefined,
  managerPhone: s.contactPhone ?? undefined,
  capacity: s.capacity ?? undefined,
  currentOccupancy: s.currentOccupancy ?? undefined,
  coordinates:
    s.latitude != null && s.longitude != null
      ? { lat: s.latitude, lng: s.longitude }
      : undefined,
  city: s.city ?? undefined,
  publicProfile: (s as SiteOut & { publicProfile?: TenantSite['publicProfile'] }).publicProfile ?? undefined,
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
  rawType: g.gateType ?? undefined,
  lastTelemetry: g.lastTelemetry ?? undefined,
});

export const mapDevice = (d: DeviceOut, tenantId: string, tenantName = ''): EdgeDeviceHealth => ({
  id: d.id,
  deviceName: d.name,
  tenantId,
  tenantName,
  siteId: d.siteId ?? undefined,
  status: upper(d.status, 'OFFLINE') as EdgeDeviceHealth['status'],
  cpuPercent: d.cpuUsagePct ?? 0,
  memoryPercent: d.ramUsagePct ?? 0,
  diskPercent: d.storageUsagePct ?? 0,
  version: d.firmwareVersion ?? '',
  connectedCameras: 0,
  eventsPerMin: 0,
  lastHeartbeat: d.lastHeartbeatAt ?? d.createdAt,
});

export const mapTenantDevice = (d: DeviceOut, siteName = ''): TenantEdgeDevice => ({
  id: d.id,
  siteId: d.siteId,
  siteName,
  name: d.name,
  deviceKey: d.deviceKey,
  deviceSerial: d.deviceSerial ?? undefined,
  hardwareModel: d.hardwareModel ?? undefined,
  mac: d.mac ?? undefined,
  ipAddress: d.ipAddress ?? undefined,
  mqttClientId: d.mqttClientId ?? undefined,
  firmwareVersion: d.firmwareVersion ?? undefined,
  status: upper(d.status, 'OFFLINE') as TenantEdgeDevice['status'],
  cpuUsagePct: d.cpuUsagePct ?? 0,
  ramUsagePct: d.ramUsagePct ?? 0,
  storageUsagePct: d.storageUsagePct ?? 0,
  latencyMs: d.latencyMs ?? undefined,
  lastHeartbeatAt: d.lastHeartbeatAt ?? undefined,
  createdAt: d.createdAt,
});

export const mapPlatformFleet = (snapshot: TelemetrySnapshotOut): PlatformFleet => ({
  edgeDevices: snapshot.devices.map((d) => ({
    id: d.deviceId,
    deviceName: d.name,
    tenantId: d.tenantId,
    tenantName: d.tenantName,
    siteId: d.siteId ?? undefined,
    status: d.status === 'online' ? 'ONLINE' : d.status === 'degraded' ? 'DEGRADED' : 'OFFLINE',
    cpuPercent: d.cpuUsagePct ?? 0,
    memoryPercent: d.ramUsagePct ?? 0,
    diskPercent: d.storageUsagePct ?? 0,
    version: d.firmwareVersion ?? '',
    connectedCameras: snapshot.cameras.filter((c) => c.edgeDeviceId === d.deviceId).length,
    eventsPerMin: 0,
    lastHeartbeat: d.lastHeartbeatAt ?? '',
  })),
  cameras: snapshot.cameras.map((c) => ({
    id: c.cameraId,
    cameraName: c.name,
    tenantId: c.tenantId,
    tenantName: c.tenantName,
    siteId: c.siteId,
    siteName: c.siteName,
    laneId: c.laneId,
    edgeDeviceId: c.edgeDeviceId ?? '',
    code: c.code,
    purpose: c.purpose as CameraHealth['purpose'],
    status: c.status === 'active' ? 'ONLINE' : c.status === 'disabled' ? 'OFFLINE' : 'DEGRADED',
    fps: 0,
    frameDropPercent: 0,
    recognitionRatePerMin: 0,
    errorRatePercent: 0,
    lastFrameTime: '—',
  })),
  gates: snapshot.gates.map((g) => ({
    id: g.gateId,
    gateName: g.gateName,
    tenantId: g.tenantId,
    tenantName: g.tenantName,
    status: g.status === 'offline' ? 'OFFLINE' : g.status === 'fault' ? 'DEGRADED' : 'ONLINE',
    eventsPerMin: 0,
    averageLatencyMs: 0,
    successRatePercent: 0,
    lastHeartbeat: g.lastRecordedAt ?? '',
    siteId: g.siteId,
    rawStatus: g.status,
  })),
});

export const mapCamera = (c: CameraOut, tenantId: string, tenantName = ''): CameraHealth => ({
  id: c.id,
  cameraName: c.name,
  tenantId,
  tenantName,
  siteId: c.siteId,
  laneId: c.laneId,
  edgeDeviceId: c.edgeDeviceId ?? '',
  code: c.code,
  streamUrl: c.streamUrl,
  purpose: (c.purpose === 'overview' || c.purpose === 'monitor' ? c.purpose : 'plate') as CameraHealth['purpose'],
  notes: c.notes,
  lastSnapshotUrl: c.lastSnapshotUrl,
  snapshotCapturedAt: c.snapshotCapturedAt,
  // 'active' → ONLINE is administrative state only; real stream health needs edge telemetry.
  status: c.status === 'active' ? 'ONLINE' : c.status === 'disabled' ? 'OFFLINE' : 'DEGRADED',
  fps: 0,
  frameDropPercent: 0,
  recognitionRatePerMin: 0,
  errorRatePercent: 0,
  lastFrameTime: '—',
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
  make: v.brand ?? '',
  model: v.model ?? v.vehicleType ?? '',
  type: upper(v.vehicleType, 'CAR') as TenantVehicle['type'],
  color: v.color ?? undefined,
  status: upper(v.status, 'ACTIVE') as TenantVehicle['status'],
  currentPlate: plateOf(v),
  previousPlates: [],
  memberId: v.memberUserId ?? null,
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
  // A blacklisted plate is hard-locked at the barrier even while its row
  // status stays active — surface that reality instead of "Gate Allowed".
  accessStatus: v.tag === 'blacklist' ? 'DENIED' : v.status === 'active' ? 'ALLOWED' : 'SUSPENDED',
  accessStatusReason: v.tag === 'blacklist' ? 'Blacklisted plate — barrier hard-locked' : undefined,
  description: (v as any).notes ?? undefined,
  createdAt: v.createdAt,
  updatedAt: v.createdAt,
});

export const mapRegisteredVehicle = (v: VehicleOut): RegisteredVehicle => ({
  id: v.id,
  plate: v.plateNumber,
  ownerName: v.ownerName ?? '',
  model: v.model ?? v.vehicleType ?? '',
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
      // conditions.targetType is authored by the wizard; fall back to
      // plate/member-group detection for rows written before it existed.
      type: (['SPECIFIC_VEHICLE', 'LICENSE_PLATE', 'MEMBER', 'MEMBER_GROUP', 'VEHICLE_GROUP', 'VISITOR', 'ALL_VEHICLES'] as const)
        .find((t) => t === cond.targetType) ??
      (cond.plateNumber ? 'LICENSE_PLATE' : cond.memberGroup ? 'MEMBER_GROUP' : 'ALL_VEHICLES'),
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

const mapMembership = (u: UserOut): TenantUser['membership'] => {
  const p = u.profile as Record<string, unknown> | null | undefined;
  if (!p || Object.keys(p).length === 0) return null;
  return {
    id: u.id,
    userId: u.id,
    memberCode: String(p.memberCode ?? `MEM-${u.id.slice(0, 8).toUpperCase()}`),
    fullName: u.fullName,
    email: u.email,
    phone: typeof p.phone === 'string' ? p.phone : undefined,
    employeeId: typeof p.employeeId === 'string' ? p.employeeId : undefined,
    department: typeof p.department === 'string' ? p.department : undefined,
    type: upper(String(p.membershipType ?? 'EMPLOYEE'), 'EMPLOYEE') as TenantMemberProfile['type'],
    status:
      u.status === 'invited' ? 'PENDING' : u.status === 'active' ? 'ACTIVE' : 'SUSPENDED',
    vehicles: [],
    notes: typeof p.notes === 'string' ? p.notes : undefined,
    joinedAt: '',
  };
};

export const mapUser = (u: UserOut): TenantUser => ({
  id: u.id,
  name: u.fullName,
  email: u.email,
  username: u.email,
  role: upper(u.role, 'MEMBER') as TenantUser['role'],
  status: upper(u.status, 'ACTIVE') as TenantUser['status'],
  membership: mapMembership(u),
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

// Backend stores direction as entry/exit and decision as allow/deny; the UI
// types use IN/OUT and ALLOWED/DENIED/BLOCKED/UNKNOWN.
const EVENT_DIRECTION_MAP: Record<string, 'IN' | 'OUT'> = {
  ENTRY: 'IN', IN: 'IN', EXIT: 'OUT', OUT: 'OUT',
};
const EVENT_DECISION_MAP: Record<string, 'ALLOWED' | 'DENIED' | 'BLOCKED' | 'UNKNOWN'> = {
  ALLOW: 'ALLOWED', ALLOWED: 'ALLOWED', DENY: 'DENIED', DENIED: 'DENIED',
  BLOCK: 'BLOCKED', BLOCKED: 'BLOCKED',
};

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
  direction: EVENT_DIRECTION_MAP[upper(e.direction, 'IN')] ?? 'IN',
  decision: EVENT_DECISION_MAP[upper(e.decision, 'UNKNOWN')] ?? 'UNKNOWN',
  reason: e.reason ?? undefined,
  verifiedBy: e.verifiedBy ?? e.source,
  correctedPlate: e.correctedPlate ?? undefined,
  correctedAt: e.correctedAt ?? undefined,
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

export const mapApiCredential = (
  c: ApiCredentialOut,
  tenantName?: string,
): ApiCredential => ({
  id: c.id,
  name: c.name,
  type: c.scopes?.some((s) => s.startsWith('edge')) ? 'EDGE_KEY' : 'PLATFORM_KEY',
  ownerName: tenantName ?? (c.tenantId ? c.tenantId.slice(0, 8) : 'Platform'),
  keyPrefix: c.keyPrefix,
  status: c.status.toUpperCase() as ApiCredential['status'],
  lastUsedAt: c.lastUsedAt ? new Date(c.lastUsedAt).toLocaleString() : 'never',
  createdAt: c.createdAt,
  expiresAt: c.expiresAt ?? undefined,
});
