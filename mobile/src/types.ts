export type CapacityStatus = 'AVAILABLE' | 'LIMITED' | 'ALMOST_FULL' | 'FULL';

export interface TenantCapacity {
  total: number;
  occupied: number;
  available: number;
  status: CapacityStatus;
  lastUpdatedAt: string; // ISO string
}

// All price fields are null when the site has not published pricing —
// the UI must render "—" rather than a fabricated number.
export interface PricingInfo {
  hourlyFrom: number | null; // VND
  dailyFrom: number | null; // VND
  overnightFrom: number | null; // VND
  monthlyFrom: number | null; // VND
}

export interface MembershipPlan {
  id: string;
  name: string;
  price: number; // VND
  durationLabel: string; // e.g. "month"
  perks: string[];
  recommended?: boolean;
  badge?: string;
}

export interface Tenant {
  id: string; // site id
  siteId: string;
  tenantId: string;
  tenantSlug: string;
  name: string;
  address: string;
  district: string;
  lat: number | null;
  lng: number | null;
  distanceMeters: number | null;
  rating?: number;
  reviewCount?: number;
  capacity: TenantCapacity;
  pricing: PricingInfo;
  openNow: boolean;
  operatingHours: string;
  supportsMembership: boolean;
  parkingType: 'indoor' | 'outdoor' | 'covered' | null;
  facilities: string[];
  image?: string;
  phone?: string;
  description?: string;
  membershipPlans: MembershipPlan[];
  floors: string[];
  zones: string[];
  isFavorite?: boolean;
}

export interface ActiveParkingSession {
  id: string;
  vehiclePlate: string;
  tenantId: string; // site id
  tenantName: string;
  tenantSlug: string;
  floor?: string;
  zone?: string;
  entryTime: string; // ISO string
  durationSeconds: number;
  currentFeeVnd: number | null; // null until pricing is supported (Phase 3)
  status: 'PARKED' | 'COMPLETED';
  entrancePhotoUrl?: string;
  anprConfidence?: number;
}

export type ParkingHistoryItem = ActiveParkingSession;

export interface DriverProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

export interface DriverVehicle {
  id: string;
  plateNumber: string;
  plateNormalized: string;
  label?: string | null;
  vehicleType: 'car' | 'motorcycle';
  isPrimary: boolean;
}

export interface FilterState {
  keyword: string;
  availability: 'all' | 'available_now' | 'limited' | 'hide_full';
  maxHourlyPrice: number;
  distanceKm: number;
  parkingTypes: string[]; // 'indoor', 'outdoor', 'covered'
  facilities: string[]; // 'EV Charging', 'Security', 'CCTV', 'Elevator', '24/7', 'Overnight'
  membershipOnly: boolean;
  vehicleType: 'car' | 'motorcycle';
  sortBy: 'recommended' | 'nearest' | 'cheapest' | 'availability' | 'rating';
}

export interface UserLocation {
  lat: number;
  lng: number;
  address: string;
  district: string;
  city: string;
  isDetecting: boolean;
  permissionStatus: 'granted' | 'denied' | 'prompt' | 'simulated';
}

export interface UserMembership {
  id: string;
  tenantId: string;
  tenantName: string;
  planName: string;
  vehiclePlate: string;
  startDate: string;
  expiryDate: string;
  status: 'ACTIVE' | 'EXPIRED';
  pricePaid: number;
}
