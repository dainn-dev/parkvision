import React, { useState, useEffect, useMemo } from 'react';
import {
  Tenant,
  ActiveParkingSession,
  UserLocation,
  FilterState,
  UserMembership,
  MembershipPlan
} from './types';
import {
  INITIAL_TENANTS,
  INITIAL_ACTIVE_SESSION,
  DEFAULT_USER_LOCATION,
  getCapacityStatus
} from './data/mockTenants';
import { LanguageProvider } from './i18n/LanguageContext';

import { DiscoverHeader } from './components/discover/DiscoverHeader';
import { LocationSelectorModal } from './components/discover/LocationSelectorModal';
import { ParkingSearchBar } from './components/discover/ParkingSearchBar';
import { FilterChips } from './components/discover/FilterChips';
import { FilterBottomSheet } from './components/discover/FilterBottomSheet';
import { ActiveParkingCard } from './components/discover/ActiveParkingCard';
import { ParkingMap } from './components/discover/ParkingMap';
import { TenantPreviewSheet } from './components/discover/TenantPreviewSheet';
import { NearbyParking } from './components/discover/NearbyParking';
import { TenantDetailModal } from './components/discover/TenantDetailModal';
import { MembershipModal } from './components/discover/MembershipModal';
import { FindMyVehicleModal } from './components/discover/FindMyVehicleModal';
import { BottomNavigation } from './components/discover/BottomNavigation';

import { MapViewScreen } from './components/views/MapViewScreen';
import { MyParkingScreen } from './components/views/MyParkingScreen';
import { MembershipsScreen } from './components/views/MembershipsScreen';
import { ProfileScreen } from './components/views/ProfileScreen';
import { LoginScreen, UserProfile } from './components/auth/LoginScreen';

const DEFAULT_FILTERS: FilterState = {
  keyword: '',
  availability: 'all',
  maxHourlyPrice: 100000,
  distanceKm: 5,
  parkingTypes: [],
  facilities: [],
  membershipOnly: false,
  vehicleType: 'car',
  sortBy: 'recommended'
};

function MainAppContent() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>({
    name: "Dainn Dev",
    email: "dainn.dev1112@gmail.com",
    avatar: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
    provider: "google"
  });

  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_USER_LOCATION);
  const [tenants, setTenants] = useState<Tenant[]>(INITIAL_TENANTS);
  const [activeSession, setActiveSession] = useState<ActiveParkingSession | null>(INITIAL_ACTIVE_SESSION);
  const [memberships, setMemberships] = useState<UserMembership[]>([]);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  // Modals & Navigation state
  const [activeTab, setActiveTab] = useState<'discover' | 'map' | 'parking' | 'memberships' | 'profile'>('discover');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedTenantPreview, setSelectedTenantPreview] = useState<Tenant | null>(null);
  const [selectedTenantDetail, setSelectedTenantDetail] = useState<Tenant | null>(null);
  const [membershipModalData, setMembershipModalData] = useState<{ tenant: Tenant; plan: MembershipPlan } | null>(null);
  const [isFindVehicleModalOpen, setIsFindVehicleModalOpen] = useState(false);

  // Realtime Simulation State
  const [isAutoStreaming, setIsAutoStreaming] = useState(true);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<string>("Just now");

  // Realtime auto-stream capacity simulator
  useEffect(() => {
    if (!isAutoStreaming) return;

    const interval = setInterval(() => {
      setTenants((prevTenants) => {
        const randomIndex = Math.floor(Math.random() * prevTenants.length);
        const tenant = prevTenants[randomIndex];

        // Decide random entry or exit (-1 or +1 spot)
        const delta = Math.random() > 0.5 ? 1 : -1;
        const newAvailable = Math.min(tenant.capacity.total, Math.max(0, tenant.capacity.available + delta));
        const newOccupied = tenant.capacity.total - newAvailable;
        const newStatus = getCapacityStatus(newAvailable, tenant.capacity.total);

        const updatedTenant: Tenant = {
          ...tenant,
          capacity: {
            ...tenant.capacity,
            available: newAvailable,
            occupied: newOccupied,
            status: newStatus,
            lastUpdatedAt: new Date().toISOString()
          }
        };

        const next = [...prevTenants];
        next[randomIndex] = updatedTenant;
        return next;
      });

      setLastUpdatedTime(new Date().toLocaleTimeString());
    }, 4000);

    return () => clearInterval(interval);
  }, [isAutoStreaming]);

  // Handle GPS Request
  const handleRequestGps = () => {
    setUserLocation(prev => ({ ...prev, isDetecting: true }));

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            address: "Current GPS Location",
            district: "Detected Area",
            city: "Ho Chi Minh City",
            isDetecting: false,
            permissionStatus: 'granted'
          });
          setIsLocationModalOpen(false);
        },
        () => {
          // Fallback to default HCMC District 7 coordinates
          setUserLocation(prev => ({
            ...prev,
            isDetecting: false,
            permissionStatus: 'denied',
            address: "Nguyen Van Linh, District 7"
          }));
        }
      );
    } else {
      setUserLocation(prev => ({ ...prev, isDetecting: false }));
    }
  };

  // Manual capacity simulation controls
  const handleSimulateEntry = () => {
    setTenants(prev => prev.map((t, idx) => {
      if (idx === 0) { // update first tenant
        const avail = Math.max(0, t.capacity.available - 1);
        return {
          ...t,
          capacity: {
            ...t.capacity,
            available: avail,
            occupied: t.capacity.total - avail,
            status: getCapacityStatus(avail, t.capacity.total),
            lastUpdatedAt: new Date().toISOString()
          }
        };
      }
      return t;
    }));
    setLastUpdatedTime("Just now");
  };

  const handleSimulateExit = () => {
    setTenants(prev => prev.map((t, idx) => {
      if (idx === 0) {
        const avail = Math.min(t.capacity.total, t.capacity.available + 1);
        return {
          ...t,
          capacity: {
            ...t.capacity,
            available: avail,
            occupied: t.capacity.total - avail,
            status: getCapacityStatus(avail, t.capacity.total),
            lastUpdatedAt: new Date().toISOString()
          }
        };
      }
      return t;
    }));
    setLastUpdatedTime("Just now");
  };

  // Toggle Favorite
  const handleToggleFavorite = (tenantId: string) => {
    setTenants(prev => prev.map(t => t.id === tenantId ? { ...t, isFavorite: !t.isFavorite } : t));
  };

  // Filter & Sort Pipeline
  const filteredTenants = useMemo(() => {
    return tenants.filter((tenant) => {
      // Keyword search
      if (filters.keyword) {
        const q = filters.keyword.toLowerCase();
        const matchName = tenant.name.toLowerCase().includes(q);
        const matchAddr = tenant.address.toLowerCase().includes(q);
        const matchDistrict = tenant.district.toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchDistrict) return false;
      }

      // Availability filter
      if (filters.availability === 'available_now' && tenant.capacity.available <= 0) return false;
      if (filters.availability === 'limited' && (tenant.capacity.status !== 'LIMITED' && tenant.capacity.status !== 'ALMOST_FULL')) return false;
      if (filters.availability === 'hide_full' && tenant.capacity.available <= 0) return false;

      // Distance filter
      const distanceKm = tenant.distanceMeters / 1000;
      if (distanceKm > filters.distanceKm) return false;

      // Price filter
      if (tenant.pricing.hourlyFrom > filters.maxHourlyPrice) return false;

      // Parking structure type
      if (filters.parkingTypes.length > 0 && !filters.parkingTypes.includes(tenant.parkingType)) return false;

      // Facilities
      if (filters.facilities.length > 0) {
        const hasAllFacilities = filters.facilities.every(fac => tenant.facilities.includes(fac));
        if (!hasAllFacilities) return false;
      }

      // Membership availability filter
      if (filters.membershipOnly && !tenant.supportsMembership) return false;

      return true;
    }).sort((a, b) => {
      if (filters.sortBy === 'nearest') return a.distanceMeters - b.distanceMeters;
      if (filters.sortBy === 'cheapest') return a.pricing.hourlyFrom - b.pricing.hourlyFrom;
      if (filters.sortBy === 'availability') return b.capacity.available - a.capacity.available;
      if (filters.sortBy === 'rating') return b.rating - a.rating;
      // Recommended default: weighted score based on distance & availability
      return a.distanceMeters - b.distanceMeters;
    });
  }, [tenants, filters]);

  // Count active filter criteria
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.availability !== 'all') count++;
    if (filters.distanceKm !== 5) count++;
    if (filters.maxHourlyPrice !== 100000) count++;
    if (filters.parkingTypes.length > 0) count++;
    if (filters.facilities.length > 0) count++;
    if (filters.membershipOnly) count++;
    return count;
  }, [filters]);

  // Simulate Check-In
  const handleParkNow = (tenant: Tenant) => {
    const newSession: ActiveParkingSession = {
      id: `SESS-${Math.floor(100000 + Math.random() * 900000)}`,
      vehiclePlate: "51A-123.45",
      tenantId: tenant.id,
      tenantName: tenant.name,
      floor: tenant.floors[0] || "Floor 1",
      zone: tenant.zones[0] || "Zone A",
      spotNumber: "A-12",
      entryTime: new Date().toISOString(),
      durationSeconds: 1,
      currentFeeVnd: tenant.pricing.hourlyFrom,
      status: 'PARKED',
      anprConfidence: 99.8,
      entrancePhotoUrl: tenant.image
    };
    setActiveSession(newSession);
    setSelectedTenantDetail(null);
    setActiveTab('parking');
  };

  if (!currentUser) {
    return <LoginScreen onLogin={(userData) => setCurrentUser(userData)} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans max-w-md mx-auto sm:max-w-xl border-x border-slate-800/80 shadow-2xl relative">
      {/* 1. Header (Only on Discover screen) */}
      {activeTab === 'discover' && (
        <DiscoverHeader
          userLocation={userLocation}
          onOpenLocationSelector={() => setIsLocationModalOpen(true)}
          onOpenNotifications={() => alert("Notification Center: Live ANPR check-in verified for 51A-123.45.")}
        />
      )}

      {/* Main Tab Router View */}
      <main className={`flex-1 ${activeTab === 'map' ? 'pb-16 h-[calc(100vh-64px)]' : 'pb-20'}`}>
        {/* TAB 1: DISCOVER / HOME */}
        {activeTab === 'discover' && (
          <div className="space-y-0">
            {/* Search Bar */}
            <ParkingSearchBar
              value={filters.keyword}
              onChange={(val) => setFilters(prev => ({ ...prev, keyword: val }))}
              onClear={() => setFilters(prev => ({ ...prev, keyword: '' }))}
              onSelectRecent={(query) => setFilters(prev => ({ ...prev, keyword: query }))}
            />

            {/* Quick Filter Chips */}
            <FilterChips
              filters={filters}
              onUpdateFilter={(updates) => setFilters(prev => ({ ...prev, ...updates }))}
              onOpenMoreFilters={() => setIsFilterSheetOpen(true)}
              activeCount={activeFilterCount}
            />

            {/* Active Parking Banner (If user is currently parked) */}
            {activeSession && (
              <ActiveParkingCard
                session={activeSession}
                onOpenFindVehicle={() => setIsFindVehicleModalOpen(true)}
                onOpenTenantDetail={(id) => {
                  const found = tenants.find(t => t.id === id);
                  if (found) setSelectedTenantDetail(found);
                }}
              />
            )}

            {/* Interactive Leaflet Map */}
            <ParkingMap
              tenants={filteredTenants}
              selectedTenant={selectedTenantPreview}
              onSelectTenant={(tenant) => setSelectedTenantPreview(tenant)}
              userLocation={userLocation}
              onRecenterGps={handleRequestGps}
            />

            {/* Selected Map Marker Bottom Preview Card */}
            {selectedTenantPreview && (
              <TenantPreviewSheet
                tenant={selectedTenantPreview}
                onClose={() => setSelectedTenantPreview(null)}
                onOpenDetails={(t) => {
                  setSelectedTenantDetail(t);
                  setSelectedTenantPreview(null);
                }}
                onOpenDirections={(t) => {
                  window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank');
                }}
              />
            )}

            {/* Nearby Parking Cards List */}
            <NearbyParking
              tenants={filteredTenants}
              onOpenDetails={(t) => setSelectedTenantDetail(t)}
              onOpenDirections={(t) => {
                window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank');
              }}
              onToggleFavorite={handleToggleFavorite}
              sortBy={filters.sortBy}
              onSortChange={(sort) => setFilters(prev => ({ ...prev, sortBy: sort }))}
              onClearFilters={() => setFilters(DEFAULT_FILTERS)}
            />
          </div>
        )}

        {/* TAB 2: MAP VIEW */}
        {activeTab === 'map' && (
          <MapViewScreen
            tenants={filteredTenants}
            selectedTenant={selectedTenantPreview}
            onSelectTenant={(t) => setSelectedTenantPreview(t)}
            userLocation={userLocation}
            onRecenterGps={handleRequestGps}
            onOpenDetails={(t) => setSelectedTenantDetail(t)}
            onOpenDirections={(t) => window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank')}
          />
        )}

        {/* TAB 3: MY PARKING */}
        {activeTab === 'parking' && (
          <MyParkingScreen
            activeSession={activeSession}
            onOpenFindVehicle={() => setIsFindVehicleModalOpen(true)}
            onOpenTenantDetail={(id) => {
              const found = tenants.find(t => t.id === id);
              if (found) setSelectedTenantDetail(found);
            }}
          />
        )}

        {/* TAB 4: MEMBERSHIPS */}
        {activeTab === 'memberships' && (
          <MembershipsScreen
            memberships={memberships}
            onOpenDiscover={() => setActiveTab('discover')}
          />
        )}

        {/* TAB 5: PROFILE */}
        {activeTab === 'profile' && (
          <ProfileScreen
            user={currentUser}
            onLogout={() => setCurrentUser(null)}
          />
        )}
      </main>

      {/* Bottom Mobile Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onChangeTab={(tab) => setActiveTab(tab)}
        hasActiveSession={!!activeSession}
        membershipsCount={memberships.length}
      />

      {/* Global Modals */}
      <LocationSelectorModal
        isOpen={isLocationModalOpen}
        onClose={() => setIsLocationModalOpen(false)}
        currentLocation={userLocation}
        onSelectLocation={(loc) => setUserLocation(prev => ({ ...prev, ...loc }))}
        onRequestGps={handleRequestGps}
      />

      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        filters={filters}
        onUpdateFilter={(updates) => setFilters(prev => ({ ...prev, ...updates }))}
        onReset={() => setFilters(DEFAULT_FILTERS)}
        totalResultsCount={filteredTenants.length}
      />

      <TenantDetailModal
        tenant={selectedTenantDetail}
        onClose={() => setSelectedTenantDetail(null)}
        onOpenMembershipModal={(tenant, plan) => setMembershipModalData({ tenant, plan })}
        onOpenDirections={(tenant) => window.open(`https://www.google.com/maps/search/?api=1&query=${tenant.lat},${tenant.lng}`, '_blank')}
        onToggleFavorite={handleToggleFavorite}
        onParkNow={handleParkNow}
      />

      <MembershipModal
        isOpen={!!membershipModalData}
        tenant={membershipModalData?.tenant || null}
        plan={membershipModalData?.plan || null}
        onClose={() => setMembershipModalData(null)}
        onSuccess={(newMem) => {
          setMemberships(prev => [newMem, ...prev]);
          setActiveTab('memberships');
        }}
      />

      <FindMyVehicleModal
        isOpen={isFindVehicleModalOpen}
        session={activeSession}
        onClose={() => setIsFindVehicleModalOpen(false)}
        onPayEarly={() => {
          alert("Exit fee paid via MoMo E-Wallet! Barrier will automatically open upon exit LPR scanner.");
          setActiveSession(null);
        }}
      />
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <MainAppContent />
    </LanguageProvider>
  );
}
