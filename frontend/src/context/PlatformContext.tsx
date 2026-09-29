import React, { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from 'react';
import {
  PrimaryTab,
  PlatformSubTab,
  MonitoringSubTab,
  SecuritySubTab,
  SettingsSection,
  Tenant,
  PlatformAdmin,
  ActiveSession,
  FeatureFlag,
  PlatformSettings,
  ServiceHealthItem,
  EdgeDeviceHealth,
  CameraHealth,
  GateHealth,
  OperationalIncident,
  SecurityAlert,
  LoginActivityEvent,
  ApiCredential,
  AuditLogItem,
  TenantStatus,
  LiveGateFrame,
} from '../types/platform';
import {
  TenantLocation,
  OperatingHoursSchedule,
  TenantSite,
  AccessEvent,
  TenantAlertItem,
  AccessActivityDataPoint,
  TenantDashboardSummary,
  TenantSystemHealth,
  TenantNavigationTab,
  RegisteredVehicle,
  TenantVehicle,
  VehicleType,
  TenantAccessRule,
  TenantMember,
  TenantUser,
  TenantInvitation,
  UserAuditLog,
  TenantUserRole,
  MembershipType,
  TenantMemberProfile,
  TenantEdgeDevice,
  TenantEdgeDeviceInput,
} from '../types/tenant';
import {
  authApi,
  platformApi,
  tenantApi,
  barrierTelemetryWsUrl,
  ApiError,
} from '../services/api';
import type {
  CameraIn,
  IncidentOut,
  LaneOut,
  LocateOut,
  MapLevelOut,
  PresenceOut,
  ZoneBounds,
} from '../services/api';
import {
  mapAccessEvent,
  mapApiCredential,
  mapAuditLog,
  mapCamera,
  mapDevice,
  mapTenantDevice,
  mapFeatureFlag,
  mapGate,
  mapIncident,
  mapInfraHealth,
  mapInvitation,
  mapMember,
  mapPlatformAdmin,
  mapRegisteredVehicle,
  mapRule,
  mapSession,
  mapSite,
  mapTenant,
  mapUser,
  mapUserAuditLog,
  mapVehicle,
  settingsFromRows,
} from '../services/api/mappers';
import {
  INITIAL_TENANT_LOCATION,
  INITIAL_TENANT_SUMMARY,
  INITIAL_TENANT_HEALTH,
  INITIAL_TENANT_ALERTS,
  INITIAL_ACCESS_ACTIVITY,
  INITIAL_TENANT_INVITATIONS,
  INITIAL_USER_AUDIT_LOGS,
} from '../data/tenantMockData';
import {
  INITIAL_SETTINGS,
} from '../data/mockData';
// UI role labels -> backend TenantUserRole enum
const mapUiRoleToBackend = (role: string): string => {
  const r = (role ?? '').toUpperCase();
  if (r === 'OWNER' || r === 'ADMIN' || r === 'TENANT_ADMIN') return 'admin';
  if (r === 'OPERATOR' || r === 'SITE_MANAGER' || r === 'MANAGER') return 'operator';
  return 'viewer';
};

interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

interface PlatformContextType {
  isAuthenticated: boolean;
  isSessionLoading: boolean;
  userType: string;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    mfaEnabled: boolean;
  };
  login: (email: string, pass: string, otp?: string) => Promise<{ requiresMfa: boolean; success: boolean; message?: string }>;
  logout: () => void;

  theme: 'dark' | 'light';
  toggleTheme: () => void;

  isMfaModalOpen: boolean;
  mfaModalMode: 'enroll' | 'challenge' | 'reset_admin';
  mfaTargetAdminName?: string;
  isMfaVerified: boolean;
  openMfaModal: (mode?: 'enroll' | 'challenge' | 'reset_admin', targetAdminName?: string) => void;
  closeMfaModal: () => void;

  primaryTab: PrimaryTab;
  setPrimaryTab: (tab: PrimaryTab) => void;
  platformSubTab: PlatformSubTab;
  setPlatformSubTab: (subTab: PlatformSubTab) => void;
  monitoringSubTab: MonitoringSubTab;
  setMonitoringSubTab: (subTab: MonitoringSubTab) => void;
  securitySubTab: SecuritySubTab;
  setSecuritySubTab: (subTab: SecuritySubTab) => void;
  settingsSection: SettingsSection;
  setSettingsSection: (section: SettingsSection) => void;

  selectedTenantId: string | null;
  activeTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  selectedAdminId: string | null;
  setSelectedAdminId: (id: string | null) => void;

  isLiveSimulationActive: boolean;
  setIsLiveSimulationActive: (active: boolean) => void;
  lastUpdatedTime: string;

  tenants: Tenant[];
  admins: PlatformAdmin[];
  sessions: ActiveSession[];
  featureFlags: FeatureFlag[];
  settings: PlatformSettings;
  services: ServiceHealthItem[];
  edgeDevices: EdgeDeviceHealth[];
  tenantDevices: TenantEdgeDevice[];
  cameras: CameraHealth[];
  gates: GateHealth[];
  incidents: OperationalIncident[];
  securityAlerts: SecurityAlert[];
  loginEvents: LoginActivityEvent[];
  credentials: ApiCredential[];
  auditLogs: AuditLogItem[];

  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  createTenant: (tenantData: Partial<Tenant>, adminData: any) => Promise<void>;
  updateTenant: (id: string, updateData: Partial<Tenant>) => Promise<void>;
  setTenantStatus: (id: string, status: TenantStatus, reason?: string) => Promise<void>;

  createAdmin: (adminData: Partial<PlatformAdmin> & { password?: string }) => Promise<void>;
  updateAdmin: (id: string, updateData: Partial<PlatformAdmin>) => void;
  disableAdmin: (id: string, reason?: string) => void;
  resetAdminMfa: (id: string) => void;

  toggleFeatureFlag: (id: string) => void;
  createFeatureFlag: (key: string, description: string) => void;
  updateSettings: (section: SettingsSection, newSettings: any) => void;

  acknowledgeIncident: (id: string, assignedTo?: string) => void;
  resolveIncident: (id: string, note?: string) => void;
  bulkResolveIncidents: (ids: string[], note?: string) => void;

  pushAuditLog: (
    category: AuditLogItem['category'],
    action: string,
    resourceType: string,
    resourceId: string,
    resourceName?: string,
    tenantName?: string,
    changes?: { field: string; before: any; after: any }[]
  ) => void;
  acknowledgeAlert: (id: string) => void;
  resolveAlert: (id: string) => void;
  revokeSession: (id: string) => void;
  revokeAllUserSessions: (userId: string) => void;
  rotateCredential: (id: string) => void;
  revokeCredential: (id: string) => void;
  createCredential: (body: { name: string; tenantId?: string | null; scopes?: string[]; expiresInDays?: number | null }) => void;
  issuedSecret: { name: string; key: string } | null;
  clearIssuedSecret: () => void;
  impersonation: { tenantId: string; tenantName: string; expiresIn: number } | null;
  impersonateTenant: (tenantId: string) => Promise<void>;
  exitImpersonation: () => Promise<void>;

  navigateTo: (tab: PrimaryTab, subTab?: string, detailId?: string) => void;

  appWorkspace: 'platform' | 'tenant';
  tenantNavTab: TenantNavigationTab;
  setTenantNavTab: (tab: TenantNavigationTab) => void;
  selectedSiteId: string | null;
  setSelectedSiteId: (siteId: string | null) => void;
  tenantSiteFilter: string;
  setTenantSiteFilter: (siteId: string) => void;
  tenantDateFilter: string;
  setTenantDateFilter: (filter: string) => void;
  isTenantRefreshing: boolean;
  refreshTenantDashboard: () => void;

  tenantLocation: TenantLocation;
  tenantSites: TenantSite[];
  tenantSummary: TenantDashboardSummary;
  tenantHealth: TenantSystemHealth;
  tenantAlerts: TenantAlertItem[];
  accessEvents: AccessEvent[];
  accessActivity: AccessActivityDataPoint[];
  tenantLanes: LaneOut[];
  liveGateFrames: Record<string, LiveGateFrame>;
  parkingMap: MapLevelOut[];
  parkingPresences: PresenceOut[];
  refreshParkingMap: () => void;
  locateVehicleInLot: (plate: string) => Promise<LocateOut | null>;
  parkingCheckin: (plateNumber: string, zoneId: string) => void;
  parkingCheckout: (plateNumber: string) => void;
  upsertParkingLevel: (
    id: string | null,
    data: { siteId?: string; name: string; code?: string | null; sortOrder?: number; mapImageUrl?: string | null; status?: string | null }
  ) => void;
  upsertParkingZone: (
    levelId: string,
    id: string | null,
    data: { name: string; code?: string | null; bounds?: ZoneBounds | null; capacity?: number; status?: string | null }
  ) => void;
  removeParkingLevel: (id: string) => void;
  removeParkingZone: (id: string) => void;
  setCameraCoverage: (cameraId: string, zoneIds: string[]) => void;
  uploadParkingMapImage: (file: File) => Promise<string>;
  registeredVehicles: RegisteredVehicle[];
  tenantVehicles: TenantVehicle[];
  tenantAccessRules: TenantAccessRule[];
  tenantMembers: TenantMember[];
  tenantUsers: TenantUser[];
  tenantInvitations: TenantInvitation[];
  userAuditLogs: UserAuditLog[];

  updateTenantLocation: (updatedData: Partial<TenantLocation>) => void;
  updateLocationOperatingHours: (hours: OperatingHoursSchedule) => void;
  toggleLocationStatus: (status: 'ACTIVE' | 'INACTIVE') => void;
  addTenantSite: (siteData: Partial<TenantSite>) => void;
  updateTenantSite: (siteId: string, siteData: Partial<TenantSite>) => void;
  deleteTenantSite: (siteId: string) => void;
  createTenantCamera: (siteId: string, data: Omit<CameraIn, 'siteId'>) => void;
  updateTenantCamera: (id: string, data: Partial<Omit<CameraIn, 'siteId'>>) => void;
  deleteTenantCamera: (id: string) => void;
  resolveTenantAlert: (alertId: string) => void;
  triggerGateCommand: (gateId: string, command: 'OPEN' | 'CLOSE' | 'LOCK' | 'UNLOCK' | 'RESET' | 'REBOOT' | 'RELINK' | 'open' | 'close' | 'lock' | 'unlock' | 'reboot' | 'relink') => void;
  simulateNewAccessEvent: (customEvent?: Partial<AccessEvent>) => void;
  addRegisteredVehicle: (vehicleData: { plate: string; ownerName: string; model: string; type: string; siteId?: string }) => void;
  deleteRegisteredVehicle: (id: string) => void;
  createTenantVehicle: (vehicleData: {
    type: VehicleType;
    make: string;
    model: string;
    year?: number;
    color?: string;
    vin?: string;
    description?: string;
    memberId?: string | null;
    licensePlate: { number: string; country?: string; province?: string };
  }) => Promise<{ success: boolean; vehicle?: TenantVehicle; message?: string }>;
  updateTenantVehicle: (vehicleId: string, data: Partial<TenantVehicle>) => void;
  assignVehicleMember: (vehicleId: string, memberId: string | null) => void;
  suspendTenantVehicle: (vehicleId: string, reason: string) => void;
  activateTenantVehicle: (vehicleId: string) => void;
  deactivateTenantVehicle: (vehicleId: string) => void;
  archiveTenantVehicle: (vehicleId: string) => void;
  registerVehicleLicensePlate: (
    vehicleId: string,
    newPlate: { number: string; country?: string; province?: string }
  ) => Promise<{ success: boolean; message?: string }>;
  importTenantVehicles: (
    vehicles: Array<{
      type: VehicleType;
      make: string;
      model: string;
      year?: number;
      color?: string;
      vin?: string;
      plate: string;
      country?: string;
      province?: string;
      memberId?: string | null;
    }>
  ) => Promise<{ importedCount: number; duplicateCount: number }>;
  inviteTenantMember: (memberData: { name: string; email: string; role: string; siteAccess: string[] }) => void;
  deleteTenantMember: (id: string) => void;
  createTenantAccessRule: (ruleData: any) => Promise<{ success: boolean; rule?: TenantAccessRule; conflicts?: string[]; message?: string }>;
  updateTenantAccessRule: (ruleId: string, ruleData: Partial<TenantAccessRule>) => Promise<{ success: boolean; rule?: TenantAccessRule; conflicts?: string[]; message?: string }>;
  activateTenantAccessRule: (ruleId: string) => void;
  deactivateTenantAccessRule: (ruleId: string) => void;
  duplicateTenantAccessRule: (ruleId: string) => Promise<TenantAccessRule | null>;
  deleteTenantAccessRule: (id: string) => void;
  reorderRulePriorities: (ruleIdsInOrder: string[]) => void;
  detectRuleConflicts: (rule: Partial<TenantAccessRule>, excludeRuleId?: string) => string[];

  createTenantDevice: (data: TenantEdgeDeviceInput) => Promise<{ success: boolean; message?: string }>;
  updateTenantDevice: (deviceId: string, data: Partial<TenantEdgeDeviceInput>) => Promise<{ success: boolean; message?: string }>;
  decommissionTenantDevice: (deviceId: string) => Promise<{ success: boolean; message?: string }>;
  reactivateTenantDevice: (deviceId: string) => Promise<{ success: boolean; message?: string }>;
  deleteTenantDevice: (deviceId: string) => Promise<{ success: boolean; message?: string }>;
  rebootTenantDevice: (deviceId: string) => Promise<{ success: boolean; commandIds?: string[]; message?: string }>;

  inviteTenantUser: (data: {
    email: string;
    fullName?: string;
    role: TenantUserRole;
    personalMessage?: string;
    createMemberProfile?: boolean;
    membershipType?: MembershipType;
    phone?: string;
    employeeId?: string;
    department?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  createTenantUserManually: (data: {
    fullName: string;
    email: string;
    username?: string;
    role: TenantUserRole;
    phone?: string;
    tempPassword?: string;
    forcePasswordChange?: boolean;
    createMemberProfile?: boolean;
    membershipType?: MembershipType;
    department?: string;
    employeeId?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  changeTenantUserRole: (userId: string, newRole: TenantUserRole) => Promise<{ success: boolean; message?: string }>;
  toggleTenantUserStatus: (userId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => Promise<{ success: boolean; message?: string }>;
  resetTenantUserPassword: (userId: string) => void;
  updateTenantUser: (userId: string, data: Partial<TenantUser>) => void;
  updateTenantMemberProfile: (userId: string, data: Partial<TenantMemberProfile>) => void;
  suspendTenantMembership: (userId: string, reason: string) => void;
  activateTenantMembership: (userId: string) => void;
  endTenantMembership: (userId: string) => void;
  resendTenantInvitation: (invitationId: string) => void;
  cancelTenantInvitation: (invitationId: string) => void;
}

const PlatformContext = createContext<PlatformContextType | undefined>(undefined);

const errText = (e: unknown): string => (e instanceof ApiError ? e.message : 'Unexpected error');

export const PlatformProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // ---------- Auth ----------
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState({ id: '', name: '', email: '', role: '', mfaEnabled: false });
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantSlug, setTenantSlug] = useState<string | null>(null);
  const [userType, setUserType] = useState<string>('');

  const applyMe = useCallback(
    (me: Awaited<ReturnType<typeof authApi.me>>) => {
      setIsAuthenticated(true);
      setUserType(me.userType);
      setTenantId(me.tenantId ?? null);
      setTenantSlug(me.tenantSlug ?? null);
      setCurrentUser({
        id: me.user.id,
        name: me.user.fullName,
        email: me.user.email,
        role: me.userType === 'platform_admin' ? `Platform ${me.user.role}` : `Tenant ${me.user.role}`,
        mfaEnabled: me.user.mfaEnabled,
      });
      setIsMfaVerified(me.mfaVerified);
    },
    []
  );

  useEffect(() => {
    authApi
      .me()
      .then(applyMe)
      .catch(() => setIsAuthenticated(false))
      .finally(() => setIsSessionLoading(false));
  }, [applyMe]);

  const login = async (emailInput: string, passInput: string, otpCode?: string) => {
    try {
      if (otpCode) {
        await authApi.mfaVerify(otpCode);
      } else {
        const res = await authApi.login(emailInput.toLowerCase(), passInput);
        if (res.mfaRequired) return { requiresMfa: true, success: true };
      }
      const me = await authApi.me();
      applyMe(me);
      return { requiresMfa: false, success: true };
    } catch (e) {
      return { requiresMfa: false, success: false, message: errText(e) };
    }
  };

  const logout = () => {
    authApi.logout().catch(() => undefined);
    setIsAuthenticated(false);
    setTenantId(null);
    setUserType('');
    setCurrentUser({ id: '', name: '', email: '', role: '', mfaEnabled: false });
  };

  // ---------- Theme ----------
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'light' ? 'light' : 'dark';
  });
  useEffect(() => {
    document.documentElement.classList.remove('dark', 'light');
    document.documentElement.classList.add(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  // ---------- MFA modal ----------
  const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
  const [mfaModalMode, setMfaModalMode] = useState<'enroll' | 'challenge' | 'reset_admin'>('enroll');
  const [mfaTargetAdminName, setMfaTargetAdminName] = useState<string | undefined>(undefined);
  const [isMfaVerified, setIsMfaVerified] = useState(false);
  const openMfaModal = (mode: 'enroll' | 'challenge' | 'reset_admin' = 'enroll', targetAdminName?: string) => {
    setMfaModalMode(mode);
    setMfaTargetAdminName(targetAdminName);
    setIsMfaModalOpen(true);
  };
  const closeMfaModal = () => setIsMfaModalOpen(false);

  // ---------- Navigation ----------
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('dashboard');
  const [platformSubTab, setPlatformSubTab] = useState<PlatformSubTab>('settings');
  const [monitoringSubTab, setMonitoringSubTab] = useState<MonitoringSubTab>('overview');
  const [securitySubTab, setSecuritySubTab] = useState<SecuritySubTab>('overview');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);

  // Workspace is role-derived: platform admins always get the platform console,
  // tenant users always get the tenant portal — there is no manual switcher.
  const appWorkspace: 'platform' | 'tenant' = userType === 'platform_admin' ? 'platform' : 'tenant';
  const [tenantNavTab, setTenantNavTab] = useState<TenantNavigationTab>('dashboard');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [tenantSiteFilter, setTenantSiteFilter] = useState('all');
  const [tenantDateFilter, setTenantDateFilter] = useState('today');
  const [isTenantRefreshing, setIsTenantRefreshing] = useState(false);

  const [isLiveSimulationActive, setIsLiveSimulationActive] = useState(false);
  const [lastUpdatedTime, setLastUpdatedTime] = useState(new Date().toLocaleTimeString());

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => removeToast(id), 6000);
  };
  const removeToast = (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id));

  const toastErr = (title: string) => (e: unknown) =>
    addToast({ type: 'error', title, description: errText(e) });

  // ---------- Collections ----------
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [settings, setSettings] = useState<PlatformSettings>(INITIAL_SETTINGS);
  const [services, setServices] = useState<ServiceHealthItem[]>([]);
  const [edgeDevices, setEdgeDevices] = useState<EdgeDeviceHealth[]>([]);
  const [tenantDevices, setTenantDevices] = useState<TenantEdgeDevice[]>([]);
  // No camera/security-activity/credential APIs exist yet — start honest-empty instead of mock.
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [gates, setGates] = useState<GateHealth[]>([]);
  const [incidents, setIncidents] = useState<OperationalIncident[]>([]);
  // Latest WS telemetry frame per gate (live overlay for the barrier map)
  const [liveGateFrames, setLiveGateFrames] = useState<Record<string, LiveGateFrame>>({});
  // Parking map: levels+zones with live occupancy, plus active presences.
  const [parkingMap, setParkingMap] = useState<MapLevelOut[]>([]);
  const [parkingPresences, setParkingPresences] = useState<PresenceOut[]>([]);
  const parkingPresencesRef = useRef<PresenceOut[]>([]);
  const [securityAlerts] = useState<SecurityAlert[]>([]);
  const [loginEvents] = useState<LoginActivityEvent[]>([]);
  const [credentials, setCredentials] = useState<ApiCredential[]>([]);
  const [issuedSecret, setIssuedSecret] = useState<{ name: string; key: string } | null>(null);
  const [impersonation, setImpersonation] = useState<{ tenantId: string; tenantName: string; expiresIn: number } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  const [tenantLocation, setTenantLocation] = useState<TenantLocation>(INITIAL_TENANT_LOCATION);
  const [tenantSites, setTenantSites] = useState<TenantSite[]>([]);
  const [tenantSummary, setTenantSummary] = useState<TenantDashboardSummary>(INITIAL_TENANT_SUMMARY);
  const [tenantHealth, setTenantHealth] = useState<TenantSystemHealth>(INITIAL_TENANT_HEALTH);
  const [tenantAlerts, setTenantAlerts] = useState<TenantAlertItem[]>(INITIAL_TENANT_ALERTS);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>([]);
  const [accessActivity, setAccessActivity] = useState<AccessActivityDataPoint[]>(INITIAL_ACCESS_ACTIVITY);
  const [tenantLanes, setTenantLanes] = useState<LaneOut[]>([]);
  const [registeredVehicles, setRegisteredVehicles] = useState<RegisteredVehicle[]>([]);
  const [tenantVehicles, setTenantVehicles] = useState<TenantVehicle[]>([]);
  const [tenantAccessRules, setTenantAccessRules] = useState<TenantAccessRule[]>([]);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>([]);
  const [tenantInvitations, setTenantInvitations] = useState<TenantInvitation[]>(INITIAL_TENANT_INVITATIONS);
  const [userAuditLogs, setUserAuditLogs] = useState<UserAuditLog[]>(INITIAL_USER_AUDIT_LOGS);

  const siteNameOf = (id?: string | null) => tenantSites.find((s) => s.id === id)?.name;
  const gateNameOf = (id?: string | null) => gates.find((g) => g.id === id)?.gateName;

  // ---------- Loaders ----------
  const loadPlatformData = useCallback(async () => {
    try {
      const [tenantsPage, adminsRows, sessionRows, flags, settingsRows, health, credentialRows] = await Promise.all([
        platformApi.listTenants({ limit: 200 }),
        platformApi.listAdmins(),
        platformApi.listSessions({ activeOnly: true }).catch(() => []),
        platformApi.listFlags(),
        platformApi.getSettings().catch(() => []),
        platformApi.infraHealth().catch(() => null),
        platformApi.credentials().catch(() => []),
      ]);
      platformApi
        .auditLogs({ limit: 100 })
        .then((auditPage) => setAuditLogs(auditPage.data.map(mapAuditLog)))
        .catch(() => setAuditLogs([]));
      const mappedTenants = tenantsPage.data.map(mapTenant);
      setTenants(mappedTenants);
      const adminRows = adminsRows.map(mapPlatformAdmin);
      setAdmins(adminRows);
      const lookup = (uid: string) => {
        const a = adminRows.find((x) => x.id === uid);
        return a ? { name: a.name, email: a.email } : undefined;
      };
      setSessions(sessionRows.map((s) => mapSession(s, lookup)));
      setFeatureFlags(flags.map(mapFeatureFlag));
      setCredentials(
        credentialRows.map((c) =>
          mapApiCredential(c, mappedTenants.find((t) => t.id === c.tenantId)?.name)
        )
      );
      setSettings((prev) => settingsFromRows(settingsRows, prev));
      if (health) setServices(mapInfraHealth(health));
      setLastUpdatedTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('loadPlatformData failed', e);
      toastErr('Failed to load platform data')(e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tenantNameRef = useRef('');
  const loadTenantData = useCallback(async (tId: string) => {
    setIsTenantRefreshing(true);
    try {
      const [sitesPage, gatesPage, devicesPage, camerasPage, vehiclesPage, rulesPage, usersPage, eventsPage, incidentsPage, auditPage, dashSummary, hourlyFlow, parkingMapRes, parkingPresencePage] =
        await Promise.all([
          tenantApi.sites(tId, { limit: 200 }),
          tenantApi.gates(tId, { limit: 200 }),
          tenantApi.devices(tId, { limit: 200 }),
          tenantApi.cameras(tId, { limit: 200 }),
          tenantApi.vehicles(tId, { limit: 200 }),
          tenantApi.rules(tId, { limit: 200 }),
          tenantApi.users(tId, { limit: 200 }),
          tenantApi.accessEvents(tId, { limit: 100 }),
          tenantApi.incidents(tId, { limit: 100 }),
          tenantApi.auditLogs(tId, { limit: 100 }).catch(() => ({ data: [], meta: { page: 1, limit: 100, total: 0 } })),
          tenantApi.dashboardSummary(tId).catch(() => null),
          tenantApi.hourlyFlow(tId, 24).catch(() => null),
          tenantApi.parkingMap(tId).catch(() => null),
          tenantApi.parkingPresence(tId, { limit: 200 }).catch(() => ({ data: [] as PresenceOut[], meta: { page: 1, limit: 200, total: 0 } })),
        ]);

      setParkingMap(parkingMapRes?.levels ?? []);
      parkingPresencesRef.current = parkingPresencePage.data;
      setParkingPresences(parkingPresencePage.data);

      const tName = tenantNameRef.current;
      const sites = sitesPage.data.map((s) => mapSite(s, tId, tName));
      const siteNames = new Map(sitesPage.data.map((s) => [s.id, s.name]));
      const gatesMapped = gatesPage.data.map((g) => mapGate(g, tId, tName));
      const gateNames = new Map(gatesPage.data.map((g) => [g.id, g.name]));
      const lanesNested = await Promise.all(
        sitesPage.data.map((s) => tenantApi.lanes(tId, s.id).catch(() => [] as LaneOut[]))
      );
      setTenantLanes(lanesNested.flat());

      setTenantSites(sites.map((s) => ({
        ...s,
        cameraCount: camerasPage.data.filter((c) => c.siteId === s.id).length,
        onlineCameraCount: camerasPage.data.filter((c) => c.siteId === s.id && c.status === 'active').length,
        gateCount: gatesPage.data.filter((g) => g.siteId === s.id).length,
        onlineGateCount: gatesPage.data.filter((g) => g.siteId === s.id && (g.status === 'open' || g.status === 'closed')).length,
        edgeDeviceCount: devicesPage.data.filter((d) => d.siteId === s.id).length,
        onlineEdgeDeviceCount: devicesPage.data.filter((d) => d.siteId === s.id && d.status === 'online').length,
        lanesCount: lanesNested[sitesPage.data.findIndex((pg) => pg.id === s.id)]?.length ?? 0,
      })));
      setGates(gatesMapped);
      setEdgeDevices(devicesPage.data.map((d) => mapDevice(d, tId, tName)));
      setTenantDevices(devicesPage.data.map((d) => mapTenantDevice(d, siteNames.get(d.siteId) ?? '')));
      setCameras(camerasPage.data.map((c) => mapCamera(c, tId, tName)));

      const primarySite = sitesPage.data[0];
      if (primarySite) {
        setTenantLocation((prev) => ({
          ...prev,
          name: primarySite.name,
          status: primarySite.status === 'active' ? 'ACTIVE' : 'INACTIVE',
          timezone: primarySite.timezone || prev.timezone,
          address: {
            ...prev.address,
            line1: primarySite.address ?? prev.address.line1
          }
        }));
      }

      const vehicles = vehiclesPage.data;
      setTenantVehicles(vehicles.map((v) => mapVehicle(v, tId)));
      setRegisteredVehicles(vehicles.map(mapRegisteredVehicle));

      setTenantAccessRules(rulesPage.data.map((r) => mapRule(r, r.siteId ? siteNames.get(r.siteId) : undefined)));

      const users = usersPage.data;
      setTenantUsers(users.map(mapUser));
      setTenantMembers(users.map(mapMember));
      setTenantInvitations(users.filter((u) => u.status === 'invited').map(mapInvitation));

      setAccessEvents(
        eventsPage.data.map((e) =>
          mapAccessEvent(e, {
            siteName: e.siteId ? siteNames.get(e.siteId) : undefined,
            gateName: e.gateId ? gateNames.get(e.gateId) : undefined,
          })
        )
      );
      setIncidents(
        incidentsPage.data.map((i) =>
          mapIncident(i, {
            siteName: i.siteId ? siteNames.get(i.siteId) : undefined,
            gateName: i.gateId ? gateNames.get(i.gateId) : undefined,
            tenantName: tName,
          })
        )
      );
      setAuditLogs(auditPage.data.map(mapAuditLog));
      setUserAuditLogs(
        auditPage.data.filter((a) => /user|invite|member/i.test(a.action)).map(mapUserAuditLog)
      );

      // Aggregates: prefer server-side dashboard summary (accurate beyond page
      // limit); fall back to counting the fetched page when the endpoint is down.
      const today = new Date().toDateString();
      const todayEvents = eventsPage.data.filter((e) => new Date(e.occurredAt).toDateString() === today);
      setTenantSummary({
        sites: { total: dashSummary?.sites ?? sites.length, active: sites.filter((s) => s.status !== 'INACTIVE').length, inactive: sites.filter((s) => s.status === 'INACTIVE').length },
        cameras: {
          total: camerasPage.data.length,
          online: camerasPage.data.filter((c) => c.status === 'active').length,
          offline: camerasPage.data.filter((c) => c.status !== 'active').length,
        },
        gates: {
          total: dashSummary?.gates ?? gatesMapped.length,
          online: dashSummary?.gatesOnline ?? gatesMapped.filter((g) => g.status === 'ONLINE').length,
          offline: dashSummary ? dashSummary.gates - dashSummary.gatesOnline : gatesMapped.filter((g) => g.status !== 'ONLINE').length,
        },
        vehicles: {
          total: dashSummary?.vehicles ?? vehicles.length,
          active: vehicles.filter((v) => v.status === 'active').length,
          inactive: vehicles.filter((v) => v.status !== 'active').length,
          newThisMonth: vehicles.filter((v) => new Date(v.createdAt).getMonth() === new Date().getMonth()).length,
        },
        accessToday: {
          total: dashSummary?.todayEvents ?? todayEvents.length,
          allowed: dashSummary?.todayAllowed ?? todayEvents.filter((e) => e.decision === 'allow' || e.decision === 'allowed').length,
          denied: dashSummary?.todayDenied ?? todayEvents.filter((e) => e.decision === 'deny' || e.decision === 'denied').length,
          unknown: dashSummary?.todayUnknown ?? todayEvents.filter((e) => !/allow|deny/i.test(e.decision)).length,
          percentChange: 0,
        },
      });
      setTenantHealth({
        overall: devicesPage.data.every((d) => d.status === 'online') ? 'HEALTHY' : 'WARNING',
        cameras: {
          total: camerasPage.data.length,
          online: camerasPage.data.filter((c) => c.status === 'active').length,
          offline: camerasPage.data.filter((c) => c.status !== 'active').length,
        },
        gates: {
          total: dashSummary?.gates ?? gatesMapped.length,
          online: dashSummary?.gatesOnline ?? gatesMapped.filter((g) => g.status === 'ONLINE').length,
          offline: dashSummary ? dashSummary.gates - dashSummary.gatesOnline : gatesMapped.filter((g) => g.status !== 'ONLINE').length,
        },
        edgeDevices: {
          total: dashSummary?.devices ?? devicesPage.data.length,
          online: dashSummary?.devicesOnline ?? devicesPage.data.filter((d) => d.status === 'online').length,
          offline: dashSummary ? dashSummary.devices - dashSummary.devicesOnline : devicesPage.data.filter((d) => d.status !== 'online').length,
        },
      } as TenantSystemHealth);
      setTenantAlerts(
        incidentsPage.data
          .filter((i) => i.status === 'open')
          .map((i) => ({
            id: i.id,
            severity: (i.severity ?? 'warning').toUpperCase() as TenantAlertItem['severity'],
            type: 'SECURITY_INCIDENT' as const,
            title: i.type,
            message: i.description ?? '',
            siteId: i.siteId ?? '',
            siteName: i.siteId ? siteNames.get(i.siteId) ?? '' : '',
            resourceId: i.gateId ?? i.id,
            resourceType: 'GATE' as const,
            createdAt: i.detectedAt,
            timeAgo: '',
            status: 'OPEN' as const,
          }))
      );
      // Hourly activity: server-aggregated buckets; fall back to counting the
      // fetched page when the endpoint is unavailable.
      if (hourlyFlow) {
        const points = hourlyFlow.points.map((p) => ({
          time: `${new Date(p.hour).getHours().toString().padStart(2, '0')}:00`,
          timestamp: p.hour,
          allowed: p.allowed,
          denied: p.denied,
          unknown: p.entries + p.exits - p.allowed - p.denied,
        }));
        if (points.length) setAccessActivity(points);
      } else {
        const buckets = new Map<string, AccessActivityDataPoint>();
        for (const e of eventsPage.data) {
          const d = new Date(e.occurredAt);
          const key = `${d.getHours().toString().padStart(2, '0')}:00`;
          const b = buckets.get(key) ?? { time: key, timestamp: d.toISOString(), allowed: 0, denied: 0, unknown: 0 };
          if (/allow/i.test(e.decision)) b.allowed++;
          else if (/deny/i.test(e.decision)) b.denied++;
          else b.unknown++;
          buckets.set(key, b);
        }
        if (buckets.size) setAccessActivity(Array.from(buckets.values()).sort((a, b) => a.time.localeCompare(b.time)));
      }
      setLastUpdatedTime(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('loadTenantData failed', e);
      toastErr('Failed to load tenant data')(e);
    } finally {
      setIsTenantRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTenantId = userType === 'tenant_user' ? tenantId : selectedTenantId;

  // Platform data on login / workspace switch
  useEffect(() => {
    if (isAuthenticated && userType === 'platform_admin') void loadPlatformData();
  }, [isAuthenticated, userType, loadPlatformData]);



  // Tenant data when the active tenant is known
  useEffect(() => {
    if (!isAuthenticated || !activeTenantId) return;
    // For a platform admin previewing a tenant, resolve its display name
    const t = tenants.find((x) => x.id === activeTenantId);
    if (t) tenantNameRef.current = t.name;
    void loadTenantData(activeTenantId);
  }, [isAuthenticated, activeTenantId, loadTenantData, tenants]);

  // Resolve tenant name for tenant_user sessions — me() only exposes the slug,
  // and tenant users may not call platform endpoints, so display the slug.
  useEffect(() => {
    if (isAuthenticated && userType === 'tenant_user' && tenantId && tenantSlug) {
      tenantNameRef.current = tenantSlug;
      setTenantLocation((prev) => ({ ...prev, tenantId, tenantName: tenantSlug, name: tenantSlug }));
    }
  }, [isAuthenticated, userType, tenantId, tenantSlug]);

  // ---------- Realtime WebSocket ----------
  useEffect(() => {
    if (!isAuthenticated || !activeTenantId) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    setLiveGateFrames({});
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(barrierTelemetryWsUrl(activeTenantId));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const kind = msg?.type ?? msg?.event ?? '';
          const gateId: string | undefined = msg?.gateId ?? msg?.gate_id;
          const siteId: string | undefined = msg?.siteId ?? msg?.site_id;
          const nowIso = new Date().toISOString();

          // Parking: monitor-camera detections arrive as vehicle_location frames.
          if (kind === 'vehicle_location' && msg.presence) {
            const pr = msg.presence as Partial<PresenceOut> & { zoneCode?: string; zoneName?: string };
            const evType = String(msg.eventType ?? '');
            const plateNorm = String(pr.plateNumber ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
            const prevList = parkingPresencesRef.current;
            const prevRow = prevList.find((p) => p.id === pr.id || p.plateNormalized === plateNorm);
            const prevZone = prevRow?.zoneId ?? null;
            const newZone: string | null = pr.zoneId ?? null;

            // Occupancy deltas (stale still counts as occupied; seen → no change).
            const deltas: Record<string, number> = {};
            const bump = (z: string | null | undefined, d: number) => {
              if (z) deltas[z] = (deltas[z] ?? 0) + d;
            };
            if (evType === 'parked' || evType === 'relocated' || evType === 'seen') {
              if (!prevRow) bump(newZone, 1);
              else if (prevZone !== newZone) {
                bump(newZone, 1);
                bump(prevZone, -1);
              }
            } else if (evType === 'exited') {
              bump(prevZone ?? newZone, -1);
            }

            const row: PresenceOut = {
              id: pr.id ?? prevRow?.id ?? '',
              tenantId: activeTenantId,
              siteId: msg.siteId ?? prevRow?.siteId ?? '',
              levelId: pr.levelId ?? prevRow?.levelId ?? null,
              zoneId: newZone,
              plateNumber: pr.plateNumber ?? prevRow?.plateNumber ?? '',
              plateNormalized: prevRow?.plateNormalized ?? plateNorm,
              vehicleId: prevRow?.vehicleId ?? null,
              cameraId: msg.cameraId ?? prevRow?.cameraId ?? null,
              confidence: prevRow?.confidence ?? null,
              status: pr.status ?? (evType === 'exited' ? 'exited' : 'parked'),
              firstSeenAt: prevRow?.firstSeenAt ?? nowIso,
              lastSeenAt: pr.lastSeenAt ?? nowIso,
              exitedAt: evType === 'exited' ? nowIso : (prevRow?.exitedAt ?? null),
            };
            const nextList =
              evType === 'exited'
                ? prevList.filter((p) => p !== prevRow)
                : prevRow
                  ? prevList.map((p) => (p === prevRow ? row : p))
                  : [row, ...prevList];
            parkingPresencesRef.current = nextList;
            setParkingPresences(nextList);
            if (Object.keys(deltas).length > 0) {
              setParkingMap((prev) =>
                prev.map((lv) => ({
                  ...lv,
                  zones: lv.zones.map((z) =>
                    deltas[z.id] ? { ...z, occupiedCount: Math.max(0, z.occupiedCount + deltas[z.id]) } : z
                  ),
                }))
              );
            }
            setLastUpdatedTime(new Date().toLocaleTimeString());
            return;
          }

          // Apply WS deltas directly — never re-fetch the whole tenant per frame.
          if (/incident/i.test(kind)) {
            // Rare event: one targeted refetch of the incidents list only.
            tenantApi.incidents(activeTenantId, { limit: 100 })
              .then((page) =>
                setIncidents(page.data.map((i) =>
                  mapIncident(i, {
                    siteName: siteNameOf(i.siteId),
                    gateName: gateNameOf(i.gateId),
                    tenantName: tenantNameRef.current,
                  })
                ))
              )
              .catch(() => undefined);
            if (gateId) {
              // Optimistically degrade the gate card while the refetch lands.
              setGates((prev) => prev.map((g) => (g.id === gateId ? { ...g, status: 'DEGRADED' } : g)));
            }
            setLastUpdatedTime(new Date().toLocaleTimeString());
            return;
          }
          if (/command_ack/i.test(kind)) {
            setLastUpdatedTime(new Date().toLocaleTimeString());
            return;
          }
          if (/heartbeat/i.test(kind)) {
            const deviceId: string | undefined = msg?.deviceId ?? msg?.device_id;
            if (deviceId) {
              setEdgeDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, status: 'ONLINE', lastHeartbeat: nowIso } : d)));
              setTenantDevices((prev) => prev.map((d) => (d.id === deviceId ? { ...d, status: 'ONLINE', lastHeartbeatAt: nowIso } : d)));
            }
            if (gateId) {
              setLiveGateFrames((prev) => ({ ...prev, [gateId]: { ...prev[gateId], ...msg, receivedAt: Date.now() } }));
            }
            setLastUpdatedTime(new Date().toLocaleTimeString());
            return;
          }
          // Access events & plate reads (arrive as telemetry frames carrying a plate/decision).
          if (/access|event/i.test(kind) || msg?.decision || (kind === 'telemetry' && msg?.plateNumber)) {
            const out = msg.event ?? msg.payload ?? msg;
            const mapped = mapAccessEvent({
              id: out.id ?? `evt-${Date.now()}`,
              siteId: out.siteId ?? out.site_id,
              gateId: out.gateId ?? out.gate_id,
              laneId: out.laneId ?? out.lane_id,
              vehicleId: out.vehicleId ?? out.vehicle_id,
              plateNumber: out.plateNumber ?? out.plate_number ?? out.plate,
              direction: (out.direction ?? 'IN').toString().toUpperCase() === 'EXIT' ? 'OUT' : 'IN',
              decision: out.decision ?? 'unknown',
              reason: out.reason,
              confidence: out.confidence,
              plateImageUrl: out.plateImageUrl ?? out.plate_image_url,
              overviewImageUrl: out.overviewImageUrl ?? out.overview_image_url,
              source: out.source ?? 'edge',
              occurredAt: out.occurredAt ?? out.occurred_at ?? nowIso,
            } as any, { siteName: siteNameOf(out.siteId ?? out.site_id), gateName: gateNameOf(out.gateId ?? out.gate_id) });
            setAccessEvents((prev) => [mapped, ...prev.slice(0, 99)]);
            if (siteId) {
              const dir = String(out.direction ?? 'IN').toUpperCase() === 'IN' ? 1 : -1;
              setTenantSites((prev) =>
                prev.map((s) =>
                  s.id === siteId
                    ? { ...s, currentOccupancy: Math.max(0, (s.currentOccupancy ?? 0) + dir) }
                    : s
                )
              );
            }
            setLastUpdatedTime(new Date().toLocaleTimeString());
          }
          if (/telemetry|gate|access|event/i.test(kind) || msg?.state) {
            if (gateId) {
              // Apply gate telemetry as a delta — no REST refetch per frame
              const { type: _t, siteId: _s, gateId: _g, ...payload } = msg;
              const raw = typeof payload.state === 'string' ? payload.state : undefined;
              setGates((prev) =>
                prev.map((g) =>
                  g.id === gateId
                    ? {
                        ...g,
                        rawStatus: raw ?? g.rawStatus,
                        status:
                          raw === 'fault'
                            ? 'DEGRADED'
                            : raw === 'offline' || raw === 'unknown'
                              ? 'OFFLINE'
                              : raw
                                ? 'ONLINE'
                                : g.status,
                        lastTelemetry: { recordedAt: nowIso, state: raw ?? null, payload },
                        lastHeartbeat: nowIso,
                      }
                    : g
                )
              );
              setLiveGateFrames((prev) => ({ ...prev, [gateId]: { ...prev[gateId], ...msg, receivedAt: Date.now() } }));
            }
            if (msg.deviceId) {
              setEdgeDevices((prev) =>
                prev.map((d) =>
                  d.id === msg.deviceId ? { ...d, status: 'ONLINE', lastHeartbeat: nowIso } : d,
                ),
              );
              setTenantDevices((prev) =>
                prev.map((d) =>
                  d.id === msg.deviceId ? { ...d, status: 'ONLINE', lastHeartbeatAt: nowIso } : d,
                ),
              );
            }
            setLastUpdatedTime(new Date().toLocaleTimeString());
          }
        } catch {
          /* malformed frame */
        }
      };
      ws.onclose = () => {
        if (!closed && retry < 5) {
          retry += 1;
          setTimeout(connect, 3000 * retry);
        }
      };
      ws.onerror = () => ws?.close();
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, activeTenantId]);

  const pushAuditLog = (
    category: AuditLogItem['category'],
    action: string,
    resourceType: string,
    resourceId: string,
    resourceName?: string,
    tenantName?: string,
    changes?: { field: string; before: any; after: any }[]
  ) => {
    // The backend writes audit rows itself; keep this as a UI-visible append.
    setAuditLogs((prev) => [
      {
        id: `audit-${Date.now()}`,
        timestamp: new Date().toISOString(),
        category,
        action,
        actorName: currentUser.name,
        actorEmail: currentUser.email,
        actorType: userType === 'platform_admin' ? 'PLATFORM_ADMIN' : 'TENANT_ADMIN',
        tenantName,
        resourceType,
        resourceId,
        resourceName,
        result: 'SUCCESS',
        source: 'WEB',
        ipAddress: '',
        requestId: '',
        traceId: '',
        changes,
      },
      ...prev,
    ]);
  };

  const navigateTo = (tab: PrimaryTab, _subTab?: string, detailId?: string) => {
    setPrimaryTab(tab);
    if (detailId) setSelectedTenantId(detailId);
  };

  // ---------- Platform handlers ----------
  const createTenant = async (tenantData: Partial<Tenant>, adminData: any) => {
    try {
      await platformApi.createTenant({
        name: tenantData.name ?? '',
        slug: (tenantData.code ?? tenantData.name ?? '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || `tenant-${Date.now()}`,
        planCode: 'starter',
        contactEmail: tenantData.email ?? adminData?.email ?? '',
        ownerEmail: adminData?.email ?? '',
        ownerFullName: adminData?.name ?? adminData?.fullName ?? 'Owner',
        ownerPassword: adminData?.password ?? `Temp-${Date.now().toString(36)}xZ!`,
      });
      await loadPlatformData();
      addToast({ type: 'success', title: 'Tenant Created', description: `${tenantData.name} has been registered.` });
    } catch (e) {
      toastErr('Failed to create tenant')(e);
    }
  };

  const updateTenant = async (id: string, updateData: Partial<Tenant>) => {
    try {
      await platformApi.updateTenant(id, {
        name: updateData.name,
        contactEmail: updateData.email,
        status: updateData.status ? updateData.status.toLowerCase() : undefined,
      });
      await loadPlatformData();
      addToast({ type: 'success', title: 'Tenant Updated' });
    } catch (e) {
      toastErr('Failed to update tenant')(e);
    }
  };

  const setTenantStatus = async (id: string, status: TenantStatus, _reason?: string) => {
    try {
      await platformApi.updateTenant(id, { status: status.toLowerCase() });
      await loadPlatformData();
      addToast({ type: 'success', title: 'Status Updated', description: `Tenant status set to ${status}.` });
    } catch (e) {
      toastErr('Failed to update tenant status')(e);
    }
  };

  const createAdmin = async (adminData: Partial<PlatformAdmin> & { password?: string }) => {
    try {
      const rawRole = (adminData.role ?? '').toLowerCase();
      const uiRole = (adminData.role ?? '').toUpperCase();
      const role = ['super_admin', 'ops', 'support'].includes(rawRole)
        ? rawRole
        : uiRole === 'PLATFORM_ADMIN' ? 'super_admin'
          : uiRole === 'PLATFORM_SECURITY' ? 'ops'
            : 'support';
      await platformApi.createAdmin({
        email: adminData.email ?? '',
        password: adminData.password ?? '',
        fullName: adminData.name ?? '',
        role,
      });
      await loadPlatformData();
      addToast({ type: 'success', title: 'Admin Created', description: `${adminData.name} added.` });
    } catch (e) {
      toastErr('Failed to create admin')(e);
    }
  };

  // Not supported by the API (no PATCH/DELETE admin, no per-user MFA reset):
  const updateAdmin = (_id: string, _updateData: Partial<PlatformAdmin>) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The backend does not expose admin updates.' });
  const disableAdmin = (_id: string, _reason?: string) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The backend does not expose disabling admins.' });
  const resetAdminMfa = (_id: string) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The backend does not expose per-user MFA reset.' });

  const createFeatureFlag = (key: string, description: string) => {
    platformApi
      .putFlag(key, { enabled: false, description })
      .then(async () => {
        await loadPlatformData();
        addToast({ type: 'success', title: 'Feature Flag Created', description: key });
      })
      .catch(toastErr('Failed to create flag'));
  };

  const toggleFeatureFlag = (id: string) => {
    const flag = featureFlags.find((f) => f.id === id);
    if (!flag) return;
    platformApi
      .putFlag(id, { enabled: !flag.enabled, description: flag.description })
      .then(async () => {
        await loadPlatformData();
        addToast({ type: 'success', title: `Flag ${!flag.enabled ? 'enabled' : 'disabled'}`, description: flag.key });
      })
      .catch(toastErr('Failed to update flag'));
  };

  const updateSettings = (section: SettingsSection, newSettings: any) => {
    platformApi
      .putSetting(section, newSettings)
      .then(() => loadPlatformData())
      .then(() => addToast({ type: 'success', title: 'Settings saved' }))
      .catch(toastErr('Failed to save settings'));
  };

  const acknowledgeIncident = (id: string, _assignedTo?: string) => {
    if (!activeTenantId) return;
    tenantApi
      .acknowledgeIncident(activeTenantId, id)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to acknowledge incident'));
  };

  const resolveIncident = (id: string, note?: string) => {
    if (!activeTenantId) return;
    tenantApi
      .resolveIncident(activeTenantId, id, note)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to resolve incident'));
  };

  const bulkResolveIncidents = (ids: string[], note?: string) => {
    if (!activeTenantId || ids.length === 0) return;
    tenantApi
      .bulkResolveIncidents(activeTenantId, ids, note)
      .then((r) => {
        addToast({ type: 'success', title: `Resolved ${r.resolved} incident${r.resolved === 1 ? '' : 's'}` });
        return loadTenantData(activeTenantId);
      })
      .catch(toastErr('Failed to bulk-resolve incidents'));
  };

  const acknowledgeAlert = (_id: string) => addToast({ type: 'info', title: 'Not supported by API' });
  const resolveAlert = (_id: string) => addToast({ type: 'info', title: 'Not supported by API' });

  const revokeSession = (id: string) => {
    (userType === 'platform_admin' ? platformApi.revokeSession(id) : authApi.revokeSession(id))
      .then(() => loadPlatformData())
      .then(() => addToast({ type: 'success', title: 'Session revoked' }))
      .catch(toastErr('Failed to revoke session'));
  };

  const revokeAllUserSessions = (userId: string) => {
    sessions
      .filter((s) => s.userId === userId)
      .forEach((s) => revokeSession(s.id));
  };

  const rotateCredential = (id: string) => {
    platformApi
      .rotateCredential(id)
      .then((r) => {
        setIssuedSecret({ name: r.name, key: r.plaintextKey });
        return loadPlatformData();
      })
      .catch(toastErr('Failed to rotate credential'));
  };
  const revokeCredential = (id: string) => {
    platformApi
      .revokeCredential(id)
      .then(() => loadPlatformData())
      .then(() => addToast({ type: 'success', title: 'Credential revoked' }))
      .catch(toastErr('Failed to revoke credential'));
  };
  const createCredential = (body: { name: string; tenantId?: string | null; scopes?: string[]; expiresInDays?: number | null }) => {
    platformApi
      .createCredential(body)
      .then((r) => {
        setIssuedSecret({ name: r.name, key: r.plaintextKey });
        return loadPlatformData();
      })
      .catch(toastErr('Failed to create credential'));
  };
  const clearIssuedSecret = () => setIssuedSecret(null);

  const impersonateTenant = async (tId: string) => {
    const r = await platformApi.impersonateTenant(tId);
    setImpersonation({ tenantId: r.tenantId, tenantName: r.tenantName, expiresIn: r.expiresIn });
    const me = await authApi.me();
    applyMe(me);
    setTenantNavTab('dashboard');
    addToast({ type: 'info', title: 'Đang mạo danh', description: `Tenant: ${r.tenantName} — 15 phút` });
  };

  const exitImpersonation = async () => {
    try {
      await authApi.refresh();
    } catch {
      // fall through — still clear local state
    }
    setImpersonation(null);
    try {
      const me = await authApi.me();
      applyMe(me);
    } catch {
      setIsAuthenticated(false);
    }
  };

  // ---------- Tenant handlers ----------
  const refreshTenantDashboard = () => {
    if (activeTenantId) void loadTenantData(activeTenantId);
  };

  const updateTenantLocation = (updatedData: Partial<TenantLocation>) => {
    setTenantLocation((prev) => ({ ...prev, ...updatedData }));
    const site = tenantSites[0];
    if (activeTenantId && site && updatedData.name) {
      tenantApi
        .updateSite(activeTenantId, site.id, {
          name: updatedData.name,
          address: typeof updatedData.address === 'string'
            ? updatedData.address
            : [updatedData.address?.line1, updatedData.address?.city, updatedData.address?.country]
                .filter(Boolean)
                .join(', ') || undefined
        })
        .then(() => loadTenantData(activeTenantId))
        .catch(toastErr('Failed to update site'));
    }
  };

  const updateLocationOperatingHours = (hours: OperatingHoursSchedule) => {
    setTenantLocation((prev) => ({ ...prev, operatingHours: hours }));
  };

  const toggleLocationStatus = (status: 'ACTIVE' | 'INACTIVE') => {
    setTenantLocation((prev) => ({ ...prev, status }));
    const site = tenantSites[0];
    if (activeTenantId && site) {
      tenantApi
        .updateSite(activeTenantId, site.id, { status: status.toLowerCase() })
        .then(() => loadTenantData(activeTenantId))
        .catch(toastErr('Failed to update site status'));
    }
  };

  const addTenantSite = (siteData: Partial<TenantSite>) => {
    if (!activeTenantId) return;
    tenantApi
      .createSite(activeTenantId, { name: siteData.name ?? '', address: siteData.address, timezone: siteData.operatingHours })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Site created' }))
      .catch(toastErr('Failed to create site'));
  };

  const updateTenantSite = (siteId: string, siteData: Partial<TenantSite>) => {
    if (!activeTenantId) return;
    tenantApi
      .updateSite(activeTenantId, siteId, { name: siteData.name, address: siteData.address, timezone: siteData.operatingHours })
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to update site'));
  };

  const deleteTenantSite = (siteId: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteSite(activeTenantId, siteId)
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Site deleted' }))
      .catch(toastErr('Failed to delete site'));
  };

  const createTenantCamera = (siteId: string, data: Omit<CameraIn, 'siteId'>) => {
    if (!activeTenantId) return;
    tenantApi
      .createCamera(activeTenantId, { ...data, siteId })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Camera registered', description: data.name }))
      .catch(toastErr('Failed to create camera'));
  };

  const updateTenantCamera = (id: string, data: Partial<Omit<CameraIn, 'siteId'>>) => {
    if (!activeTenantId) return;
    tenantApi
      .updateCamera(activeTenantId, id, data)
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Camera updated' }))
      .catch(toastErr('Failed to update camera'));
  };

  const deleteTenantCamera = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteCamera(activeTenantId, id)
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Camera deleted' }))
      .catch(toastErr('Failed to delete camera'));
  };

  // ---------- Parking map ----------
  const refreshParkingMap = () => {
    if (!activeTenantId) return;
    Promise.all([
      tenantApi.parkingMap(activeTenantId),
      tenantApi.parkingPresence(activeTenantId, { limit: 200 }),
    ])
      .then(([m, p]) => {
        setParkingMap(m.levels);
        parkingPresencesRef.current = p.data;
        setParkingPresences(p.data);
      })
      .catch(toastErr('Failed to refresh parking map'));
  };

  const locateVehicleInLot = async (plate: string): Promise<LocateOut | null> => {
    if (!activeTenantId) return null;
    try {
      return await tenantApi.locateVehicle(activeTenantId, plate);
    } catch (e) {
      toastErr('Locate failed')(e);
      return null;
    }
  };

  const parkingCheckin = (plateNumber: string, zoneId: string) => {
    if (!activeTenantId) return;
    tenantApi
      .parkingCheckin(activeTenantId, { plateNumber, zoneId })
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: 'Vehicle checked in', description: plateNumber }))
      .catch(toastErr('Check-in failed'));
  };

  const parkingCheckout = (plateNumber: string) => {
    if (!activeTenantId) return;
    tenantApi
      .parkingCheckout(activeTenantId, plateNumber)
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: 'Vehicle checked out', description: plateNumber }))
      .catch(toastErr('Check-out failed'));
  };

  const upsertParkingLevel: PlatformContextType['upsertParkingLevel'] = (id, data) => {
    if (!activeTenantId) return;
    const req = id
      ? tenantApi.updateParkingLevel(activeTenantId, id, data)
      : tenantApi.createParkingLevel(activeTenantId, { siteId: data.siteId ?? '', ...data });
    req
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: id ? 'Level updated' : 'Level added', description: data.name }))
      .catch(toastErr('Failed to save level'));
  };

  const upsertParkingZone: PlatformContextType['upsertParkingZone'] = (levelId, id, data) => {
    if (!activeTenantId) return;
    const req = id
      ? tenantApi.updateParkingZone(activeTenantId, id, data)
      : tenantApi.createParkingZone(activeTenantId, levelId, data);
    req
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: id ? 'Zone updated' : 'Zone added', description: data.name }))
      .catch(toastErr('Failed to save zone'));
  };

  const removeParkingLevel = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteParkingLevel(activeTenantId, id)
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: 'Level deleted' }))
      .catch(toastErr('Failed to delete level'));
  };

  const removeParkingZone = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteParkingZone(activeTenantId, id)
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: 'Zone deleted' }))
      .catch(toastErr('Failed to delete zone'));
  };

  const setCameraCoverage = (cameraId: string, zoneIds: string[]) => {
    if (!activeTenantId) return;
    tenantApi
      .setCameraCoverage(activeTenantId, cameraId, zoneIds)
      .then(refreshParkingMap)
      .then(() => addToast({ type: 'success', title: 'Camera coverage updated' }))
      .catch(toastErr('Failed to update coverage'));
  };

  const uploadParkingMapImage = async (file: File): Promise<string> => {
    if (!activeTenantId) throw new Error('No tenant selected');
    const presign = await tenantApi.presignMapImage(activeTenantId, file.type || 'image/png');
    await fetch(presign.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
    }).then((r) => {
      if (!r.ok) throw new Error(`Upload failed (${r.status})`);
    });
    return presign.objectKey;
  };

  const resolveTenantAlert = (alertId: string) => {
    if (!activeTenantId) return;
    tenantApi
      .resolveIncident(activeTenantId, alertId)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to resolve alert'));
  };

  const triggerGateCommand = (gateId: string, command: string) => {
    if (!activeTenantId) return;
    const upper = command.toUpperCase();
    const backendCommand = upper === 'RESET' ? 'reboot' : upper.toLowerCase();
    tenantApi
      .sendCommand(activeTenantId, gateId, backendCommand, crypto.randomUUID())
      .then((cmd) => {
        addToast({ type: 'success', title: `Command ${upper === 'RESET' ? 'REBOOT' : upper} sent`, description: cmd.id });
        // Poll for the ack a couple of times, then surface the outcome.
        let tries = 0;
        const poll = setInterval(() => {
          tries += 1;
          tenantApi.command(activeTenantId!, cmd.id).then((c) => {
            if (c.status === 'acknowledged') {
              clearInterval(poll);
              addToast({ type: 'success', title: 'Command acknowledged' });
              void loadTenantData(activeTenantId);
            } else if (c.status === 'timeout' || c.status === 'failed' || tries >= 10) {
              clearInterval(poll);
              if (c.status !== 'acknowledged') {
                addToast({ type: 'warning', title: `Command ${c.status}`, description: c.error ?? 'No ack received' });
              }
            }
          }).catch(() => clearInterval(poll));
        }, 1500);
      })
      .catch(toastErr('Failed to send command'));
  };

  const simulateNewAccessEvent = (customEvent?: Partial<AccessEvent>) => {
    if (!activeTenantId) return;
    const site = tenantSites[0];
    tenantApi
      .createAccessEvent(activeTenantId, {
        siteId: customEvent?.siteId ?? site?.id,
        gateId: customEvent?.gateId ?? gates[0]?.id,
        plateNumber: customEvent?.plate ?? '51G-TEST.01',
        direction: (customEvent?.direction ?? 'IN').toLowerCase(),
        decision: 'allow',
        reason: 'Manual simulation entry',
        source: 'manual',
      })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Test event recorded' }))
      .catch(toastErr('Failed to record event'));
  };

  const addRegisteredVehicle = (vehicleData: { plate: string; ownerName: string; model: string; type: string; siteId?: string }) => {
    if (!activeTenantId) return;
    tenantApi
      .createVehicle(activeTenantId, {
        plateNumber: vehicleData.plate,
        ownerName: vehicleData.ownerName,
        vehicleType: vehicleData.type,
      })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Vehicle registered', description: vehicleData.plate }))
      .catch(toastErr('Failed to register vehicle'));
  };

  const deleteRegisteredVehicle = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteVehicle(activeTenantId, id)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to delete vehicle'));
  };

  const createTenantVehicle = async (vehicleData: {
    type: VehicleType;
    make: string;
    model: string;
    year?: number;
    color?: string;
    vin?: string;
    description?: string;
    memberId?: string | null;
    licensePlate: { number: string; country?: string; province?: string };
  }) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      const v = await tenantApi.createVehicle(activeTenantId, {
        plateNumber: vehicleData.licensePlate.number,
        vehicleType: vehicleData.type?.toLowerCase(),
        notes: vehicleData.description,
      });
      await loadTenantData(activeTenantId);
      return { success: true, vehicle: mapVehicle(v, activeTenantId) };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const updateTenantVehicle = (vehicleId: string, data: Partial<TenantVehicle>) => {
    if (!activeTenantId) return;
    tenantApi
      .updateVehicle(activeTenantId, vehicleId, {
        plateNumber: data.currentPlate?.number ?? data.name,
        vehicleType: data.type?.toLowerCase(),
        status: data.status?.toLowerCase(),
        notes: data.description,
      })
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to update vehicle'));
  };

  // Vehicle-member assignment does not exist in the API — surface honestly.
  const assignVehicleMember = (_vehicleId: string, _memberId: string | null) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The API has no vehicle-member assignment.' });

  const setVehicleStatus = (vehicleId: string, status: string, successMsg: string) => {
    if (!activeTenantId) return;
    tenantApi
      .updateVehicle(activeTenantId, vehicleId, { status })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: successMsg }))
      .catch(toastErr('Failed to update vehicle'));
  };

  const suspendTenantVehicle = (vehicleId: string, _reason: string) => setVehicleStatus(vehicleId, 'suspended', 'Vehicle suspended');
  const activateTenantVehicle = (vehicleId: string) => setVehicleStatus(vehicleId, 'active', 'Vehicle activated');
  const deactivateTenantVehicle = (vehicleId: string) => setVehicleStatus(vehicleId, 'inactive', 'Vehicle deactivated');
  const archiveTenantVehicle = (vehicleId: string) => setVehicleStatus(vehicleId, 'archived', 'Vehicle archived');

  const registerVehicleLicensePlate = async (
    vehicleId: string,
    newPlate: { number: string; country?: string; province?: string }
  ) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.updateVehicle(activeTenantId, vehicleId, { plateNumber: newPlate.number });
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const importTenantVehicles = async (vehicles: Array<{ plate: string; type?: VehicleType }>) => {
    if (!activeTenantId) return { importedCount: 0, duplicateCount: vehicles.length };
    // The bulk endpoint accepts a CSV file; build one client-side.
    const header = 'plate_number,vehicle_type\n';
    const rows = vehicles.map((v) => `${v.plate},${(v.type ?? 'car').toLowerCase()}`).join('\n');
    try {
      const job = await tenantApi.importVehicles(activeTenantId, new Blob([header + rows], { type: 'text/csv' }));
      // Poll until the worker finishes to get real counts.
      const result = await new Promise<{ created?: number; skipped?: number; updated?: number }>((resolve) => {
        let tries = 0;
        const poll = setInterval(() => {
          tries += 1;
          tenantApi.job(activeTenantId!, job.jobId).then((j) => {
            if (j.status === 'done' || j.status === 'failed' || tries >= 20) {
              clearInterval(poll);
              resolve((j.result as { created?: number; skipped?: number; updated?: number }) ?? {});
            }
          }).catch(() => {
            clearInterval(poll);
            resolve({});
          });
        }, 1000);
      });
      await loadTenantData(activeTenantId);
      const created = result.created ?? 0;
      const dup = (result.skipped ?? 0) + (result.updated ?? 0);
      return { importedCount: created, duplicateCount: dup };
    } catch (e) {
      addToast({ type: 'error', title: 'Import failed', description: errText(e) });
      return { importedCount: 0, duplicateCount: 0 };
    }
  };

  const inviteTenantMember = (memberData: { name: string; email: string; role: string; siteAccess: string[] }) => {
    if (!activeTenantId) return;
    tenantApi
      .inviteUser(activeTenantId, { email: memberData.email, fullName: memberData.name, role: mapUiRoleToBackend(memberData.role) })
      .then(() => loadTenantData(activeTenantId))
      .then(() => addToast({ type: 'success', title: 'Invitation sent', description: memberData.email }))
      .catch(toastErr('Failed to invite member'));
  };

  const deleteTenantMember = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteUser(activeTenantId, id)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to delete member'));
  };

  // ---------- Access rules ----------
  const detectRuleConflicts = (rule: Partial<TenantAccessRule>, excludeRuleId?: string): string[] => {
    const conflicts: string[] = [];
    for (const other of tenantAccessRules) {
      if (excludeRuleId && other.id === excludeRuleId) continue;
      if (other.status !== 'ACTIVE') continue;
      const sameTarget =
        (rule.target?.type && rule.target.type === other.target.type) ||
        (rule.target?.licensePlate && rule.target.licensePlate === other.target.licensePlate);
      const scopeOverlap =
        (rule.scope?.allSites || other.scope.allSites) ||
        (rule.scope?.siteIds ?? []).some((s) => other.scope.siteIds.includes(s));
      if (sameTarget && scopeOverlap && rule.action !== other.action) {
        const higher = (rule.priority ?? 9999) < other.priority ? 'this rule' : `"${other.name}"`;
        conflicts.push(`Conflicting ${other.action} rule "${other.name}" overlaps — ${higher} wins`);
      }
    }
    return conflicts;
  };

  const createTenantAccessRule = async (ruleData: any) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    const conflicts = detectRuleConflicts(ruleData);
    try {
      const siteIds = (ruleData.scope?.siteIds ?? []).filter((s: string) => s && !s.startsWith('ALL_'));
      const gateIds = (ruleData.scope?.gateIds ?? []).filter((g: string) => g && !g.startsWith('ALL_'));
      const r = await tenantApi.createRule(activeTenantId, {
        siteId: siteIds[0] ?? undefined,
        name: ruleData.name ?? '',
        ruleType: (ruleData.action ?? 'custom').toLowerCase(),
        priority: ruleData.priority ?? 100,
        schedule: ruleData.schedule ?? {},
        conditions: {
          plateNumber: ruleData.target?.licensePlate,
          gateIds: gateIds.length ? gateIds : undefined,
          allSites: ruleData.scope?.allSites || undefined,
          allGates: ruleData.scope?.allGates || undefined,
          targetType: ruleData.target?.type,
          notes: ruleData.target?.notes ?? ruleData.description,
        },
        active: true,
      });
      await loadTenantData(activeTenantId);
      return { success: true, rule: mapRule(r), conflicts };
    } catch (e) {
      return { success: false, message: errText(e), conflicts };
    }
  };

  const updateTenantAccessRule = async (ruleId: string, ruleData: Partial<TenantAccessRule>) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      const siteIds = (ruleData.scope?.siteIds ?? []).filter((s: string) => s && !s.startsWith('ALL_'));
      const gateIds = (ruleData.scope?.gateIds ?? []).filter((g: string) => g && !g.startsWith('ALL_'));
      const r = await tenantApi.updateRule(activeTenantId, ruleId, {
        name: ruleData.name,
        ruleType: ruleData.action?.toLowerCase(),
        priority: ruleData.priority,
        schedule: ruleData.schedule as object | undefined,
        conditions: ruleData.target
          ? {
              plateNumber: ruleData.target.licensePlate,
              gateIds: gateIds.length ? gateIds : undefined,
              allSites: ruleData.scope?.allSites || undefined,
              allGates: ruleData.scope?.allGates || undefined,
              targetType: ruleData.target.type,
              notes: ruleData.target.notes ?? ruleData.description,
            }
          : undefined,
        active: ruleData.status ? ruleData.status === 'ACTIVE' : undefined,
        siteId: siteIds[0] ?? undefined,
      });
      await loadTenantData(activeTenantId);
      return { success: true, rule: mapRule(r) };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const setRuleActive = (ruleId: string, active: boolean) => {
    if (!activeTenantId) return;
    tenantApi
      .updateRule(activeTenantId, ruleId, { active })
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to update rule'));
  };
  const activateTenantAccessRule = (ruleId: string) => setRuleActive(ruleId, true);
  const deactivateTenantAccessRule = (ruleId: string) => setRuleActive(ruleId, false);

  const duplicateTenantAccessRule = async (ruleId: string): Promise<TenantAccessRule | null> => {
    const orig = tenantAccessRules.find((r) => r.id === ruleId);
    if (!orig || !activeTenantId) return null;
    try {
      const r = await tenantApi.createRule(activeTenantId, {
        siteId: orig.scope?.siteIds?.[0],
        name: `${orig.name} (copy)`,
        ruleType: (orig.type ?? 'custom').toLowerCase(),
        priority: (orig.priority ?? 100) + 1,
        schedule: orig.schedule as object,
        conditions: {},
        active: false,
      });
      await loadTenantData(activeTenantId);
      return mapRule(r);
    } catch (e) {
      toastErr('Failed to duplicate rule')(e);
      return null;
    }
  };

  const deleteTenantAccessRule = (id: string) => {
    if (!activeTenantId) return;
    tenantApi
      .deleteRule(activeTenantId, id)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to delete rule'));
  };

  const reorderRulePriorities = (ruleIdsInOrder: string[]) => {
    if (!activeTenantId) return;
    // Persist new priorities (steps of 10) sequentially.
    (async () => {
      try {
        for (const [i, id] of Array.from(ruleIdsInOrder.entries())) {
          await tenantApi.updateRule(activeTenantId, id, { priority: (i + 1) * 10 });
        }
        await loadTenantData(activeTenantId);
        addToast({ type: 'success', title: 'Priorities updated' });
      } catch (e) {
        toastErr('Failed to reorder rules')(e);
      }
    })();
  };

  // ---------- Tenant users ----------
  const inviteTenantUser = async (data: { email: string; fullName?: string; role: TenantUserRole }) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.inviteUser(activeTenantId, {
        email: data.email,
        fullName: data.fullName ?? data.email,
        role: mapUiRoleToBackend(data.role),
      });
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const createTenantUserManually = async (data: { fullName: string; email: string; role: TenantUserRole }) => {
    // The API only supports invite-based creation — same call.
    return inviteTenantUser({ email: data.email, fullName: data.fullName, role: data.role });
  };

  const changeTenantUserRole = async (userId: string, newRole: TenantUserRole) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.updateUser(activeTenantId, userId, { role: newRole.toLowerCase() });
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const toggleTenantUserStatus = async (userId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.updateUser(activeTenantId, userId, { status: targetStatus === 'ACTIVE' ? 'active' : 'disabled' });
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const resetTenantUserPassword = (_userId: string) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The API has no per-user password reset.' });

  const updateTenantUser = (userId: string, data: Partial<TenantUser>) => {
    if (!activeTenantId) return;
    tenantApi
      .updateUser(activeTenantId, userId, {
        fullName: data.name,
        role: data.role?.toLowerCase(),
        status: data.status ? (data.status === 'ACTIVE' ? 'active' : 'disabled') : undefined,
      })
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to update user'));
  };

  const updateTenantMemberProfile = (_userId: string, _data: Partial<TenantMemberProfile>) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The API has no member profile fields.' });

  const suspendTenantMembership = (userId: string, _reason: string) => void toggleTenantUserStatus(userId, 'INACTIVE');
  const activateTenantMembership = (userId: string) => void toggleTenantUserStatus(userId, 'ACTIVE');
  const endTenantMembership = (userId: string) => deleteTenantMember(userId);

  const resendTenantInvitation = (_invitationId: string) =>
    addToast({ type: 'info', title: 'Not supported', description: 'The API has no resend-invite endpoint.' });
  const cancelTenantInvitation = (invitationId: string) => deleteTenantMember(invitationId);

  const createTenantDevice = async (data: TenantEdgeDeviceInput) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.createDevice(activeTenantId, data);
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const updateTenantDevice = async (deviceId: string, data: Partial<TenantEdgeDeviceInput>) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.updateDevice(activeTenantId, deviceId, data);
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const decommissionTenantDevice = async (deviceId: string) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.decommissionDevice(activeTenantId, deviceId);
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const reactivateTenantDevice = async (deviceId: string) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.reactivateDevice(activeTenantId, deviceId);
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const deleteTenantDevice = async (deviceId: string) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      await tenantApi.deleteDevice(activeTenantId, deviceId);
      await loadTenantData(activeTenantId);
      return { success: true };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  const rebootTenantDevice = async (deviceId: string) => {
    if (!activeTenantId) return { success: false, message: 'No tenant selected' };
    try {
      const r = await tenantApi.rebootDevice(activeTenantId, deviceId);
      await loadTenantData(activeTenantId);
      return { success: true, commandIds: r.commandIds };
    } catch (e) {
      return { success: false, message: errText(e) };
    }
  };

  return (
    <PlatformContext.Provider
      value={{
        isAuthenticated,
        isSessionLoading,
        userType,
        currentUser,
        login,
        logout,
        theme,
        toggleTheme,
        isMfaModalOpen,
        mfaModalMode,
        mfaTargetAdminName,
        isMfaVerified,
        openMfaModal,
        closeMfaModal,
        primaryTab,
        setPrimaryTab,
        platformSubTab,
        setPlatformSubTab,
        monitoringSubTab,
        setMonitoringSubTab,
        securitySubTab,
        setSecuritySubTab,
        settingsSection,
        setSettingsSection,
        selectedTenantId,
        activeTenantId,
        setSelectedTenantId,
        selectedAdminId,
        setSelectedAdminId,
        isLiveSimulationActive,
        setIsLiveSimulationActive,
        lastUpdatedTime,
        tenants,
        admins,
        sessions,
        featureFlags,
        settings,
        services,
        edgeDevices,
        tenantDevices,
        cameras,
        gates,
        incidents,
        securityAlerts,
        loginEvents,
        credentials,
        auditLogs,
        toasts,
        addToast,
        removeToast,
        createTenant,
        updateTenant,
        setTenantStatus,
        createAdmin,
        updateAdmin,
        disableAdmin,
        resetAdminMfa,
        createFeatureFlag,
        toggleFeatureFlag,
        updateSettings,
        acknowledgeIncident,
        resolveIncident,
        bulkResolveIncidents,
        pushAuditLog,
        acknowledgeAlert,
        resolveAlert,
        revokeSession,
        revokeAllUserSessions,
        rotateCredential,
        revokeCredential,
        createCredential,
        issuedSecret,
        clearIssuedSecret,
        impersonation,
        impersonateTenant,
        exitImpersonation,
        navigateTo,
        appWorkspace,
        tenantNavTab,
        setTenantNavTab,
        selectedSiteId,
        setSelectedSiteId,
        tenantSiteFilter,
        setTenantSiteFilter,
        tenantDateFilter,
        setTenantDateFilter,
        isTenantRefreshing,
        refreshTenantDashboard,
        tenantLocation,
        tenantSites,
        tenantSummary,
        tenantHealth,
        tenantAlerts,
        accessEvents,
        accessActivity,
        tenantLanes,
        liveGateFrames,
        parkingMap,
        parkingPresences,
        refreshParkingMap,
        locateVehicleInLot,
        parkingCheckin,
        parkingCheckout,
        upsertParkingLevel,
        upsertParkingZone,
        removeParkingLevel,
        removeParkingZone,
        setCameraCoverage,
        uploadParkingMapImage,
        registeredVehicles,
        tenantVehicles,
        tenantAccessRules,
        tenantMembers,
        tenantUsers,
        tenantInvitations,
        userAuditLogs,
        updateTenantLocation,
        updateLocationOperatingHours,
        toggleLocationStatus,
        addTenantSite,
        updateTenantSite,
        deleteTenantSite,
        createTenantCamera,
        updateTenantCamera,
        deleteTenantCamera,
        resolveTenantAlert,
        triggerGateCommand,
        simulateNewAccessEvent,
        addRegisteredVehicle,
        deleteRegisteredVehicle,
        createTenantVehicle,
        updateTenantVehicle,
        assignVehicleMember,
        suspendTenantVehicle,
        activateTenantVehicle,
        deactivateTenantVehicle,
        archiveTenantVehicle,
        registerVehicleLicensePlate,
        importTenantVehicles,
        inviteTenantMember,
        deleteTenantMember,
        createTenantAccessRule,
        updateTenantAccessRule,
        activateTenantAccessRule,
        deactivateTenantAccessRule,
        duplicateTenantAccessRule,
        deleteTenantAccessRule,
        reorderRulePriorities,
        detectRuleConflicts,
        createTenantDevice,
        updateTenantDevice,
        decommissionTenantDevice,
        reactivateTenantDevice,
        deleteTenantDevice,
        rebootTenantDevice,
        inviteTenantUser,
        createTenantUserManually,
        changeTenantUserRole,
        toggleTenantUserStatus,
        resetTenantUserPassword,
        updateTenantUser,
        updateTenantMemberProfile,
        suspendTenantMembership,
        activateTenantMembership,
        endTenantMembership,
        resendTenantInvitation,
        cancelTenantInvitation,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = (): PlatformContextType => {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within a PlatformProvider');
  return ctx;
};
