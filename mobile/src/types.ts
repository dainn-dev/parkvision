export type CapacityStatus = 'AVAILABLE' | 'LIMITED' | 'ALMOST_FULL' | 'FULL';

export interface TenantCapacity {
  total: number;
  occupied: number;
  available: number;
  status: CapacityStatus;
  lastUpdatedAt: string; // ISO string
}

export interface PricingInfo {
  hourlyFrom: number; // VND
  overnightFrom: number; // VND
  monthlyFrom: number; // VND
  dailyFrom?: number; // VND
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
  id: string;
  name: string;
  address: string;
  district: string;
  lat: number;
  lng: number;
  distanceMeters: number;
  rating: number;
  reviewCount: number;
  capacity: TenantCapacity;
  pricing: PricingInfo;
  openNow: boolean;
  operatingHours: string;
  supportsMembership: boolean;
  parkingType: 'indoor' | 'outdoor' | 'covered';
  facilities: string[];
  image: string;
  phone: string;
  description: string;
  membershipPlans: MembershipPlan[];
  floors: string[];
  zones: string[];
  isFavorite?: boolean;
}

export interface ActiveParkingSession {
  id: string;
  vehiclePlate: string;
  tenantId: string;
  tenantName: string;
  floor: string;
  zone: string;
  spotNumber: string;
  entryTime: string; // ISO string or timestamp
  durationSeconds: number;
  currentFeeVnd: number;
  status: 'PARKED' | 'PAYMENT_PENDING' | 'COMPLETED';
  entrancePhotoUrl?: string;
  anprConfidence?: number;
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
