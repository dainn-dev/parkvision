import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useAuth } from './AuthContext';
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
  IncidentStatus,
  AlertStatus
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
  VehicleStatus,
  VehicleAccessStatus,
  VehicleLicensePlate,
  TenantAccessRule,
  AccessRuleAction,
  AccessRuleStatus,
  AccessRuleSimulationResult,
  AccessRuleSimulationRuleMatch,
  TenantMember,
  TenantUser,
  TenantInvitation,
  UserAuditLog,
  TenantUserRole,
  TenantUserStatus,
  MembershipStatus,
  MembershipType,
  InvitationStatus,
  TenantMemberProfile
} from '../types/tenant';
import {
  INITIAL_TENANTS,
  INITIAL_PLATFORM_ADMINS,
  INITIAL_SESSIONS,
  INITIAL_FEATURE_FLAGS,
  INITIAL_SETTINGS,
  INITIAL_SERVICES,
  INITIAL_EDGE_DEVICES,
  INITIAL_CAMERAS,
  INITIAL_GATES,
  INITIAL_INCIDENTS,
  INITIAL_SECURITY_ALERTS,
  INITIAL_LOGIN_EVENTS,
  INITIAL_CREDENTIALS,
  INITIAL_AUDIT_LOGS
} from '../data/mockData';
import {
  INITIAL_TENANT_LOCATION,
  INITIAL_TENANT_SITES,
  INITIAL_TENANT_SUMMARY,
  INITIAL_TENANT_HEALTH,
  INITIAL_TENANT_ALERTS,
  INITIAL_ACCESS_ACTIVITY,
  INITIAL_RECENT_ACCESS_EVENTS,
  INITIAL_REGISTERED_VEHICLES,
  INITIAL_TENANT_VEHICLES,
  INITIAL_TENANT_ACCESS_RULES,
  INITIAL_TENANT_MEMBERS,
  INITIAL_TENANT_USERS,
  INITIAL_TENANT_INVITATIONS,
  INITIAL_USER_AUDIT_LOGS
} from '../data/tenantMockData';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  description?: string;
}

interface PlatformContextType {
  // Authentication State
  authStatus: 'loading' | 'anonymous' | 'authenticated';
  isAuthenticated: boolean;
  currentUser: {
    id: string;
    name: string;
    email: string;
    role: string;
    mfaEnabled: boolean;
  };
  logout: () => Promise<void>;

  // Theme State
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // MFA Flow State
  isMfaModalOpen: boolean;
  mfaModalMode: 'enroll' | 'challenge' | 'reset_admin';
  mfaTargetAdminName?: string;
  isMfaVerified: boolean;
  openMfaModal: (mode?: 'enroll' | 'challenge' | 'reset_admin', targetAdminName?: string) => void;
  closeMfaModal: () => void;

  // Navigation State
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

  // Selected Detail Drilldown States
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  selectedAdminId: string | null;
  setSelectedAdminId: (id: string | null) => void;

  // Real-time Simulation Control
  isLiveSimulationActive: boolean;
  setIsLiveSimulationActive: (active: boolean) => void;
  lastUpdatedTime: string;

  // Data Collections
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

  // Toasts
  toasts: ToastMessage[];
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  removeToast: (id: string) => void;

  // Handlers - Tenant
  createTenant: (tenantData: Partial<Tenant>, adminData: any) => void;
  updateTenant: (id: string, updateData: Partial<Tenant>) => void;
  setTenantStatus: (id: string, status: TenantStatus, reason?: string) => void;

  // Handlers - Admin
  createAdmin: (adminData: Partial<PlatformAdmin>) => void;
  updateAdmin: (id: string, updateData: Partial<PlatformAdmin>) => void;
  disableAdmin: (id: string, reason?: string) => void;
  resetAdminMfa: (id: string) => void;

  // Handlers - Feature Flags & Settings
  toggleFeatureFlag: (id: string) => void;
  updateSettings: (section: SettingsSection, newSettings: any) => void;

  // Handlers - Monitoring & Incidents
  acknowledgeIncident: (id: string, assignedTo?: string) => void;
  resolveIncident: (id: string, note?: string) => void;

  // Handlers - Security & Sessions
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

  // Quick Action Navigator
  navigateTo: (tab: PrimaryTab, subTab?: string, detailId?: string) => void;

  // ==========================================
  // TENANT ADMIN CONTEXT & DASHBOARD STATE
  // ==========================================
  appWorkspace: 'platform' | 'tenant';
  setAppWorkspace: (workspace: 'platform' | 'tenant') => void;
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

  // Tenant Collections
  tenantLocation: TenantLocation;
  tenantSites: TenantSite[];
  tenantSummary: TenantDashboardSummary;
  tenantHealth: TenantSystemHealth;
  tenantAlerts: TenantAlertItem[];
  accessEvents: AccessEvent[];
  accessActivity: AccessActivityDataPoint[];
  registeredVehicles: RegisteredVehicle[];
  tenantVehicles: TenantVehicle[];
  tenantAccessRules: TenantAccessRule[];
  tenantMembers: TenantMember[];
  tenantUsers: TenantUser[];
  tenantInvitations: TenantInvitation[];
  userAuditLogs: UserAuditLog[];

  // Tenant Handlers
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
    licensePlate: {
      number: string;
      country?: string;
      province?: string;
    };
  }) => { success: boolean; vehicle?: TenantVehicle; message?: string };
  updateTenantVehicle: (vehicleId: string, data: Partial<TenantVehicle>) => void;
  assignVehicleMember: (vehicleId: string, memberId: string | null) => void;
  suspendTenantVehicle: (vehicleId: string, reason: string) => void;
  activateTenantVehicle: (vehicleId: string) => void;
  deactivateTenantVehicle: (vehicleId: string) => void;
  archiveTenantVehicle: (vehicleId: string) => void;
  registerVehicleLicensePlate: (vehicleId: string, newPlate: { number: string; country?: string; province?: string }) => { success: boolean; message?: string };
  importTenantVehicles: (vehicles: Array<{
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
  }>) => { importedCount: number; duplicateCount: number };
  inviteTenantMember: (memberData: { name: string; email: string; role: string; siteAccess: string[] }) => void;
  deleteTenantMember: (id: string) => void;
  createTenantAccessRule: (ruleData: any) => { success: boolean; rule?: TenantAccessRule; conflicts?: string[] };
  updateTenantAccessRule: (ruleId: string, ruleData: Partial<TenantAccessRule>) => { success: boolean; rule?: TenantAccessRule; conflicts?: string[] };
  activateTenantAccessRule: (ruleId: string) => void;
  deactivateTenantAccessRule: (ruleId: string) => void;
  duplicateTenantAccessRule: (ruleId: string) => TenantAccessRule;
  deleteTenantAccessRule: (id: string) => void;
  reorderRulePriorities: (ruleIdsInOrder: string[]) => void;
  simulateAccessDecision: (params: { plate: string; siteId: string; gateId: string; timestamp?: string }) => AccessRuleSimulationResult;
  detectRuleConflicts: (rule: Partial<TenantAccessRule>, excludeRuleId?: string) => string[];

  // Tenant User & Member Management Handlers
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
  }) => void;
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
  }) => void;
  changeTenantUserRole: (userId: string, newRole: TenantUserRole) => { success: boolean; message?: string };
  toggleTenantUserStatus: (userId: string, targetStatus: 'ACTIVE' | 'INACTIVE') => { success: boolean; message?: string };
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

export const PlatformProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // Auth State is owned by AuthProvider; this context keeps UI and domain state only.
  const { status: authStatus, session, logout } = useAuth();
  const isAuthenticated = authStatus === 'authenticated';
  const currentUser = {
    id: session?.user.id ?? '',
    name: session?.user.fullName ?? '',
    email: session?.user.email ?? '',
    role: session?.user.role ?? '',
    mfaEnabled: session?.user.mfaEnabled ?? false,
  };


  // Theme State
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved === 'light' || saved === 'dark') ? saved : 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.body.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.body.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // MFA Flow State
  const [isMfaModalOpen, setIsMfaModalOpen] = useState<boolean>(false);
  const [mfaModalMode, setMfaModalMode] = useState<'enroll' | 'challenge' | 'reset_admin'>('enroll');
  const [mfaTargetAdminName, setMfaTargetAdminName] = useState<string | undefined>(undefined);
  const [isMfaVerified, setIsMfaVerified] = useState<boolean>(true);

  const openMfaModal = (mode: 'enroll' | 'challenge' | 'reset_admin' = 'enroll', targetAdminName?: string) => {
    setMfaModalMode(mode);
    setMfaTargetAdminName(targetAdminName);
    setIsMfaModalOpen(true);
  };

  const closeMfaModal = () => {
    setIsMfaModalOpen(false);
  };

  // Navigation State
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>('dashboard');
  const [platformSubTab, setPlatformSubTab] = useState<PlatformSubTab>('settings');
  const [monitoringSubTab, setMonitoringSubTab] = useState<MonitoringSubTab>('overview');
  const [securitySubTab, setSecuritySubTab] = useState<SecuritySubTab>('overview');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');

  // Drilldown States
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [selectedAdminId, setSelectedAdminId] = useState<string | null>(null);

  // ===============================================
  // TENANT ADMIN PORTAL STATE
  // ===============================================
  const [appWorkspace, setAppWorkspace] = useState<'platform' | 'tenant'>('tenant');
  const [tenantNavTab, setTenantNavTab] = useState<TenantNavigationTab>('dashboard');
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [tenantSiteFilter, setTenantSiteFilter] = useState<string>('all');
  const [tenantDateFilter, setTenantDateFilter] = useState<string>('today');
  const [isTenantRefreshing, setIsTenantRefreshing] = useState<boolean>(false);

  const [tenantLocation, setTenantLocation] = useState<TenantLocation>(INITIAL_TENANT_LOCATION);
  const [tenantSites, setTenantSites] = useState<TenantSite[]>(INITIAL_TENANT_SITES);
  const [tenantSummary, setTenantSummary] = useState<TenantDashboardSummary>(INITIAL_TENANT_SUMMARY);
  const [tenantHealth, setTenantHealth] = useState<TenantSystemHealth>(INITIAL_TENANT_HEALTH);
  const [tenantAlerts, setTenantAlerts] = useState<TenantAlertItem[]>(INITIAL_TENANT_ALERTS);
  const [accessEvents, setAccessEvents] = useState<AccessEvent[]>(INITIAL_RECENT_ACCESS_EVENTS);
  const [accessActivity, setAccessActivity] = useState<AccessActivityDataPoint[]>(INITIAL_ACCESS_ACTIVITY);
  const [registeredVehicles, setRegisteredVehicles] = useState<RegisteredVehicle[]>(INITIAL_REGISTERED_VEHICLES);
  const [tenantVehicles, setTenantVehicles] = useState<TenantVehicle[]>(INITIAL_TENANT_VEHICLES);
  const [tenantAccessRules, setTenantAccessRules] = useState<TenantAccessRule[]>(INITIAL_TENANT_ACCESS_RULES);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>(INITIAL_TENANT_MEMBERS);
  const [tenantUsers, setTenantUsers] = useState<TenantUser[]>(INITIAL_TENANT_USERS);
  const [tenantInvitations, setTenantInvitations] = useState<TenantInvitation[]>(INITIAL_TENANT_INVITATIONS);
  const [userAuditLogs, setUserAuditLogs] = useState<UserAuditLog[]>(INITIAL_USER_AUDIT_LOGS);

  // Live Ticker State
  const [isLiveSimulationActive, setIsLiveSimulationActive] = useState<boolean>(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>(new Date().toLocaleTimeString());

  // Collections
  const [tenants, setTenants] = useState<Tenant[]>(INITIAL_TENANTS);
  const [admins, setAdmins] = useState<PlatformAdmin[]>(INITIAL_PLATFORM_ADMINS);
  const [sessions, setSessions] = useState<ActiveSession[]>(INITIAL_SESSIONS);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>(INITIAL_FEATURE_FLAGS);
  const [settings, setSettings] = useState<PlatformSettings>(INITIAL_SETTINGS);
  const [services, setServices] = useState<ServiceHealthItem[]>(INITIAL_SERVICES);
  const [edgeDevices, setEdgeDevices] = useState<EdgeDeviceHealth[]>(INITIAL_EDGE_DEVICES);
  const [cameras, setCameras] = useState<CameraHealth[]>(INITIAL_CAMERAS);
  const [gates, setGates] = useState<GateHealth[]>(INITIAL_GATES);
  const [incidents, setIncidents] = useState<OperationalIncident[]>(INITIAL_INCIDENTS);
  const [securityAlerts, setSecurityAlerts] = useState<SecurityAlert[]>(INITIAL_SECURITY_ALERTS);
  const [loginEvents, setLoginEvents] = useState<LoginActivityEvent[]>(INITIAL_LOGIN_EVENTS);
  const [credentials, setCredentials] = useState<ApiCredential[]>(INITIAL_CREDENTIALS);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>(INITIAL_AUDIT_LOGS);

  // Toast System
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Helper helper to push audit log
  const pushAuditLog = (
    category: AuditLogItem['category'],
    action: string,
    resourceType: string,
    resourceId: string,
    resourceName?: string,
    tenantName?: string,
    changes?: { field: string; before: any; after: any }[]
  ) => {
    const newLog: AuditLogItem = {
      id: `aud-${Date.now()}`,
      timestamp: new Date().toISOString(),
      category,
      action,
      actorName: 'Anthony Nguyen',
      actorEmail: 'anh.nh@kyanon.digital',
      actorType: 'PLATFORM_ADMIN',
      tenantName,
      resourceType,
      resourceId,
      resourceName,
      result: 'SUCCESS',
      source: 'WEB',
      ipAddress: '118.69.182.201',
      requestId: `req-${Math.random().toString(36).substring(2, 10)}`,
      traceId: `trace-${Math.random().toString(36).substring(2, 10)}`,
      changes
    };
    setAuditLogs((prev) => [newLog, ...prev]);
  };

  // Navigation Helper
  const navigateTo = (tab: PrimaryTab, subTab?: string, detailId?: string) => {
    setPrimaryTab(tab);
    if (tab === 'platform' && subTab) setPlatformSubTab(subTab as PlatformSubTab);
    if (tab === 'monitoring' && subTab) setMonitoringSubTab(subTab as MonitoringSubTab);
    if (tab === 'security' && subTab) setSecuritySubTab(subTab as SecuritySubTab);
    if (tab === 'tenants') setSelectedTenantId(detailId || null);
    if (tab === 'platform' && subTab === 'admins') setSelectedAdminId(detailId || null);
  };

  // ===============================================
  // REAL-TIME SIMULATION TICKER
  // ===============================================
  useEffect(() => {
    if (!isLiveSimulationActive) return;

    const interval = setInterval(() => {
      setLastUpdatedTime(new Date().toLocaleTimeString());

      // 1. Randomly fluctuate service ping ms
      setServices((prev) =>
        prev.map((s) => ({
          ...s,
          responseTimeMs: Math.max(2, s.responseTimeMs + Math.floor(Math.random() * 7) - 3)
        }))
      );

      // 2. Increment active tenant event statistics slightly
      setTenants((prev) =>
        prev.map((t) => {
          if (t.status === 'ACTIVE') {
            return {
              ...t,
              statistics: {
                ...t.statistics,
                eventsCount: t.statistics.eventsCount + Math.floor(Math.random() * 15)
              },
              lastActivityAt: new Date().toISOString()
            };
          }
          return t;
        })
      );

      // 3. Fluctuate Edge CPUs
      setEdgeDevices((prev) =>
        prev.map((e) => {
          if (e.status === 'ONLINE') {
            const cpuDelta = Math.floor(Math.random() * 5) - 2;
            return {
              ...e,
              cpuPercent: Math.min(98, Math.max(15, e.cpuPercent + cpuDelta))
            };
          }
          return e;
        })
      );
    }, 4000);

    return () => clearInterval(interval);
  }, [isLiveSimulationActive]);

  // ===============================================
  // TENANT HANDLERS
  // ===============================================
  const createTenant = (tenantData: Partial<Tenant>, adminData: any) => {
    const newId = `t-00${tenants.length + 1}`;
    const newTenant: Tenant = {
      id: newId,
      name: tenantData.name || 'New Organization',
      code: (tenantData.code || 'NEW-TENANT').toUpperCase(),
      email: tenantData.email || 'contact@newtenant.com',
      phone: tenantData.phone || '+84 28 0000 0000',
      timezone: tenantData.timezone || 'Asia/Ho_Chi_Minh',
      status: 'ACTIVE',
      administrator: {
        id: `u-${newId}-admin`,
        name: adminData.name || 'Tenant Administrator',
        email: adminData.email || 'admin@newtenant.com',
        phone: adminData.phone
      },
      statistics: {
        usersCount: 1,
        vehiclesCount: 0,
        camerasCount: 0,
        gatesCount: 0,
        edgeDevicesCount: 0,
        eventsCount: 0,
        storageUsedGb: 0.1
      },
      createdAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString()
    };

    setTenants((prev) => [newTenant, ...prev]);
    pushAuditLog(
      'TENANT_MANAGEMENT',
      'TENANT_CREATED',
      'TENANT',
      newTenant.id,
      newTenant.name,
      newTenant.name
    );

    addToast({
      type: 'success',
      title: 'Tenant Created',
      description: `Organization ${newTenant.name} (${newTenant.code}) has been provisioned successfully.`
    });
  };

  const updateTenant = (id: string, updateData: Partial<Tenant>) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updateData } : t))
    );
    const target = tenants.find((t) => t.id === id);
    pushAuditLog(
      'TENANT_MANAGEMENT',
      'TENANT_UPDATED',
      'TENANT',
      id,
      target?.name,
      target?.name
    );

    addToast({
      type: 'success',
      title: 'Tenant Details Updated',
      description: `Updated configuration for ${target?.name || id}.`
    });
  };

  const setTenantStatus = (id: string, status: TenantStatus, reason?: string) => {
    setTenants((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status } : t))
    );
    const target = tenants.find((t) => t.id === id);
    pushAuditLog(
      'TENANT_MANAGEMENT',
      `TENANT_STATUS_${status}`,
      'TENANT',
      id,
      target?.name,
      target?.name,
      [{ field: 'status', before: target?.status, after: status }]
    );

    addToast({
      type: status === 'ACTIVE' ? 'success' : 'warning',
      title: `Tenant Lifecycle: ${status}`,
      description: `${target?.name || id} status changed to ${status}.${reason ? ` Reason: ${reason}` : ''}`
    });
  };

  // ===============================================
  // ADMIN HANDLERS
  // ===============================================
  const createAdmin = (adminData: Partial<PlatformAdmin>) => {
    const newAdmin: PlatformAdmin = {
      id: `pa-00${admins.length + 1}`,
      name: adminData.name || 'Platform Admin',
      email: adminData.email || 'admin@platform.internal',
      role: adminData.role || 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      mfaEnabled: true,
      mfaConfiguredAt: new Date().toISOString(),
      lastLoginAt: 'Never',
      createdAt: new Date().toISOString(),
      failedLoginAttempts: 0
    };

    setAdmins((prev) => [newAdmin, ...prev]);
    pushAuditLog('PLATFORM_ADMIN', 'ADMIN_ACCOUNT_CREATED', 'ADMIN', newAdmin.id, newAdmin.name);

    addToast({
      type: 'success',
      title: 'Administrator Account Created',
      description: `Created platform admin account for ${newAdmin.email}.`
    });
  };

  const updateAdmin = (id: string, updateData: Partial<PlatformAdmin>) => {
    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, ...updateData } : a)));
    pushAuditLog('PLATFORM_ADMIN', 'ADMIN_ACCOUNT_UPDATED', 'ADMIN', id);
    addToast({
      type: 'success',
      title: 'Administrator Profile Updated',
      description: `Saved changes for administrator ${id}.`
    });
  };

  const disableAdmin = (id: string, reason?: string) => {
    // Safety check: Cannot disable last active Platform Admin
    const activeAdmins = admins.filter((a) => a.status === 'ACTIVE' && a.role === 'PLATFORM_ADMIN');
    if (activeAdmins.length <= 1 && activeAdmins.some((a) => a.id === id)) {
      addToast({
        type: 'error',
        title: 'Operation Rejected',
        description: 'Cannot disable the last remaining active Platform Administrator account.'
      });
      return;
    }

    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, status: 'DISABLED' } : a)));
    const target = admins.find((a) => a.id === id);
    pushAuditLog('PLATFORM_ADMIN', 'ADMIN_ACCOUNT_DISABLED', 'ADMIN', id, target?.name);

    // Also revoke active sessions for this admin
    setSessions((prev) => prev.filter((s) => s.userId !== id));

    addToast({
      type: 'warning',
      title: 'Administrator Disabled',
      description: `${target?.name || id} disabled and active sessions revoked.`
    });
  };

  const resetAdminMfa = (id: string) => {
    setAdmins((prev) => prev.map((a) => (a.id === id ? { ...a, mfaEnabled: false } : a)));
    const target = admins.find((a) => a.id === id);
    pushAuditLog('SECURITY', 'MFA_RESET_PERFORMED', 'ADMIN', id, target?.name);

    addToast({
      type: 'info',
      title: 'MFA Configuration Reset',
      description: `MFA secret reset for ${target?.name || id}. User must re-enroll on next login.`
    });
  };

  // ===============================================
  // FEATURE FLAGS & SETTINGS
  // ===============================================
  const toggleFeatureFlag = (id: string) => {
    setFeatureFlags((prev) =>
      prev.map((f) => {
        if (f.id === id) {
          const nextState = !f.enabled;
          pushAuditLog('CONFIGURATION', 'FEATURE_FLAG_TOGGLED', 'FEATURE_FLAG', id, f.name, undefined, [
            { field: 'enabled', before: f.enabled, after: nextState }
          ]);
          return {
            ...f,
            enabled: nextState,
            updatedAt: new Date().toISOString()
          };
        }
        return f;
      })
    );

    const target = featureFlags.find((f) => f.id === id);
    addToast({
      type: 'info',
      title: 'Feature Flag Toggled',
      description: `${target?.key} is now ${!target?.enabled ? 'ENABLED' : 'DISABLED'}.`
    });
  };

  const updateSettings = (section: SettingsSection, newSettings: any) => {
    setSettings((prev) => ({
      ...prev,
      [section]: {
        ...prev[section],
        ...newSettings
      }
    }));

    pushAuditLog('CONFIGURATION', `SETTINGS_SECTION_UPDATED_${section.toUpperCase()}`, 'SETTINGS', section);

    addToast({
      type: 'success',
      title: 'Platform Settings Saved',
      description: `Global ${section} configuration updated successfully.`
    });
  };

  // ===============================================
  // INCIDENTS & SECURITY ALERTS
  // ===============================================
  const acknowledgeIncident = (id: string, assignedTo?: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              status: 'ACKNOWLEDGED',
              assignedTo: assignedTo || 'anh.nh@kyanon.digital',
              updatedAt: new Date().toISOString()
            }
          : inc
      )
    );

    pushAuditLog('MONITORING', 'INCIDENT_ACKNOWLEDGED', 'INCIDENT', id);
    addToast({
      type: 'info',
      title: 'Operational Incident Acknowledged',
      description: `Incident ${id} marked as Acknowledged.`
    });
  };

  const resolveIncident = (id: string, note?: string) => {
    setIncidents((prev) =>
      prev.map((inc) =>
        inc.id === id
          ? {
              ...inc,
              status: 'RESOLVED',
              resolutionNote: note || 'Resolved by Platform Administrator',
              updatedAt: new Date().toISOString()
            }
          : inc
      )
    );

    pushAuditLog('MONITORING', 'INCIDENT_RESOLVED', 'INCIDENT', id);
    addToast({
      type: 'success',
      title: 'Incident Resolved',
      description: `Incident ${id} marked as Resolved.`
    });
  };

  const acknowledgeAlert = (id: string) => {
    setSecurityAlerts((prev) =>
      prev.map((al) => (al.id === id ? { ...al, status: 'ACKNOWLEDGED' } : al))
    );
    pushAuditLog('SECURITY', 'SECURITY_ALERT_ACKNOWLEDGED', 'SECURITY_ALERT', id);
    addToast({
      type: 'info',
      title: 'Security Alert Acknowledged',
      description: `Alert ${id} acknowledged.`
    });
  };

  const resolveAlert = (id: string) => {
    setSecurityAlerts((prev) =>
      prev.map((al) => (al.id === id ? { ...al, status: 'RESOLVED' } : al))
    );
    pushAuditLog('SECURITY', 'SECURITY_ALERT_RESOLVED', 'SECURITY_ALERT', id);
    addToast({
      type: 'success',
      title: 'Security Threat Resolved',
      description: `Security alert ${id} marked as Resolved.`
    });
  };

  // ===============================================
  // SESSIONS & CREDENTIALS
  // ===============================================
  const revokeSession = (id: string) => {
    const session = sessions.find((s) => s.id === id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    pushAuditLog('SECURITY', 'SESSION_REVOKED', 'SESSION', id, session?.userName);

    addToast({
      type: 'warning',
      title: 'Session Revoked',
      description: `Active session for ${session?.userEmail || id} was terminated.`
    });
  };

  const revokeAllUserSessions = (userId: string) => {
    setSessions((prev) => prev.filter((s) => s.userId !== userId));
    pushAuditLog('SECURITY', 'ALL_USER_SESSIONS_REVOKED', 'USER', userId);

    addToast({
      type: 'warning',
      title: 'All User Sessions Terminated',
      description: `All active device sessions for user ${userId} were revoked.`
    });
  };

  const rotateCredential = (id: string) => {
    setCredentials((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              keyPrefix: `${c.keyPrefix.substring(0, 8)}_rot_${Math.random().toString(36).substring(2, 6)}`,
              createdAt: new Date().toISOString()
            }
          : c
      )
    );

    pushAuditLog('CREDENTIAL', 'API_CREDENTIAL_ROTATED', 'CREDENTIAL', id);
    addToast({
      type: 'success',
      title: 'API Credential Rotated',
      description: `Rotated key for credential ${id}. Old keys remain in grace period.`
    });
  };

  const revokeCredential = (id: string) => {
    setCredentials((prev) =>
      prev.map((c) => (c.id === id ? { ...c, status: 'REVOKED' } : c))
    );

    pushAuditLog('CREDENTIAL', 'API_CREDENTIAL_REVOKED', 'CREDENTIAL', id);
    addToast({
      type: 'error',
      title: 'API Credential Revoked',
      description: `Credential ${id} has been permanently revoked.`
    });
  };

  // ===============================================
  // TENANT ADMIN ACTIONS & HANDLERS
  // ===============================================
  const refreshTenantDashboard = () => {
    setIsTenantRefreshing(true);
    setTimeout(() => {
      setLastUpdatedTime(new Date().toLocaleTimeString());
      setIsTenantRefreshing(false);
      addToast({
        type: 'success',
        title: 'Dashboard Refreshed',
        description: 'Latest telemetry and access events synchronized with edge nodes.'
      });
    }, 600);
  };

  // Tenant Live Access Simulation Ticker
  useEffect(() => {
    if (!isLiveSimulationActive) return;

    const samplePlates = [
      { plate: '51G-882.19', type: 'Sedan', model: 'Mazda 3', color: 'Soul Red', owner: 'Vuong Dinh Hue', role: 'EMPLOYEE', rule: 'Employee Standard Access · 24/7 Gate IN-01', lane: 'Lane 01 (Inbound Main)' },
      { plate: '29C-445.67', type: 'Van', model: 'Ford Transit', color: 'Silver', owner: 'FastDelivery Express', role: 'CONTRACTOR', rule: 'Contractor Authorized Delivery Access', lane: 'Lane 01 (Inbound Main)' },
      { plate: '30E-999.01', type: 'Luxury SUV', model: 'Porsche Cayenne', color: 'White', owner: 'Pham Nhat Linh', role: 'VIP', rule: 'Executive Priority All-Gate Pass', lane: 'Lane 02 (VIP FastTrack)' },
      { plate: '61A-234.88', type: 'Sedan', model: 'Hyundai Elantra', color: 'Black', owner: 'Guest Driver', role: 'VISITOR', rule: 'Visitor Day Ticket', lane: 'Lane 01 (Inbound Main)' },
      { plate: '50H-112.33', type: 'Hatchback', model: 'VinFast VF5', color: 'Blue', owner: 'Nguyen Thi Ha', role: 'EMPLOYEE', rule: 'Employee Standard Access · 24/7 Gate IN-01', lane: 'Lane 03 (Outbound FastPass)' }
    ];

    const interval = setInterval(() => {
      const isAllowed = Math.random() > 0.08;
      const sample = samplePlates[Math.floor(Math.random() * samplePlates.length)];
      const targetSite = tenantSites[0] || { id: 'site-001', name: 'Main Campus Facility' };
      const now = new Date();
      const timeFormatted = now.toTimeString().split(' ')[0];

      const newEvent: AccessEvent = {
        id: `evt-${Date.now()}`,
        timestamp: now.toISOString(),
        timeFormatted,
        plate: sample.plate,
        plateConfidence: Number((0.94 + Math.random() * 0.058).toFixed(3)),
        detectionConfidence: Number((0.92 + Math.random() * 0.07).toFixed(3)),
        siteId: targetSite.id,
        siteName: targetSite.name,
        gateId: `gate-mc-01`,
        gateName: `Entrance Gate 01`,
        laneName: sample.lane || `Lane 01 (Inbound Main)`,
        direction: Math.random() > 0.3 ? 'IN' : 'OUT',
        decision: isAllowed ? 'ALLOWED' : (Math.random() > 0.5 ? 'DENIED' : 'UNKNOWN'),
        vehicleType: sample.type,
        vehicleModel: sample.model,
        vehicleColor: sample.color,
        ownerName: sample.owner,
        ownerType: sample.role as any,
        accessRule: sample.rule,
        reason: isAllowed ? `Plate verified against active ${sample.role} roster.` : 'Unregistered plate / verification threshold check.',
        verifiedBy: 'Edge AI OCR Engine v4.2'
      };

      setAccessEvents(prev => [newEvent, ...prev.slice(0, 19)]);

      // Update counters
      setTenantSummary(prev => ({
        ...prev,
        accessToday: {
          ...prev.accessToday,
          total: prev.accessToday.total + 1,
          allowed: prev.accessToday.allowed + (newEvent.decision === 'ALLOWED' ? 1 : 0),
          denied: prev.accessToday.denied + (newEvent.decision === 'DENIED' ? 1 : 0),
          unknown: prev.accessToday.unknown + (newEvent.decision === 'UNKNOWN' ? 1 : 0)
        }
      }));

      // Update site access count
      setTenantSites(prev =>
        prev.map(s => s.id === targetSite.id ? { ...s, todayAccessCount: s.todayAccessCount + 1 } : s)
      );

    }, 8000);

    return () => clearInterval(interval);
  }, [isLiveSimulationActive, tenantSites]);

  const addTenantSite = (siteData: Partial<TenantSite>) => {
    const newSiteId = `site-00${tenantSites.length + 1}`;
    const newSite: TenantSite = {
      id: newSiteId,
      name: siteData.name || 'New Facility Site',
      code: (siteData.code || `SITE-0${tenantSites.length + 1}`).toUpperCase(),
      tenantId: 't-001',
      tenantName: 'Acme Parking Systems',
      address: siteData.address || 'District 1, Ho Chi Minh City',
      status: (siteData.status as any) || 'HEALTHY',
      cameraCount: siteData.cameraCount || 4,
      onlineCameraCount: siteData.onlineCameraCount || siteData.cameraCount || 4,
      gateCount: siteData.gateCount || 2,
      onlineGateCount: siteData.onlineGateCount || siteData.gateCount || 2,
      edgeDeviceCount: siteData.edgeDeviceCount || 1,
      onlineEdgeDeviceCount: siteData.onlineEdgeDeviceCount || 1,
      vehicleCount: 0,
      todayAccessCount: 0,
      lanesCount: siteData.lanesCount || 2,
      operatingHours: siteData.operatingHours || '24/7 Operations',
      capacity: siteData.capacity || 400,
      currentOccupancy: 0,
      createdAt: new Date().toISOString(),
      description: siteData.description || 'Facility managed under tenant access control system.',
      managerName: siteData.managerName || 'Operations Lead',
      managerPhone: siteData.managerPhone || '+84 90 000 0000'
    };

    setTenantSites(prev => [...prev, newSite]);
    setTenantSummary(prev => ({
      ...prev,
      sites: {
        ...prev.sites,
        total: prev.sites.total + 1,
        active: prev.sites.active + 1
      },
      cameras: {
        ...prev.cameras,
        total: prev.cameras.total + newSite.cameraCount,
        online: prev.cameras.online + newSite.onlineCameraCount
      },
      gates: {
        ...prev.gates,
        total: prev.gates.total + newSite.gateCount,
        online: prev.gates.online + newSite.onlineGateCount
      }
    }));

    addToast({
      type: 'success',
      title: 'Site Added Successfully',
      description: `Site "${newSite.name}" (${newSite.code}) created and synced with edge controllers.`
    });
  };

  const updateTenantSite = (siteId: string, siteData: Partial<TenantSite>) => {
    setTenantSites(prev => prev.map(s => s.id === siteId ? { ...s, ...siteData } : s));
    addToast({
      type: 'success',
      title: 'Site Configuration Saved',
      description: `Updated configuration for site ${siteId}.`
    });
  };

  const deleteTenantSite = (siteId: string) => {
    const site = tenantSites.find(s => s.id === siteId);
    setTenantSites(prev => prev.filter(s => s.id !== siteId));
    setTenantSummary(prev => ({
      ...prev,
      sites: {
        ...prev.sites,
        total: Math.max(0, prev.sites.total - 1),
        active: site?.status !== 'INACTIVE' ? Math.max(0, prev.sites.active - 1) : prev.sites.active
      }
    }));
    addToast({
      type: 'warning',
      title: 'Site Removed',
      description: `Site ${site?.name || siteId} was removed from the active topology.`
    });
  };

  const resolveTenantAlert = (alertId: string) => {
    setTenantAlerts(prev => prev.filter(a => a.id !== alertId));
    addToast({
      type: 'success',
      title: 'Alert Resolved',
      description: 'The alert has been dismissed and marked as resolved.'
    });
  };

  const triggerGateCommand = (gateId: string, command: 'OPEN' | 'CLOSE' | 'LOCK' | 'RESET') => {
    addToast({
      type: command === 'OPEN' ? 'success' : command === 'LOCK' ? 'warning' : 'info',
      title: `Gate Command Sent: ${command}`,
      description: `Relay instruction ${command} dispatched to Gate [${gateId}] via MQTT/Edge.`
    });
  };

  const simulateNewAccessEvent = (customEvent?: Partial<AccessEvent>) => {
    const now = new Date();
    const newEvent: AccessEvent = {
      id: `evt-${Date.now()}`,
      timestamp: now.toISOString(),
      timeFormatted: now.toTimeString().split(' ')[0],
      plate: customEvent?.plate || '51K-999.88',
      plateConfidence: 0.992,
      detectionConfidence: 0.981,
      siteId: customEvent?.siteId || tenantSites[0].id,
      siteName: customEvent?.siteName || tenantSites[0].name,
      gateId: customEvent?.gateId || 'gate-mc-01',
      gateName: customEvent?.gateName || 'Gate IN-01 Main',
      laneName: 'Lane IN-01 (Automated)',
      direction: customEvent?.direction || 'IN',
      decision: customEvent?.decision || 'ALLOWED',
      vehicleType: 'Sedan',
      vehicleModel: 'Mercedes-Benz E300',
      vehicleColor: 'Obsidian Black',
      ownerName: 'VIP Executive',
      ownerType: 'VIP',
      accessRule: 'Executive Priority All-Gate Pass',
      reason: 'Manual test trigger or VIP instant authentication',
      verifiedBy: 'Edge AI OCR Engine v4.2',
      ...customEvent
    };

    setAccessEvents(prev => [newEvent, ...prev.slice(0, 19)]);
    setTenantSummary(prev => ({
      ...prev,
      accessToday: {
        ...prev.accessToday,
        total: prev.accessToday.total + 1,
        allowed: prev.accessToday.allowed + (newEvent.decision === 'ALLOWED' ? 1 : 0),
        denied: prev.accessToday.denied + (newEvent.decision === 'DENIED' ? 1 : 0),
        unknown: prev.accessToday.unknown + (newEvent.decision === 'UNKNOWN' ? 1 : 0)
      }
    }));
    addToast({
      type: 'info',
      title: 'Simulated Access Event',
      description: `Event recorded for vehicle plate ${newEvent.plate} (${newEvent.decision}).`
    });
  };

  const addRegisteredVehicle = (vehicleData: { plate: string; ownerName: string; model: string; type: string; siteId?: string }) => {
    const formattedPlate = vehicleData.plate.toUpperCase().trim();
    const newReg: RegisteredVehicle = {
      id: `veh-${Date.now()}`,
      plate: formattedPlate,
      ownerName: vehicleData.ownerName,
      model: vehicleData.model || 'Standard Vehicle',
      type: vehicleData.type || 'Sedan',
      status: 'ACTIVE',
      registeredAt: new Date().toISOString().split('T')[0]
    };
    setRegisteredVehicles(prev => [newReg, ...prev]);

    // Also register in modern tenantVehicles collection
    createTenantVehicle({
      type: (vehicleData.type as any) || 'CAR',
      make: vehicleData.model.split(' ')[0] || 'Generic',
      model: vehicleData.model || 'Standard Vehicle',
      licensePlate: {
        number: formattedPlate,
        country: 'Vietnam',
        province: 'Ho Chi Minh City'
      }
    });
  };

  const createTenantVehicle = (vehicleData: {
    type: VehicleType;
    make: string;
    model: string;
    year?: number;
    color?: string;
    vin?: string;
    description?: string;
    memberId?: string | null;
    licensePlate: {
      number: string;
      country?: string;
      province?: string;
    };
  }): { success: boolean; vehicle?: TenantVehicle; message?: string } => {
    const normalizedPlate = vehicleData.licensePlate.number.toUpperCase().replace(/\s+/g, '-').trim();

    // Check duplicate plate among active/non-archived vehicles
    const duplicate = tenantVehicles.find(
      v => v.status !== 'ARCHIVED' && v.currentPlate.normalizedPlate === normalizedPlate
    );

    if (duplicate) {
      addToast({
        type: 'error',
        title: 'License Plate Already Registered',
        description: `${normalizedPlate} is currently assigned to another active vehicle (${duplicate.name}).`
      });
      return {
        success: false,
        message: `License plate ${normalizedPlate} is already registered to vehicle "${duplicate.name}".`
      };
    }

    // Lookup member if provided
    let assignedMember = null;
    if (vehicleData.memberId) {
      const userWithMember = tenantUsers.find(u => u.membership?.id === vehicleData.memberId || u.id === vehicleData.memberId);
      if (userWithMember && userWithMember.membership) {
        assignedMember = {
          id: userWithMember.membership.id,
          userId: userWithMember.id,
          code: userWithMember.membership.memberCode,
          name: userWithMember.membership.fullName || userWithMember.name,
          email: userWithMember.membership.email || userWithMember.email,
          phone: userWithMember.membership.phone || userWithMember.phone,
          department: userWithMember.membership.department,
          type: userWithMember.membership.type,
          status: userWithMember.membership.status
        };
      }
    }

    const vehicleId = `veh-${Date.now()}`;
    const nowIso = new Date().toISOString();
    const vehicleName = `${vehicleData.make} ${vehicleData.model}`.trim();

    const newVehicle: TenantVehicle = {
      id: vehicleId,
      tenantId: 'tenant-001',
      name: vehicleName,
      make: vehicleData.make,
      model: vehicleData.model,
      year: vehicleData.year || new Date().getFullYear(),
      color: vehicleData.color || 'White',
      vin: vehicleData.vin,
      type: vehicleData.type,
      status: 'ACTIVE',
      description: vehicleData.description,
      currentPlate: {
        id: `plt-${Date.now()}`,
        number: normalizedPlate,
        normalizedPlate,
        country: vehicleData.licensePlate.country || 'Vietnam',
        province: vehicleData.licensePlate.province || 'Ho Chi Minh City',
        status: 'ACTIVE',
        validFrom: nowIso.split('T')[0],
        registeredAt: nowIso
      },
      previousPlates: [],
      memberId: assignedMember ? assignedMember.id : null,
      member: assignedMember,
      accessStatus: assignedMember?.status === 'SUSPENDED' ? 'DENIED' : 'ALLOWED',
      accessStatusReason: assignedMember
        ? `Registered to ${assignedMember.name} (${assignedMember.code}) with active whitelist privileges.`
        : 'Registered organization / fleet vehicle with automatic entry authorization.',
      appliedRules: ['Standard Working Hours Access'],
      assignmentHistory: assignedMember
        ? [
            {
              id: `asg-${Date.now()}`,
              memberId: assignedMember.id,
              memberName: assignedMember.name,
              memberCode: assignedMember.code,
              assignedAt: nowIso,
              assignedBy: 'Anthony Nguyen (Tenant Admin)'
            }
          ]
        : [],
      auditHistory: [
        {
          id: `aud-${Date.now()}-1`,
          vehicleId,
          action: 'VEHICLE_CREATED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: `Created vehicle ${vehicleName} with plate ${normalizedPlate}.`,
          timestamp: nowIso
        },
        ...(assignedMember
          ? [
              {
                id: `aud-${Date.now()}-2`,
                vehicleId,
                action: 'VEHICLE_ASSIGNED' as const,
                actorName: 'Anthony Nguyen',
                actorRole: 'Tenant Admin',
                description: `Assigned vehicle to ${assignedMember.name} (${assignedMember.code}).`,
                timestamp: nowIso
              }
            ]
          : [])
      ],
      createdAt: nowIso,
      updatedAt: nowIso
    };

    setTenantVehicles(prev => [newVehicle, ...prev]);

    // Keep summary KPI counters in sync
    setTenantSummary(prev => ({
      ...prev,
      vehicles: {
        ...prev.vehicles,
        total: prev.vehicles.total + 1,
        active: prev.vehicles.active + 1,
        newThisMonth: prev.vehicles.newThisMonth + 1
      }
    }));

    addToast({
      type: 'success',
      title: 'Vehicle Registered Successfully',
      description: `${newVehicle.name} (${normalizedPlate}) is now operational and synced to edge gates.`
    });

    return { success: true, vehicle: newVehicle };
  };

  const updateTenantVehicle = (vehicleId: string, data: Partial<TenantVehicle>) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const updatedName = data.make && data.model ? `${data.make} ${data.model}` : data.name || v.name;
        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_UPDATED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: `Updated vehicle information for ${updatedName}.`,
          timestamp: nowIso
        };

        return {
          ...v,
          ...data,
          name: updatedName,
          updatedAt: nowIso,
          auditHistory: [newAuditItem, ...(v.auditHistory || [])]
        };
      })
    );

    addToast({
      type: 'success',
      title: 'Vehicle Updated',
      description: 'Vehicle specifications and properties updated successfully.'
    });
  };

  const assignVehicleMember = (vehicleId: string, memberId: string | null) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        let assignedMember = null;
        if (memberId) {
          const userWithMember = tenantUsers.find(u => u.membership?.id === memberId || u.id === memberId);
          if (userWithMember && userWithMember.membership) {
            assignedMember = {
              id: userWithMember.membership.id,
              userId: userWithMember.id,
              code: userWithMember.membership.memberCode,
              name: userWithMember.membership.fullName || userWithMember.name,
              email: userWithMember.membership.email || userWithMember.email,
              phone: userWithMember.membership.phone || userWithMember.phone,
              department: userWithMember.membership.department,
              type: userWithMember.membership.type,
              status: userWithMember.membership.status
            };
          }
        }

        const prevAssignment = v.assignmentHistory && v.assignmentHistory[0];
        const newAssignmentHistory = assignedMember
          ? [
              {
                id: `asg-${Date.now()}`,
                memberId: assignedMember.id,
                memberName: assignedMember.name,
                memberCode: assignedMember.code,
                assignedAt: nowIso,
                assignedBy: 'Anthony Nguyen (Tenant Admin)'
              },
              ...(v.assignmentHistory || [])
            ]
          : (v.assignmentHistory || []);

        const auditAction = assignedMember ? 'VEHICLE_ASSIGNED' : 'VEHICLE_UNASSIGNED';
        const auditDesc = assignedMember
          ? `Assigned vehicle ${v.name} to ${assignedMember.name} (${assignedMember.code}).`
          : `Unassigned vehicle ${v.name} (moved to organization fleet / unassigned pool).`;

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: auditAction,
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: auditDesc,
          timestamp: nowIso
        };

        // Determine new access status based on vehicle status & member status
        let newAccessStatus = v.accessStatus;
        let newReason = v.accessStatusReason;
        if (v.status === 'SUSPENDED') {
          newAccessStatus = 'DENIED';
          newReason = 'Vehicle status is SUSPENDED. Overrides normal allow rules.';
        } else if (assignedMember && assignedMember.status === 'SUSPENDED') {
          newAccessStatus = 'DENIED';
          newReason = `Associated member ${assignedMember.name} is SUSPENDED.`;
        } else if (v.status === 'ACTIVE') {
          newAccessStatus = 'ALLOWED';
          newReason = assignedMember
            ? `Assigned to ${assignedMember.name} with active permit.`
            : 'Unassigned organization vehicle with gate permit.';
        }

        return {
          ...v,
          memberId: assignedMember ? assignedMember.id : null,
          member: assignedMember,
          accessStatus: newAccessStatus,
          accessStatusReason: newReason,
          assignmentHistory: newAssignmentHistory,
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'success',
      title: memberId ? 'Member Assigned' : 'Vehicle Unassigned',
      description: memberId
        ? 'Vehicle ownership successfully reassigned and access policy updated.'
        : 'Vehicle marked as unassigned / organization pool.'
    });
  };

  const suspendTenantVehicle = (vehicleId: string, reason: string) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_SUSPENDED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: `Suspended vehicle: ${reason}`,
          reason,
          timestamp: nowIso
        };

        return {
          ...v,
          status: 'SUSPENDED',
          suspendedReason: reason,
          suspendedAt: nowIso,
          accessStatus: 'DENIED',
          accessStatusReason: `Vehicle is SUSPENDED: ${reason}. Gate access denied.`,
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'warning',
      title: 'Vehicle Suspended',
      description: 'Vehicle access is now blocked at all facility gates.'
    });
  };

  const activateTenantVehicle = (vehicleId: string) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const isMemberSuspended = v.member && v.member.status === 'SUSPENDED';
        const newAccessStatus: VehicleAccessStatus = isMemberSuspended ? 'DENIED' : 'ALLOWED';
        const newReason = isMemberSuspended
          ? `Vehicle reactivated, but associated member ${v.member?.name} remains suspended.`
          : 'Vehicle reactivated. Normal access policies apply.';

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_ACTIVATED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: 'Reactivated vehicle and restored access eligibility.',
          timestamp: nowIso
        };

        return {
          ...v,
          status: 'ACTIVE',
          suspendedReason: undefined,
          suspendedAt: undefined,
          accessStatus: newAccessStatus,
          accessStatusReason: newReason,
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'success',
      title: 'Vehicle Reactivated',
      description: 'Vehicle is now active and eligible for normal access rules.'
    });
  };

  const deactivateTenantVehicle = (vehicleId: string) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_DEACTIVATED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: 'Deactivated vehicle registration.',
          timestamp: nowIso
        };

        return {
          ...v,
          status: 'INACTIVE',
          accessStatus: 'DENIED',
          accessStatusReason: 'Vehicle is INACTIVE. Historical records preserved.',
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'info',
      title: 'Vehicle Deactivated',
      description: 'Vehicle marked inactive. Historical access logs remain preserved.'
    });
  };

  const archiveTenantVehicle = (vehicleId: string) => {
    const nowIso = new Date().toISOString();
    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_ARCHIVED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: 'Archived vehicle record.',
          timestamp: nowIso
        };

        return {
          ...v,
          status: 'ARCHIVED',
          accessStatus: 'DENIED',
          accessStatusReason: 'Vehicle is ARCHIVED.',
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'info',
      title: 'Vehicle Archived',
      description: 'Vehicle decommissioned and moved to archive.'
    });
  };

  const registerVehicleLicensePlate = (
    vehicleId: string,
    newPlate: { number: string; country?: string; province?: string }
  ): { success: boolean; message?: string } => {
    const normalizedNumber = newPlate.number.toUpperCase().replace(/\s+/g, '-').trim();

    // Check duplicate active plate
    const duplicate = tenantVehicles.find(
      v => v.id !== vehicleId && v.status !== 'ARCHIVED' && v.currentPlate.normalizedPlate === normalizedNumber
    );

    if (duplicate) {
      addToast({
        type: 'error',
        title: 'License Plate Already Registered',
        description: `${normalizedNumber} is currently assigned to another vehicle (${duplicate.name}).`
      });
      return { success: false, message: `Plate ${normalizedNumber} is already registered to "${duplicate.name}".` };
    }

    const nowIso = new Date().toISOString();

    setTenantVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;

        const oldPlate = v.currentPlate;
        const retiredOldPlate: VehicleLicensePlate = {
          ...oldPlate,
          status: 'REPLACED',
          validTo: nowIso.split('T')[0],
          notes: `Replaced by ${normalizedNumber} on ${nowIso.split('T')[0]}`
        };

        const newActivePlate: VehicleLicensePlate = {
          id: `plt-${Date.now()}`,
          number: normalizedNumber,
          normalizedPlate: normalizedNumber,
          country: newPlate.country || 'Vietnam',
          province: newPlate.province || 'Ho Chi Minh City',
          status: 'ACTIVE',
          validFrom: nowIso.split('T')[0],
          registeredAt: nowIso
        };

        const newAuditItem: any = {
          id: `aud-${Date.now()}`,
          vehicleId,
          action: 'VEHICLE_PLATE_UPDATED',
          actorName: 'Anthony Nguyen',
          actorRole: 'Tenant Admin',
          description: `Changed active license plate from ${oldPlate.number} to ${normalizedNumber}.`,
          timestamp: nowIso
        };

        return {
          ...v,
          currentPlate: newActivePlate,
          previousPlates: [retiredOldPlate, ...(v.previousPlates || [])],
          auditHistory: [newAuditItem, ...(v.auditHistory || [])],
          updatedAt: nowIso
        };
      })
    );

    addToast({
      type: 'success',
      title: 'License Plate Updated',
      description: `Active plate updated to ${normalizedNumber}. Previous plate moved to history.`
    });

    return { success: true };
  };

  const importTenantVehicles = (
    vehiclesToImport: Array<{
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
  ) => {
    let imported = 0;
    let duplicates = 0;

    for (const item of vehiclesToImport) {
      const res = createTenantVehicle({
        type: item.type,
        make: item.make,
        model: item.model,
        year: item.year,
        color: item.color,
        vin: item.vin,
        memberId: item.memberId,
        licensePlate: {
          number: item.plate,
          country: item.country,
          province: item.province
        }
      });

      if (res.success) {
        imported++;
      } else {
        duplicates++;
      }
    }

    addToast({
      type: 'success',
      title: 'Bulk Import Completed',
      description: `Successfully enrolled ${imported} vehicles (${duplicates} skipped due to existing plates).`
    });

    return { importedCount: imported, duplicateCount: duplicates };
  };

  const inviteTenantMember = (memberData: { name: string; email: string; role: string; siteAccess: string[] }) => {
    addToast({
      type: 'success',
      title: 'Invitation Sent',
      description: `Invitation dispatched to ${memberData.email} with role [${memberData.role}].`
    });
  };

  const updateTenantLocation = (updatedData: Partial<TenantLocation>) => {
    setTenantLocation(prev => {
      const updated = {
        ...prev,
        ...updatedData,
        updatedAt: new Date().toISOString()
      };
      // Keep tenantSites synchronized
      setTenantSites(oldSites => [
        {
          ...oldSites[0],
          name: updated.name || oldSites[0].name,
          address: updated.address ? `${updated.address.line1}, ${updated.address.city}, ${updated.address.country}` : oldSites[0].address,
          capacity: updated.capacity ?? oldSites[0].capacity,
          status: (updated.status === 'ACTIVE' ? 'HEALTHY' : 'INACTIVE') as any,
          managerName: updated.contactPerson || oldSites[0].managerName,
          managerPhone: updated.phone || oldSites[0].managerPhone
        }
      ]);
      return updated;
    });
    pushAuditLog('SECURITY', 'LOCATION_UPDATED', 'LOCATION', 'location-001', updatedData.name);
    addToast({
      type: 'success',
      title: 'Location Updated',
      description: 'Physical operating location details synchronized across system.'
    });
  };

  const updateLocationOperatingHours = (hours: OperatingHoursSchedule) => {
    setTenantLocation(prev => ({
      ...prev,
      operatingHours: hours,
      updatedAt: new Date().toISOString()
    }));
    pushAuditLog('SECURITY', 'OPERATING_HOURS_UPDATED', 'LOCATION', 'location-001');
    addToast({
      type: 'success',
      title: 'Operating Hours Saved',
      description: 'Access schedule rules and facility operating hours updated.'
    });
  };

  const toggleLocationStatus = (status: 'ACTIVE' | 'INACTIVE') => {
    setTenantLocation(prev => ({
      ...prev,
      status,
      updatedAt: new Date().toISOString()
    }));
    setTenantSites(prev => prev.map(s => ({
      ...s,
      status: (status === 'ACTIVE' ? 'HEALTHY' : 'INACTIVE') as any
    })));
    pushAuditLog(
      'SECURITY',
      status === 'ACTIVE' ? 'LOCATION_ACTIVATED' : 'LOCATION_DEACTIVATED',
      'LOCATION',
      'location-001'
    );
    addToast({
      type: status === 'ACTIVE' ? 'success' : 'warning',
      title: status === 'ACTIVE' ? 'Location Activated' : 'Location Deactivated',
      description: status === 'ACTIVE'
        ? 'Location is now operational for ANPR camera access events.'
        : 'Location disabled. Historical records and hardware configurations are preserved.'
    });
  };

  const deleteRegisteredVehicle = (id: string) => {
    setRegisteredVehicles(prev => prev.filter(v => v.id !== id));
    setTenantSummary(prev => ({
      ...prev,
      vehicles: {
        ...prev.vehicles,
        total: Math.max(0, prev.vehicles.total - 1),
        active: Math.max(0, prev.vehicles.active - 1)
      }
    }));
    addToast({
      type: 'info',
      title: 'Vehicle Removed',
      description: 'Vehicle revoked from whitelist access.'
    });
  };

  const deleteTenantMember = (id: string) => {
    setTenantMembers(prev => prev.filter(m => m.id !== id));
    addToast({
      type: 'info',
      title: 'Member Removed',
      description: 'Tenant operator access revoked.'
    });
  };

  const detectRuleConflicts = (rule: Partial<TenantAccessRule>, excludeRuleId?: string): string[] => {
    const warnings: string[] = [];
    const activeRules = tenantAccessRules.filter(r => r.id !== excludeRuleId && r.status === 'ACTIVE');

    for (const other of activeRules) {
      if (rule.priority !== undefined && other.priority === rule.priority) {
        warnings.push(`Priority Conflict: Rule "${other.name}" also has Priority #${other.priority}. Distinct priority values guarantee deterministic evaluation.`);
      }

      const sameTarget = (
        (rule.target?.type === 'ALL_VEHICLES' && other.target?.type === 'ALL_VEHICLES') ||
        (rule.target?.type === 'LICENSE_PLATE' && other.target?.type === 'LICENSE_PLATE' && rule.target.licensePlate && other.target.licensePlate && rule.target.licensePlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase() === other.target.licensePlate.replace(/[^A-Za-z0-9]/g, '').toUpperCase()) ||
        (rule.target?.type === 'SPECIFIC_VEHICLE' && other.target?.type === 'SPECIFIC_VEHICLE' && rule.target.vehicleId && rule.target.vehicleId === other.target.vehicleId) ||
        (rule.target?.type === 'MEMBER_GROUP' && other.target?.type === 'MEMBER_GROUP' && rule.target.memberGroup === other.target.memberGroup) ||
        (rule.target?.type === 'MEMBER' && other.target?.type === 'MEMBER' && rule.target.memberId === other.target.memberId)
      );

      const scopeOverlap = (
        (rule.scope?.allSites || other.scope?.allSites || (rule.scope?.siteIds || []).some(s => (other.scope?.siteIds || []).includes(s))) &&
        (rule.scope?.allGates || other.scope?.allGates || (rule.scope?.gateIds || []).some(g => (other.scope?.gateIds || []).includes(g)))
      );

      if (sameTarget && scopeOverlap && rule.action && other.action && rule.action !== other.action) {
        const higherPriority = (rule.priority || 999) < other.priority ? 'this rule' : `"${other.name}" (Priority #${other.priority})`;
        warnings.push(`Action Conflict: Target and scope overlap with "${other.name}" (${other.action} vs ${rule.action}). ${higherPriority} will take precedence during evaluation.`);
      }
    }

    return warnings;
  };

  const createTenantAccessRule = (ruleData: any): { success: boolean; rule?: TenantAccessRule; conflicts?: string[] } => {
    const nowIso = new Date().toISOString();
    const newId = `rule-${Date.now()}`;
    const code = ruleData.code ? ruleData.code.toUpperCase().replace(/\s+/g, '-') : `RULE-${Math.floor(100 + Math.random() * 900)}`;

    const newRule: TenantAccessRule = {
      id: newId,
      tenantId: 't-001',
      code,
      name: ruleData.name || 'New Access Policy Rule',
      description: ruleData.description || '',
      action: ruleData.action || 'ALLOW',
      priority: Number(ruleData.priority) || (tenantAccessRules.length > 0 ? Math.max(...tenantAccessRules.map(r => r.priority || 100)) + 10 : 10),
      status: ruleData.status || 'ACTIVE',
      target: ruleData.target || {
        type: ruleData.type || 'ALL_VEHICLES',
        licensePlate: ruleData.licensePlate,
        memberGroup: ruleData.memberGroup,
        vehicleGroup: ruleData.vehicleGroup,
        notes: ruleData.targetNotes
      },
      scope: ruleData.scope || {
        allSites: ruleData.sites?.includes('ALL') || ruleData.sites?.includes('ALL_SITES') || false,
        siteIds: ruleData.sites || ['site-001'],
        siteNames: ruleData.siteNames || ['Main Campus Facility'],
        allGates: ruleData.gates?.includes('ALL') || ruleData.gates?.includes('ALL_GATES') || false,
        gateIds: ruleData.gates || ['ALL_GATES'],
        gateNames: ruleData.gateNames || ['All Gates']
      },
      schedule: ruleData.schedule && typeof ruleData.schedule === 'object' ? ruleData.schedule : {
        type: 'ALWAYS',
        timezone: 'Asia/Ho_Chi_Minh',
        summaryText: typeof ruleData.schedule === 'string' ? ruleData.schedule : 'Always (24/7)'
      },
      advanced: ruleData.advanced || {
        minConfidence: 90,
        duplicateWindowSeconds: 5,
        failBehavior: 'DENY'
      },
      validFrom: ruleData.validFrom || nowIso,
      validUntil: ruleData.validUntil || null,
      auditHistory: [
        {
          id: `aud-r-${Date.now()}`,
          action: 'CREATED',
          timestamp: nowIso,
          actorName: currentUser?.name || 'Anthony Nguyen',
          actorEmail: currentUser?.email || 'anh.nh@kyanon.digital',
          details: `Created rule "${ruleData.name}" with action ${ruleData.action || 'ALLOW'} at Priority #${ruleData.priority || 10}.`
        }
      ],
      createdAt: nowIso,
      updatedAt: nowIso,
      type: ruleData.type || 'SCHEDULED_RULE',
      scheduleSummary: typeof ruleData.schedule === 'string' ? ruleData.schedule : (ruleData.schedule?.summaryText || 'Configured schedule'),
      sites: ruleData.scope?.siteIds || ruleData.sites || ['site-001'],
      gates: ruleData.scope?.gateIds || ruleData.gates || ['ALL'],
      actionOnMatch: ruleData.action === 'DENY' ? 'DENIED' : 'ALLOWED'
    };

    const conflicts = detectRuleConflicts(newRule);

    setTenantAccessRules(prev => [...prev, newRule].sort((a, b) => (a.priority || 999) - (b.priority || 999)));

    pushAuditLog('SECURITY', 'ACCESS_RULE_CREATED', 'ACCESS_RULE', newRule.id, newRule.name);

    addToast({
      type: 'success',
      title: 'Access Rule Created',
      description: `Rule "${newRule.name}" (#${newRule.priority}) saved and distributed to edge gateways.`
    });

    return { success: true, rule: newRule, conflicts };
  };

  const updateTenantAccessRule = (ruleId: string, ruleData: Partial<TenantAccessRule>): { success: boolean; rule?: TenantAccessRule; conflicts?: string[] } => {
    const nowIso = new Date().toISOString();
    let updatedRule: TenantAccessRule | undefined;
    const conflicts = detectRuleConflicts(ruleData, ruleId);

    setTenantAccessRules(prev =>
      prev.map(r => {
        if (r.id !== ruleId) return r;
        const newAuditItem = {
          id: `aud-r-${Date.now()}`,
          action: 'UPDATED' as const,
          timestamp: nowIso,
          actorName: currentUser?.name || 'Anthony Nguyen',
          actorEmail: currentUser?.email || 'anh.nh@kyanon.digital',
          details: `Updated rule configurations (Priority #${ruleData.priority ?? r.priority}).`
        };

        updatedRule = {
          ...r,
          ...ruleData,
          updatedAt: nowIso,
          auditHistory: [newAuditItem, ...(r.auditHistory || [])]
        };
        return updatedRule;
      }).sort((a, b) => (a.priority || 999) - (b.priority || 999))
    );

    pushAuditLog('SECURITY', 'ACCESS_RULE_UPDATED', 'ACCESS_RULE', ruleId, ruleData.name);

    addToast({
      type: 'success',
      title: 'Rule Updated',
      description: `Rule "${ruleData.name || ruleId}" configurations synchronized across edge barrier controllers.`
    });

    return { success: true, rule: updatedRule, conflicts };
  };

  const activateTenantAccessRule = (ruleId: string) => {
    const nowIso = new Date().toISOString();
    setTenantAccessRules(prev =>
      prev.map(r => {
        if (r.id !== ruleId) return r;
        const newAuditItem = {
          id: `aud-r-${Date.now()}`,
          action: 'ACTIVATED' as const,
          timestamp: nowIso,
          actorName: currentUser?.name || 'Anthony Nguyen',
          actorEmail: currentUser?.email || 'anh.nh@kyanon.digital',
          details: 'Rule status activated to ACTIVE.'
        };
        return {
          ...r,
          status: 'ACTIVE',
          updatedAt: nowIso,
          auditHistory: [newAuditItem, ...(r.auditHistory || [])]
        };
      })
    );
    addToast({
      type: 'success',
      title: 'Rule Activated',
      description: 'Access policy is now live and enforcing on edge gateways.'
    });
  };

  const deactivateTenantAccessRule = (ruleId: string) => {
    const nowIso = new Date().toISOString();
    setTenantAccessRules(prev =>
      prev.map(r => {
        if (r.id !== ruleId) return r;
        const newAuditItem = {
          id: `aud-r-${Date.now()}`,
          action: 'DEACTIVATED' as const,
          timestamp: nowIso,
          actorName: currentUser?.name || 'Anthony Nguyen',
          actorEmail: currentUser?.email || 'anh.nh@kyanon.digital',
          details: 'Rule status changed to INACTIVE.'
        };
        return {
          ...r,
          status: 'INACTIVE',
          updatedAt: nowIso,
          auditHistory: [newAuditItem, ...(r.auditHistory || [])]
        };
      })
    );
    addToast({
      type: 'warning',
      title: 'Rule Deactivated',
      description: 'Rule disabled. Edge controllers will bypass this rule during evaluation.'
    });
  };

  const duplicateTenantAccessRule = (ruleId: string): TenantAccessRule => {
    const original = tenantAccessRules.find(r => r.id === ruleId);
    const nowIso = new Date().toISOString();
    const newRule: TenantAccessRule = {
      ...(original || INITIAL_TENANT_ACCESS_RULES[0]),
      id: `rule-${Date.now()}`,
      code: `${original?.code || 'RULE'}-COPY`,
      name: `${original?.name || 'Rule'} (Copy)`,
      status: 'DRAFT',
      priority: (tenantAccessRules.length > 0 ? Math.max(...tenantAccessRules.map(r => r.priority || 100)) + 10 : 100),
      createdAt: nowIso,
      updatedAt: nowIso,
      auditHistory: [
        {
          id: `aud-r-${Date.now()}`,
          action: 'DUPLICATED' as const,
          timestamp: nowIso,
          actorName: currentUser?.name || 'Anthony Nguyen',
          actorEmail: currentUser?.email || 'anh.nh@kyanon.digital',
          details: `Duplicated from rule "${original?.name || ruleId}". Initialized as DRAFT.`
        }
      ]
    };

    setTenantAccessRules(prev => [...prev, newRule].sort((a, b) => (a.priority || 999) - (b.priority || 999)));

    addToast({
      type: 'info',
      title: 'Rule Duplicated',
      description: `Created draft clone "${newRule.name}".`
    });

    return newRule;
  };

  const reorderRulePriorities = (ruleIdsInOrder: string[]) => {
    setTenantAccessRules(prev => {
      return prev.map(r => {
        const index = ruleIdsInOrder.indexOf(r.id);
        if (index !== -1) {
          const newPriority = (index + 1) * 10;
          return { ...r, priority: newPriority, updatedAt: new Date().toISOString() };
        }
        return r;
      }).sort((a, b) => (a.priority || 999) - (b.priority || 999));
    });
    addToast({
      type: 'success',
      title: 'Rule Priorities Reordered',
      description: 'Evaluation sequence updated across all edge devices.'
    });
  };

  const deleteTenantAccessRule = (id: string) => {
    setTenantAccessRules(prev => prev.filter(r => r.id !== id));
    addToast({
      type: 'info',
      title: 'Rule Deleted',
      description: 'Access rule removed from edge gate policies.'
    });
  };

  const simulateAccessDecision = ({
    plate,
    siteId,
    gateId,
    timestamp
  }: {
    plate: string;
    siteId: string;
    gateId: string;
    timestamp?: string;
  }): AccessRuleSimulationResult => {
    const simTime = timestamp ? new Date(timestamp) : new Date();
    const cleanPlate = plate.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

    const vehicle = tenantVehicles.find(v => {
      const vPlate = v.currentPlate?.number?.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const prevPlates = (v.previousPlates || []).map(p => p.number.toUpperCase().replace(/[^A-Z0-9]/g, ''));
      return vPlate === cleanPlate || prevPlates.includes(cleanPlate);
    });

    const member = vehicle?.member || (vehicle?.memberId ? tenantMembers.find(m => m.id === vehicle.memberId) : null);
    const memberUser = member?.userId ? tenantUsers.find(u => u.id === member.userId) : null;
    const memberGroup = member?.type || memberUser?.role || 'VISITOR';

    const currentSite = tenantSites.find(s => s.id === siteId) || tenantSites[0] || { id: siteId, name: 'Main Campus Facility' };
    const currentGate = currentSite.gates?.find((g: any) => g.id === gateId) || { id: gateId, name: 'Entrance Gate 01' };

    const daysMap: Record<number, string> = {
      0: 'SUNDAY',
      1: 'MONDAY',
      2: 'TUESDAY',
      3: 'WEDNESDAY',
      4: 'THURSDAY',
      5: 'FRIDAY',
      6: 'SATURDAY'
    };
    const currentDay = daysMap[simTime.getDay()];
    const currentHours = simTime.getHours().toString().padStart(2, '0');
    const currentMinutes = simTime.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHours}:${currentMinutes}`;

    const sortedRules = [...tenantAccessRules].sort((a, b) => (a.priority || 999) - (b.priority || 999));
    const evaluatedMatches: AccessRuleSimulationRuleMatch[] = [];
    let winningRule: TenantAccessRule | null = null;
    let winningReason = '';

    for (const rule of sortedRules) {
      if (rule.status !== 'ACTIVE') {
        evaluatedMatches.push({
          ruleId: rule.id,
          ruleCode: rule.code,
          ruleName: rule.name,
          priority: rule.priority,
          action: rule.action,
          matched: false,
          targetMatched: false,
          scopeMatched: false,
          scheduleMatched: false,
          matchReason: `Skipped: Rule is ${rule.status} (not ACTIVE).`
        });
        continue;
      }

      let targetMatched = false;
      let targetReason = '';

      switch (rule.target?.type) {
        case 'ALL_VEHICLES':
          targetMatched = true;
          targetReason = 'Matches All Vehicles policy';
          break;
        case 'LICENSE_PLATE': {
          const rulePlate = rule.target.licensePlate?.toUpperCase().replace(/[^A-Z0-9]/g, '');
          if (rulePlate && cleanPlate.includes(rulePlate)) {
            targetMatched = true;
            targetReason = `Plate ${plate} matches target ${rule.target.licensePlate}`;
          } else {
            targetReason = `Plate ${plate} does not match target plate ${rule.target.licensePlate}`;
          }
          break;
        }
        case 'SPECIFIC_VEHICLE':
          if (vehicle && (rule.target.vehicleId === vehicle.id || rule.target.licensePlate?.toUpperCase().replace(/[^A-Z0-9]/g, '') === cleanPlate)) {
            targetMatched = true;
            targetReason = `Matched specific vehicle ${vehicle.name}`;
          } else {
            targetReason = `Does not match specific vehicle target`;
          }
          break;
        case 'MEMBER':
          if (member && rule.target.memberId === member.id) {
            targetMatched = true;
            targetReason = `Matched registered member ${member.name}`;
          } else {
            targetReason = `Vehicle not assigned to member ${rule.target.memberName || rule.target.memberId}`;
          }
          break;
        case 'MEMBER_GROUP': {
          const targetGrp = rule.target.memberGroup?.toUpperCase();
          if (targetGrp && (memberGroup.toUpperCase() === targetGrp || member?.department?.toUpperCase().includes(targetGrp))) {
            targetMatched = true;
            targetReason = `Member belongs to target group ${targetGrp}`;
          } else {
            targetReason = `Member group (${memberGroup}) does not match rule target (${targetGrp})`;
          }
          break;
        }
        case 'VEHICLE_GROUP': {
          const vType = vehicle?.type?.toUpperCase();
          if (vType && rule.target.vehicleGroup?.toUpperCase() === vType) {
            targetMatched = true;
            targetReason = `Vehicle type ${vType} matches target group`;
          } else {
            targetReason = `Vehicle type does not match rule vehicle group`;
          }
          break;
        }
        case 'VISITOR':
          if (!vehicle || memberGroup === 'VISITOR') {
            targetMatched = true;
            targetReason = `Matches visitor / guest profile`;
          } else {
            targetReason = `Vehicle belongs to registered staff, not visitor`;
          }
          break;
        default:
          targetMatched = false;
          targetReason = 'Target criteria did not match';
      }

      const allSites = rule.scope?.allSites || rule.scope?.siteIds?.includes('ALL') || rule.scope?.siteIds?.includes('ALL_SITES');
      const siteMatch = allSites || (rule.scope?.siteIds && rule.scope.siteIds.includes(siteId));

      const allGates = rule.scope?.allGates || rule.scope?.gateIds?.includes('ALL') || rule.scope?.gateIds?.includes('ALL_GATES');
      const gateMatch = allGates || (rule.scope?.gateIds && rule.scope.gateIds.includes(gateId));

      const scopeMatched = Boolean(siteMatch && gateMatch);
      const scopeReason = scopeMatched
        ? `Scope matches facility & gate`
        : !siteMatch
        ? `Site does not match rule scope`
        : `Gate does not match rule scope`;

      let scheduleMatched = false;
      let scheduleReason = '';

      if (rule.schedule?.type === 'ALWAYS') {
        scheduleMatched = true;
        scheduleReason = '24/7 Always Active schedule';
      } else if (rule.schedule?.type === 'DATE_RANGE') {
        const start = rule.schedule.startDate ? `${rule.schedule.startDate}T${rule.schedule.startTime || '00:00'}` : null;
        const end = rule.schedule.endDate ? `${rule.schedule.endDate}T${rule.schedule.endTime || '23:59'}` : null;
        const currentIso = simTime.toISOString();

        if (start && end) {
          if (currentIso >= start && currentIso <= end) {
            scheduleMatched = true;
            scheduleReason = `Within valid date window (${rule.schedule.startDate} to ${rule.schedule.endDate})`;
          } else {
            scheduleReason = `Outside rule date window`;
          }
        } else {
          scheduleMatched = true;
          scheduleReason = 'Valid date range';
        }
      } else if (rule.schedule?.type === 'WEEKLY' && rule.schedule.days) {
        const dayConfig = rule.schedule.days.find(d => d.day === currentDay);
        if (!dayConfig || !dayConfig.enabled) {
          scheduleReason = `Access not permitted on ${currentDay}`;
        } else if (!dayConfig.windows || dayConfig.windows.length === 0) {
          scheduleMatched = true;
          scheduleReason = `Permitted all day on ${currentDay}`;
        } else {
          const inWindow = dayConfig.windows.some(w => currentTimeStr >= w.start && currentTimeStr <= w.end);
          if (inWindow) {
            scheduleMatched = true;
            scheduleReason = `${currentDay} within window (${dayConfig.windows.map(w => `${w.start}-${w.end}`).join(', ')})`;
          } else {
            scheduleReason = `Time ${currentTimeStr} is outside allowed window for ${currentDay}`;
          }
        }
      } else {
        scheduleMatched = true;
        scheduleReason = 'Default active schedule';
      }

      const isFullMatch = targetMatched && scopeMatched && scheduleMatched;
      const combinedReason = isFullMatch
        ? `MATCH: ${targetReason} · ${scopeReason} · ${scheduleReason}`
        : `NO MATCH: ${!targetMatched ? targetReason : !scopeMatched ? scopeReason : scheduleReason}`;

      evaluatedMatches.push({
        ruleId: rule.id,
        ruleCode: rule.code,
        ruleName: rule.name,
        priority: rule.priority,
        action: rule.action,
        matched: isFullMatch,
        targetMatched,
        scopeMatched,
        scheduleMatched,
        matchReason: combinedReason
      });

      if (isFullMatch && !winningRule) {
        winningRule = rule;
        winningReason = `Evaluated at Priority #${rule.priority} (${rule.name}): ${targetReason} at ${currentGate.name}. Action: ${rule.action}.`;
      }
    }

    const finalDecision: AccessRuleAction = winningRule ? winningRule.action : 'DENY';
    const finalReason = winningRule
      ? winningReason
      : `DENIED by Default Policy: No active access rule permitted license plate ${plate} at ${currentSite.name} / ${currentGate.name} on ${currentDay} ${currentTimeStr}.`;

    return {
      plate,
      siteId,
      siteName: currentSite.name,
      gateId,
      gateName: currentGate.name,
      timestamp: simTime.toISOString(),
      decision: finalDecision,
      winningRule,
      reason: finalReason,
      allEvaluatedRules: evaluatedMatches
    };
  };

  // ===============================================
  // TENANT USER & MEMBER MANAGEMENT HANDLERS
  // ===============================================
  const inviteTenantUser = (data: {
    email: string;
    fullName?: string;
    role: TenantUserRole;
    personalMessage?: string;
    createMemberProfile?: boolean;
    membershipType?: MembershipType;
    phone?: string;
    employeeId?: string;
    department?: string;
  }) => {
    // 1. Check if user already exists
    const existing = tenantUsers.find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      addToast({
        type: 'error',
        title: 'User Already Exists',
        description: `An account with ${data.email} already exists in the organization.`
      });
      return;
    }

    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const newInvId = `inv-${Date.now()}`;

    const newInvitation: TenantInvitation = {
      id: newInvId,
      email: data.email,
      fullName: data.fullName,
      role: data.role,
      invitedBy: currentUser.name || 'Anthony Nguyen',
      status: 'PENDING',
      sentAt: now.toISOString(),
      expiresAt: expires.toISOString(),
      createMemberProfile: data.createMemberProfile,
      membershipType: data.membershipType,
      personalMessage: data.personalMessage
    };

    setTenantInvitations(prev => [newInvitation, ...prev]);

    // If createMemberProfile is true or role is MEMBER, also create a pending user record
    const newUserId = `user-${Date.now()}`;
    const newMemberProfile: TenantMemberProfile | null = data.createMemberProfile
      ? {
          id: `mem-${Date.now()}`,
          userId: newUserId,
          memberCode: `MEM-${Math.floor(100000 + Math.random() * 900000)}`,
          fullName: data.fullName || data.email.split('@')[0],
          email: data.email,
          phone: data.phone,
          employeeId: data.employeeId,
          department: data.department,
          type: data.membershipType || 'EMPLOYEE',
          status: 'PENDING',
          joinedAt: now.toISOString(),
          vehicles: []
        }
      : null;

    const newUser: TenantUser = {
      id: newUserId,
      name: data.fullName || data.email.split('@')[0],
      email: data.email,
      username: data.email.split('@')[0],
      phone: data.phone,
      role: data.role,
      status: 'PENDING',
      membership: newMemberProfile,
      createdAt: now.toISOString()
    };

    setTenantUsers(prev => [newUser, ...prev]);

    // Push User Audit Log
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'USER_INVITED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: data.fullName || data.email,
      targetUserId: newUserId,
      description: `Dispatched invitation to ${data.email} with role ${data.role.replace('_', ' ')}.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'Invitation Dispatched',
      description: `Invitation sent to ${data.email}. Valid for 7 days.`
    });
  };

  const createTenantUserManually = (data: {
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
  }) => {
    const existing = tenantUsers.find(u => u.email.toLowerCase() === data.email.toLowerCase());
    if (existing) {
      addToast({
        type: 'error',
        title: 'User Already Exists',
        description: `An account with ${data.email} already exists in the organization.`
      });
      return;
    }

    const now = new Date();
    const newUserId = `user-${Date.now()}`;

    const newMemberProfile: TenantMemberProfile | null = data.createMemberProfile
      ? {
          id: `mem-${Date.now()}`,
          userId: newUserId,
          memberCode: `MEM-${Math.floor(100000 + Math.random() * 900000)}`,
          fullName: data.fullName,
          email: data.email,
          phone: data.phone,
          employeeId: data.employeeId,
          department: data.department,
          type: data.membershipType || 'EMPLOYEE',
          status: 'ACTIVE',
          joinedAt: now.toISOString(),
          vehicles: []
        }
      : null;

    const newUser: TenantUser = {
      id: newUserId,
      name: data.fullName,
      email: data.email,
      username: data.username || data.email.split('@')[0],
      phone: data.phone,
      role: data.role,
      status: 'ACTIVE',
      membership: newMemberProfile,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };

    setTenantUsers(prev => [newUser, ...prev]);

    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'USER_CREATED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: data.fullName,
      targetUserId: newUserId,
      description: `Created user account directly with role ${data.role.replace('_', ' ')}.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'User Account Created',
      description: `User ${data.fullName} has been successfully provisioned.`
    });
  };

  const changeTenantUserRole = (userId: string, newRole: TenantUserRole): { success: boolean; message?: string } => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser) {
      return { success: false, message: 'User not found.' };
    }

    if (targetUser.role === newRole) {
      return { success: true };
    }

    // Guard: Prevent demoting last active Tenant Admin
    if (targetUser.role === 'TENANT_ADMIN' && newRole !== 'TENANT_ADMIN') {
      const activeAdmins = tenantUsers.filter(u => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
      if (activeAdmins.length <= 1 && targetUser.status === 'ACTIVE') {
        const errorMsg = 'Cannot demote the only remaining active Tenant Admin. Assign another Tenant Admin first to safeguard organization governance.';
        addToast({
          type: 'error',
          title: 'Action Blocked',
          description: errorMsg
        });
        return { success: false, message: errorMsg };
      }
    }

    const previousRole = targetUser.role;
    setTenantUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, role: newRole, updatedAt: new Date().toISOString() } : u))
    );

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'USER_ROLE_CHANGED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: `Changed role from ${previousRole.replace('_', ' ')} to ${newRole.replace('_', ' ')}.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'Role Updated',
      description: `${targetUser.name}'s role updated to ${newRole.replace('_', ' ')}.`
    });

    return { success: true };
  };

  const toggleTenantUserStatus = (userId: string, targetStatus: 'ACTIVE' | 'INACTIVE'): { success: boolean; message?: string } => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser) {
      return { success: false, message: 'User not found.' };
    }

    // Guard: Prevent deactivating last active Tenant Admin
    if (targetStatus === 'INACTIVE' && targetUser.role === 'TENANT_ADMIN') {
      const activeAdmins = tenantUsers.filter(u => u.role === 'TENANT_ADMIN' && u.status === 'ACTIVE');
      if (activeAdmins.length <= 1 && targetUser.status === 'ACTIVE') {
        const errorMsg = 'Cannot deactivate the only active Tenant Admin. Promote another active user to Tenant Admin first.';
        addToast({
          type: 'error',
          title: 'Action Blocked',
          description: errorMsg
        });
        return { success: false, message: errorMsg };
      }
    }

    setTenantUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, status: targetStatus, updatedAt: new Date().toISOString() } : u))
    );

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: targetStatus === 'ACTIVE' ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: targetStatus === 'ACTIVE'
        ? `Re-activated user authentication access.`
        : `Deactivated user account. Access revoked while preserving membership and vehicles.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: targetStatus === 'ACTIVE' ? 'success' : 'warning',
      title: targetStatus === 'ACTIVE' ? 'User Activated' : 'User Deactivated',
      description: `${targetUser.name} is now ${targetStatus}.`
    });

    return { success: true };
  };

  const resetTenantUserPassword = (userId: string) => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser) return;

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'USER_PASSWORD_RESET_REQUESTED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: `Dispatched password reset instructions to ${targetUser.email}.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'info',
      title: 'Password Reset Sent',
      description: `Password reset email dispatched to ${targetUser.email}.`
    });
  };

  const updateTenantUser = (userId: string, data: Partial<TenantUser>) => {
    setTenantUsers(prev =>
      prev.map(u => (u.id === userId ? { ...u, ...data, updatedAt: new Date().toISOString() } : u))
    );

    const targetUser = tenantUsers.find(u => u.id === userId);
    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'USER_UPDATED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser?.name || userId,
      targetUserId: userId,
      description: `Updated user profile details.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'User Profile Updated',
      description: 'Changes saved successfully.'
    });
  };

  const updateTenantMemberProfile = (userId: string, data: Partial<TenantMemberProfile>) => {
    setTenantUsers(prev =>
      prev.map(u => {
        if (u.id === userId && u.membership) {
          return {
            ...u,
            membership: { ...u.membership, ...data },
            updatedAt: new Date().toISOString()
          };
        }
        return u;
      })
    );

    const targetUser = tenantUsers.find(u => u.id === userId);
    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'MEMBER_UPDATED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser?.name || userId,
      targetUserId: userId,
      description: `Updated membership profile details.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'Membership Updated',
      description: 'Member profile updated.'
    });
  };

  const suspendTenantMembership = (userId: string, reason: string) => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser || !targetUser.membership) return;

    setTenantUsers(prev =>
      prev.map(u => {
        if (u.id === userId && u.membership) {
          return {
            ...u,
            membership: {
              ...u.membership,
              status: 'SUSPENDED',
              suspendedReason: reason
            },
            updatedAt: new Date().toISOString()
          };
        }
        return u;
      })
    );

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'MEMBER_SUSPENDED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: `Suspended parking membership. Reason: ${reason}`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'warning',
      title: 'Membership Suspended',
      description: `${targetUser.name}'s vehicle access rights suspended. Login account remains active.`
    });
  };

  const activateTenantMembership = (userId: string) => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser || !targetUser.membership) return;

    setTenantUsers(prev =>
      prev.map(u => {
        if (u.id === userId && u.membership) {
          return {
            ...u,
            membership: {
              ...u.membership,
              status: 'ACTIVE',
              suspendedReason: undefined
            },
            updatedAt: new Date().toISOString()
          };
        }
        return u;
      })
    );

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'MEMBER_ACTIVATED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: `Re-activated parking membership and vehicle access rights.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'Membership Activated',
      description: `${targetUser.name}'s vehicle access rights restored.`
    });
  };

  const endTenantMembership = (userId: string) => {
    const targetUser = tenantUsers.find(u => u.id === userId);
    if (!targetUser || !targetUser.membership) return;

    const now = new Date();
    setTenantUsers(prev =>
      prev.map(u => {
        if (u.id === userId && u.membership) {
          return {
            ...u,
            membership: {
              ...u.membership,
              status: 'ENDED',
              endedAt: now.toISOString()
            },
            updatedAt: now.toISOString()
          };
        }
        return u;
      })
    );

    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'MEMBER_ENDED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetUser.name,
      targetUserId: userId,
      description: `Ended membership profile. Whitelist passes revoked.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'info',
      title: 'Membership Ended',
      description: `${targetUser.name}'s membership has been formally ended.`
    });
  };

  const resendTenantInvitation = (invitationId: string) => {
    const targetInv = tenantInvitations.find(i => i.id === invitationId);
    if (!targetInv) return;

    const now = new Date();
    const expires = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    setTenantInvitations(prev =>
      prev.map(i =>
        i.id === invitationId
          ? { ...i, status: 'PENDING', sentAt: now.toISOString(), expiresAt: expires.toISOString() }
          : i
      )
    );

    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'INVITATION_RESENT',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetInv.fullName || targetInv.email,
      description: `Resent invitation to ${targetInv.email} (new expiry in 7 days).`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'success',
      title: 'Invitation Resent',
      description: `New invitation dispatched to ${targetInv.email}.`
    });
  };

  const cancelTenantInvitation = (invitationId: string) => {
    const targetInv = tenantInvitations.find(i => i.id === invitationId);
    if (!targetInv) return;

    setTenantInvitations(prev =>
      prev.map(i => (i.id === invitationId ? { ...i, status: 'CANCELLED' } : i))
    );

    const now = new Date();
    const newAuditLog: UserAuditLog = {
      id: `ual-${Date.now()}`,
      action: 'INVITATION_CANCELLED',
      actorName: currentUser.name || 'Anthony Nguyen',
      targetUserName: targetInv.fullName || targetInv.email,
      description: `Cancelled pending invitation for ${targetInv.email}.`,
      timestamp: now.toISOString()
    };
    setUserAuditLogs(prev => [newAuditLog, ...prev]);

    addToast({
      type: 'info',
      title: 'Invitation Cancelled',
      description: `Invitation for ${targetInv.email} has been revoked.`
    });
  };

  return (
    <PlatformContext.Provider
      value={{
        authStatus,
        isAuthenticated,
        currentUser,
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
        pushAuditLog,
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
        toggleFeatureFlag,
        updateSettings,
        acknowledgeIncident,
        resolveIncident,
        acknowledgeAlert,
        resolveAlert,
        revokeSession,
        revokeAllUserSessions,
        rotateCredential,
        revokeCredential,
        navigateTo,

        // Tenant Admin Portal Values
        appWorkspace,
        setAppWorkspace,
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
        tenantSites,
        tenantLocation,
        tenantSummary,
        tenantHealth,
        tenantAlerts,
        accessEvents,
        accessActivity,
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

        // Tenant User & Member Handlers
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
        cancelTenantInvitation
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
};

export const usePlatform = (): PlatformContextType => {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
};
