/**
 * Tenant & Site Management Types
 * Module: Tenant Admin
 */

export type TenantSiteStatus = 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL' | 'INACTIVE';
export type AccessDecision = 'ALLOWED' | 'DENIED' | 'UNKNOWN' | 'BLOCKED' | 'EXPIRED';
export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';

export interface LocationAddress {
  line1: string;
  line2?: string;
  city: string;
  province?: string;
  postalCode?: string;
  country: string;
}

export interface OperatingHoursDay {
  day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  enabled: boolean;
  open?: string;
  close?: string;
  is24Hours?: boolean;
}

export interface OperatingHoursSchedule {
  timezone: string;
  isOpen24_7?: boolean;
  days: OperatingHoursDay[];
}

export interface TenantLocation {
  id: string;
  tenantId: string;
  tenantName: string;
  name: string;
  code: string;
  status: 'ACTIVE' | 'INACTIVE';
  address: LocationAddress;
  timezone: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  emergencyContact?: string;
  contactPerson?: string;
  capacity?: number;
  currentOccupancy?: number;
  operatingHours: OperatingHoursSchedule;
  createdAt: string;
  updatedAt: string;
  description?: string;
}

export interface TenantSite {
  id: string;
  name: string;
  code: string;
  tenantId: string;
  tenantName: string;
  address: string;
  status: TenantSiteStatus;
  cameraCount: number;
  onlineCameraCount: number;
  gateCount: number;
  onlineGateCount: number;
  edgeDeviceCount: number;
  onlineEdgeDeviceCount: number;
  vehicleCount: number;
  todayAccessCount: number;
  lanesCount: number;
  operatingHours: string;
  capacity?: number;
  currentOccupancy?: number;
  coordinates?: { lat: number; lng: number };
  createdAt: string;
  description: string;
  managerName?: string;
  managerPhone?: string;
}

export interface AccessEvent {
  id: string;
  timestamp: string;
  timeFormatted: string;
  plate: string;
  plateConfidence: number; // 0.0 - 1.0
  detectionConfidence: number;
  plateImageCrop?: string;
  overviewImage?: string;
  siteId: string;
  siteName: string;
  gateId: string;
  gateName: string;
  laneName: string;
  direction: 'IN' | 'OUT';
  decision: AccessDecision;
  vehicleType?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  ownerName?: string;
  ownerType?: 'EMPLOYEE' | 'VISITOR' | 'CONTRACTOR' | 'VIP' | 'UNKNOWN';
  ownerDepartment?: string;
  accessRule?: string;
  reason?: string;
  verifiedBy?: string;
  correctedPlate?: string;
  correctedAt?: string;
}

export interface TenantAlertItem {
  id: string;
  severity: AlertSeverity;
  type: 'GATE_OFFLINE' | 'CAMERA_OFFLINE' | 'EDGE_OFFLINE' | 'EDGE_HIGH_CPU' | 'HIGH_DENIED_RATE' | 'SECURITY_INCIDENT' | 'FIRMWARE_UPDATE';
  title: string;
  message: string;
  siteId: string;
  siteName: string;
  resourceId: string;
  resourceType: 'GATE' | 'CAMERA' | 'EDGE_DEVICE' | 'SYSTEM';
  createdAt: string;
  timeAgo: string;
  status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
  actionText?: string;
  actionTarget?: string;
}

export interface AccessActivityDataPoint {
  time: string;
  timestamp: string;
  allowed: number;
  denied: number;
  unknown: number;
}

export interface TenantDashboardSummary {
  sites: {
    total: number;
    active: number;
    inactive: number;
  };
  cameras: {
    total: number;
    online: number;
    offline: number;
  };
  gates: {
    total: number;
    online: number;
    offline: number;
  };
  vehicles: {
    total: number;
    active: number;
    inactive: number;
    newThisMonth: number;
  };
  accessToday: {
    total: number;
    allowed: number;
    denied: number;
    unknown: number;
    percentChange: number;
  };
}

export interface TenantSystemHealth {
  overall: 'HEALTHY' | 'WARNING' | 'DEGRADED' | 'CRITICAL' | 'OFFLINE';
  cameras: {
    total: number;
    online: number;
    offline: number;
  };
  gates: {
    total: number;
    online: number;
    offline: number;
  };
  edgeDevices: {
    total: number;
    online: number;
    offline: number;
  };
  api: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  websocket: 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED';
  apiLatencyMs: number;
}

export type TenantNavigationTab =
  | 'dashboard'
  | 'location'
  | 'organization'
  | 'sites'
  | 'users'
  | 'vehicles'
  | 'access-rules'
  | 'access_rules'
  | 'cameras'
  | 'gates'
  | 'edge-devices'
  | 'monitoring'
  | 'access-events'
  | 'access_events'
  | 'team'
  | 'reports'
  | 'audit-logs'
  | 'settings';

export type TenantNavTab = TenantNavigationTab;

export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'VAN' | 'BUS' | 'OTHER';
export type VehicleStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'ARCHIVED';
export type VehicleAccessStatus = 'ALLOWED' | 'DENIED' | 'RESTRICTED' | 'NO_RULE' | 'SUSPENDED';

export interface VehicleLicensePlate {
  id: string;
  number: string;
  normalizedPlate: string;
  country: string; // e.g. 'VN'
  province?: string; // e.g. 'Ho Chi Minh City'
  status: 'ACTIVE' | 'INACTIVE' | 'REPLACED';
  validFrom: string;
  validTo?: string;
  registeredAt: string;
  notes?: string;
}

export interface VehicleMemberSummary {
  id: string;
  userId?: string;
  code: string; // e.g. MEM-000123
  name: string;
  email: string;
  phone?: string;
  department?: string;
  type: MembershipType;
  status: MembershipStatus;
}

export interface VehicleAssignmentHistoryItem {
  id: string;
  memberId: string | null;
  memberName: string;
  memberCode?: string;
  assignedAt: string;
  unassignedAt?: string;
  assignedBy: string;
}

export interface VehicleAuditItem {
  id: string;
  vehicleId: string;
  action:
    | 'VEHICLE_CREATED'
    | 'VEHICLE_UPDATED'
    | 'VEHICLE_ASSIGNED'
    | 'VEHICLE_UNASSIGNED'
    | 'VEHICLE_SUSPENDED'
    | 'VEHICLE_ACTIVATED'
    | 'VEHICLE_DEACTIVATED'
    | 'VEHICLE_ARCHIVED'
    | 'VEHICLE_PLATE_ADDED'
    | 'VEHICLE_PLATE_UPDATED'
    | 'VEHICLE_PLATE_DEACTIVATED';
  actorName: string;
  actorRole?: string;
  description: string;
  reason?: string;
  timestamp: string;
}

export interface TenantVehicle {
  id: string;
  tenantId: string;
  name: string; // e.g. "Toyota Camry"
  make: string;
  model: string;
  year?: number;
  color?: string;
  vin?: string;
  type: VehicleType;
  status: VehicleStatus;
  suspendedReason?: string;
  suspendedAt?: string;
  description?: string;
  currentPlate: VehicleLicensePlate;
  previousPlates?: VehicleLicensePlate[];
  memberId?: string | null; // Nullable for fleet/unassigned
  member?: VehicleMemberSummary | null;
  accessStatus: VehicleAccessStatus;
  accessStatusReason?: string;
  appliedRules?: string[];
  lastSeenAt?: string;
  lastSeenGate?: string;
  lastSeenDecision?: AccessDecision;
  lastSeenConfidence?: number;
  lastSeenPlate?: string;
  assignmentHistory?: VehicleAssignmentHistoryItem[];
  auditHistory?: VehicleAuditItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RegisteredVehicle {
  id: string;
  plate: string;
  ownerName: string;
  model: string;
  type: string;
  siteId?: string;
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
  registeredAt: string;
}

export type AccessRuleAction = 'ALLOW' | 'DENY';
export type AccessRuleStatus = 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DRAFT';
export type AccessRuleTargetType =
  | 'SPECIFIC_VEHICLE'
  | 'LICENSE_PLATE'
  | 'MEMBER'
  | 'MEMBER_GROUP'
  | 'VEHICLE_GROUP'
  | 'VISITOR'
  | 'ALL_VEHICLES';

export type AccessRuleScheduleType = 'ALWAYS' | 'DATE_RANGE' | 'WEEKLY' | 'CUSTOM';

export interface AccessRuleTimeWindow {
  start: string; // "07:00"
  end: string;   // "18:00"
}

export interface AccessRuleDaySchedule {
  day: 'MONDAY' | 'TUESDAY' | 'WEDNESDAY' | 'THURSDAY' | 'FRIDAY' | 'SATURDAY' | 'SUNDAY';
  enabled: boolean;
  windows: AccessRuleTimeWindow[];
}

export interface AccessRuleAuditItem {
  id: string;
  action: 'CREATED' | 'UPDATED' | 'ACTIVATED' | 'DEACTIVATED' | 'DUPLICATED' | 'PRIORITY_CHANGED' | 'TESTED';
  timestamp: string;
  actorName: string;
  actorEmail?: string;
  details: string;
}

export interface TenantAccessRule {
  id: string;
  tenantId?: string;
  code: string; // e.g. EMPLOYEE-PARKING
  name: string;
  description?: string;
  action: AccessRuleAction; // 'ALLOW' | 'DENY'
  priority: number; // 1 (highest) to 9999
  status: AccessRuleStatus; // 'ACTIVE' | 'INACTIVE' | 'SCHEDULED' | 'EXPIRED' | 'DRAFT'
  
  target: {
    type: AccessRuleTargetType;
    vehicleId?: string;
    vehicleName?: string;
    licensePlate?: string;
    memberId?: string;
    memberName?: string;
    memberEmail?: string;
    memberGroup?: string; // 'EMPLOYEE' | 'VIP' | 'MANAGEMENT' | 'SECURITY' | 'CONTRACTOR' | 'VISITOR'
    vehicleGroup?: string; // 'COMPANY' | 'DELIVERY' | 'SECURITY' | 'VIP' | 'MAINTENANCE'
    notes?: string;
  };

  scope: {
    allSites: boolean;
    siteIds: string[];
    siteNames?: string[];
    allGates: boolean;
    gateIds: string[];
    gateNames?: string[];
  };

  schedule: {
    type: AccessRuleScheduleType;
    timezone?: string; // e.g. 'Asia/Ho_Chi_Minh'
    startDate?: string;
    startTime?: string;
    endDate?: string;
    endTime?: string;
    days?: AccessRuleDaySchedule[];
    summaryText?: string;
  };

  advanced?: {
    minConfidence?: number; // e.g. 90
    duplicateWindowSeconds?: number; // e.g. 5
    failBehavior?: 'DENY' | 'SAFE_FALLBACK' | 'DEFAULT';
    notes?: string;
  };

  validFrom?: string;
  validUntil?: string | null;
  auditHistory?: AccessRuleAuditItem[];
  createdAt: string;
  updatedAt: string;

  // Backward compatibility fields:
  type?: string;
  scheduleSummary?: string;
  sites?: string[];
  gates?: string[];
  actionOnMatch?: string;
}

export interface AccessRuleSimulationRuleMatch {
  ruleId: string;
  ruleCode: string;
  ruleName: string;
  priority: number;
  action: AccessRuleAction;
  matched: boolean;
  targetMatched: boolean;
  scopeMatched: boolean;
  scheduleMatched: boolean;
  matchReason: string;
}

export interface AccessRuleSimulationResult {
  plate: string;
  siteId: string;
  siteName: string;
  gateId: string;
  gateName: string;
  timestamp: string;
  decision: AccessRuleAction;
  winningRule: TenantAccessRule | null;
  reason: string;
  allEvaluatedRules: AccessRuleSimulationRuleMatch[];
}

export type TenantUserRole = 'TENANT_ADMIN' | 'SITE_MANAGER' | 'MEMBER';
export type TenantUserStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'SUSPENDED';
export type MembershipStatus = 'ACTIVE' | 'SUSPENDED' | 'ENDED' | 'PENDING';
export type MembershipType = 'EMPLOYEE' | 'RESIDENT' | 'CUSTOMER' | 'STAFF' | 'VISITOR' | 'OTHER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'CANCELLED';

export interface MemberVehicle {
  plate: string;
  model: string;
  color?: string;
  type: string;
  status: 'ACTIVE' | 'BLOCKED' | 'EXPIRED';
}

export interface TenantMemberProfile {
  id: string;
  userId: string;
  memberCode: string; // e.g. MEM-000123
  fullName: string;
  email: string;
  phone?: string;
  employeeId?: string;
  department?: string;
  type: MembershipType;
  status: MembershipStatus;
  suspendedReason?: string;
  joinedAt: string;
  endedAt?: string;
  vehicles: MemberVehicle[];
  notes?: string;
}

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  username?: string;
  phone?: string;
  avatar?: string;
  role: TenantUserRole;
  status: TenantUserStatus;
  membership?: TenantMemberProfile | null;
  lastLoginAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface TenantInvitation {
  id: string;
  email: string;
  fullName?: string;
  role: TenantUserRole;
  invitedBy: string;
  status: InvitationStatus;
  sentAt: string;
  expiresAt: string;
  createMemberProfile?: boolean;
  membershipType?: MembershipType;
  personalMessage?: string;
}

export interface UserAuditLog {
  id: string;
  action:
    | 'USER_INVITED'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_ROLE_CHANGED'
    | 'USER_ACTIVATED'
    | 'USER_DEACTIVATED'
    | 'USER_PASSWORD_RESET_REQUESTED'
    | 'MEMBER_CREATED'
    | 'MEMBER_UPDATED'
    | 'MEMBER_SUSPENDED'
    | 'MEMBER_ACTIVATED'
    | 'MEMBER_ENDED'
    | 'INVITATION_SENT'
    | 'INVITATION_RESENT'
    | 'INVITATION_CANCELLED';
  actorName: string;
  targetUserName: string;
  targetUserId?: string;
  description: string;
  timestamp: string;
}

export interface TenantMember {
  id: string;
  name: string;
  email: string;
  role: string;
  siteAccess: string[];
  status: 'ACTIVE' | 'PENDING';
  createdAt: string;
}
