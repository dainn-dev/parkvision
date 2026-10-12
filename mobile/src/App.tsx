import React, { useState, useMemo } from 'react';
import {
  Tenant,
  UserLocation,
  FilterState
} from './types';
import { DEFAULT_USER_LOCATION } from './lib/location';
import { useAuth } from './hooks/useAuth';
import { useSites } from './hooks/useSites';
import { useActiveSession } from './hooks/useActiveSession';
import { useFavorites } from './hooks/useFavorites';
import { useMemberships } from './hooks/useMemberships';
import { usePayments } from './hooks/usePayments';
import { LanguageProvider, useLanguage } from './i18n/LanguageContext';
import { pushRecentSearch } from './lib/recentSearches';
import { LogIn } from 'lucide-react';

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
import { FindMyVehicleModal } from './components/discover/FindMyVehicleModal';
import { BottomNavigation } from './components/discover/BottomNavigation';

import { MapViewScreen } from './components/views/MapViewScreen';
import { MyParkingScreen } from './components/views/MyParkingScreen';
import { MembershipsScreen } from './components/views/MembershipsScreen';
import { ProfileScreen } from './components/views/ProfileScreen';
import { LoginScreen } from './components/auth/LoginScreen';

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

function GuestGate({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl m-4 space-y-3">
      <div className="w-12 h-12 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
        <LogIn className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-bold text-white">{t('signInRequired')}</h3>
      <p className="text-xs text-slate-400 max-w-xs mx-auto">{t('guestNotice')}</p>
      <button
        onClick={onSignIn}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
      >
        {t('signIn')}
      </button>
    </div>
  );
}

function MainAppContent() {
  const auth = useAuth();
  const isAuthed = auth.status === 'authed';

  const [userLocation, setUserLocation] = useState<UserLocation>(DEFAULT_USER_LOCATION);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);

  const { sites: tenants, loading: sitesLoading } = useSites({
    location: userLocation,
    keyword: filters.keyword,
    enabled: auth.status === 'authed' || auth.status === 'guest'
  });
  const { session: activeSession } = useActiveSession(isAuthed);
  const favorites = useFavorites(isAuthed);
  const membershipHook = useMemberships(isAuthed);
  const paymentsHook = usePayments(isAuthed);

  // Modals & Navigation state
  const [activeTab, setActiveTab] = useState<'discover' | 'map' | 'parking' | 'memberships' | 'profile'>('discover');
  const [isLocationModalOpen, setIsLocationModalOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const [selectedTenantPreview, setSelectedTenantPreview] = useState<Tenant | null>(null);
  const [selectedTenantDetail, setSelectedTenantDetail] = useState<Tenant | null>(null);
  const [isFindVehicleModalOpen, setIsFindVehicleModalOpen] = useState(false);

  // Merge favorite ids into displayed tenants
  const tenantsWithFavs = useMemo(
    () =>
      tenants.map((t) => ({ ...t, isFavorite: favorites.ids.has(t.id) })),
    [tenants, favorites.ids]
  );

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

  const handleToggleFavorite = (siteId: string) => {
    if (!isAuthed) {
      auth.requireLogin();
      return;
    }
    void favorites.toggle(siteId);
  };

  // Filter & Sort Pipeline
  const filteredTenants = useMemo(() => {
    return tenantsWithFavs.filter((tenant) => {
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

      // Distance filter (sites without coordinates have no distance)
      if (tenant.distanceMeters != null && tenant.distanceMeters / 1000 > filters.distanceKm) return false;

      // Price filter — sites without published pricing are not excluded
      if (tenant.pricing.hourlyFrom != null && tenant.pricing.hourlyFrom > filters.maxHourlyPrice) return false;

      // Parking structure type
      if (filters.parkingTypes.length > 0 && (!tenant.parkingType || !filters.parkingTypes.includes(tenant.parkingType))) return false;

      // Facilities
      if (filters.facilities.length > 0) {
        const hasAllFacilities = filters.facilities.every(fac => tenant.facilities.includes(fac));
        if (!hasAllFacilities) return false;
      }

      // Membership availability filter (no memberships supported yet)
      if (filters.membershipOnly && !tenant.supportsMembership) return false;

      return true;
    }).sort((a, b) => {
      const distA = a.distanceMeters ?? Number.MAX_SAFE_INTEGER;
      const distB = b.distanceMeters ?? Number.MAX_SAFE_INTEGER;
      if (filters.sortBy === 'nearest') return distA - distB;
      if (filters.sortBy === 'cheapest') return (a.pricing.hourlyFrom ?? Number.MAX_SAFE_INTEGER) - (b.pricing.hourlyFrom ?? Number.MAX_SAFE_INTEGER);
      if (filters.sortBy === 'availability') return b.capacity.available - a.capacity.available;
      if (filters.sortBy === 'rating') return (b.rating ?? 0) - (a.rating ?? 0);
      return distA - distB;
    });
  }, [tenantsWithFavs, filters]);

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

  if (auth.status === 'loading') {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (auth.status === 'unauthenticated') {
    return (
      <LoginScreen
        onLogin={auth.login}
        onRegister={auth.register}
        onGuest={auth.continueAsGuest}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans max-w-md mx-auto sm:max-w-xl border-x border-slate-800/80 shadow-2xl relative">
      {/* 1. Header (Only on Discover screen) */}
      {activeTab === 'discover' && (
        <DiscoverHeader
          userLocation={userLocation}
          onOpenLocationSelector={() => setIsLocationModalOpen(true)}
          onOpenNotifications={() => {}}
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
              onSubmitSearch={(query) => pushRecentSearch(query)}
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
                  const found = tenantsWithFavs.find(t => t.id === id);
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
                  if (t.lat != null && t.lng != null) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank');
                  }
                }}
              />
            )}

            {/* Nearby Parking Cards List */}
            <NearbyParking
              tenants={filteredTenants}
              onOpenDetails={(t) => setSelectedTenantDetail(t)}
              onOpenDirections={(t) => {
                if (t.lat != null && t.lng != null) {
                  window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank');
                }
              }}
              onToggleFavorite={handleToggleFavorite}
              sortBy={filters.sortBy}
              onSortChange={(sort) => setFilters(prev => ({ ...prev, sortBy: sort }))}
              onClearFilters={() => setFilters(DEFAULT_FILTERS)}
              isLoading={sitesLoading && tenants.length === 0}
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
            onOpenDirections={(t) => {
              if (t.lat != null && t.lng != null) {
                window.open(`https://www.google.com/maps/search/?api=1&query=${t.lat},${t.lng}`, '_blank');
              }
            }}
          />
        )}

        {/* TAB 3: MY PARKING */}
        {activeTab === 'parking' && (
          isAuthed ? (
            <MyParkingScreen
              activeSession={activeSession}
              onOpenFindVehicle={() => setIsFindVehicleModalOpen(true)}
              onOpenTenantDetail={(id) => {
                const found = tenantsWithFavs.find(t => t.id === id);
                if (found) setSelectedTenantDetail(found);
              }}
            />
          ) : (
            <GuestGate onSignIn={auth.requireLogin} />
          )
        )}

        {/* TAB 4: MEMBERSHIPS */}
        {activeTab === 'memberships' && (
          isAuthed ? (
            <MembershipsScreen
              memberships={membershipHook.memberships}
              loading={membershipHook.loading}
              onCancel={membershipHook.cancel}
              onPay={async (membershipId) => {
                await paymentsHook.payAndWatch(
                  { kind: 'membership', membershipId },
                  () => void membershipHook.refetch()
                );
              }}
              onOpenDiscover={() => setActiveTab('discover')}
            />
          ) : (
            <GuestGate onSignIn={auth.requireLogin} />
          )
        )}

        {/* TAB 5: PROFILE */}
        {activeTab === 'profile' && (
          isAuthed && auth.user ? (
            <ProfileScreen
              user={auth.user}
              onLogout={() => void auth.logout()}
            />
          ) : (
            <GuestGate onSignIn={auth.requireLogin} />
          )
        )}
      </main>

      {/* Bottom Mobile Navigation */}
      <BottomNavigation
        activeTab={activeTab}
        onChangeTab={(tab) => setActiveTab(tab)}
        hasActiveSession={!!activeSession}
        membershipsCount={membershipHook.activeCount}
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
        isAuthed={isAuthed}
        memberships={membershipHook.memberships}
        onClose={() => setSelectedTenantDetail(null)}
        onOpenDirections={(tenant) => {
          if (tenant.lat != null && tenant.lng != null) {
            window.open(`https://www.google.com/maps/search/?api=1&query=${tenant.lat},${tenant.lng}`, '_blank');
          }
        }}
        onToggleFavorite={handleToggleFavorite}
        onRequireLogin={auth.requireLogin}
        onRequestMembership={membershipHook.request}
      />

      <FindMyVehicleModal
        isOpen={isFindVehicleModalOpen}
        session={activeSession}
        onClose={() => setIsFindVehicleModalOpen(false)}
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
