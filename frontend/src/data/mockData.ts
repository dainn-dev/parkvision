import {
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
  AuditLogItem
} from '../types/platform';

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: 't-001',
    name: 'ABC Logistics & Parking',
    code: 'ABC-LOGISTICS',
    email: 'contact@abclogistics.vn',
    phone: '+84 28 3822 9900',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
    administrator: {
      id: 'u-abc-01',
      name: 'Nguyen Van Minh',
      email: 'minh.nguyen@abclogistics.vn',
      phone: '+84 90 312 3456'
    },
    statistics: {
      usersCount: 142,
      vehiclesCount: 3820,
      camerasCount: 48,
      gatesCount: 12,
      edgeDevicesCount: 8,
      eventsCount: 1420800,
      storageUsedGb: 340.5
    },
    createdAt: '2026-01-15T08:30:00Z',
    lastActivityAt: '2026-08-09T21:58:12Z'
  },
  {
    id: 't-002',
    name: 'Saigon Metro Plaza Mall',
    code: 'SG-METRO-PLAZA',
    email: 'operations@sgmetro.com.vn',
    phone: '+84 28 7300 1122',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
    administrator: {
      id: 'u-sgm-01',
      name: 'Tran Thi Hong',
      email: 'hong.tran@sgmetro.com.vn',
      phone: '+84 91 822 3344'
    },
    statistics: {
      usersCount: 86,
      vehiclesCount: 12450,
      camerasCount: 64,
      gatesCount: 16,
      edgeDevicesCount: 12,
      eventsCount: 3890200,
      storageUsedGb: 680.2
    },
    createdAt: '2026-02-01T10:15:00Z',
    lastActivityAt: '2026-08-09T21:59:45Z'
  },
  {
    id: 't-003',
    name: 'Vinhomes Central Park Gate Systems',
    code: 'VINHOMES-CP',
    email: 'security@vinhomescp.vn',
    phone: '+84 28 3910 8888',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
    administrator: {
      id: 'u-vh-01',
      name: 'Le Hoang Nam',
      email: 'nam.le@vinhomescp.vn',
      phone: '+84 98 900 1122'
    },
    statistics: {
      usersCount: 230,
      vehiclesCount: 18900,
      camerasCount: 128,
      gatesCount: 24,
      edgeDevicesCount: 18,
      eventsCount: 8200100,
      storageUsedGb: 1240.0
    },
    createdAt: '2026-02-20T14:00:00Z',
    lastActivityAt: '2026-08-09T21:55:20Z'
  },
  {
    id: 't-004',
    name: 'Tan Son Nhat Air Cargo Terminal',
    code: 'TSN-CARGO-TERM',
    email: 'access@tsncargo.com.vn',
    phone: '+84 28 3844 5566',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'ACTIVE',
    administrator: {
      id: 'u-tsn-01',
      name: 'Pham Quoc Bao',
      email: 'bao.pham@tsncargo.com.vn'
    },
    statistics: {
      usersCount: 94,
      vehiclesCount: 5410,
      camerasCount: 36,
      gatesCount: 10,
      edgeDevicesCount: 6,
      eventsCount: 2150000,
      storageUsedGb: 410.8
    },
    createdAt: '2026-03-10T09:00:00Z',
    lastActivityAt: '2026-08-09T21:50:00Z'
  },
  {
    id: 't-005',
    name: 'TechPark Tan Thuan Enterprise',
    code: 'TECHPARK-TT',
    email: 'admin@techpark.vn',
    phone: '+84 28 3770 0011',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'TRIAL',
    administrator: {
      id: 'u-tp-01',
      name: 'Doan Viet Dung',
      email: 'dung.doan@techpark.vn'
    },
    statistics: {
      usersCount: 18,
      vehiclesCount: 620,
      camerasCount: 8,
      gatesCount: 2,
      edgeDevicesCount: 2,
      eventsCount: 45000,
      storageUsedGb: 28.4
    },
    createdAt: '2026-07-15T11:20:00Z',
    lastActivityAt: '2026-08-09T20:10:00Z'
  },
  {
    id: 't-006',
    name: 'Old Port Warehousing Services',
    code: 'OLD-PORT-WAREHOUSE',
    email: 'info@oldport.com.vn',
    phone: '+84 28 3829 1122',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'SUSPENDED',
    administrator: {
      id: 'u-op-01',
      name: 'Vo Thi Lan',
      email: 'lan.vo@oldport.com.vn'
    },
    statistics: {
      usersCount: 32,
      vehiclesCount: 1200,
      camerasCount: 14,
      gatesCount: 4,
      edgeDevicesCount: 3,
      eventsCount: 320000,
      storageUsedGb: 110.0
    },
    createdAt: '2026-01-05T08:00:00Z',
    lastActivityAt: '2026-08-01T15:00:00Z'
  }
];

export const INITIAL_PLATFORM_ADMINS: PlatformAdmin[] = [
  {
    id: 'pa-001',
    name: 'Anthony Nguyen',
    email: 'anh.nh@kyanon.digital',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    mfaEnabled: true,
    mfaConfiguredAt: '2026-01-10T09:00:00Z',
    lastLoginAt: '2026-08-09T22:00:00Z',
    createdAt: '2026-01-01T00:00:00Z',
    failedLoginAttempts: 0
  },
  {
    id: 'pa-002',
    name: 'Johnathan Vance',
    email: 'johnathan.vance@platform.internal',
    role: 'PLATFORM_ADMIN',
    status: 'ACTIVE',
    mfaEnabled: true,
    mfaConfiguredAt: '2026-02-14T11:30:00Z',
    lastLoginAt: '2026-08-09T18:24:00Z',
    createdAt: '2026-02-10T10:00:00Z',
    failedLoginAttempts: 0
  },
  {
    id: 'pa-003',
    name: 'Platform Support Lead',
    email: 'support.lead@platform.internal',
    role: 'PLATFORM_SUPPORT',
    status: 'ACTIVE',
    mfaEnabled: true,
    mfaConfiguredAt: '2026-03-01T14:15:00Z',
    lastLoginAt: '2026-08-09T15:10:00Z',
    createdAt: '2026-03-01T08:00:00Z',
    failedLoginAttempts: 0
  },
  {
    id: 'pa-004',
    name: 'Security Officer Alex',
    email: 'security.alex@platform.internal',
    role: 'PLATFORM_SECURITY',
    status: 'ACTIVE',
    mfaEnabled: true,
    mfaConfiguredAt: '2026-03-12T16:00:00Z',
    lastLoginAt: '2026-08-09T21:30:00Z',
    createdAt: '2026-03-12T09:00:00Z',
    failedLoginAttempts: 0
  },
  {
    id: 'pa-005',
    name: 'Inactive Admin Account',
    email: 'legacy.admin@platform.internal',
    role: 'PLATFORM_ADMIN',
    status: 'DISABLED',
    mfaEnabled: false,
    lastLoginAt: '2026-05-10T12:00:00Z',
    createdAt: '2026-01-10T00:00:00Z',
    failedLoginAttempts: 4
  }
];

export const INITIAL_SESSIONS: ActiveSession[] = [
  {
    id: 'sess-001',
    userId: 'pa-001',
    userName: 'Anthony Nguyen',
    userEmail: 'anh.nh@kyanon.digital',
    userType: 'PLATFORM_ADMIN',
    device: 'Linux x86_64 Workstation',
    browser: 'Chrome 149.0.0.0',
    os: 'Ubuntu 24.04 LTS',
    ipAddress: '118.69.182.201',
    location: 'Ho Chi Minh City, VN',
    riskLevel: 'NORMAL',
    createdTime: '2026-08-09T21:00:00Z',
    lastActive: 'Just now'
  },
  {
    id: 'sess-002',
    userId: 'pa-002',
    userName: 'Johnathan Vance',
    userEmail: 'johnathan.vance@platform.internal',
    userType: 'PLATFORM_ADMIN',
    device: 'MacBook Pro M3 Max',
    browser: 'Safari 18.2',
    os: 'macOS 15.1 Sequoia',
    ipAddress: '14.241.220.45',
    location: 'Da Nang, VN',
    riskLevel: 'NORMAL',
    createdTime: '2026-08-09T18:00:00Z',
    lastActive: '36m ago'
  },
  {
    id: 'sess-003',
    userId: 'u-sgm-01',
    userName: 'Tran Thi Hong',
    userEmail: 'hong.tran@sgmetro.com.vn',
    userType: 'TENANT_ADMIN',
    tenantId: 't-002',
    tenantName: 'Saigon Metro Plaza Mall',
    device: 'Windows 11 Pro',
    browser: 'Edge 128.0',
    os: 'Windows 11 23H2',
    ipAddress: '113.161.42.18',
    location: 'Ho Chi Minh City, VN',
    riskLevel: 'SUSPICIOUS',
    createdTime: '2026-08-09T20:15:00Z',
    lastActive: '2m ago'
  },
  {
    id: 'sess-004',
    userId: 'u-vh-01',
    userName: 'Le Hoang Nam',
    userEmail: 'nam.le@vinhomescp.vn',
    userType: 'TENANT_ADMIN',
    tenantId: 't-003',
    tenantName: 'Vinhomes Central Park Gate Systems',
    device: 'iPhone 15 Pro',
    browser: 'Mobile Safari 18.0',
    os: 'iOS 18.1',
    ipAddress: '42.112.98.11',
    location: 'Ho Chi Minh City, VN',
    riskLevel: 'NORMAL',
    createdTime: '2026-08-09T19:30:00Z',
    lastActive: '12m ago'
  }
];

export const INITIAL_FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: 'ff-001',
    key: 'ANPR_AI_V2_CORE',
    name: 'Automatic Number Plate Recognition V2 (YOLOv11 Edge)',
    description: 'Enables real-time 99.8% precision license plate optical character recognition with blur & night IR restoration.',
    enabled: true,
    environment: 'production',
    rolloutPercentage: 100,
    rules: [{ tenantIds: ['t-001', 't-002', 't-003'] }],
    updatedAt: '2026-08-01T10:00:00Z',
    updatedBy: 'anh.nh@kyanon.digital'
  },
  {
    id: 'ff-002',
    key: 'BIOMETRIC_DRIVER_VERIFY',
    name: 'Driver Facial Verification at Gate Barrier',
    description: 'Cross-checks camera driver snapshot against resident/staff registered biometric templates.',
    enabled: true,
    environment: 'production',
    rolloutPercentage: 50,
    rules: [{ tenantIds: ['t-003'] }],
    updatedAt: '2026-08-05T14:20:00Z',
    updatedBy: 'johnathan.vance@platform.internal'
  },
  {
    id: 'ff-003',
    key: 'EDGE_STREAM_HQ_60FPS',
    name: '60 FPS Ultra-HD RTSP Edge Camera Ingestion',
    description: 'Allows high-throughput 4K stream decoding on hardware-accelerated NPU Edge devices.',
    enabled: true,
    environment: 'production',
    rolloutPercentage: 25,
    rules: [{ tenantIds: ['t-004'] }],
    updatedAt: '2026-08-07T09:15:00Z',
    updatedBy: 'security.alex@platform.internal'
  },
  {
    id: 'ff-004',
    key: 'GEO_IP_LOCKOUT_STRICT',
    name: 'Strict Geo-IP Authentication Lockout',
    description: 'Blocks login sessions originating outside designated country IP CIDR blocks.',
    enabled: true,
    environment: 'production',
    rolloutPercentage: 100,
    rules: [],
    updatedAt: '2026-07-20T16:00:00Z',
    updatedBy: 'anh.nh@kyanon.digital'
  },
  {
    id: 'ff-005',
    key: 'KAFKA_STREAMING_CDC',
    name: 'Kafka Change Data Capture Event Hub',
    description: 'Streams entry/exit audit payloads to external compliance data lakes in sub-50ms latency.',
    enabled: false,
    environment: 'staging',
    rolloutPercentage: 0,
    rules: [],
    updatedAt: '2026-08-08T11:00:00Z',
    updatedBy: 'anh.nh@kyanon.digital'
  }
];

export const INITIAL_SETTINGS: PlatformSettings = {
  general: {
    platformName: 'Vehicle Governance Platform Admin Console',
    platformUrl: 'https://vehicle.platform.internal',
    defaultTimezone: 'Asia/Ho_Chi_Minh',
    defaultLanguage: 'English (US)',
    supportEmail: 'platform-support@kyanon.digital',
    supportUrl: 'https://support.vehicle.platform.internal'
  },
  authentication: {
    accessTokenLifetimeMinutes: 15,
    refreshTokenLifetimeDays: 7,
    sessionTimeoutMinutes: 30,
    maxConcurrentSessions: 5,
    revokeSessionsOnPasswordChange: true,
    revokeSessionsOnPasswordReset: true
  },
  security: {
    minPasswordLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxFailedLoginAttempts: 5,
    accountLockoutMinutes: 15,
    mfaEnforcement: 'MANDATORY_ADMINS'
  },
  storage: {
    provider: 'MinIO',
    defaultImageRetentionDays: 90,
    attachmentRetentionDays: 180,
    maxUploadSizeBytes: 20971520, // 20 MB
    autoCleanupEnabled: true,
    warningThresholdPercent: 80
  },
  notifications: {
    emailNotificationsEnabled: true,
    senderName: 'Platform Governance Control Center',
    senderEmail: 'no-reply@vehicle.platform.internal',
    notifySecurityAlerts: true,
    notifySystemHealthAlerts: true,
    notifyTenantLifecycleAlerts: true
  }
};

export const INITIAL_SERVICES: ServiceHealthItem[] = [
  {
    id: 'srv-01',
    name: 'Core REST API Engine',
    category: 'core',
    status: 'HEALTHY',
    responseTimeMs: 38,
    uptimePercent: 99.99,
    errorRatePercent: 0.04,
    details: 'Cluster Node 01-04 active',
    lastChecked: 'Just now'
  },
  {
    id: 'srv-02',
    name: 'PostgreSQL Primary Cluster (Patroni HA)',
    category: 'database',
    status: 'HEALTHY',
    responseTimeMs: 12,
    uptimePercent: 100.0,
    errorRatePercent: 0.0,
    details: 'Primary + 2 Synchronous Replicas',
    lastChecked: 'Just now'
  },
  {
    id: 'srv-03',
    name: 'Redis Distributed Cache & Rate Limiter',
    category: 'database',
    status: 'HEALTHY',
    responseTimeMs: 2,
    uptimePercent: 99.98,
    errorRatePercent: 0.01,
    details: '6-Node Cluster Shard active',
    lastChecked: 'Just now'
  },
  {
    id: 'srv-04',
    name: 'MinIO Object Storage Cluster',
    category: 'storage',
    status: 'HEALTHY',
    responseTimeMs: 45,
    uptimePercent: 99.95,
    errorRatePercent: 0.08,
    details: 'NVMe Storage Bucket (68.4% capacity)',
    lastChecked: 'Just now'
  },
  {
    id: 'srv-05',
    name: 'WebSocket Live Gate Telemetry Broker',
    category: 'realtime',
    status: 'HEALTHY',
    responseTimeMs: 15,
    uptimePercent: 99.97,
    errorRatePercent: 0.02,
    details: '14,200 active socket channels',
    lastChecked: 'Just now'
  },
  {
    id: 'srv-06',
    name: 'RabbitMQ / Kafka Vehicle Event Pipeline',
    category: 'queue',
    status: 'HEALTHY',
    responseTimeMs: 8,
    uptimePercent: 99.99,
    errorRatePercent: 0.03,
    details: 'Consumer Lag: 140 messages',
    lastChecked: 'Just now'
  }
];

export const INITIAL_EDGE_DEVICES: EdgeDeviceHealth[] = [
  {
    id: 'edge-01',
    deviceName: 'EDGE-GATE-ABC-NORTH',
    tenantId: 't-001',
    tenantName: 'ABC Logistics & Parking',
    status: 'ONLINE',
    cpuPercent: 38,
    memoryPercent: 54,
    diskPercent: 42,
    version: 'v2.4.1-arm64',
    connectedCameras: 6,
    eventsPerMin: 184,
    lastHeartbeat: '4s ago'
  },
  {
    id: 'edge-02',
    deviceName: 'EDGE-GATE-SGMETRO-L1',
    tenantId: 't-002',
    tenantName: 'Saigon Metro Plaza Mall',
    status: 'ONLINE',
    cpuPercent: 62,
    memoryPercent: 71,
    diskPercent: 58,
    version: 'v2.4.1-arm64',
    connectedCameras: 8,
    eventsPerMin: 312,
    lastHeartbeat: '2s ago'
  },
  {
    id: 'edge-03',
    deviceName: 'EDGE-VINHOMES-ZONE-A',
    tenantId: 't-003',
    tenantName: 'Vinhomes Central Park Gate Systems',
    status: 'ONLINE',
    cpuPercent: 45,
    memoryPercent: 60,
    diskPercent: 39,
    version: 'v2.4.1-arm64',
    connectedCameras: 12,
    eventsPerMin: 480,
    lastHeartbeat: '3s ago'
  },
  {
    id: 'edge-04',
    deviceName: 'EDGE-TSN-CARGO-MAIN',
    tenantId: 't-004',
    tenantName: 'Tan Son Nhat Air Cargo Terminal',
    status: 'DEGRADED',
    cpuPercent: 89,
    memoryPercent: 92,
    diskPercent: 81,
    version: 'v2.3.8-legacy',
    connectedCameras: 6,
    eventsPerMin: 120,
    lastHeartbeat: '18s ago'
  },
  {
    id: 'edge-05',
    deviceName: 'EDGE-OLDPORT-BAY01',
    tenantId: 't-006',
    tenantName: 'Old Port Warehousing Services',
    status: 'OFFLINE',
    cpuPercent: 0,
    memoryPercent: 0,
    diskPercent: 0,
    version: 'v2.2.0-legacy',
    connectedCameras: 0,
    eventsPerMin: 0,
    lastHeartbeat: '12m ago'
  }
];

export const INITIAL_CAMERAS: CameraHealth[] = [
  {
    id: 'cam-01',
    cameraName: 'CAM-INBOUND-LANEA1',
    tenantId: 't-001',
    tenantName: 'ABC Logistics & Parking',
    edgeDeviceId: 'edge-01',
    status: 'ONLINE',
    fps: 30,
    frameDropPercent: 0.1,
    recognitionRatePerMin: 42,
    errorRatePercent: 0.0,
    lastFrameTime: '1s ago'
  },
  {
    id: 'cam-02',
    cameraName: 'CAM-OUTBOUND-LANEA2',
    tenantId: 't-001',
    tenantName: 'ABC Logistics & Parking',
    edgeDeviceId: 'edge-01',
    status: 'ONLINE',
    fps: 30,
    frameDropPercent: 0.2,
    recognitionRatePerMin: 38,
    errorRatePercent: 0.0,
    lastFrameTime: '2s ago'
  },
  {
    id: 'cam-03',
    cameraName: 'CAM-SGM-BASEMENT-L1',
    tenantId: 't-002',
    tenantName: 'Saigon Metro Plaza Mall',
    edgeDeviceId: 'edge-02',
    status: 'ONLINE',
    fps: 60,
    frameDropPercent: 0.4,
    recognitionRatePerMin: 88,
    errorRatePercent: 0.1,
    lastFrameTime: '1s ago'
  },
  {
    id: 'cam-04',
    cameraName: 'CAM-TSN-VIP-LANE',
    tenantId: 't-004',
    tenantName: 'Tan Son Nhat Air Cargo Terminal',
    edgeDeviceId: 'edge-04',
    status: 'OFFLINE',
    fps: 0,
    frameDropPercent: 100.0,
    recognitionRatePerMin: 0,
    errorRatePercent: 100.0,
    lastFrameTime: '18m ago'
  }
];

export const INITIAL_GATES: GateHealth[] = [
  {
    id: 'gate-01',
    gateName: 'GATE-MAIN-INBOUND-01',
    tenantId: 't-001',
    tenantName: 'ABC Logistics & Parking',
    status: 'ONLINE',
    eventsPerMin: 28,
    averageLatencyMs: 64,
    successRatePercent: 99.8,
    lastHeartbeat: '2s ago'
  },
  {
    id: 'gate-02',
    gateName: 'GATE-SG-MALL-SOUTH',
    tenantId: 't-002',
    tenantName: 'Saigon Metro Plaza Mall',
    status: 'ONLINE',
    eventsPerMin: 62,
    averageLatencyMs: 52,
    successRatePercent: 100.0,
    lastHeartbeat: '1s ago'
  },
  {
    id: 'gate-03',
    gateName: 'GATE-VINHOMES-TOWER-1',
    tenantId: 't-003',
    tenantName: 'Vinhomes Central Park Gate Systems',
    status: 'ONLINE',
    eventsPerMin: 110,
    averageLatencyMs: 48,
    successRatePercent: 99.9,
    lastHeartbeat: '1s ago'
  },
  {
    id: 'gate-04',
    gateName: 'GATE-TSN-CARGO-RESTRICTED',
    tenantId: 't-004',
    tenantName: 'Tan Son Nhat Air Cargo Terminal',
    status: 'DEGRADED',
    eventsPerMin: 12,
    averageLatencyMs: 280,
    successRatePercent: 92.5,
    lastHeartbeat: '14s ago'
  }
];

export const INITIAL_INCIDENTS: OperationalIncident[] = [
  {
    id: 'inc-001',
    title: 'Camera Feed Disconnected on VIP Entry Lane',
    severity: 'HIGH',
    status: 'OPEN',
    resourceId: 'cam-04',
    resourceType: 'CAMERA',
    tenantName: 'Tan Son Nhat Air Cargo Terminal',
    description: 'RTSP video stream lost heartbeat 18 minutes ago. Reconnect attempts timing out.',
    startedAt: '2026-08-09T21:42:00Z',
    updatedAt: '2026-08-09T21:55:00Z'
  },
  {
    id: 'inc-002',
    title: 'High Thermal & CPU Utilization on Edge Processing Box',
    severity: 'MEDIUM',
    status: 'ACKNOWLEDGED',
    resourceId: 'edge-04',
    resourceType: 'EDGE_DEVICE',
    tenantName: 'Tan Son Nhat Air Cargo Terminal',
    description: 'CPU temperature peaked at 84°C due to unoptimized 4K stream decoding load.',
    startedAt: '2026-08-09T20:10:00Z',
    updatedAt: '2026-08-09T20:30:00Z',
    assignedTo: 'security.alex@platform.internal'
  },
  {
    id: 'inc-003',
    title: 'Storage Capacity Warning Threshold Exceeded (82%)',
    severity: 'LOW',
    status: 'RESOLVED',
    resourceId: 'storage-minio-01',
    resourceType: 'STORAGE',
    description: 'Automated retention worker purged 120 GB of archived raw OCR frame logs.',
    startedAt: '2026-08-08T04:00:00Z',
    updatedAt: '2026-08-08T05:15:00Z',
    resolutionNote: 'Purge cycle executed. Storage usage dropped to 68.4%.'
  }
];

export const INITIAL_SECURITY_ALERTS: SecurityAlert[] = [
  {
    id: 'sec-001',
    type: 'BRUTE_FORCE_DETECTED',
    severity: 'CRITICAL',
    status: 'OPEN',
    subjectEmail: 'admin@oldport.com.vn',
    subjectUserType: 'TENANT_ADMIN',
    detectedAt: '2026-08-09T21:45:10Z',
    sourceIp: '185.220.101.42',
    clientBrowser: 'Python-requests/2.31.0',
    evidence: {
      failedAttempts: 48,
      timeWindowMinutes: 3,
      location: 'Frankfurt, DE (Tor Exit Node)',
      details: 'Automated login dictionary spray attack detected against tenant admin endpoint.'
    }
  },
  {
    id: 'sec-002',
    type: 'SUSPICIOUS_LOGIN',
    severity: 'HIGH',
    status: 'OPEN',
    subjectEmail: 'hong.tran@sgmetro.com.vn',
    subjectUserType: 'TENANT_ADMIN',
    detectedAt: '2026-08-09T20:15:00Z',
    sourceIp: '113.161.42.18',
    clientBrowser: 'Edge 128.0 / Windows 11',
    evidence: {
      location: 'Ho Chi Minh City, VN',
      details: 'First login from newly registered untrusted device during off-business hours.'
    }
  },
  {
    id: 'sec-003',
    type: 'MFA_RESET',
    severity: 'MEDIUM',
    status: 'RESOLVED',
    subjectEmail: 'nam.le@vinhomescp.vn',
    subjectUserType: 'TENANT_ADMIN',
    detectedAt: '2026-08-08T14:20:00Z',
    sourceIp: '118.69.182.201',
    clientBrowser: 'Chrome 149 / Linux',
    evidence: {
      details: 'MFA authenticator secret reset performed by Platform Admin Anthony Nguyen upon identity check.'
    }
  }
];

export const INITIAL_LOGIN_EVENTS: LoginActivityEvent[] = [
  {
    id: 'log-001',
    timestamp: '2026-08-09T22:00:15Z',
    userEmail: 'anh.nh@kyanon.digital',
    userType: 'PLATFORM_ADMIN',
    result: 'SUCCESS',
    sourceIp: '118.69.182.201',
    clientDevice: 'Chrome 149 / Linux'
  },
  {
    id: 'log-002',
    timestamp: '2026-08-09T21:45:10Z',
    userEmail: 'admin@oldport.com.vn',
    userType: 'TENANT_ADMIN',
    tenantName: 'Old Port Warehousing Services',
    result: 'BLOCKED',
    sourceIp: '185.220.101.42',
    clientDevice: 'Python-requests/2.31.0',
    failureReason: 'RATE_LIMIT_EXCEEDED_BRUTE_FORCE',
    suspicious: true
  },
  {
    id: 'log-003',
    timestamp: '2026-08-09T20:15:00Z',
    userEmail: 'hong.tran@sgmetro.com.vn',
    userType: 'TENANT_ADMIN',
    tenantName: 'Saigon Metro Plaza Mall',
    result: 'CHALLENGED',
    sourceIp: '113.161.42.18',
    clientDevice: 'Edge 128 / Windows 11',
    suspicious: true
  },
  {
    id: 'log-004',
    timestamp: '2026-08-09T18:24:00Z',
    userEmail: 'johnathan.vance@platform.internal',
    userType: 'PLATFORM_ADMIN',
    result: 'SUCCESS',
    sourceIp: '14.241.220.45',
    clientDevice: 'Safari 18 / macOS'
  }
];

export const INITIAL_CREDENTIALS: ApiCredential[] = [
  {
    id: 'cred-001',
    name: 'Edge Gateway Fleet Ingestion Key',
    type: 'EDGE_KEY',
    ownerName: 'Platform Edge Engine',
    keyPrefix: 'edge_prod_live_8f9a',
    status: 'ACTIVE',
    lastUsedAt: 'Just now',
    createdAt: '2026-01-01T00:00:00Z'
  },
  {
    id: 'cred-002',
    name: 'Saigon Metro ERP Integration Service',
    type: 'INTEGRATION_SECRET',
    ownerName: 'Saigon Metro Plaza Mall',
    keyPrefix: 'sec_sgm_int_4412',
    status: 'ACTIVE',
    lastUsedAt: '12m ago',
    createdAt: '2026-02-15T10:00:00Z'
  },
  {
    id: 'cred-003',
    name: 'Legacy V1 Recognition Webhook Key',
    type: 'PLATFORM_KEY',
    ownerName: 'Old Port Warehousing',
    keyPrefix: 'legacy_key_0019',
    status: 'EXPIRING',
    lastUsedAt: '3d ago',
    createdAt: '2026-01-10T00:00:00Z',
    expiresAt: '2026-08-15T23:59:59Z'
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: 'aud-001',
    timestamp: '2026-08-09T21:40:00Z',
    category: 'TENANT_MANAGEMENT',
    action: 'TENANT_STATUS_UPDATED',
    actorName: 'Anthony Nguyen',
    actorEmail: 'anh.nh@kyanon.digital',
    actorType: 'PLATFORM_ADMIN',
    tenantName: 'Old Port Warehousing Services',
    resourceType: 'TENANT',
    resourceId: 't-006',
    resourceName: 'Old Port Warehousing Services',
    result: 'SUCCESS',
    source: 'WEB',
    ipAddress: '118.69.182.201',
    requestId: 'req-89f1a23b-2026',
    traceId: 'trace-4421-a12b',
    changes: [
      {
        field: 'status',
        before: 'ACTIVE',
        after: 'SUSPENDED'
      }
    ],
    metadata: {
      reason: 'Unresolved billing delinquency and inactive gate telemetry'
    }
  },
  {
    id: 'aud-002',
    timestamp: '2026-08-09T20:30:00Z',
    category: 'MONITORING',
    action: 'OPERATIONAL_INCIDENT_ACKNOWLEDGED',
    actorName: 'Security Officer Alex',
    actorEmail: 'security.alex@platform.internal',
    actorType: 'PLATFORM_ADMIN',
    resourceType: 'INCIDENT',
    resourceId: 'inc-002',
    resourceName: 'High Thermal & CPU Utilization',
    result: 'SUCCESS',
    source: 'WEB',
    ipAddress: '14.241.220.45',
    requestId: 'req-1204a98e-2026',
    traceId: 'trace-9812-c42a'
  },
  {
    id: 'aud-003',
    timestamp: '2026-08-09T19:15:00Z',
    category: 'CONFIGURATION',
    action: 'FEATURE_FLAG_TOGGLED',
    actorName: 'Anthony Nguyen',
    actorEmail: 'anh.nh@kyanon.digital',
    actorType: 'PLATFORM_ADMIN',
    resourceType: 'FEATURE_FLAG',
    resourceId: 'ff-002',
    resourceName: 'Driver Facial Verification at Gate Barrier',
    result: 'SUCCESS',
    source: 'WEB',
    ipAddress: '118.69.182.201',
    requestId: 'req-7711b23c-2026',
    traceId: 'trace-3310-f82b',
    changes: [
      {
        field: 'rolloutPercentage',
        before: 25,
        after: 50
      }
    ]
  },
  {
    id: 'aud-004',
    timestamp: '2026-08-09T18:00:00Z',
    category: 'AUTHENTICATION',
    action: 'PLATFORM_ADMIN_LOGIN',
    actorName: 'Johnathan Vance',
    actorEmail: 'johnathan.vance@platform.internal',
    actorType: 'PLATFORM_ADMIN',
    resourceType: 'SESSION',
    resourceId: 'sess-002',
    result: 'SUCCESS',
    source: 'WEB',
    ipAddress: '14.241.220.45',
    requestId: 'req-5544d12a-2026',
    traceId: 'trace-8821-d11a'
  }
];
