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
  AccessRuleSimulationResult,
  TenantMember,
  TenantUser,
  TenantInvitation,
  UserAuditLog,
  TenantUserRole,
  MembershipType,
  TenantMemberProfile,
} from '../types/tenant';
import {
  authApi,
  platformApi,
  tenantApi,
  barrierTelemetryWsUrl,
  ApiError,
} from '../services/api';
import type { LaneOut } from '../services/api';
import {
  mapAccessEvent,
  mapAuditLog,
  mapDevice,
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
  resolveTenantAlert: (alertId: string) => void;
  triggerGateCommand: (gateId: string, command: 'OPEN' | 'CLOSE' | 'LOCK' | 'RESET') => void;
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
  simulateAccessDecision: (params: { plate: string; siteId: string; gateId: string; timestamp?: string }) => AccessRuleSimulationResult;
  detectRuleConflicts: (rule: Partial<TenantAccessRule>, excludeRuleId?: string) => string[];

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
    document.documentElement.classList.toggle('dark', theme === 'dark');
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
  // No camera/security-activity/credential APIs exist yet — start honest-empty instead of mock.
  const [cameras, setCameras] = useState<CameraHealth[]>([]);
  const [gates, setGates] = useState<GateHealth[]>([]);
  const [incidents, setIncidents] = useState<OperationalIncident[]>([]);
  const [securityAlerts] = useState<SecurityAlert[]>([]);
  const [loginEvents] = useState<LoginActivityEvent[]>([]);
  const [credentials] = useState<ApiCredential[]>([]);
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
      const [tenantsPage, adminsRows, sessionRows, flags, settingsRows, health] = await Promise.all([
        platformApi.listTenants({ limit: 200 }),
        platformApi.listAdmins(),
        platformApi.listSessions({ activeOnly: true }).catch(() => []),
        platformApi.listFlags(),
        platformApi.getSettings().catch(() => []),
        platformApi.infraHealth().catch(() => null),
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
      const [sitesPage, gatesPage, devicesPage, vehiclesPage, rulesPage, usersPage, eventsPage, incidentsPage, auditPage] =
        await Promise.all([
          tenantApi.sites(tId, { limit: 200 }),
          tenantApi.gates(tId, { limit: 200 }),
          tenantApi.devices(tId, { limit: 200 }),
          tenantApi.vehicles(tId, { limit: 200 }),
          tenantApi.rules(tId, { limit: 200 }),
          tenantApi.users(tId, { limit: 200 }),
          tenantApi.accessEvents(tId, { limit: 100 }),
          tenantApi.incidents(tId, { limit: 100 }),
          tenantApi.auditLogs(tId, { limit: 100 }).catch(() => ({ data: [], meta: { page: 1, limit: 100, total: 0 } })),
        ]);

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
        gateCount: gatesPage.data.filter((g) => g.siteId === s.id).length,
        onlineGateCount: gatesPage.data.filter((g) => g.siteId === s.id && (g.status === 'open' || g.status === 'closed')).length,
        edgeDeviceCount: devicesPage.data.filter((d) => d.siteId === s.id).length,
        onlineEdgeDeviceCount: devicesPage.data.filter((d) => d.siteId === s.id && d.status === 'online').length,
        lanesCount: lanesNested[sitesPage.data.findIndex((pg) => pg.id === s.id)]?.length ?? 0,
      })));
      setGates(gatesMapped);
      setEdgeDevices(devicesPage.data.map((d) => mapDevice(d, tId, tName)));

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

      // Derived aggregates
      const today = new Date().toDateString();
      const todayEvents = eventsPage.data.filter((e) => new Date(e.occurredAt).toDateString() === today);
      setTenantSummary({
        sites: { total: sites.length, active: sites.filter((s) => s.status !== 'INACTIVE').length, inactive: sites.filter((s) => s.status === 'INACTIVE').length },
        cameras: { total: 0, online: 0, offline: 0 },
        gates: { total: gatesMapped.length, online: gatesMapped.filter((g) => g.status === 'ONLINE').length, offline: gatesMapped.filter((g) => g.status !== 'ONLINE').length },
        vehicles: {
          total: vehicles.length,
          active: vehicles.filter((v) => v.status === 'active').length,
          inactive: vehicles.filter((v) => v.status !== 'active').length,
          newThisMonth: vehicles.filter((v) => new Date(v.createdAt).getMonth() === new Date().getMonth()).length,
        },
        accessToday: {
          total: todayEvents.length,
          allowed: todayEvents.filter((e) => e.decision === 'allow' || e.decision === 'allowed').length,
          denied: todayEvents.filter((e) => e.decision === 'deny' || e.decision === 'denied').length,
          unknown: todayEvents.filter((e) => !/allow|deny/i.test(e.decision)).length,
          percentChange: 0,
        },
      });
      setTenantHealth({
        overall: devicesPage.data.every((d) => d.status === 'online') ? 'HEALTHY' : 'WARNING',
        cameras: { total: 0, online: 0, offline: 0 },
        gates: { total: gatesMapped.length, online: gatesMapped.filter((g) => g.status === 'ONLINE').length, offline: gatesMapped.filter((g) => g.status !== 'ONLINE').length },
        edgeDevices: { total: devicesPage.data.length, online: devicesPage.data.filter((d) => d.status === 'online').length, offline: devicesPage.data.filter((d) => d.status !== 'online').length },
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
      // Hourly activity buckets for the chart
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
    const connect = () => {
      if (closed) return;
      ws = new WebSocket(barrierTelemetryWsUrl(activeTenantId));
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const kind = msg?.type ?? msg?.event ?? '';
          if (/access|event/i.test(kind) || msg?.decision) {
            const out = msg.payload ?? msg;
            const mapped = mapAccessEvent({
              id: out.id ?? `evt-${Date.now()}`,
              siteId: out.siteId ?? out.site_id,
              gateId: out.gateId ?? out.gate_id,
              laneId: out.laneId ?? out.lane_id,
              vehicleId: out.vehicleId ?? out.vehicle_id,
              plateNumber: out.plateNumber ?? out.plate_number ?? out.plate,
              direction: out.direction ?? 'IN',
              decision: out.decision ?? 'unknown',
              reason: out.reason,
              confidence: out.confidence,
              plateImageUrl: out.plateImageUrl ?? out.plate_image_url,
              overviewImageUrl: out.overviewImageUrl ?? out.overview_image_url,
              source: out.source ?? 'edge',
              occurredAt: out.occurredAt ?? out.occurred_at ?? new Date().toISOString(),
            } as any, { siteName: siteNameOf(out.siteId ?? out.site_id), gateName: gateNameOf(out.gateId ?? out.gate_id) });
            setAccessEvents((prev) => [mapped, ...prev.slice(0, 99)]);
          } else if (/incident/i.test(kind)) {
            void loadTenantData(activeTenantId);
          } else if (/telemetry|gate|heartbeat/i.test(kind)) {
            setLastUpdatedTime(new Date().toLocaleTimeString());
            void loadTenantData(activeTenantId);
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

  const rotateCredential = (_id: string) => addToast({ type: 'info', title: 'Not supported by API' });
  const revokeCredential = (_id: string) => addToast({ type: 'info', title: 'Not supported by API' });

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

  const resolveTenantAlert = (alertId: string) => {
    if (!activeTenantId) return;
    tenantApi
      .resolveIncident(activeTenantId, alertId)
      .then(() => loadTenantData(activeTenantId))
      .catch(toastErr('Failed to resolve alert'));
  };

  const triggerGateCommand = (gateId: string, command: 'OPEN' | 'CLOSE' | 'LOCK' | 'RESET') => {
    if (!activeTenantId) return;
    tenantApi
      .sendCommand(activeTenantId, gateId, command.toLowerCase(), crypto.randomUUID())
      .then((cmd) => {
        addToast({ type: 'success', title: `Command ${command} sent`, description: cmd.id });
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

  const simulateAccessDecision = (params: { plate: string; siteId: string; gateId: string; timestamp?: string }): AccessRuleSimulationResult => {
    // Local evaluation against the loaded rules (the API has no simulate endpoint).
    const plateNorm = params.plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const matches = tenantAccessRules
      .filter((r) => r.status === 'ACTIVE')
      .sort((a, b) => a.priority - b.priority)
      .map((r) => {
        const targetPlate = (r.target.licensePlate ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const targetMatched = r.target.type === 'ALL_VEHICLES' || (targetPlate !== '' && targetPlate === plateNorm);
        const scopeMatched = r.scope.allSites || r.scope.siteIds.includes(params.siteId) || r.scope.gateIds.includes(params.gateId);
        return {
          ruleId: r.id,
          ruleCode: r.code,
          ruleName: r.name,
          priority: r.priority,
          action: r.action,
          matched: targetMatched && scopeMatched,
          targetMatched,
          scopeMatched,
          scheduleMatched: true,
          matchReason: targetMatched && scopeMatched ? 'Target and scope matched' : 'No match',
        };
      });
    const winner = matches.find((m) => m.matched);
    const winningRule = winner ? tenantAccessRules.find((r) => r.id === winner.ruleId) ?? null : null;
    return {
      plate: params.plate,
      siteId: params.siteId,
      siteName: siteNameOf(params.siteId) ?? params.siteId,
      gateId: params.gateId,
      gateName: gateNameOf(params.gateId) ?? params.gateId,
      timestamp: params.timestamp ?? new Date().toISOString(),
      decision: winningRule?.action ?? 'DENY',
      winningRule,
      reason: winningRule ? `Matched rule "${winningRule.name}" (#${winningRule.priority})` : 'No active rule matched — default deny',
      allEvaluatedRules: matches,
    };
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
        pushAuditLog,
        acknowledgeAlert,
        resolveAlert,
        revokeSession,
        revokeAllUserSessions,
        rotateCredential,
        revokeCredential,
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
        simulateAccessDecision,
        detectRuleConflicts,
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
