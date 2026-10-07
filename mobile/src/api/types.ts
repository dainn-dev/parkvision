import { CapacityStatus } from '../types';

// Wire shapes returned by the FastAPI backend (camelCase via CamelModel).

export interface Page<T> {
  data: T[];
  meta: { page: number; limit: number; total: number };
}

export interface SitePricingOut {
  hourlyFrom: number | null;
  dailyFrom: number | null;
  overnightFrom: number | null;
  monthlyFrom: number | null;
}

export interface SiteProfileOut {
  listed: boolean;
  description: string | null;
  imageUrl: string | null;
  parkingType: 'indoor' | 'outdoor' | 'covered' | null;
  facilities: string[];
  pricing: SitePricingOut;
}

export interface PublicSiteOut {
  id: string;
  tenantId: string;
  tenantSlug: string;
  name: string;
  address: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceMeters: number | null;
  capacity: number;
  occupied: number;
  available: number;
  capacityStatus: CapacityStatus;
  operatingHours: Record<string, unknown>;
  contactPhone: string | null;
  profile: SiteProfileOut;
  isFavorite: boolean;
  updatedAt: string;
}

export interface PublicMapZoneOut {
  id: string;
  levelId: string;
  name: string;
  code: string | null;
  occupiedCount: number;
}

export interface PublicMapLevelOut {
  id: string;
  name: string;
  code: string | null;
  sortOrder: number;
  mapImageUrl: string | null;
  zones: PublicMapZoneOut[];
}

export interface PublicSiteDetailOut extends PublicSiteOut {
  levels: PublicMapLevelOut[];
}

export interface PublicLocateOut {
  found: boolean;
  zoneId: string | null;
  zoneName: string | null;
  zoneCode: string | null;
  levelId: string | null;
  levelName: string | null;
  levelCode: string | null;
  sinceAt: string | null;
}

export interface DriverTokenOut {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface DriverOut {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  avatarUrl: string | null;
  status: string;
  createdAt: string;
}

export interface DriverVehicleOut {
  id: string;
  plateNumber: string;
  plateNormalized: string;
  label: string | null;
  vehicleType: 'car' | 'motorcycle';
  isPrimary: boolean;
  createdAt: string;
}

export interface DriverSessionOut {
  id: string;
  siteId: string;
  siteName: string;
  tenantSlug: string;
  plateNumber: string;
  enteredAt: string;
  exitedAt: string | null;
  durationSeconds: number;
  status: 'PARKED' | 'COMPLETED';
  entryImageUrl: string | null;
  confidence: number | null;
  levelName: string | null;
  zoneName: string | null;
}

export interface AuthSessionOut {
  id: string;
  userId: string;
  userType: string;
  tenantId: string | null;
  ip: string | null;
  userAgent: string | null;
  mfaVerified: boolean;
  deviceFingerprint: string | null;
  riskLevel: string;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
}
