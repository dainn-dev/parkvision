import React from 'react';
import { MapPin, Navigation, Star, Heart, ChevronRight } from 'lucide-react';
import { Tenant } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface ParkingCardProps {
  tenant: Tenant;
  onOpenDetails: (tenant: Tenant) => void;
  onOpenDirections: (tenant: Tenant) => void;
  onToggleFavorite: (tenantId: string) => void;
}

export const ParkingCard: React.FC<ParkingCardProps> = ({
  tenant,
  onOpenDetails,
  onOpenDirections,
  onToggleFavorite
}) => {
  const { t } = useLanguage();
  const available = tenant.capacity.available;
  const total = tenant.capacity.total;
  const isFull = available <= 0;
  const isLimited = tenant.capacity.status === 'LIMITED' || tenant.capacity.status === 'ALMOST_FULL';

  // Capacity color logic according to spec Section 21
  let capacityBadgeBg = "bg-emerald-950/80 text-emerald-400 border-emerald-800/80";
  let capacityLabel = `🟢 ${available} ${t('spacesAvailable')}`;
  if (isFull) {
    capacityBadgeBg = "bg-rose-950/80 text-rose-400 border-rose-800/80";
    capacityLabel = `🔴 ${t('full')}`;
  } else if (isLimited) {
    capacityBadgeBg = "bg-amber-950/80 text-amber-300 border-amber-800/80";
    capacityLabel = `🟡 ${available} ${t('spotsLeft')}`;
  }

  return (
    <div className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 shadow-lg transition-all duration-200 group flex flex-col justify-between relative overflow-hidden">
      {/* Top Banner Image & Details */}
      <div className="flex items-start gap-3.5">
        <div className="w-24 h-24 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 relative border border-slate-700/80">
          <img
            src={tenant.image}
            alt={tenant.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          {/* Favorite button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(tenant.id);
            }}
            className="absolute top-1.5 right-1.5 p-1.5 bg-slate-950/70 hover:bg-slate-900 text-slate-300 hover:text-rose-400 rounded-full transition-colors backdrop-blur-sm"
            aria-label="Toggle Favorite"
          >
            <Heart className={`w-3.5 h-3.5 ${tenant.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
          </button>
          
          {/* Rating tag */}
          <div className="absolute bottom-1.5 left-1.5 bg-slate-950/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400 flex items-center gap-0.5 backdrop-blur-sm">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>{tenant.rating}</span>
            <span className="text-slate-400 font-normal">({tenant.reviewCount})</span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1">
            <h3
              onClick={() => onOpenDetails(tenant)}
              className="text-sm font-bold text-slate-100 hover:text-blue-400 transition-colors cursor-pointer truncate"
            >
              {tenant.name}
            </h3>
          </div>

          <div className="mt-1 text-xs text-slate-400 flex items-center gap-1">
            <MapPin className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <span className="font-semibold text-slate-300">{tenant.distanceMeters}m</span>
            <span>·</span>
            <span className="truncate">{tenant.district}</span>
          </div>

          {/* Realtime Capacity Badge */}
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border ${capacityBadgeBg}`}>
            <span>{capacityLabel}</span>
            <span className="text-[10px] text-slate-400 font-mono">({available}/{total})</span>
          </div>

          {/* Pricing Row Priority */}
          <div className="mt-2 text-xs font-mono flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-300">
            <div>
              <span className="text-slate-400">{t('from')} </span>
              <span className="text-emerald-400 font-extrabold text-sm">{tenant.pricing.hourlyFrom.toLocaleString()}đ</span>
              <span className="text-slate-400 text-[10px]">{t('perHour')}</span>
            </div>
            {tenant.pricing.overnightFrom && (
              <div className="text-[11px] text-slate-400">
                {t('night')}: <span className="text-slate-200 font-bold">{tenant.pricing.overnightFrom.toLocaleString()}đ</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Facilities Chips */}
      <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {tenant.facilities.slice(0, 3).map((fac, idx) => (
            <span key={idx} className="px-2 py-0.5 bg-slate-800 border border-slate-700/60 rounded text-slate-300 whitespace-nowrap">
              {fac === 'EV Charging' ? `⚡ ${t('evCharger')}` : fac}
            </span>
          ))}
          {tenant.facilities.length > 3 && (
            <span className="text-slate-500 font-mono">+{tenant.facilities.length - 3}</span>
          )}
        </div>

        {tenant.supportsMembership && (
          <div className="text-blue-400 font-medium text-[11px] flex items-center gap-1 whitespace-nowrap">
            <span>{t('membershipFrom')} {(tenant.pricing.monthlyFrom / 1000).toLocaleString()}k{t('perMonth')}</span>
          </div>
        )}
      </div>

      {/* Card Action Buttons */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onOpenDirections(tenant)}
          className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700/80 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Navigation className="w-3.5 h-3.5 text-blue-400" />
          <span>{t('directions')}</span>
        </button>

        <button
          onClick={() => onOpenDetails(tenant)}
          className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1 shadow-md shadow-blue-600/20 transition-all"
        >
          <span>{t('viewDetails')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
