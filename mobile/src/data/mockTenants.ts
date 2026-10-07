import { Tenant, ActiveParkingSession, UserLocation, CapacityStatus } from '../types';

export const DEFAULT_USER_LOCATION: UserLocation = {
  lat: 10.7324,
  lng: 106.7210,
  address: "Nguyen Van Linh, District 7",
  district: "District 7",
  city: "Ho Chi Minh City",
  isDetecting: false,
  permissionStatus: 'granted'
};

export function getCapacityStatus(available: number, total: number): CapacityStatus {
  if (total <= 0 || available <= 0) return 'FULL';
  const ratio = available / total;
  if (ratio > 0.3) return 'AVAILABLE';
  if (ratio >= 0.1) return 'LIMITED';
  return 'ALMOST_FULL';
}

export const INITIAL_ACTIVE_SESSION: ActiveParkingSession = {
  id: "SESS-883912",
  vehiclePlate: "51A-123.45",
  tenantId: "tenant-001",
  tenantName: "Trọ TP Parking Complex",
  floor: "Floor 2",
  zone: "Zone B",
  spotNumber: "B-27",
  entryTime: new Date(Date.now() - (2 * 3600 + 35 * 60) * 1000).toISOString(), // 2h 35m ago
  durationSeconds: 2 * 3600 + 35 * 60,
  currentFeeVnd: 40000,
  status: 'PARKED',
  anprConfidence: 99.4,
  entrancePhotoUrl: "https://images.unsplash.com/photo-1590674899484-d5640e854abe?auto=format&fit=crop&w=600&q=80"
};

export const INITIAL_TENANTS: Tenant[] = [
  {
    id: "tenant-001",
    name: "Trọ TP Parking Complex",
    address: "450 Nguyen Van Linh, Tan Phong Ward",
    district: "District 7",
    lat: 10.7328,
    lng: 106.7218,
    distanceMeters: 350,
    rating: 4.8,
    reviewCount: 142,
    capacity: {
      total: 100,
      occupied: 65,
      available: 35,
      status: 'AVAILABLE',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 20000,
      overnightFrom: 80000,
      monthlyFrom: 150000,
      dailyFrom: 120000
    },
    openNow: true,
    operatingHours: "24/7",
    supportsMembership: true,
    parkingType: "indoor",
    facilities: ["EV Charging", "Security", "CCTV", "Elevator", "24/7", "Overnight"],
    image: "https://images.unsplash.com/photo-1506521781263-d8422e82f27a?auto=format&fit=crop&w=800&q=80",
    phone: "0901234567",
    description: "Modern multi-storey underground parking with automated License Plate Recognition (ANPR), high-speed EV chargers, and 24/7 security control.",
    floors: ["B1 - Visitor", "B2 - Monthly Resident", "B3 - EV Priority"],
    zones: ["Zone A - Compact", "Zone B - SUV/Sedan", "Zone C - EV Chargers"],
    isFavorite: true,
    membershipPlans: [
      {
        id: "plan-tp-bronze",
        name: "Monthly Standard",
        price: 150000,
        durationLabel: "month",
        perks: ["Guaranteed slot", "Fast pass ANPR entry", "Free overnight parking", "Cancel anytime"],
        badge: "Popular"
      },
      {
        id: "plan-tp-gold",
        name: "VIP EV Pass",
        price: 250000,
        durationLabel: "month",
        perks: ["Dedicated B3 Reserved Slot", "Free 50kWh EV Charging/mo", "Priority ANPR gate", "24/7 valet assist"],
        recommended: true
      }
    ]
  },
  {
    id: "tenant-002",
    name: "Crescent Mall Underground",
    address: "101 Ton Dat Tien, Tan Phu Ward",
    district: "District 7",
    lat: 10.7295,
    lng: 106.7198,
    distanceMeters: 600,
    rating: 4.7,
    reviewCount: 310,
    capacity: {
      total: 450,
      occupied: 438,
      available: 12,
      status: 'LIMITED',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 25000,
      overnightFrom: 100000,
      monthlyFrom: 1800000,
      dailyFrom: 150000
    },
    openNow: true,
    operatingHours: "06:00 - 23:00",
    supportsMembership: true,
    parkingType: "indoor",
    facilities: ["EV Charging", "Security", "CCTV", "Elevator", "Car Wash"],
    image: "https://images.unsplash.com/photo-1573348722427-f1d6819fdf98?auto=format&fit=crop&w=800&q=80",
    phone: "02854133333",
    description: "Spacious shopping mall parking with direct elevator access to mall floors, valets, and automatic guidance lights for available slots.",
    floors: ["Basement 1", "Basement 2"],
    zones: ["Zone Green", "Zone Blue", "Zone Orange"],
    isFavorite: false,
    membershipPlans: [
      {
        id: "plan-cm-monthly",
        name: "Shopper Monthly",
        price: 180000,
        durationLabel: "month",
        perks: ["Unlimited parking during mall hours", "50% off overnight fee", "Express exit lane"]
      }
    ]
  },
  {
    id: "tenant-003",
    name: "SC VivoCity Multi-Level Parking",
    address: "1058 Nguyen Van Linh, Tan Phong Ward",
    district: "District 7",
    lat: 10.7308,
    lng: 106.7025,
    distanceMeters: 1800,
    rating: 4.5,
    reviewCount: 98,
    capacity: {
      total: 300,
      occupied: 298,
      available: 2,
      status: 'ALMOST_FULL',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 15000,
      overnightFrom: 70000,
      monthlyFrom: 120000,
      dailyFrom: 90000
    },
    openNow: true,
    operatingHours: "07:00 - 22:30",
    supportsMembership: true,
    parkingType: "covered",
    facilities: ["Security", "CCTV", "Elevator", "Car Wash"],
    image: "https://images.unsplash.com/photo-1617886322168-72b886573c35?auto=format&fit=crop&w=800&q=80",
    phone: "02837761018",
    description: "Well-ventilated multi-level covered structure near VivoCity and Him Lam residences. Ideal for day commuters.",
    floors: ["Floor 1", "Floor 2", "Rooftop"],
    zones: ["Zone A", "Zone B"],
    membershipPlans: [
      {
        id: "plan-vivo-commuter",
        name: "Commuter Pass",
        price: 120000,
        durationLabel: "month",
        perks: ["Mon-Fri Daytime Parking", "Automated plate scanner gate access"]
      }
    ]
  },
  {
    id: "tenant-004",
    name: "Sunrise City Tower Parking",
    address: "23 Nguyen Huu Tho, Tan Hung Ward",
    district: "District 7",
    lat: 10.7412,
    lng: 106.7001,
    distanceMeters: 2400,
    rating: 4.9,
    reviewCount: 88,
    capacity: {
      total: 200,
      occupied: 200,
      available: 0,
      status: 'FULL',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 20000,
      overnightFrom: 90000,
      monthlyFrom: 160000,
      dailyFrom: 110000
    },
    openNow: true,
    operatingHours: "24/7",
    supportsMembership: true,
    parkingType: "indoor",
    facilities: ["Security", "CCTV", "Elevator", "24/7", "Overnight"],
    image: "https://images.unsplash.com/photo-1545179605-1296651e9d43?auto=format&fit=crop&w=800&q=80",
    phone: "0908889911",
    description: "High security residential complex underground parking. Strictly monitored by Vision License Plate AI camera network.",
    floors: ["B1 Residential", "B2 Guest"],
    zones: ["North Tower", "Central Tower", "South Tower"],
    membershipPlans: [
      {
        id: "plan-sunrise-res",
        name: "Resident Keycard",
        price: 160000,
        durationLabel: "month",
        perks: ["24/7 designated space", "App vehicle lock security"]
      }
    ]
  },
  {
    id: "tenant-005",
    name: "Saigon Centre & Takashimaya",
    address: "65 Le Loi, Ben Nghe Ward",
    district: "District 1",
    lat: 10.7735,
    lng: 106.7011,
    distanceMeters: 5200,
    rating: 4.9,
    reviewCount: 520,
    capacity: {
      total: 600,
      occupied: 380,
      available: 220,
      status: 'AVAILABLE',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 35000,
      overnightFrom: 150000,
      monthlyFrom: 3200000,
      dailyFrom: 250000
    },
    openNow: true,
    operatingHours: "24/7",
    supportsMembership: true,
    parkingType: "indoor",
    facilities: ["EV Charging", "Security", "CCTV", "Elevator", "24/7", "Overnight", "Valet"],
    image: "https://images.unsplash.com/photo-1517524008697-84bbe3c3fd98?auto=format&fit=crop&w=800&q=80",
    phone: "02838294888",
    description: "Ultra-prime District 1 location featuring premium indoor space, Porsche & VinFast superchargers, and VIP valet services.",
    floors: ["B2 Premium", "B3 Standard", "B4 Long-stay"],
    zones: ["VIP Zone", "Standard Zone", "EV Charging Hub"],
    membershipPlans: [
      {
        id: "plan-sgc-executive",
        name: "Executive CBD Pass",
        price: 3200000,
        durationLabel: "month",
        perks: ["24/7 CBD parking", "Priority Valet drop-off", "Free weekly car exterior wash"],
        badge: "Executive"
      }
    ]
  },
  {
    id: "tenant-006",
    name: "Bitexco Financial Tower Parking",
    address: "2 Hai Trieu, Ben Nghe Ward",
    district: "District 1",
    lat: 10.7716,
    lng: 106.7044,
    distanceMeters: 5100,
    rating: 4.6,
    reviewCount: 204,
    capacity: {
      total: 350,
      occupied: 240,
      available: 110,
      status: 'AVAILABLE',
      lastUpdatedAt: new Date().toISOString()
    },
    pricing: {
      hourlyFrom: 30000,
      overnightFrom: 120000,
      monthlyFrom: 2800000,
      dailyFrom: 200000
    },
    openNow: true,
    operatingHours: "24/7",
    supportsMembership: true,
    parkingType: "indoor",
    facilities: ["Security", "CCTV", "Elevator", "24/7", "Overnight"],
    image: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?auto=format&fit=crop&w=800&q=80",
    phone: "02839156156",
    description: "Iconic skyscraper basement parking with fast automated barrier gates and instant plate detection camera entry.",
    floors: ["B1", "B2", "B3"],
    zones: ["Office Tenant Zone", "Public Visitor Zone"],
    membershipPlans: [
      {
        id: "plan-bitexco-mon",
        name: "Tower Office Pass",
        price: 2800000,
        durationLabel: "month",
        perks: ["Guaranteed B2 spot", "App instant barrier bypass"]
      }
    ]
  }
];

export const RECENT_SEARCHES_MOCK = [
  "Trọ TP",
  "Nguyen Van Linh",
  "District 7",
  "Near Crescent Mall",
  "Saigon Centre"
];
