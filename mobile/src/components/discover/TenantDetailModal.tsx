import React, { useState } from 'react';
import { X, Star, MapPin, Phone, Clock, Navigation, Heart, Check, Car } from 'lucide-react';
import { Tenant, MembershipPlan } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface TenantDetailModalProps {
  tenant: Tenant | null;
  onClose: () => void;
  onOpenMembershipModal: (tenant: Tenant, plan: MembershipPlan) => void;
  onOpenDirections: (tenant: Tenant) => void;
  onToggleFavorite: (tenantId: string) => void;
  onParkNow?: (tenant: Tenant) => void;
}

export const TenantDetailModal: React.FC<TenantDetailModalProps> = ({
  tenant,
  onClose,
  onOpenMembershipModal,
  onOpenDirections,
  onToggleFavorite,
  onParkNow
}) => {
  if (!tenant) return null;

  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'floors' | 'memberships' | 'reviews'>('overview');
  const [selectedFloor, setSelectedFloor] = useState(tenant.floors[0] || "Floor 1");

  const available = tenant.capacity.available;
  const total = tenant.capacity.total;
  const occupied = total - available;
  const fillPercentage = Math.round((occupied / total) * 100);

  // Generate mock indoor spots matrix for floor visualization
  const mockSpots = Array.from({ length: 24 }).map((_, i) => ({
    spotId: `${selectedFloor.slice(0, 2)}-${i + 1}`,
    isOccupied: i % 3 === 0 || i % 5 === 0,
    isEV: i === 2 || i === 3,
    isVIP: i === 1
  }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Hero Header */}
        <div className="relative h-48 bg-slate-800 flex-shrink-0">
          <img
            src={tenant.image}
            alt={tenant.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

          {/* Close & Favorite top bar */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full transition-colors backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleFavorite(tenant.id)}
                className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full transition-colors backdrop-blur-sm"
              >
                <Heart className={`w-5 h-5 ${tenant.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
              </button>
            </div>
          </div>

          {/* Title Overlay */}
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-blue-600 text-white font-mono text-[10px] font-bold rounded uppercase">
                {tenant.parkingType}
              </span>
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-200 font-mono text-[10px] rounded">
                ANPR LPR Camera
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight mt-1 truncate">{tenant.name}</h1>
            <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{tenant.address}, {tenant.district}</span>
            </p>
          </div>
        </div>

        {/* Realtime Capacity Progress Bar Banner */}
        <div className="px-4 py-3 bg-slate-950 border-b border-slate-800 flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>{t('realtimeCapacity')}</span>
            </span>
            <span className="font-mono font-bold text-emerald-400">
              {available} / {total} {t('availableTotal')}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden flex">
            <div
              style={{ width: `${100 - fillPercentage}%` }}
              className="bg-emerald-500 h-full transition-all duration-500"
              title={`${available} Available`}
            />
            <div
              style={{ width: `${fillPercentage}%` }}
              className="bg-slate-700 h-full transition-all duration-500"
              title={`${occupied} Occupied`}
            />
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-4 border-b border-slate-800 bg-slate-900 text-xs font-semibold text-slate-400">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === 'overview' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('overview')}
          </button>
          <button
            onClick={() => setActiveTab('floors')}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === 'floors' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('floorSpots')}
          </button>
          <button
            onClick={() => setActiveTab('memberships')}
            className={`py-3 text-center border-b-2 transition-colors relative ${
              activeTab === 'memberships' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('memberships')}
            {tenant.supportsMembership && (
              <span className="absolute top-1 right-2 w-1.5 h-1.5 rounded-full bg-blue-500"></span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === 'reviews' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('reviews')} ({tenant.reviewCount})
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4 text-slate-200">
              {/* Pricing Cards Grid */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('pricingTariff')}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">{t('hourlyRateLabel')}</span>
                    <div className="text-lg font-black text-emerald-400 font-mono">
                      {tenant.pricing.hourlyFrom.toLocaleString()} đ
                    </div>
                  </div>

                  <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">{t('overnightFeeLabel')}</span>
                    <div className="text-lg font-black text-blue-400 font-mono">
                      {tenant.pricing.overnightFrom.toLocaleString()} đ
                    </div>
                  </div>

                  {tenant.pricing.monthlyFrom && (
                    <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-1 col-span-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-medium">{t('monthlyPassLabel')}</span>
                        <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">Fast Pass LPR</span>
                      </div>
                      <div className="text-lg font-black text-white font-mono">
                        {tenant.pricing.monthlyFrom.toLocaleString()} đ <span className="text-xs font-normal text-slate-400">{t('perMonth')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('aboutFacility')}
                </h3>
                <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                  {tenant.description}
                </p>
              </div>

              {/* Operating Hours & Contact */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400 text-[10px]">{t('operatingHours')}</div>
                    <div className="font-semibold text-white">{tenant.operatingHours}</div>
                  </div>
                </div>

                <a
                  href={`tel:${tenant.phone}`}
                  className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center gap-2.5 hover:bg-slate-800 transition-colors"
                >
                  <Phone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400 text-[10px]">{t('contactDesk')}</div>
                    <div className="font-semibold text-emerald-400">{tenant.phone}</div>
                  </div>
                </a>
              </div>

              {/* Facilities tags */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('availableFacilities')}
                </h3>
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {tenant.facilities.map((fac, idx) => (
                    <span key={idx} className="px-2.5 py-1 bg-slate-800 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5">
                      <Check className="w-3 h-3 text-blue-400" />
                      <span>{fac === 'EV Charging' ? `⚡ ${t('evCharger')}` : fac}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: INDOOR FLOOR SPOTS MATRIX */}
          {activeTab === 'floors' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {t('selectFloor')}
                </h3>
                <span className="text-xs text-emerald-400 font-mono">🟢 {t('vacantSlot')}</span>
              </div>

              {/* Floor switcher tabs */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {tenant.floors.map((fl) => (
                  <button
                    key={fl}
                    onClick={() => setSelectedFloor(fl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
                      selectedFloor === fl
                        ? 'bg-blue-600 text-white border-blue-500'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {fl}
                  </button>
                ))}
              </div>

              {/* Spots Grid */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-2xl">
                <div className="text-xs text-slate-400 font-mono mb-2 flex items-center justify-between">
                  <span>{t('interactiveFloorPlan')} ({selectedFloor})</span>
                </div>

                <div className="grid grid-cols-6 gap-2">
                  {mockSpots.map((spot, i) => (
                    <div
                      key={i}
                      className={`p-2 rounded-lg text-center text-xs font-mono font-bold border transition-all flex flex-col items-center justify-center min-h-[48px] ${
                        spot.isOccupied
                          ? 'bg-rose-950/60 text-rose-400 border-rose-800/80 opacity-70'
                          : spot.isEV
                          ? 'bg-teal-950 text-teal-300 border-teal-600 shadow-sm'
                          : 'bg-emerald-950 text-emerald-300 border-emerald-600 hover:scale-105 cursor-pointer'
                      }`}
                    >
                      <span>{spot.spotId}</span>
                      <span className="text-[9px] font-normal opacity-80">
                        {spot.isOccupied ? '🚗 TAKEN' : spot.isEV ? '⚡ EV' : 'VACANT'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MEMBERSHIP PLANS */}
          {activeTab === 'memberships' && (
            <div className="space-y-3">
              {tenant.membershipPlans.map((plan) => (
                <div
                  key={plan.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    plan.recommended
                      ? 'bg-gradient-to-r from-blue-950 to-slate-900 border-blue-500 shadow-xl'
                      : 'bg-slate-800/60 border-slate-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {plan.badge && (
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 text-[10px] font-bold rounded uppercase border border-blue-400/30">
                          {plan.badge}
                        </span>
                      )}
                      <h4 className="text-base font-bold text-white mt-1">{plan.name}</h4>
                      <div className="text-lg font-black text-emerald-400 font-mono mt-0.5">
                        {plan.price.toLocaleString()} đ <span className="text-xs font-normal text-slate-400">/ {plan.durationLabel}</span>
                      </div>
                    </div>

                    <button
                      onClick={() => onOpenMembershipModal(tenant, plan)}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
                    >
                      {t('registerPlan')}
                    </button>
                  </div>

                  <ul className="mt-3 space-y-1.5 text-xs text-slate-300 border-t border-slate-700/50 pt-2.5">
                    {plan.perks.map((perk, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>{perk}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}

          {/* TAB 4: REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-800/60 border border-slate-700 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-2xl font-black text-white font-mono">{tenant.rating} / 5.0</div>
                  <div className="text-slate-400 text-[11px]">{tenant.reviewCount} verified check-ins</div>
                </div>
                <div className="flex text-amber-400">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-amber-400" />
                  ))}
                </div>
              </div>

              {/* Sample Reviews */}
              <div className="space-y-2">
                <div className="p-3 bg-slate-800/40 border border-slate-800 rounded-xl space-y-1">
                  <div className="flex justify-between items-center text-slate-400 text-[11px]">
                    <span className="font-semibold text-white">Minh Tu (51A-881.92)</span>
                    <span>2 days ago</span>
                  </div>
                  <p className="text-slate-300">"Super fast ANPR gate! I didn't even have to roll down my window."</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom CTA Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center gap-3">
          <button
            onClick={() => onOpenDirections(tenant)}
            className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 transition-colors"
          >
            <Navigation className="w-4 h-4 text-blue-400" />
            <span>{t('navigateHere')}</span>
          </button>

          {onParkNow && (
            <button
              onClick={() => onParkNow(tenant)}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2"
            >
              <Car className="w-4 h-4 text-blue-200" />
              <span>{t('simulateCheckIn')}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
