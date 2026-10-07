import React, { useState, useEffect } from 'react';
import { X, MapPin, Phone, Clock, Navigation, Heart, Check, Car, Layers } from 'lucide-react';
import { Tenant } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';
import { getSite, PublicMapLevelOut } from '../../api/public';

interface TenantDetailModalProps {
  tenant: Tenant | null;
  onClose: () => void;
  onOpenDirections: (tenant: Tenant) => void;
  onToggleFavorite: (tenantId: string) => void;
}

const fmtVnd = (v: number | null) => (v == null ? '—' : `${v.toLocaleString()} đ`);

export const TenantDetailModal: React.FC<TenantDetailModalProps> = ({
  tenant,
  onClose,
  onOpenDirections,
  onToggleFavorite
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'overview' | 'floors' | 'memberships' | 'reviews'>('overview');
  const [levels, setLevels] = useState<PublicMapLevelOut[] | null>(null);

  const siteId = tenant?.id;
  useEffect(() => {
    setLevels(null);
    setActiveTab('overview');
    if (!siteId) return;
    let cancelled = false;
    getSite(siteId)
      .then((detail) => {
        if (!cancelled) setLevels(detail.levels);
      })
      .catch(() => {
        if (!cancelled) setLevels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (!tenant) return null;

  const available = tenant.capacity.available;
  const total = tenant.capacity.total;
  const occupied = total - available;
  const fillPercentage = total > 0 ? Math.round((occupied / total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/80 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn">
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Hero Header */}
        <div className="relative h-48 bg-slate-800 flex-shrink-0">
          {tenant.image ? (
            <img
              src={tenant.image}
              alt={tenant.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-600">
              <Car className="w-16 h-16" />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-transparent" />

          {/* Close & Favorite top bar */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
            <button
              onClick={onClose}
              className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full transition-colors backdrop-blur-sm"
            >
              <X className="w-5 h-5" />
            </button>
            <button
              onClick={() => onToggleFavorite(tenant.id)}
              className="p-2 bg-slate-950/70 hover:bg-slate-900 text-white rounded-full transition-colors backdrop-blur-sm"
            >
              <Heart className={`w-5 h-5 ${tenant.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </div>

          {/* Title Overlay */}
          <div className="absolute bottom-3 left-4 right-4 text-white">
            <div className="flex items-center gap-2">
              {tenant.parkingType && (
                <span className="px-2 py-0.5 bg-blue-600 text-white font-mono text-[10px] font-bold rounded uppercase">
                  {tenant.parkingType}
                </span>
              )}
              <span className="px-2 py-0.5 bg-slate-800/80 text-slate-200 font-mono text-[10px] rounded">
                ANPR LPR Camera
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight mt-1 truncate">{tenant.name}</h1>
            <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span>{[tenant.address, tenant.district].filter(Boolean).join(', ') || '—'}</span>
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
            />
            <div
              style={{ width: `${fillPercentage}%` }}
              className="bg-slate-700 h-full transition-all duration-500"
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
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === 'memberships' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('memberships')}
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`py-3 text-center border-b-2 transition-colors ${
              activeTab === 'reviews' ? 'border-blue-500 text-blue-400 font-bold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            {t('reviews')}
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
                      {fmtVnd(tenant.pricing.hourlyFrom)}
                    </div>
                  </div>

                  <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-1">
                    <span className="text-slate-400 font-medium">{t('overnightFeeLabel')}</span>
                    <div className="text-lg font-black text-blue-400 font-mono">
                      {fmtVnd(tenant.pricing.overnightFrom)}
                    </div>
                  </div>

                  {tenant.pricing.monthlyFrom != null && (
                    <div className="p-3 bg-slate-800/80 border border-slate-700/80 rounded-xl space-y-1 col-span-2">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400 font-medium">{t('monthlyPassLabel')}</span>
                      </div>
                      <div className="text-lg font-black text-white font-mono">
                        {fmtVnd(tenant.pricing.monthlyFrom)} <span className="text-xs font-normal text-slate-400">{t('perMonth')}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              {tenant.description && (
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    {t('aboutFacility')}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed bg-slate-800/40 p-3 rounded-xl border border-slate-800">
                    {tenant.description}
                  </p>
                </div>
              )}

              {/* Operating Hours & Contact */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center gap-2.5">
                  <Clock className="w-4 h-4 text-purple-400 flex-shrink-0" />
                  <div>
                    <div className="text-slate-400 text-[10px]">{t('operatingHours')}</div>
                    <div className="font-semibold text-white">{tenant.operatingHours || '—'}</div>
                  </div>
                </div>

                {tenant.phone ? (
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
                ) : (
                  <div className="p-3 bg-slate-800/60 border border-slate-700/60 rounded-xl flex items-center gap-2.5 opacity-60">
                    <Phone className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <div>
                      <div className="text-slate-400 text-[10px]">{t('contactDesk')}</div>
                      <div className="font-semibold text-slate-400">—</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Facilities tags */}
              {tenant.facilities.length > 0 && (
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
              )}
            </div>
          )}

          {/* TAB 2: LEVELS / ZONES (from site detail) */}
          {activeTab === 'floors' && (
            <div className="space-y-3">
              {levels === null ? (
                <div className="p-6 text-center text-slate-400 text-xs">{t('loading')}</div>
              ) : levels.length === 0 ? (
                <div className="p-6 text-center bg-slate-800/40 border border-slate-800 rounded-xl space-y-2">
                  <Layers className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">{t('noFloorData')}</p>
                </div>
              ) : (
                levels.map((lv) => (
                  <div key={lv.id} className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{lv.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">{lv.code ?? ''}</span>
                    </div>
                    {lv.zones.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {lv.zones.map((z) => (
                          <span
                            key={z.id}
                            className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[11px] font-mono text-slate-300"
                          >
                            {z.name} · {z.occupiedCount} {t('occupiedShort')}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: MEMBERSHIP PLANS — not yet supported by the backend */}
          {activeTab === 'memberships' && (
            <div className="p-6 text-center bg-slate-800/40 border border-slate-800 rounded-xl space-y-2">
              <Car className="w-8 h-8 text-slate-500 mx-auto" />
              <h4 className="text-sm font-bold text-white">{t('comingSoon')}</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">{t('membershipsComingSoon')}</p>
            </div>
          )}

          {/* TAB 4: REVIEWS — no review system on the backend yet */}
          {activeTab === 'reviews' && (
            <div className="p-6 text-center bg-slate-800/40 border border-slate-800 rounded-xl space-y-2">
              <h4 className="text-sm font-bold text-white">{t('noReviews')}</h4>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">{t('noReviewsDesc')}</p>
            </div>
          )}
        </div>

        {/* Modal Bottom CTA Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center gap-3">
          <button
            onClick={() => onOpenDirections(tenant)}
            disabled={tenant.lat == null || tenant.lng == null}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Navigation className="w-4 h-4 text-blue-200" />
            <span>{t('navigateHere')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
