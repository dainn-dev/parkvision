import { api } from './client';
export { ApiError, api } from './client';
import type { components } from './schema';

type S = components['schemas'];
export type MeOut = S['MeOut'];
export type SessionOut = S['SessionOut'];
export type PlanOut = S['PlanOut'];
export type LegalDocOut = S['LegalDocOut'];
export type TenantOut = S['TenantOut'];
export type UserOut = S['UserOut'];
export type PlatformAdminOut = S['PlatformAdminOut'];
export type FeatureFlagOut = S['FeatureFlagOut'];
export type PlatformSettingOut = S['PlatformSettingOut'];
export type SiteOut = S['SiteOut'];
export type LaneOut = S['LaneOut'];
export type GateOut = S['GateOut'];
export type DeviceOut = S['DeviceOut'];
export type CommandOut = S['CommandOut'];
export type VehicleOut = S['VehicleOut'];
export type RuleOut = S['RuleOut'];
export type AccessEventOut = S['AccessEventOut'];
export type IncidentOut = S['IncidentOut'];
export type AuditLogOut = S['AuditLogOut'];
export type JobOut = S['JobOut'];
export type ApiCredentialOut = S['ApiCredentialOut'];
export type ApiCredentialCreatedOut = S['ApiCredentialCreatedOut'];
export type ApiCredentialCreateIn = S['ApiCredentialCreateIn'];
export type ImpersonateOut = S['ImpersonateOut'];
export type MessageOut = S['MessageOut'];
export interface InfraCheck {
  status: string;
  latencyMs?: number;
  error?: string;
}
export interface InfraHealth {
  status: string;
  checks: Record<string, InfraCheck>;
}

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
};

// ---------- Auth ----------
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ mfaRequired: boolean; csrfToken?: string }>('/auth/login', { email, password }),
  mfaVerify: (code: string) =>
    api.post<{ mfaRequired: boolean; csrfToken?: string }>('/auth/mfa/verify', { code }),
  me: () => api.get<MeOut>('/auth/me'),
  logout: () => api.post<{ message?: string }>('/auth/logout'),
  refresh: () => api.post<{ csrfToken?: string }>('/auth/refresh'),
  activate: (token: string, password: string) => api.post('/auth/activate', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/password', { currentPassword, newPassword }),
  mfaSetup: () => api.post<{ secret: string; provisioningUri: string }>('/auth/mfa/setup'),
  mfaEnable: (code: string) => api.post<{ backupCodes: string[] }>('/auth/mfa/enable', { code }),
  mfaDisable: (code: string) => api.post('/auth/mfa/disable', { code }),
  listSessions: () => api.get<SessionOut[]>('/auth/sessions'),
  revokeSession: (sessionId: string) => api.del(`/auth/sessions/${sessionId}`),
};

// ---------- Public ----------
export const publicApi = {
  plans: () => api.get<PlanOut[]>('/plans'),
  legal: (doc: 'terms' | 'privacy' | 'dpa' | 'sla') => api.get<LegalDocOut>(`/legal/${doc}`),
  checkCode: (slug: string) => api.get<S['CheckCodeOut']>(`/tenants/check-code${qs({ slug })}`),
  register: (body: {
    tenantName: string;
    slug: string;
    planCode?: string;
    contactEmail: string;
    ownerEmail: string;
    ownerFullName: string;
    ownerPassword: string;
  }) => api.post<{ tenantId: string; ownerUserId: string; message?: string }>('/register', body),
};

// ---------- Platform ----------
export const platformApi = {
  listTenants: (p: { page?: number; limit?: number; status?: string; search?: string } = {}) =>
    api.get<Page<TenantOut>>(`/platform/tenants${qs(p)}`),
  getTenant: (id: string) => api.get<TenantOut>(`/platform/tenants/${id}`),
  createTenant: (body: {
    name: string;
    slug: string;
    planCode?: string;
    contactEmail: string;
    ownerEmail: string;
    ownerFullName: string;
    ownerPassword: string;
  }) => api.post<TenantOut>('/platform/tenants', body),
  updateTenant: (id: string, body: { name?: string; status?: string; planCode?: string; contactEmail?: string; settings?: object }) =>
    api.patch<TenantOut>(`/platform/tenants/${id}`, body),
  listTenantUsers: (id: string) => api.get<UserOut[]>(`/platform/tenants/${id}/users`),
  listAdmins: () => api.get<PlatformAdminOut[]>('/platform/admins'),
  createAdmin: (body: { email: string; password: string; fullName: string; role?: string }) =>
    api.post<PlatformAdminOut>('/platform/admins', body),
  listSessions: (p: { userId?: string; tenantId?: string; activeOnly?: boolean } = {}) =>
    api.get<SessionOut[]>(`/platform/sessions${qs(p)}`),
  revokeSession: (id: string) => api.post(`/platform/sessions/${id}/revoke`),
  getSettings: () => api.get<PlatformSettingOut[]>('/platform/settings'),
  putSetting: (key: string, value: object) => api.put<PlatformSettingOut>(`/platform/settings/${key}`, { value }),
  listFlags: () => api.get<FeatureFlagOut[]>('/platform/feature-flags'),
  putFlag: (key: string, body: { enabled: boolean; description?: string; tenantOverrides?: object }) =>
    api.put<FeatureFlagOut>(`/platform/feature-flags/${key}`, body),
  infraHealth: () => api.get<InfraHealth>('/platform/infra/health'),
  auditLogs: (p: { page?: number; limit?: number; action?: string; actorId?: string; fromTs?: string; toTs?: string } = {}) =>
    api.get<Page<AuditLogOut>>(`/platform/audit-logs${qs(p)}`),
  metricsOverview: () => api.get<S['MetricsOverviewOut']>('/platform/metrics/overview'),
  throughputChart: (hours = 24) => api.get<S['ThroughputChartOut']>(`/platform/metrics/throughput-chart${qs({ hours })}`),
  telemetrySnapshot: () => api.get<S['TelemetrySnapshotOut']>('/platform/monitoring/telemetry-snapshot'),
  rebootEdgeDevice: (deviceId: string) => api.post<S['EdgeRebootOut']>(`/platform/edge-devices/${deviceId}/reboot`),
  credentials: () => api.get<S['ApiCredentialOut'][]>('/platform/credentials'),
  createCredential: (body: S['ApiCredentialCreateIn']) => api.post<S['ApiCredentialCreatedOut']>('/platform/credentials', body),
  rotateCredential: (id: string) => api.post<S['ApiCredentialCreatedOut']>(`/platform/credentials/${id}/rotate`),
  revokeCredential: (id: string) => api.post<S['MessageOut']>(`/platform/credentials/${id}/revoke`),
  impersonateTenant: (tenantId: string) => api.post<S['ImpersonateOut']>(`/platform/tenants/${tenantId}/impersonate`),
};

// ---------- Tenant-scoped ----------
const T = (tenantId: string, p: string) => `/tenants/${tenantId}${p}`;

export const tenantApi = {
  sites: (t: string, p: { page?: number; limit?: number } = {}) => api.get<Page<SiteOut>>(T(t, `/sites${qs(p)}`)),
  site: (t: string, id: string) => api.get<SiteOut>(T(t, `/sites/${id}`)),
  createSite: (t: string, body: { name: string; address?: string; timezone?: string; status?: string }) => api.post<SiteOut>(T(t, '/sites'), body),
  updateSite: (t: string, id: string, body: Partial<{ name: string; address: string; timezone: string; status: string }>) => api.patch<SiteOut>(T(t, `/sites/${id}`), body),
  deleteSite: (t: string, id: string) => api.del(T(t, `/sites/${id}`)),

  lanes: (t: string, siteId: string) => api.get<LaneOut[]>(T(t, `/sites/${siteId}/lanes`)),
  createLane: (t: string, siteId: string, body: { name: string; direction?: string; cameraUrl?: string; status?: string }) => api.post<LaneOut>(T(t, `/sites/${siteId}/lanes`), body),
  updateLane: (t: string, id: string, body: Partial<{ name: string; direction: string; cameraUrl: string; status: string }>) => api.patch<LaneOut>(T(t, `/lanes/${id}`), body),
  deleteLane: (t: string, id: string) => api.del(T(t, `/lanes/${id}`)),

  gates: (t: string, p: { page?: number; limit?: number; siteId?: string } = {}) => api.get<Page<GateOut>>(T(t, `/gates${qs(p)}`)),
  gate: (t: string, id: string) => api.get<GateOut>(T(t, `/gates/${id}`)),
  createGate: (t: string, body: { siteId: string; laneId?: string; edgeDeviceId?: string; name: string; gateType?: string }) => api.post<GateOut>(T(t, '/gates'), body),
  updateGate: (t: string, id: string, body: Partial<{ name: string; gateType: string; laneId: string; edgeDeviceId: string; status: string }>) => api.patch<GateOut>(T(t, `/gates/${id}`), body),
  sendCommand: (t: string, gateId: string, command: string, idempotencyKey: string, payload?: object) =>
    api.post<CommandOut>(T(t, `/gates/${gateId}/commands`), { command, idempotencyKey, payload }),
  commands: (t: string, gateId: string) => api.get<Page<CommandOut>>(T(t, `/gates/${gateId}/commands`)),
  command: (t: string, commandId: string) => api.get<CommandOut>(T(t, `/commands/${commandId}`)),
  telemetry: (t: string, gateId: string) => api.get<Page<S['TelemetryOut']>>(T(t, `/gates/${gateId}/telemetry`)),

  devices: (t: string, p: { page?: number; limit?: number; siteId?: string } = {}) => api.get<Page<DeviceOut>>(T(t, `/devices${qs(p)}`)),
  device: (t: string, id: string) => api.get<DeviceOut>(T(t, `/devices/${id}`)),
  createDevice: (t: string, body: { siteId: string; name: string; mac?: string; firmwareVersion?: string }) => api.post<DeviceOut>(T(t, '/devices'), body),

  vehicles: (t: string, p: { page?: number; limit?: number; tag?: string; status?: string; search?: string } = {}) =>
    api.get<Page<VehicleOut>>(T(t, `/vehicles${qs(p)}`)),
  vehicle: (t: string, id: string) => api.get<VehicleOut>(T(t, `/vehicles/${id}`)),
  createVehicle: (t: string, body: { plateNumber: string; ownerName?: string; ownerContact?: string; vehicleType?: string; tag?: string; validFrom?: string; validTo?: string; notes?: string }) =>
    api.post<VehicleOut>(T(t, '/vehicles'), body),
  updateVehicle: (t: string, id: string, body: Partial<{ plateNumber: string; ownerName: string; ownerContact: string; vehicleType: string; tag: string; validFrom: string; validTo: string; notes: string; status: string }>) =>
    api.patch<VehicleOut>(T(t, `/vehicles/${id}`), body),
  deleteVehicle: (t: string, id: string) => api.del(T(t, `/vehicles/${id}`)),
  importVehicles: (t: string, csv: Blob) => {
    const form = new FormData();
    form.append('file', csv, 'vehicles.csv');
    return api.postForm<{ jobId: string }>(T(t, '/vehicles/import'), form);
  },

  rules: (t: string, p: { page?: number; limit?: number } = {}) => api.get<Page<RuleOut>>(T(t, `/rules${qs(p)}`)),
  createRule: (t: string, body: { siteId?: string; name: string; ruleType: string; priority?: number; schedule?: object; conditions?: object; active?: boolean }) =>
    api.post<RuleOut>(T(t, '/rules'), body),
  updateRule: (t: string, id: string, body: Partial<{ siteId: string; name: string; ruleType: string; priority: number; schedule: object; conditions: object; active: boolean }>) =>
    api.patch<RuleOut>(T(t, `/rules/${id}`), body),
  deleteRule: (t: string, id: string) => api.del(T(t, `/rules/${id}`)),

  users: (t: string, p: { page?: number; limit?: number } = {}) => api.get<Page<UserOut>>(T(t, `/users${qs(p)}`)),
  inviteUser: (t: string, body: { email: string; fullName: string; role?: string }) => api.post<UserOut>(T(t, '/users'), body),
  updateUser: (t: string, id: string, body: Partial<{ fullName: string; role: string; status: string }>) => api.patch<UserOut>(T(t, `/users/${id}`), body),
  deleteUser: (t: string, id: string) => api.del(T(t, `/users/${id}`)),

  accessEvents: (t: string, p: { page?: number; limit?: number; siteId?: string; gateId?: string; plate?: string; decision?: string; fromTs?: string; toTs?: string } = {}) =>
    api.get<Page<AccessEventOut>>(T(t, `/access-events${qs(p)}`)),
  accessEvent: (t: string, id: string) => api.get<AccessEventOut>(T(t, `/access-events/${id}`)),
  createAccessEvent: (t: string, body: object) => api.post<AccessEventOut>(T(t, '/access-events'), body),
  presignEventImages: (t: string, body: object) => api.post<{ uploadUrl: string; key?: string }>(T(t, '/access-events/presign'), body),

  incidents: (t: string, p: { page?: number; limit?: number; status?: string; gateId?: string } = {}) =>
    api.get<Page<IncidentOut>>(T(t, `/incidents${qs(p)}`)),
  createIncident: (t: string, body: { gateId?: string; type: string; severity: string; description?: string }) => api.post<IncidentOut>(T(t, '/incidents'), body),
  acknowledgeIncident: (t: string, id: string) => api.post<IncidentOut>(T(t, `/incidents/${id}/acknowledge`)),
  resolveIncident: (t: string, id: string, resolutionNotes?: string) => api.post<IncidentOut>(T(t, `/incidents/${id}/resolve`), { resolutionNotes }),

  auditLogs: (t: string, p: { page?: number; limit?: number; action?: string; actorId?: string; fromTs?: string; toTs?: string } = {}) =>
    api.get<Page<AuditLogOut>>(T(t, `/audit-logs${qs(p)}`)),
  exportAudit: (t: string, body: { fromTs?: string; toTs?: string; action?: string }) => api.post<JobOut>(T(t, '/audit-logs/export'), body),

  job: (t: string, id: string) => api.get<JobOut>(T(t, `/jobs/${id}`)),

  simulateRule: (t: string, plateNumber?: string) =>
    api.post<S['RuleSimulateOut']>(T(t, '/rules/simulate'), { plateNumber }),
  correctPlate: (t: string, id: string, plateNumber: string) =>
    api.patch<S['AccessEventOut']>(T(t, `/access-events/${id}/correct-plate`), { plateNumber }),
  bulkResolveIncidents: (t: string, incidentIds: string[], resolutionNotes?: string) =>
    api.post<S['BulkResolveOut']>(T(t, '/incidents/bulk-resolve'), { incidentIds, resolutionNotes }),

  settings: (t: string) => api.get<S['TenantSettingsOut']>(T(t, '/settings')),
  updateSettings: (t: string, body: S['TenantSettingsIn']) =>
    api.put<S['TenantSettingsOut']>(T(t, '/settings'), body),

  dashboardSummary: (t: string) => api.get<S['DashboardSummaryOut']>(T(t, '/dashboard/summary')),
  hourlyFlow: (t: string, hours = 24) => api.get<S['HourlyFlowOut']>(T(t, `/dashboard/hourly-flow${qs({ hours })}`)),
};

// ---------- WebSocket ----------
export const barrierTelemetryWsUrl = (tenantId: string): string => {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/tenants/${tenantId}/barrier-telemetry`;
};
