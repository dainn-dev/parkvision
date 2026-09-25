/**
 * Platform Governance & Developer Tools Types
 */

// Navigation Types
export type PrimaryTab = 
  | 'dashboard' 
  | 'tenants' 
  | 'platform' 
  | 'monitoring' 
  | 'security' 
  | 'audit';

export type PlatformSubTab = 'settings' | 'feature-flags' | 'admins';
export type MonitoringSubTab = 'overview' | 'services' | 'edge' | 'cameras' | 'gates' | 'events' | 'incidents';
export type SecuritySubTab = 'overview' | 'mfa' | 'alerts' | 'logins' | 'sessions' | 'accounts' | 'credentials' | 'incidents' | 'activity';
export type SettingsSection = 'general' | 'authentication' | 'security' | 'storage' | 'notifications';

// Tenant Types
export type TenantStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'DISABLED';

export interface TenantAdministrator {
  id: string;
  name: string;
  email: string;
  phone?: string;
}

export interface TenantStatistics {
  usersCount: number;
  vehiclesCount: number;
  camerasCount: number;
  gatesCount: number;
  edgeDevicesCount: number;
  eventsCount: number;
  storageUsedGb: number;
}

export interface Tenant {
  id: string;
  name: string;
  code: string;
  email: string;
  phone: string;
  timezone: string;
  status: TenantStatus;
  administrator: TenantAdministrator;
  statistics: TenantStatistics;
  createdAt: string;
  lastActivityAt: string;
}

// Platform Administrator Types
export type AdminStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'PENDING';
export type AdminRole = 'PLATFORM_ADMIN' | 'PLATFORM_SUPPORT' | 'PLATFORM_SECURITY' | 'super_admin' | 'ops' | 'support';

export interface PlatformAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
  mfaEnabled: boolean;
  mfaConfiguredAt?: string;
  lastLoginAt: string;
  createdAt: string;
  failedLoginAttempts: number;
}

// Session Types
export interface ActiveSession {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  userType: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'MEMBER' | 'SYSTEM';
  tenantId?: string;
  tenantName?: string;
  device: string;
  browser: string;
  os: string;
  ipAddress: string;
  location?: string;
  riskLevel: 'NORMAL' | 'SUSPICIOUS' | 'HIGH_RISK';
  createdTime: string;
  lastActive: string;
}

// Feature Flag Types
export interface FeatureFlagRule {
  id?: string;
  tenantIds?: string[];
  userPercentage?: number;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  environment: 'production' | 'staging' | 'development';
  rolloutPercentage: number;
  rules: FeatureFlagRule[];
  updatedAt: string;
  updatedBy: string;
}

// Platform Settings Types
export interface GeneralSettings {
  platformName: string;
  platformUrl: string;
  defaultTimezone: string;
  defaultLanguage: string;
  supportEmail: string;
  supportUrl: string;
}

export interface AuthenticationSettings {
  accessTokenLifetimeMinutes: number;
  refreshTokenLifetimeDays: number;
  sessionTimeoutMinutes: number;
  maxConcurrentSessions: number;
  revokeSessionsOnPasswordChange: boolean;
  revokeSessionsOnPasswordReset: boolean;
}

export interface SecuritySettings {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  maxFailedLoginAttempts: number;
  accountLockoutMinutes: number;
  mfaEnforcement: 'MANDATORY_ALL' | 'MANDATORY_ADMINS' | 'OPTIONAL';
}

export interface StorageSettings {
  provider: 'MinIO' | 'Google Cloud Storage' | 'Amazon S3';
  defaultImageRetentionDays: number;
  attachmentRetentionDays: number;
  maxUploadSizeBytes: number;
  autoCleanupEnabled: boolean;
  warningThresholdPercent: number;
}

export interface NotificationSettings {
  emailNotificationsEnabled: boolean;
  senderName: string;
  senderEmail: string;
  notifySecurityAlerts: boolean;
  notifySystemHealthAlerts: boolean;
  notifyTenantLifecycleAlerts: boolean;
}

export interface PlatformSettings {
  general: GeneralSettings;
  authentication: AuthenticationSettings;
  security: SecuritySettings;
  storage: StorageSettings;
  notifications: NotificationSettings;
}

// Monitoring & Service Health Types
export type ServiceHealthStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';

export interface ServiceHealthItem {
  id: string;
  name: string;
  category: 'core' | 'database' | 'storage' | 'realtime' | 'queue';
  status: ServiceHealthStatus;
  responseTimeMs: number;
  uptimePercent: number | null;
  errorRatePercent: number;
  details?: string;
  lastChecked: string;
}

export interface EdgeDeviceHealth {
  id: string;
  deviceName: string;
  tenantId: string;
  tenantName: string;
  siteId?: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  cpuPercent: number;
  memoryPercent: number;
  diskPercent: number;
  version: string;
  connectedCameras: number;
  eventsPerMin: number;
  lastHeartbeat: string;
}

export interface CameraHealth {
  id: string;
  cameraName: string;
  tenantId: string;
  tenantName: string;
  edgeDeviceId: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  fps: number;
  frameDropPercent: number;
  recognitionRatePerMin: number;
  errorRatePercent: number;
  lastFrameTime: string;
}

export interface GateTelemetrySnapshot {
  id?: string;
  recordedAt: string;
  state?: string | null;
  payload: Record<string, unknown>;
}

export interface GateHealth {
  id: string;
  gateName: string;
  tenantId: string;
  tenantName: string;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED';
  eventsPerMin: number;
  averageLatencyMs: number;
  successRatePercent: number;
  lastHeartbeat: string;
  laneId?: string;
  siteId?: string;
  edgeDeviceId?: string;
  rawStatus?: string;
  lastTelemetry?: GateTelemetrySnapshot;
}

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';

export interface OperationalIncident {
  id: string;
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  resourceId: string;
  resourceType: 'CAMERA' | 'EDGE_DEVICE' | 'GATE' | 'API' | 'DATABASE' | 'STORAGE';
  tenantName?: string;
  description: string;
  startedAt: string;
  updatedAt: string;
  resolutionNote?: string;
  assignedTo?: string;
}

// Security Alerts & Login Activity Types
export type AlertSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED' | 'DISMISSED';

export interface SecurityAlert {
  id: string;
  type: 
    | 'MULTIPLE_FAILED_LOGINS'
    | 'BRUTE_FORCE_DETECTED'
    | 'ACCOUNT_LOCKED'
    | 'SUSPICIOUS_LOGIN'
    | 'IMPOSSIBLE_TRAVEL'
    | 'MFA_FAILURE'
    | 'MFA_RESET'
    | 'API_KEY_ANOMALY'
    | 'PRIVILEGE_CHANGE';
  severity: AlertSeverity;
  status: AlertStatus;
  subjectEmail: string;
  subjectUserType: string;
  detectedAt: string;
  sourceIp: string;
  clientBrowser: string;
  evidence: {
    failedAttempts?: number;
    timeWindowMinutes?: number;
    location?: string;
    details?: string;
  };
}

export interface LoginActivityEvent {
  id: string;
  timestamp: string;
  userEmail: string;
  userType: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'MEMBER' | 'SYSTEM';
  tenantName?: string;
  result: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'CHALLENGED';
  sourceIp: string;
  clientDevice: string;
  failureReason?: string;
  suspicious?: boolean;
}

export interface ApiCredential {
  id: string;
  name: string;
  type: 'PLATFORM_KEY' | 'EDGE_KEY' | 'INTEGRATION_SECRET' | 'SERVICE_ACCOUNT';
  ownerName: string;
  keyPrefix: string;
  status: 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'REVOKED';
  lastUsedAt: string;
  createdAt: string;
  expiresAt?: string;
}

// Audit Types
export type AuditResult = 'SUCCESS' | 'FAILED' | 'DENIED';

export interface AuditLogItem {
  id: string;
  timestamp: string;
  category: 
    | 'AUTHENTICATION'
    | 'TENANT_MANAGEMENT'
    | 'PLATFORM_ADMIN'
    | 'SECURITY'
    | 'CONFIGURATION'
    | 'MONITORING'
    | 'CREDENTIAL'
    | 'SYSTEM';
  action: string;
  actorName: string;
  actorEmail: string;
  actorType: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'SYSTEM' | 'SERVICE';
  tenantName?: string;
  resourceType: string;
  resourceId: string;
  resourceName?: string;
  result: AuditResult;
  source: 'WEB' | 'API' | 'SYSTEM' | 'EDGE';
  ipAddress: string;
  requestId: string;
  traceId: string;
  correlationId?: string;
  changes?: {
    field: string;
    before: any;
    after: any;
  }[];
  metadata?: Record<string, any>;
}
