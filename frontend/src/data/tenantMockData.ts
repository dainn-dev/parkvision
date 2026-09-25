import {
  TenantLocation,
  TenantSite,
  AccessEvent,
  TenantAlertItem,
  AccessActivityDataPoint,
  TenantDashboardSummary,
  TenantSystemHealth,
  TenantVehicle,
  TenantAccessRule
} from '../types/tenant';

export const INITIAL_TENANT_LOCATION: TenantLocation = {
  id: '',
  tenantId: '',
  tenantName: '',
  name: 'No site configured',
  code: '—',
  status: 'INACTIVE',
  address: {
    line1: '—',
    line2: '',
    city: '—',
    province: '—',
    postalCode: '',
    country: '—'
  },
  timezone: 'UTC',
  latitude: 0,
  longitude: 0,
  phone: '—',
  email: '—',
  emergencyContact: '—',
  contactPerson: '—',
  capacity: 0,
  currentOccupancy: 0,
  createdAt: '',
  updatedAt: '',
  description: 'Create a site to activate this location.',
  operatingHours: {
    timezone: 'UTC',
    isOpen24_7: false,
    days: [
      { day: 'MONDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'TUESDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'WEDNESDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'THURSDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'FRIDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'SATURDAY', enabled: true, open: '00:00', close: '23:59' },
      { day: 'SUNDAY', enabled: true, open: '00:00', close: '23:59' }
    ]
  }
};

export const INITIAL_TENANT_SITES: TenantSite[] = [
  {
    id: 'site-001',
    name: 'Main Campus Facility',
    code: 'SITE-MC',
    tenantId: 't-001',
    tenantName: 'Acme Parking Systems',
    address: '120 Nguyen Hue Blvd, District 1, Ho Chi Minh City',
    status: 'HEALTHY',
    cameraCount: 20,
    onlineCameraCount: 20,
    gateCount: 4,
    onlineGateCount: 4,
    edgeDeviceCount: 3,
    onlineEdgeDeviceCount: 3,
    vehicleCount: 620,
    todayAccessCount: 5420,
    lanesCount: 4,
    operatingHours: '24/7 Operations',
    capacity: 800,
    currentOccupancy: 534,
    coordinates: { lat: 10.7769, lng: 106.7009 },
    createdAt: '2026-01-10T08:00:00Z',
    description: 'Corporate headquarters facility with automated barrier gates, dual-angle ANPR cameras, and real-time edge processing.',
    managerName: 'Le Hoang Nam',
    managerPhone: '+84 90 311 2233'
  }
];

export const INITIAL_TENANT_SUMMARY: TenantDashboardSummary = {
  sites: {
    total: 1,
    active: 1,
    inactive: 0
  },
  cameras: {
    total: 20,
    online: 20,
    offline: 0
  },
  gates: {
    total: 4,
    online: 4,
    offline: 0
  },
  vehicles: {
    total: 620,
    active: 598,
    inactive: 22,
    newThisMonth: 28
  },
  accessToday: {
    total: 5420,
    allowed: 5218,
    denied: 164,
    unknown: 38,
    percentChange: 12.4
  }
};

export const INITIAL_TENANT_HEALTH: TenantSystemHealth = {
  overall: 'HEALTHY',
  cameras: {
    total: 20,
    online: 20,
    offline: 0
  },
  gates: {
    total: 4,
    online: 4,
    offline: 0
  },
  edgeDevices: {
    total: 3,
    online: 3,
    offline: 0
  },
  api: 'HEALTHY',
  websocket: 'CONNECTED',
  apiLatencyMs: 18
};

export const INITIAL_TENANT_ALERTS: TenantAlertItem[] = [
  {
    id: 'alt-t-001',
    severity: 'WARNING',
    type: 'EDGE_HIGH_CPU',
    title: 'Lane 01 ANPR High Throughput',
    message: 'Edge Node 01 processing rate peaked at 38 reads/min during rush hour. Load balancing active.',
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    resourceId: 'edge-mc-01',
    resourceType: 'EDGE_DEVICE',
    createdAt: '2026-08-16T14:15:00+07:00',
    timeAgo: '15 minutes ago',
    status: 'OPEN',
    actionText: 'View Node',
    actionTarget: 'edge'
  },
  {
    id: 'alt-t-002',
    severity: 'WARNING',
    type: 'CAMERA_OFFLINE',
    title: 'CAM-04 Standby Stream',
    message: 'Backup ANPR camera on Lane OUT-02 switched to secondary RTSP stream with 99.1% clarity.',
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    resourceId: 'cam-mc-04',
    resourceType: 'CAMERA',
    createdAt: '2026-08-16T14:27:00+07:00',
    timeAgo: '5 minutes ago',
    status: 'OPEN',
    actionText: 'View Camera',
    actionTarget: 'cameras'
  }
];

export const INITIAL_ACCESS_ACTIVITY: AccessActivityDataPoint[] = [
  { time: '00:00', timestamp: '2026-08-16T00:00:00+07:00', allowed: 48, denied: 2, unknown: 0 },
  { time: '02:00', timestamp: '2026-08-16T02:00:00+07:00', allowed: 22, denied: 1, unknown: 0 },
  { time: '04:00', timestamp: '2026-08-16T04:00:00+07:00', allowed: 35, denied: 1, unknown: 0 },
  { time: '06:00', timestamp: '2026-08-16T06:00:00+07:00', allowed: 210, denied: 8, unknown: 2 },
  { time: '08:00', timestamp: '2026-08-16T08:00:00+07:00', allowed: 890, denied: 28, unknown: 6 },
  { time: '10:00', timestamp: '2026-08-16T10:00:00+07:00', allowed: 680, denied: 22, unknown: 4 },
  { time: '12:00', timestamp: '2026-08-16T12:00:00+07:00', allowed: 590, denied: 19, unknown: 5 },
  { time: '14:00', timestamp: '2026-08-16T14:00:00+07:00', allowed: 840, denied: 26, unknown: 7 },
  { time: '16:00', timestamp: '2026-08-16T16:00:00+07:00', allowed: 1050, denied: 34, unknown: 9 },
  { time: '18:00', timestamp: '2026-08-16T18:00:00+07:00', allowed: 620, denied: 16, unknown: 3 },
  { time: '20:00', timestamp: '2026-08-16T20:00:00+07:00', allowed: 180, denied: 5, unknown: 2 },
  { time: '22:00', timestamp: '2026-08-16T22:00:00+07:00', allowed: 53, denied: 2, unknown: 0 }
];

export const INITIAL_RECENT_ACCESS_EVENTS: AccessEvent[] = [
  {
    id: 'evt-001',
    timestamp: '2026-08-16T14:32:01+07:00',
    timeFormatted: '14:32:01',
    plate: '29A-123.45',
    plateConfidence: 0.987,
    detectionConfidence: 0.963,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-01',
    gateName: 'Entrance Gate 01',
    laneName: 'Lane 01 (Inbound Main)',
    direction: 'IN',
    decision: 'ALLOWED',
    vehicleType: 'Sedan',
    vehicleModel: 'Toyota Camry 2024',
    vehicleColor: 'Pearl White',
    ownerName: 'Nguyen Van A',
    ownerType: 'EMPLOYEE',
    ownerDepartment: 'Executive Operations',
    accessRule: 'Employee Standard Access · 24/7 Gate IN-01',
    reason: 'Plate matched in Tenant Allow-List #AL-4091',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-002',
    timestamp: '2026-08-16T14:31:54+07:00',
    timeFormatted: '14:31:54',
    plate: '51F-998.81',
    plateConfidence: 0.942,
    detectionConfidence: 0.931,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-01',
    gateName: 'Entrance Gate 01',
    laneName: 'Lane 01 (Inbound Main)',
    direction: 'IN',
    decision: 'DENIED',
    vehicleType: 'SUV',
    vehicleModel: 'Ford Everest',
    vehicleColor: 'Midnight Black',
    ownerName: 'Unregistered Visitor',
    ownerType: 'VISITOR',
    accessRule: 'Default Reject Unknown Vehicles',
    reason: 'Vehicle plate not registered in tenant database or visitor schedule.',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-003',
    timestamp: '2026-08-16T14:31:44+07:00',
    timeFormatted: '14:31:44',
    plate: '30H-222.22',
    plateConfidence: 0.994,
    detectionConfidence: 0.985,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-02',
    gateName: 'Entrance Gate 02 VIP',
    laneName: 'Lane 02 (VIP FastTrack)',
    direction: 'IN',
    decision: 'ALLOWED',
    vehicleType: 'Luxury Sedan',
    vehicleModel: 'Mercedes-Benz S450',
    vehicleColor: 'Obsidian Black',
    ownerName: 'Tran Minh Chau',
    ownerType: 'VIP',
    ownerDepartment: 'Board of Directors',
    accessRule: 'Executive Priority All-Gate Pass',
    reason: 'VIP Allow-List Match #VIP-004 · Auto-barrier trigger',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-004',
    timestamp: '2026-08-16T14:31:21+07:00',
    timeFormatted: '14:31:21',
    plate: '59C-338.90',
    plateConfidence: 0.812,
    detectionConfidence: 0.884,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-01',
    gateName: 'Entrance Gate 01',
    laneName: 'Lane 01 (Inbound Main)',
    direction: 'IN',
    decision: 'UNKNOWN',
    vehicleType: 'Heavy Truck',
    vehicleModel: 'Isuzu Giga 15T',
    vehicleColor: 'Silver White',
    ownerName: 'Contractor Logistics Co',
    ownerType: 'CONTRACTOR',
    accessRule: 'Logistics Freight Delivery Rule',
    reason: 'Plate partially obscured by dust. OCR confidence below 85% threshold.',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-005',
    timestamp: '2026-08-16T14:30:48+07:00',
    timeFormatted: '14:30:48',
    plate: '43A-778.19',
    plateConfidence: 0.978,
    detectionConfidence: 0.961,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-02',
    gateName: 'Entrance Gate 02 VIP',
    laneName: 'Lane 02 (VIP FastTrack)',
    direction: 'IN',
    decision: 'ALLOWED',
    vehicleType: 'Van / Light Truck',
    vehicleModel: 'Hyundai Solati',
    vehicleColor: 'White',
    ownerName: 'DHL Express Dispatcher',
    ownerType: 'CONTRACTOR',
    ownerDepartment: 'Logistics Unit',
    accessRule: 'Contractor Authorized Delivery Access',
    reason: 'Valid permit #AC-2026-881 verified.',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-006',
    timestamp: '2026-08-16T14:29:55+07:00',
    timeFormatted: '14:29:55',
    plate: '60A-445.12',
    plateConfidence: 0.965,
    detectionConfidence: 0.952,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-03',
    gateName: 'Exit Gate 01',
    laneName: 'Lane 03 (Outbound FastPass)',
    direction: 'OUT',
    decision: 'ALLOWED',
    vehicleType: 'Sedan',
    vehicleModel: 'Honda Civic RS',
    vehicleColor: 'Sonic Gray',
    ownerName: 'Pham Quoc Bao',
    ownerType: 'EMPLOYEE',
    ownerDepartment: 'Product Engineering',
    accessRule: 'Employee Standard Access',
    reason: 'Exit clearance authenticated. Duration: 4h 12m',
    verifiedBy: 'Edge AI OCR Engine v4.2'
  },
  {
    id: 'evt-007',
    timestamp: '2026-08-16T14:28:10+07:00',
    timeFormatted: '14:28:10',
    plate: '51K-881.00',
    plateConfidence: 0.989,
    detectionConfidence: 0.973,
    siteId: 'site-001',
    siteName: 'Main Campus Facility',
    gateId: 'gate-mc-01',
    gateName: 'Entrance Gate 01',
    laneName: 'Lane 01 (Inbound Main)',
    direction: 'IN',
    decision: 'BLOCKED',
    vehicleType: 'SUV',
    vehicleModel: 'Lexus RX350',
    vehicleColor: 'Caviar Black',
    ownerName: 'Flagged Security Record',
    ownerType: 'UNKNOWN',
    accessRule: 'Tenant Security Block-List Rule',
    reason: 'Flagged in Security Blacklist: Repeated unauthorized tailgating incident #SEC-9921',
    verifiedBy: 'Security Guard Auto-Alert'
  }
];

export const INITIAL_REGISTERED_VEHICLES = [
  {
    id: 'veh-001',
    plate: '51A-123.45',
    ownerName: 'Nguyen Van An',
    model: 'Toyota Camry 2.5Q',
    type: 'Sedan',
    status: 'ACTIVE' as const,
    registeredAt: '2026-01-15'
  },
  {
    id: 'veh-002',
    plate: '51F-998.81',
    ownerName: 'Tran Thi Binh',
    model: 'Honda CR-V e:HEV',
    type: 'SUV',
    status: 'ACTIVE' as const,
    registeredAt: '2026-02-01'
  },
  {
    id: 'veh-003',
    plate: '50H-123.45',
    ownerName: 'Acme Pool Fleet #04',
    model: 'Ford Transit Commercial',
    type: 'Van',
    status: 'BLOCKED' as const,
    registeredAt: '2026-02-18'
  },
  {
    id: 'veh-004',
    plate: '30H-222.22',
    ownerName: 'John Nguyen',
    model: 'Mercedes-Benz S450 Luxury',
    type: 'Sedan',
    status: 'ACTIVE' as const,
    registeredAt: '2026-03-05'
  },
  {
    id: 'veh-005',
    plate: '43A-778.19',
    ownerName: 'DHL Express Supply',
    model: 'Hyundai Solati Van',
    type: 'Van',
    status: 'ACTIVE' as const,
    registeredAt: '2026-03-12'
  }
];

export const INITIAL_TENANT_VEHICLES: TenantVehicle[] = [
  {
    id: 'veh-001',
    tenantId: 'tenant-001',
    name: 'Toyota Camry',
    make: 'Toyota',
    model: 'Camry 2.5Q',
    year: 2025,
    color: 'White',
    vin: '1HGCR2F83HA003456',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Executive commuter vehicle assigned to General Director.',
    currentPlate: {
      id: 'plt-001',
      number: '51A-12345',
      normalizedPlate: '51A-12345',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-01-10',
      registeredAt: '2026-01-10T08:00:00+07:00'
    },
    previousPlates: [
      {
        id: 'plt-001-prev',
        number: '51A-88888',
        normalizedPlate: '51A-88888',
        country: 'Vietnam',
        province: 'Ho Chi Minh City',
        status: 'INACTIVE',
        validFrom: '2024-01-15',
        validTo: '2025-12-31',
        registeredAt: '2024-01-15T09:00:00+07:00',
        notes: 'Plate upgraded to new registration series.'
      }
    ],
    memberId: 'mem-001',
    member: {
      id: 'mem-001',
      userId: 'user-002',
      code: 'MEM-000101',
      name: 'Nguyen Van An',
      email: 'nguyen.an@company.com',
      phone: '+84 91 888 7766',
      department: 'Executive Leadership',
      type: 'EMPLOYEE',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Active employee whitelist permit with 24/7 priority gate access.',
    appliedRules: ['Employee Standard 24/7 Access', 'Executive FastPass Green Lane'],
    lastSeenAt: '2026-08-16T19:52:10+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.987,
    lastSeenPlate: '51A-12345',
    assignmentHistory: [
      {
        id: 'asg-001',
        memberId: 'mem-001',
        memberName: 'Nguyen Van An',
        memberCode: 'MEM-000101',
        assignedAt: '2026-01-10T08:00:00+07:00',
        assignedBy: 'Anthony Nguyen (Tenant Admin)'
      }
    ],
    auditHistory: [
      {
        id: 'aud-001',
        vehicleId: 'veh-001',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Enrolled new vehicle Toyota Camry with plate 51A-12345.',
        timestamp: '2026-01-10T08:00:00+07:00'
      },
      {
        id: 'aud-002',
        vehicleId: 'veh-001',
        action: 'VEHICLE_ASSIGNED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Assigned vehicle to Member Nguyen Van An (MEM-000101).',
        timestamp: '2026-01-10T08:05:00+07:00'
      },
      {
        id: 'aud-003',
        vehicleId: 'veh-001',
        action: 'VEHICLE_PLATE_ADDED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Registered active license plate 51A-12345 (Ho Chi Minh City).',
        timestamp: '2026-01-10T08:10:00+07:00'
      }
    ],
    createdAt: '2026-01-10T08:00:00+07:00',
    updatedAt: '2026-08-16T19:00:00+07:00'
  },
  {
    id: 'veh-002',
    tenantId: 'tenant-001',
    name: 'Honda CR-V',
    make: 'Honda',
    model: 'CR-V e:HEV RS',
    year: 2024,
    color: 'Silver',
    vin: '2HKRW2H87NH119283',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Operations manager daily transport.',
    currentPlate: {
      id: 'plt-002',
      number: '51F-99881',
      normalizedPlate: '51F-99881',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-02-01',
      registeredAt: '2026-02-01T09:00:00+07:00'
    },
    memberId: 'mem-002',
    member: {
      id: 'mem-002',
      userId: 'user-003',
      code: 'MEM-000102',
      name: 'Tran Thi Binh',
      email: 'binh.tran@company.com',
      phone: '+84 98 765 4321',
      department: 'Facility Operations',
      type: 'STAFF',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Standard scheduled staff pass authorized.',
    appliedRules: ['Standard Working Hours Access'],
    lastSeenAt: '2026-08-16T19:32:00+07:00',
    lastSeenGate: 'Gate OUT-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.992,
    lastSeenPlate: '51F-99881',
    assignmentHistory: [
      {
        id: 'asg-002',
        memberId: 'mem-002',
        memberName: 'Tran Thi Binh',
        memberCode: 'MEM-000102',
        assignedAt: '2026-02-01T09:00:00+07:00',
        assignedBy: 'Anthony Nguyen (Tenant Admin)'
      }
    ],
    auditHistory: [
      {
        id: 'aud-004',
        vehicleId: 'veh-002',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Enrolled vehicle Honda CR-V with plate 51F-99881.',
        timestamp: '2026-02-01T09:00:00+07:00'
      }
    ],
    createdAt: '2026-02-01T09:00:00+07:00',
    updatedAt: '2026-08-16T19:32:00+07:00'
  },
  {
    id: 'veh-003',
    tenantId: 'tenant-001',
    name: 'Ford Transit',
    make: 'Ford',
    model: 'Transit Mid-Roof Van',
    year: 2023,
    color: 'White',
    vin: '1FTBR1Y89PKA89211',
    type: 'VAN',
    status: 'SUSPENDED',
    suspendedReason: 'Outstanding inspection violation #SEC-9921 and expired emission permit.',
    suspendedAt: '2026-08-15T10:00:00+07:00',
    description: 'Company maintenance fleet pool van.',
    currentPlate: {
      id: 'plt-003',
      number: '50H-12345',
      normalizedPlate: '50H-12345',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-01-20',
      registeredAt: '2026-01-20T10:00:00+07:00'
    },
    memberId: null,
    member: null,
    accessStatus: 'DENIED',
    accessStatusReason: 'Vehicle status is SUSPENDED. Overrides normal allow rules.',
    appliedRules: ['Fleet Pool Logistics Access (Overridden by Suspension)'],
    lastSeenAt: '2026-08-15T08:02:13+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'DENIED',
    lastSeenConfidence: 0.914,
    lastSeenPlate: '50H-12345',
    assignmentHistory: [
      {
        id: 'asg-003',
        memberId: null,
        memberName: 'Unassigned / Organization Fleet',
        assignedAt: '2026-01-20T10:00:00+07:00',
        assignedBy: 'System Administrator'
      }
    ],
    auditHistory: [
      {
        id: 'aud-005',
        vehicleId: 'veh-003',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created organization fleet vehicle Ford Transit.',
        timestamp: '2026-01-20T10:00:00+07:00'
      },
      {
        id: 'aud-006',
        vehicleId: 'veh-003',
        action: 'VEHICLE_SUSPENDED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Suspended vehicle access: Outstanding inspection violation #SEC-9921.',
        reason: 'Outstanding inspection violation #SEC-9921 and expired emission permit.',
        timestamp: '2026-08-15T10:00:00+07:00'
      }
    ],
    createdAt: '2026-01-20T10:00:00+07:00',
    updatedAt: '2026-08-15T10:00:00+07:00'
  },
  {
    id: 'veh-004',
    tenantId: 'tenant-001',
    name: 'Mercedes-Benz S450',
    make: 'Mercedes-Benz',
    model: 'S450 4MATIC Luxury',
    year: 2025,
    color: 'Black',
    vin: 'WDD2230601A987654',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Chairman executive VIP sedan.',
    currentPlate: {
      id: 'plt-004',
      number: '30H-22222',
      normalizedPlate: '30H-22222',
      country: 'Vietnam',
      province: 'Hanoi',
      status: 'ACTIVE',
      validFrom: '2026-01-12',
      registeredAt: '2026-01-12T09:00:00+07:00'
    },
    memberId: 'mem-001',
    member: {
      id: 'mem-001',
      userId: 'user-002',
      code: 'MEM-000101',
      name: 'John Nguyen',
      email: 'john.nguyen@company.com',
      phone: '+84 91 888 7766',
      department: 'Executive Leadership',
      type: 'EMPLOYEE',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'VIP Executive Override: Automatic high-speed green barrier clearance.',
    appliedRules: ['Executive & VIP Priority Pass', '24/7 Unlimited Access'],
    lastSeenAt: '2026-08-16T14:31:44+07:00',
    lastSeenGate: 'Gate MC-02 VIP',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.994,
    lastSeenPlate: '30H-22222',
    assignmentHistory: [
      {
        id: 'asg-004',
        memberId: 'mem-001',
        memberName: 'John Nguyen',
        memberCode: 'MEM-000101',
        assignedAt: '2026-01-12T09:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-007',
        vehicleId: 'veh-004',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created VIP vehicle Mercedes-Benz S450.',
        timestamp: '2026-01-12T09:00:00+07:00'
      }
    ],
    createdAt: '2026-01-12T09:00:00+07:00',
    updatedAt: '2026-08-16T14:31:44+07:00'
  },
  {
    id: 'veh-005',
    tenantId: 'tenant-001',
    name: 'VinFast VF8',
    make: 'VinFast',
    model: 'VF8 Plus Dual Motor',
    year: 2025,
    color: 'Red',
    vin: 'VF8A9283741829384',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'R&D Director electric SUV with priority EV charging bay access.',
    currentPlate: {
      id: 'plt-005',
      number: '50H-11233',
      normalizedPlate: '50H-11233',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-02-01',
      registeredAt: '2026-02-01T08:00:00+07:00'
    },
    memberId: 'mem-003',
    member: {
      id: 'mem-003',
      userId: 'user-004',
      code: 'MEM-000103',
      name: 'Bob Nguyen',
      email: 'bob.nguyen@company.com',
      phone: '+84 93 456 7890',
      department: 'Engineering & R&D',
      type: 'EMPLOYEE',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Standard employee parking permit active.',
    appliedRules: ['Standard Working Hours Access'],
    lastSeenAt: '2026-08-16T12:15:30+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.988,
    lastSeenPlate: '50H-11233',
    assignmentHistory: [
      {
        id: 'asg-005',
        memberId: 'mem-003',
        memberName: 'Bob Nguyen',
        memberCode: 'MEM-000103',
        assignedAt: '2026-02-01T08:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-008',
        vehicleId: 'veh-005',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created electric SUV VinFast VF8.',
        timestamp: '2026-02-01T08:00:00+07:00'
      }
    ],
    createdAt: '2026-02-01T08:00:00+07:00',
    updatedAt: '2026-08-16T12:15:30+07:00'
  },
  {
    id: 'veh-006',
    tenantId: 'tenant-001',
    name: 'BMW 330i',
    make: 'BMW',
    model: '330i M Sport',
    year: 2024,
    color: 'Gray',
    vin: 'WBA5R7C58PFP19283',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'External auditing consultant vehicle.',
    currentPlate: {
      id: 'plt-006',
      number: '29C-44567',
      normalizedPlate: '29C-44567',
      country: 'Vietnam',
      province: 'Hanoi',
      status: 'ACTIVE',
      validFrom: '2026-03-01',
      registeredAt: '2026-03-01T09:00:00+07:00'
    },
    memberId: 'mem-005',
    member: {
      id: 'mem-005',
      userId: 'user-006',
      code: 'MEM-000105',
      name: 'Sarah Pham',
      email: 'sarah.pham@partner.vn',
      phone: '+84 90 882 1199',
      department: 'Auditing Consultant',
      type: 'CUSTOMER',
      status: 'SUSPENDED'
    },
    accessStatus: 'DENIED',
    accessStatusReason: 'Associated member profile MEM-000105 is SUSPENDED (Settlement pending).',
    appliedRules: ['Consultant Contractor Schedule (Blocked by Member Status)'],
    lastSeenAt: '2026-08-13T16:22:11+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'DENIED',
    lastSeenConfidence: 0.965,
    lastSeenPlate: '29C-44567',
    assignmentHistory: [
      {
        id: 'asg-006',
        memberId: 'mem-005',
        memberName: 'Sarah Pham',
        memberCode: 'MEM-000105',
        assignedAt: '2026-03-01T09:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-009',
        vehicleId: 'veh-006',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created consultant vehicle BMW 330i.',
        timestamp: '2026-03-01T09:00:00+07:00'
      }
    ],
    createdAt: '2026-03-01T09:00:00+07:00',
    updatedAt: '2026-08-13T16:22:11+07:00'
  },
  {
    id: 'veh-007',
    tenantId: 'tenant-001',
    name: 'Hyundai Solati',
    make: 'Hyundai',
    model: 'Solati H350 High-Roof',
    year: 2024,
    color: 'White',
    vin: 'KMJHA37WPPU129384',
    type: 'VAN',
    status: 'ACTIVE',
    description: 'Contractor logistics supply courier van.',
    currentPlate: {
      id: 'plt-007',
      number: '43A-77819',
      normalizedPlate: '43A-77819',
      country: 'Vietnam',
      province: 'Da Nang',
      status: 'ACTIVE',
      validFrom: '2026-03-12',
      registeredAt: '2026-03-12T10:00:00+07:00'
    },
    memberId: null,
    member: null,
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Contractor Logistics Gate Permit verified and active.',
    appliedRules: ['Contractor Logistics Gate Permit'],
    lastSeenAt: '2026-08-16T14:30:48+07:00',
    lastSeenGate: 'Gate MC-02 VIP',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.978,
    lastSeenPlate: '43A-77819',
    assignmentHistory: [],
    auditHistory: [
      {
        id: 'aud-010',
        vehicleId: 'veh-007',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Enrolled unassigned contractor delivery van Hyundai Solati.',
        timestamp: '2026-03-12T10:00:00+07:00'
      }
    ],
    createdAt: '2026-03-12T10:00:00+07:00',
    updatedAt: '2026-08-16T14:30:48+07:00'
  },
  {
    id: 'veh-008',
    tenantId: 'tenant-001',
    name: 'Ford Ranger',
    make: 'Ford',
    model: 'Ranger Wildtrak 2.0L Bi-Turbo',
    year: 2024,
    color: 'Orange',
    vin: 'MNAUMFF50PW123847',
    type: 'TRUCK',
    status: 'ACTIVE',
    description: 'Field operations utility pickup truck.',
    currentPlate: {
      id: 'plt-008',
      number: '29C-77890',
      normalizedPlate: '29C-77890',
      country: 'Vietnam',
      province: 'Hanoi',
      status: 'ACTIVE',
      validFrom: '2026-02-18',
      registeredAt: '2026-02-18T08:30:00+07:00'
    },
    memberId: 'mem-004',
    member: {
      id: 'mem-004',
      userId: 'user-005',
      code: 'MEM-000104',
      name: 'David Tran',
      email: 'david.tran@company.com',
      phone: '+84 97 123 9988',
      department: 'Sales & Marketing',
      type: 'EMPLOYEE',
      status: 'PENDING'
    },
    accessStatus: 'RESTRICTED',
    accessStatusReason: 'Member verification is pending; restricted to visitor gates 08:00 - 18:00.',
    appliedRules: ['Temporary Pending Member Allowance'],
    lastSeenAt: '2026-08-16T11:40:12+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.971,
    lastSeenPlate: '29C-77890',
    assignmentHistory: [
      {
        id: 'asg-007',
        memberId: 'mem-004',
        memberName: 'David Tran',
        memberCode: 'MEM-000104',
        assignedAt: '2026-02-18T08:30:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-011',
        vehicleId: 'veh-008',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created pickup vehicle Ford Ranger Wildtrak.',
        timestamp: '2026-02-18T08:30:00+07:00'
      }
    ],
    createdAt: '2026-02-18T08:30:00+07:00',
    updatedAt: '2026-08-16T11:40:12+07:00'
  },
  {
    id: 'veh-009',
    tenantId: 'tenant-001',
    name: 'Mazda 3',
    make: 'Mazda',
    model: 'Mazda 3 Sedan Luxury',
    year: 2024,
    color: 'Red',
    vin: 'JM1BP2M76N1029384',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Staff daily commuter car.',
    currentPlate: {
      id: 'plt-009',
      number: '51G-88219',
      normalizedPlate: '51G-88219',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-01-15',
      registeredAt: '2026-01-15T09:00:00+07:00'
    },
    memberId: 'mem-002',
    member: {
      id: 'mem-002',
      userId: 'user-003',
      code: 'MEM-000102',
      name: 'Alice Tran',
      email: 'alice.tran@company.com',
      phone: '+84 98 765 4321',
      department: 'Facility Operations',
      type: 'STAFF',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Facility operations staff pass active.',
    appliedRules: ['Standard Working Hours Access'],
    lastSeenAt: '2026-08-16T08:30:00+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.985,
    lastSeenPlate: '51G-88219',
    assignmentHistory: [
      {
        id: 'asg-008',
        memberId: 'mem-002',
        memberName: 'Alice Tran',
        memberCode: 'MEM-000102',
        assignedAt: '2026-01-15T09:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-012',
        vehicleId: 'veh-009',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created Mazda 3 vehicle for Alice Tran.',
        timestamp: '2026-01-15T09:00:00+07:00'
      }
    ],
    createdAt: '2026-01-15T09:00:00+07:00',
    updatedAt: '2026-08-16T08:30:00+07:00'
  },
  {
    id: 'veh-010',
    tenantId: 'tenant-001',
    name: 'Lexus RX350',
    make: 'Lexus',
    model: 'RX350 Luxury AWD',
    year: 2023,
    color: 'Black',
    vin: '2T2BZMCA4PC019283',
    type: 'CAR',
    status: 'ARCHIVED',
    description: 'Decommissioned executive leased vehicle.',
    currentPlate: {
      id: 'plt-010',
      number: '51K-88100',
      normalizedPlate: '51K-88100',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'INACTIVE',
      validFrom: '2025-01-01',
      validTo: '2026-06-30',
      registeredAt: '2025-01-01T08:00:00+07:00',
      notes: 'Lease expired and vehicle returned to vendor.'
    },
    memberId: null,
    member: null,
    accessStatus: 'DENIED',
    accessStatusReason: 'Vehicle is ARCHIVED / DECOMMISSIONED.',
    appliedRules: [],
    lastSeenAt: '2026-08-16T14:28:10+07:00',
    lastSeenGate: 'Gate IN-01',
    lastSeenDecision: 'BLOCKED',
    lastSeenConfidence: 0.989,
    lastSeenPlate: '51K-88100',
    assignmentHistory: [],
    auditHistory: [
      {
        id: 'aud-013',
        vehicleId: 'veh-010',
        action: 'VEHICLE_ARCHIVED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Archived vehicle following lease completion.',
        timestamp: '2026-07-01T09:00:00+07:00'
      }
    ],
    createdAt: '2025-01-01T08:00:00+07:00',
    updatedAt: '2026-07-01T09:00:00+07:00'
  },
  {
    id: 'veh-011',
    tenantId: 'tenant-001',
    name: 'Porsche Cayenne',
    make: 'Porsche',
    model: 'Cayenne Turbo GT',
    year: 2025,
    color: 'White',
    vin: 'WP1AA2AY5PDA01928',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Executive board second VIP vehicle.',
    currentPlate: {
      id: 'plt-011',
      number: '30E-99901',
      normalizedPlate: '30E-99901',
      country: 'Vietnam',
      province: 'Hanoi',
      status: 'ACTIVE',
      validFrom: '2026-01-12',
      registeredAt: '2026-01-12T09:00:00+07:00'
    },
    memberId: 'mem-001',
    member: {
      id: 'mem-001',
      userId: 'user-002',
      code: 'MEM-000101',
      name: 'John Nguyen',
      email: 'john.nguyen@company.com',
      phone: '+84 91 888 7766',
      department: 'Executive Leadership',
      type: 'EMPLOYEE',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'VIP Executive Pass authorized 24/7.',
    appliedRules: ['Executive & VIP Priority Pass'],
    lastSeenAt: '2026-08-16T10:11:00+07:00',
    lastSeenGate: 'Gate MC-02 VIP',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.991,
    lastSeenPlate: '30E-99901',
    assignmentHistory: [
      {
        id: 'asg-009',
        memberId: 'mem-001',
        memberName: 'John Nguyen',
        memberCode: 'MEM-000101',
        assignedAt: '2026-01-12T09:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-014',
        vehicleId: 'veh-011',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created VIP vehicle Porsche Cayenne Turbo.',
        timestamp: '2026-01-12T09:00:00+07:00'
      }
    ],
    createdAt: '2026-01-12T09:00:00+07:00',
    updatedAt: '2026-08-16T10:11:00+07:00'
  },
  {
    id: 'veh-012',
    tenantId: 'tenant-001',
    name: 'Honda City',
    make: 'Honda',
    model: 'City RS 1.5L',
    year: 2024,
    color: 'White',
    vin: 'MRHGN2F70NP019283',
    type: 'CAR',
    status: 'ACTIVE',
    description: 'Engineering department employee vehicle.',
    currentPlate: {
      id: 'plt-012',
      number: '51A-99211',
      normalizedPlate: '51A-99211',
      country: 'Vietnam',
      province: 'Ho Chi Minh City',
      status: 'ACTIVE',
      validFrom: '2026-02-01',
      registeredAt: '2026-02-01T08:00:00+07:00'
    },
    memberId: 'mem-003',
    member: {
      id: 'mem-003',
      userId: 'user-004',
      code: 'MEM-000103',
      name: 'Bob Nguyen',
      email: 'bob.nguyen@company.com',
      phone: '+84 93 456 7890',
      department: 'Engineering & R&D',
      type: 'EMPLOYEE',
      status: 'ACTIVE'
    },
    accessStatus: 'ALLOWED',
    accessStatusReason: 'Standard employee parking permit active.',
    appliedRules: ['Standard Working Hours Access'],
    lastSeenAt: '2026-08-15T18:20:00+07:00',
    lastSeenGate: 'Gate OUT-01',
    lastSeenDecision: 'ALLOWED',
    lastSeenConfidence: 0.984,
    lastSeenPlate: '51A-99211',
    assignmentHistory: [
      {
        id: 'asg-010',
        memberId: 'mem-003',
        memberName: 'Bob Nguyen',
        memberCode: 'MEM-000103',
        assignedAt: '2026-02-01T08:00:00+07:00',
        assignedBy: 'Anthony Nguyen'
      }
    ],
    auditHistory: [
      {
        id: 'aud-015',
        vehicleId: 'veh-012',
        action: 'VEHICLE_CREATED',
        actorName: 'Anthony Nguyen',
        actorRole: 'Tenant Admin',
        description: 'Created Honda City for Bob Nguyen.',
        timestamp: '2026-02-01T08:00:00+07:00'
      }
    ],
    createdAt: '2026-02-01T08:00:00+07:00',
    updatedAt: '2026-08-15T18:20:00+07:00'
  }
];

export const INITIAL_TENANT_ACCESS_RULES: TenantAccessRule[] = [
  {
    id: 'rule-001',
    tenantId: 't-001',
    code: 'SECURITY-BLOCKLIST',
    name: 'Flagged Security Blocklist',
    description: 'Instant barrier denial and guard alert for vehicles flagged in security incidents or tailgating infractions.',
    action: 'DENY',
    priority: 1,
    status: 'ACTIVE',
    target: {
      type: 'LICENSE_PLATE',
      licensePlate: '51K-881.00',
      notes: 'Repeated tailgating incident #SEC-9921'
    },
    scope: {
      allSites: true,
      siteIds: ['ALL_SITES'],
      siteNames: ['All Facilities'],
      allGates: true,
      gateIds: ['ALL_GATES'],
      gateNames: ['All Gates']
    },
    schedule: {
      type: 'ALWAYS',
      timezone: 'Asia/Ho_Chi_Minh',
      summaryText: 'Always Active (24/7)'
    },
    advanced: {
      minConfidence: 85,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-01-01T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-01',
        action: 'CREATED',
        timestamp: '2026-01-01T08:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Created Priority 1 Security Blocklist rule for plate 51K-881.00.'
      }
    ],
    createdAt: '2026-01-01T08:00:00+07:00',
    updatedAt: '2026-01-01T08:00:00+07:00',
    type: 'SECURITY_BLOCKLIST',
    scheduleSummary: 'Always (24/7)',
    sites: ['ALL'],
    gates: ['ALL'],
    actionOnMatch: 'DENIED'
  },
  {
    id: 'rule-002',
    tenantId: 't-001',
    code: 'VIP-ALL-GATES',
    name: 'Executive & VIP Priority Pass',
    description: 'Unrestricted 24/7 fast-track lane pass for Board of Directors and VIP corporate executives.',
    action: 'ALLOW',
    priority: 10,
    status: 'ACTIVE',
    target: {
      type: 'MEMBER_GROUP',
      memberGroup: 'VIP',
      notes: 'Applies to all members with VIP status and their registered vehicles.'
    },
    scope: {
      allSites: true,
      siteIds: ['ALL_SITES'],
      siteNames: ['All Facilities'],
      allGates: true,
      gateIds: ['ALL_GATES'],
      gateNames: ['All Gates (Including VIP FastTrack)']
    },
    schedule: {
      type: 'ALWAYS',
      timezone: 'Asia/Ho_Chi_Minh',
      summaryText: 'Always Active (24/7)'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-01-10T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-02',
        action: 'CREATED',
        timestamp: '2026-01-10T09:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Created VIP Priority Pass at Priority #10.'
      }
    ],
    createdAt: '2026-01-10T09:00:00+07:00',
    updatedAt: '2026-01-10T09:00:00+07:00',
    type: 'VIP_OVERRIDE',
    scheduleSummary: '24/7 Unlimited Access',
    sites: ['ALL'],
    gates: ['ALL'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-003',
    tenantId: 't-001',
    code: 'EMPLOYEE-PARKING',
    name: 'Employee Standard Working Hours Access',
    description: 'Permits company employees to enter campus parking during weekdays and operational office hours.',
    action: 'ALLOW',
    priority: 30,
    status: 'ACTIVE',
    target: {
      type: 'MEMBER_GROUP',
      memberGroup: 'EMPLOYEE',
      notes: 'Full-time and contractor staff registered under tenant organization.'
    },
    scope: {
      allSites: false,
      siteIds: ['site-001'],
      siteNames: ['Main Campus Facility'],
      allGates: false,
      gateIds: ['gate-mc-01', 'gate-mc-03'],
      gateNames: ['Entrance Gate 01', 'Exit Gate 01']
    },
    schedule: {
      type: 'WEEKLY',
      timezone: 'Asia/Ho_Chi_Minh',
      days: [
        { day: 'MONDAY', enabled: true, windows: [{ start: '06:00', end: '21:00' }] },
        { day: 'TUESDAY', enabled: true, windows: [{ start: '06:00', end: '21:00' }] },
        { day: 'WEDNESDAY', enabled: true, windows: [{ start: '06:00', end: '21:00' }] },
        { day: 'THURSDAY', enabled: true, windows: [{ start: '06:00', end: '21:00' }] },
        { day: 'FRIDAY', enabled: true, windows: [{ start: '06:00', end: '21:00' }] },
        { day: 'SATURDAY', enabled: false, windows: [] },
        { day: 'SUNDAY', enabled: false, windows: [] }
      ],
      summaryText: 'Mon - Fri · 06:00 - 21:00'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-01-15T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-03',
        action: 'CREATED',
        timestamp: '2026-01-15T10:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Configured standard employee weekday parking schedule.'
      }
    ],
    createdAt: '2026-01-15T10:00:00+07:00',
    updatedAt: '2026-01-15T10:00:00+07:00',
    type: 'SCHEDULED_WHITELIST',
    scheduleSummary: 'Mon - Fri: 06:00 - 21:00',
    sites: ['site-001'],
    gates: ['gate-mc-01', 'gate-mc-03'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-004',
    tenantId: 't-001',
    code: 'CONTRACTOR-FREIGHT',
    name: 'Contractor Logistics Gate Permit',
    description: 'Dedicated logistics freight access for supply deliveries and verified contractor cargo vehicles.',
    action: 'ALLOW',
    priority: 50,
    status: 'ACTIVE',
    target: {
      type: 'MEMBER_GROUP',
      memberGroup: 'CONTRACTOR',
      notes: 'Third-party logistics, catering, and facility vendors.'
    },
    scope: {
      allSites: false,
      siteIds: ['site-001'],
      siteNames: ['Main Campus Facility'],
      allGates: false,
      gateIds: ['gate-cargo-01'],
      gateNames: ['Cargo Logistics Gate 01']
    },
    schedule: {
      type: 'WEEKLY',
      timezone: 'Asia/Ho_Chi_Minh',
      days: [
        { day: 'MONDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'TUESDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'WEDNESDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'THURSDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'FRIDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'SATURDAY', enabled: true, windows: [{ start: '08:00', end: '18:00' }] },
        { day: 'SUNDAY', enabled: false, windows: [] }
      ],
      summaryText: 'Mon - Sat · 08:00 - 18:00'
    },
    advanced: {
      minConfidence: 88,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-02-01T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-04',
        action: 'CREATED',
        timestamp: '2026-02-01T11:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Added contractor freight loading bay access.'
      }
    ],
    createdAt: '2026-02-01T11:00:00+07:00',
    updatedAt: '2026-02-01T11:00:00+07:00',
    type: 'CONTRACTOR_SCHEDULE',
    scheduleSummary: 'Mon - Sat: 08:00 - 18:00',
    sites: ['site-001'],
    gates: ['gate-cargo-01'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-005',
    tenantId: 't-001',
    code: 'VISITOR-DAY-PASS',
    name: 'Pre-Registered Visitor Day Pass',
    description: 'Automated barrier access for visitors with active daily appointments.',
    action: 'ALLOW',
    priority: 70,
    status: 'SCHEDULED',
    target: {
      type: 'VISITOR',
      notes: 'Scheduled visitor badge holders and pre-registered guests.'
    },
    scope: {
      allSites: false,
      siteIds: ['site-001'],
      siteNames: ['Main Campus Facility'],
      allGates: false,
      gateIds: ['gate-mc-01'],
      gateNames: ['Entrance Gate 01']
    },
    schedule: {
      type: 'DATE_RANGE',
      timezone: 'Asia/Ho_Chi_Minh',
      startDate: '2026-09-15',
      startTime: '08:00',
      endDate: '2026-09-15',
      endTime: '18:00',
      summaryText: 'Sep 15, 2026 · 08:00 - 18:00'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-09-15T08:00:00+07:00',
    validUntil: '2026-09-15T18:00:00+07:00',
    auditHistory: [
      {
        id: 'aud-r-05',
        action: 'CREATED',
        timestamp: '2026-09-10T14:00:00+07:00',
        actorName: 'Alice Tran',
        actorEmail: 'alice.tran@company.com',
        details: 'Scheduled upcoming visitor access permit.'
      }
    ],
    createdAt: '2026-09-10T14:00:00+07:00',
    updatedAt: '2026-09-10T14:00:00+07:00',
    type: 'VISITOR_PASS',
    scheduleSummary: 'Sep 15, 2026 · 08:00 - 18:00',
    sites: ['site-001'],
    gates: ['gate-mc-01'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-006',
    tenantId: 't-001',
    code: 'EV-MAINTENANCE-VAN',
    name: 'Fleet Electric Maintenance Van',
    description: 'Specific vehicle bypass for on-site facility technician service shuttle.',
    action: 'ALLOW',
    priority: 80,
    status: 'ACTIVE',
    target: {
      type: 'SPECIFIC_VEHICLE',
      vehicleId: 'veh-005',
      vehicleName: 'Hyundai Solati Van',
      licensePlate: '43A-778.19',
      notes: 'Emergency technical maintenance crew vehicle.'
    },
    scope: {
      allSites: true,
      siteIds: ['ALL_SITES'],
      siteNames: ['All Facilities'],
      allGates: true,
      gateIds: ['ALL_GATES'],
      gateNames: ['All Gates']
    },
    schedule: {
      type: 'ALWAYS',
      timezone: 'Asia/Ho_Chi_Minh',
      summaryText: 'Always Active (24/7)'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-03-01T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-06',
        action: 'CREATED',
        timestamp: '2026-03-01T08:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Approved 24/7 emergency access for fleet van 43A-778.19.'
      }
    ],
    createdAt: '2026-03-01T08:00:00+07:00',
    updatedAt: '2026-03-01T08:00:00+07:00',
    type: 'SPECIFIC_VEHICLE_PASS',
    scheduleSummary: 'Always (24/7)',
    sites: ['ALL'],
    gates: ['ALL'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-007',
    tenantId: 't-001',
    code: 'AUDITOR-Q2-PASS',
    name: 'External Financial Auditor Parking Pass',
    description: 'Temporary access pass for auditing partner teams during Q2 compliance reviews.',
    action: 'ALLOW',
    priority: 90,
    status: 'EXPIRED',
    target: {
      type: 'LICENSE_PLATE',
      licensePlate: '51D-334.56',
      notes: 'Lead Auditor Transport'
    },
    scope: {
      allSites: false,
      siteIds: ['site-001'],
      siteNames: ['Main Campus Facility'],
      allGates: false,
      gateIds: ['gate-mc-01'],
      gateNames: ['Entrance Gate 01']
    },
    schedule: {
      type: 'DATE_RANGE',
      timezone: 'Asia/Ho_Chi_Minh',
      startDate: '2026-06-01',
      startTime: '08:00',
      endDate: '2026-06-30',
      endTime: '18:00',
      summaryText: 'Jun 01 - Jun 30, 2026'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-06-01T08:00:00+07:00',
    validUntil: '2026-06-30T18:00:00+07:00',
    auditHistory: [
      {
        id: 'aud-r-07',
        action: 'CREATED',
        timestamp: '2026-06-01T08:30:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Created temporary auditor pass (expired).'
      }
    ],
    createdAt: '2026-06-01T08:30:00+07:00',
    updatedAt: '2026-07-01T00:00:00+07:00',
    type: 'TEMPORARY_PASS',
    scheduleSummary: 'Jun 01 - Jun 30, 2026',
    sites: ['site-001'],
    gates: ['gate-mc-01'],
    actionOnMatch: 'ALLOWED'
  },
  {
    id: 'rule-008',
    tenantId: 't-001',
    code: 'NIGHT-PATROL-DRAFT',
    name: 'Night Perimeter Security Patrol Draft',
    description: 'Overnight gate circulation pass for third-party mobile patrol guard units.',
    action: 'ALLOW',
    priority: 120,
    status: 'DRAFT',
    target: {
      type: 'VEHICLE_GROUP',
      vehicleGroup: 'SECURITY',
      notes: 'Security patrol branded sedans and SUVs'
    },
    scope: {
      allSites: true,
      siteIds: ['ALL_SITES'],
      siteNames: ['All Facilities'],
      allGates: true,
      gateIds: ['ALL_GATES'],
      gateNames: ['All Gates']
    },
    schedule: {
      type: 'WEEKLY',
      timezone: 'Asia/Ho_Chi_Minh',
      days: [
        { day: 'MONDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'TUESDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'WEDNESDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'THURSDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'FRIDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'SATURDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] },
        { day: 'SUNDAY', enabled: true, windows: [{ start: '22:00', end: '06:00' }] }
      ],
      summaryText: 'Daily · 22:00 - 06:00 (Overnight)'
    },
    advanced: {
      minConfidence: 90,
      duplicateWindowSeconds: 5,
      failBehavior: 'DENY'
    },
    validFrom: '2026-08-01T00:00:00+07:00',
    validUntil: null,
    auditHistory: [
      {
        id: 'aud-r-08',
        action: 'CREATED',
        timestamp: '2026-08-01T15:00:00+07:00',
        actorName: 'Anthony Nguyen',
        actorEmail: 'anh.nh@kyanon.digital',
        details: 'Saved draft rule for night security patrol.'
      }
    ],
    createdAt: '2026-08-01T15:00:00+07:00',
    updatedAt: '2026-08-01T15:00:00+07:00',
    type: 'DRAFT_RULE',
    scheduleSummary: 'Daily: 22:00 - 06:00',
    sites: ['ALL'],
    gates: ['ALL'],
    actionOnMatch: 'ALLOWED'
  }
];

export const INITIAL_TENANT_USERS: import('../types/tenant').TenantUser[] = [
  {
    id: 'user-001',
    name: 'Anthony Nguyen',
    email: 'anh.nh@kyanon.digital',
    username: 'anthony.nguyen',
    phone: '+84 90 311 2233',
    role: 'TENANT_ADMIN',
    status: 'ACTIVE',
    membership: null,
    lastLoginAt: '2026-08-16T13:35:00+07:00',
    createdAt: '2026-01-10T08:00:00+07:00'
  },
  {
    id: 'user-002',
    name: 'John Nguyen',
    email: 'john.nguyen@company.com',
    username: 'john.nguyen',
    phone: '+84 91 888 7766',
    role: 'TENANT_ADMIN',
    status: 'ACTIVE',
    membership: {
      id: 'mem-001',
      userId: 'user-002',
      memberCode: 'MEM-000101',
      fullName: 'John Nguyen',
      email: 'john.nguyen@company.com',
      phone: '+84 91 888 7766',
      employeeId: 'EMP-001',
      department: 'Executive Leadership',
      type: 'EMPLOYEE',
      status: 'ACTIVE',
      joinedAt: '2026-01-12T09:00:00+07:00',
      vehicles: [
        {
          plate: '51K-888.99',
          model: 'Mercedes-Benz E300',
          color: 'Obsidian Black',
          type: 'Sedan',
          status: 'ACTIVE'
        },
        {
          plate: '30E-999.01',
          model: 'Porsche Cayenne',
          color: 'White',
          type: 'SUV',
          status: 'ACTIVE'
        }
      ]
    },
    lastLoginAt: '2026-08-16T13:30:00+07:00',
    createdAt: '2026-01-12T08:30:00+07:00'
  },
  {
    id: 'user-003',
    name: 'Alice Tran',
    email: 'alice.tran@company.com',
    username: 'alice.tran',
    phone: '+84 98 765 4321',
    role: 'SITE_MANAGER',
    status: 'ACTIVE',
    membership: {
      id: 'mem-002',
      userId: 'user-003',
      memberCode: 'MEM-000102',
      fullName: 'Alice Tran',
      email: 'alice.tran@company.com',
      phone: '+84 98 765 4321',
      employeeId: 'EMP-045',
      department: 'Facility Operations',
      type: 'STAFF',
      status: 'ACTIVE',
      joinedAt: '2026-01-15T09:00:00+07:00',
      vehicles: [
        {
          plate: '51G-882.19',
          model: 'Mazda 3',
          color: 'Soul Red',
          type: 'Sedan',
          status: 'ACTIVE'
        }
      ]
    },
    lastLoginAt: '2026-08-16T12:45:00+07:00',
    createdAt: '2026-01-15T09:00:00+07:00'
  },
  {
    id: 'user-004',
    name: 'Bob Nguyen',
    email: 'bob.nguyen@company.com',
    username: 'bob.nguyen',
    phone: '+84 93 456 7890',
    role: 'MEMBER',
    status: 'ACTIVE',
    membership: {
      id: 'mem-003',
      userId: 'user-004',
      memberCode: 'MEM-000103',
      fullName: 'Bob Nguyen',
      email: 'bob.nguyen@company.com',
      phone: '+84 93 456 7890',
      employeeId: 'EMP-112',
      department: 'Engineering & R&D',
      type: 'EMPLOYEE',
      status: 'ACTIVE',
      joinedAt: '2026-02-01T08:00:00+07:00',
      vehicles: [
        {
          plate: '50H-112.33',
          model: 'VinFast VF8 Plus',
          color: 'Crimson Red',
          type: 'SUV',
          status: 'ACTIVE'
        },
        {
          plate: '51A-992.11',
          model: 'Honda City RS',
          color: 'Platinum White',
          type: 'Sedan',
          status: 'ACTIVE'
        }
      ]
    },
    lastLoginAt: '2026-08-15T18:20:00+07:00',
    createdAt: '2026-02-01T08:00:00+07:00'
  },
  {
    id: 'user-005',
    name: 'David Tran',
    email: 'david.tran@company.com',
    username: 'david.tran',
    phone: '+84 97 123 9988',
    role: 'MEMBER',
    status: 'PENDING',
    membership: {
      id: 'mem-004',
      userId: 'user-005',
      memberCode: 'MEM-000104',
      fullName: 'David Tran',
      email: 'david.tran@company.com',
      phone: '+84 97 123 9988',
      employeeId: 'EMP-204',
      department: 'Sales & Marketing',
      type: 'EMPLOYEE',
      status: 'PENDING',
      joinedAt: '2026-08-10T11:00:00+07:00',
      vehicles: []
    },
    lastLoginAt: undefined,
    createdAt: '2026-08-10T11:00:00+07:00'
  },
  {
    id: 'user-006',
    name: 'Sarah Pham',
    email: 'sarah.pham@partner.vn',
    username: 'sarah.pham',
    phone: '+84 90 882 1199',
    role: 'MEMBER',
    status: 'ACTIVE',
    membership: {
      id: 'mem-005',
      userId: 'user-006',
      memberCode: 'MEM-000105',
      fullName: 'Sarah Pham',
      email: 'sarah.pham@partner.vn',
      phone: '+84 90 882 1199',
      employeeId: 'PART-009',
      department: 'Auditing Consultant',
      type: 'CUSTOMER',
      status: 'SUSPENDED',
      suspendedReason: 'Quarterly parking pass renewal pending invoice settlement.',
      joinedAt: '2026-03-01T09:00:00+07:00',
      vehicles: [
        {
          plate: '29C-445.67',
          model: 'BMW 330i',
          color: 'Mineral Grey',
          type: 'Sedan',
          status: 'BLOCKED'
        }
      ]
    },
    lastLoginAt: '2026-08-14T09:15:00+07:00',
    createdAt: '2026-03-01T09:00:00+07:00'
  },
  {
    id: 'user-007',
    name: 'Michael Vu',
    email: 'michael.vu@ex-employee.com',
    username: 'michael.vu',
    phone: '+84 94 332 1100',
    role: 'MEMBER',
    status: 'INACTIVE',
    membership: {
      id: 'mem-006',
      userId: 'user-007',
      memberCode: 'MEM-000098',
      fullName: 'Michael Vu',
      email: 'michael.vu@ex-employee.com',
      phone: '+84 94 332 1100',
      employeeId: 'EMP-088',
      department: 'Procurement',
      type: 'EMPLOYEE',
      status: 'ENDED',
      endedAt: '2026-07-30T17:00:00+07:00',
      joinedAt: '2026-01-20T08:00:00+07:00',
      vehicles: [
        {
          plate: '60A-771.20',
          model: 'Toyota Fortuner',
          color: 'Silver',
          type: 'SUV',
          status: 'EXPIRED'
        }
      ]
    },
    lastLoginAt: '2026-07-28T16:00:00+07:00',
    createdAt: '2026-01-20T08:00:00+07:00'
  },
  {
    id: 'user-008',
    name: 'Pham Nhat Linh',
    email: 'nhatlinh.pham@vinholdings.vn',
    username: 'nhatlinh.p',
    phone: '+84 90 999 1122',
    role: 'MEMBER',
    status: 'ACTIVE',
    membership: {
      id: 'mem-007',
      userId: 'user-008',
      memberCode: 'MEM-000108',
      fullName: 'Pham Nhat Linh',
      email: 'nhatlinh.pham@vinholdings.vn',
      phone: '+84 90 999 1122',
      employeeId: 'VIP-002',
      department: 'Board of Directors',
      type: 'OTHER',
      status: 'ACTIVE',
      joinedAt: '2026-02-15T09:00:00+07:00',
      vehicles: [
        {
          plate: '51F-777.99',
          model: 'Lexus LX600',
          color: 'Sonic Quartz',
          type: 'Luxury SUV',
          status: 'ACTIVE'
        }
      ]
    },
    lastLoginAt: '2026-08-16T11:00:00+07:00',
    createdAt: '2026-02-15T09:00:00+07:00'
  }
];

export const INITIAL_TENANT_INVITATIONS: import('../types/tenant').TenantInvitation[] = [
  {
    id: 'inv-001',
    email: 'linh.hoang@company.com',
    fullName: 'Linh Hoang',
    role: 'MEMBER',
    invitedBy: 'Anthony Nguyen',
    status: 'PENDING',
    sentAt: '2026-08-14T10:00:00+07:00',
    expiresAt: '2026-08-21T10:00:00+07:00',
    createMemberProfile: true,
    membershipType: 'EMPLOYEE',
    personalMessage: 'Welcome to Acme Parking Systems! Please set up your vehicle whitelist access.'
  },
  {
    id: 'inv-002',
    email: 'security.lead@acme.vn',
    fullName: 'Nguyen Minh Tu',
    role: 'SITE_MANAGER',
    invitedBy: 'Anthony Nguyen',
    status: 'PENDING',
    sentAt: '2026-08-15T15:30:00+07:00',
    expiresAt: '2026-08-22T15:30:00+07:00',
    createMemberProfile: true,
    membershipType: 'STAFF',
    personalMessage: 'Site Manager credentials for Main Campus entrance & lane operations.'
  },
  {
    id: 'inv-003',
    email: 'contractor.logistics@dhl.com',
    fullName: 'DHL Logistics Team',
    role: 'MEMBER',
    invitedBy: 'John Nguyen',
    status: 'ACCEPTED',
    sentAt: '2026-08-01T09:00:00+07:00',
    expiresAt: '2026-08-08T09:00:00+07:00',
    createMemberProfile: true,
    membershipType: 'OTHER'
  },
  {
    id: 'inv-004',
    email: 'guest.consultant@pwc.com',
    fullName: 'Marcus Sterling',
    role: 'MEMBER',
    invitedBy: 'Anthony Nguyen',
    status: 'EXPIRED',
    sentAt: '2026-08-01T08:00:00+07:00',
    expiresAt: '2026-08-08T08:00:00+07:00',
    createMemberProfile: false
  },
  {
    id: 'inv-005',
    email: 'temp.guard@security.vn',
    fullName: 'Do Van Nam',
    role: 'MEMBER',
    invitedBy: 'Alice Tran',
    status: 'CANCELLED',
    sentAt: '2026-08-05T14:00:00+07:00',
    expiresAt: '2026-08-12T14:00:00+07:00',
    createMemberProfile: true,
    membershipType: 'STAFF'
  }
];

export const INITIAL_USER_AUDIT_LOGS: import('../types/tenant').UserAuditLog[] = [
  {
    id: 'ual-001',
    action: 'USER_ROLE_CHANGED',
    actorName: 'Anthony Nguyen',
    targetUserName: 'Alice Tran',
    targetUserId: 'user-003',
    description: 'Promoted role from Member to Site Manager for Main Campus operations.',
    timestamp: '2026-08-16T12:00:00+07:00'
  },
  {
    id: 'ual-002',
    action: 'INVITATION_SENT',
    actorName: 'Anthony Nguyen',
    targetUserName: 'Nguyen Minh Tu',
    description: 'Sent Site Manager invitation to security.lead@acme.vn (expires in 6 days).',
    timestamp: '2026-08-15T15:30:00+07:00'
  },
  {
    id: 'ual-003',
    action: 'MEMBER_SUSPENDED',
    actorName: 'John Nguyen',
    targetUserName: 'Sarah Pham',
    targetUserId: 'user-006',
    description: 'Suspended parking membership: Quarterly pass renewal pending settlement.',
    timestamp: '2026-08-14T09:20:00+07:00'
  },
  {
    id: 'ual-004',
    action: 'USER_PASSWORD_RESET_REQUESTED',
    actorName: 'Anthony Nguyen',
    targetUserName: 'Bob Nguyen',
    targetUserId: 'user-004',
    description: 'Dispatched password reset link to bob.nguyen@company.com.',
    timestamp: '2026-08-13T14:10:00+07:00'
  },
  {
    id: 'ual-005',
    action: 'MEMBER_CREATED',
    actorName: 'Anthony Nguyen',
    targetUserName: 'David Tran',
    targetUserId: 'user-005',
    description: 'Created new Member profile MEM-000104 (Sales & Marketing).',
    timestamp: '2026-08-10T11:00:00+07:00'
  }
];

export const INITIAL_TENANT_MEMBERS = [
  {
    id: 'mem-001',
    name: 'Anthony Nguyen',
    email: 'anh.nh@kyanon.digital',
    role: 'Tenant Admin',
    siteAccess: ['site-001'],
    status: 'ACTIVE' as const,
    createdAt: '2026-01-10'
  },
  {
    id: 'mem-002',
    name: 'Le Hoang Nam',
    email: 'nam.lh@acmeparking.vn',
    role: 'Site Supervisor',
    siteAccess: ['site-001'],
    status: 'ACTIVE' as const,
    createdAt: '2026-01-15'
  },
  {
    id: 'mem-003',
    name: 'Pham Van Dung',
    email: 'dung.pv@acmeparking.vn',
    role: 'Gate Operator',
    siteAccess: ['site-001'],
    status: 'ACTIVE' as const,
    createdAt: '2026-02-05'
  }
];

