import React from 'react';
import { MapPin, Navigation, Star, X, ChevronRight } from 'lucide-react';
import { Tenant } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface TenantPreviewSheetProps {
  tenant: Tenant | null;
  onClose: () => void;
  onOpenDetails: (tenant: Tenant) => void;
  onOpenDirections: (tenant: Tenant) => void;
}

export const TenantPreviewSheet: React.FC<TenantPreviewSheetProps> = ({
  tenant,
  onClose,
  onOpenDetails,
  onOpenDirections
}) => {
  if (!tenant) return null;

  const { t, language } = useLanguage();

  const available = tenant.capacity.available;
  const total = tenant.capacity.total;
  const isFull = available <= 0;
  const isLimited = tenant.capacity.status === 'LIMITED' || tenant.capacity.status === 'ALMOST_FULL';

  let statusBg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  let statusText = `${available} / ${total} ${t('spacesAvailable')}`;

  if (isFull) {
    statusBg = "bg-rose-500/20 text-rose-400 border-rose-500/30";
    statusText = `🔴 ${t('full')} - 0 ${t('spacesAvailable')}`;
  } else if (isLimited) {
    statusBg = "bg-amber-500/20 text-amber-300 border-amber-500/30";
    statusText = `🟡 ${t('spotsLeft')}: ${available}`;
  }

  return (
    <div className="mx-4 my-2 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl p-4 animate-slideUp relative z-20">
      <button
        onClick={onClose}
        className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
        aria-label="Close preview"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="flex items-start gap-3">
        {/* Tenant thumbnail image */}
        <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-800 flex-shrink-0 relative border border-slate-700">
          <img
            src={tenant.image}
            alt={tenant.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute top-1 left-1 bg-slate-950/80 px-1.5 py-0.5 rounded text-[10px] font-bold text-amber-400 flex items-center gap-0.5">
            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
            <span>{tenant.rating}</span>
          </div>
        </div>

        {/* Core Info */}
        <div className="flex-1 min-w-0 pr-6">
          <h3 className="text-sm font-bold text-white truncate">{tenant.name}</h3>
          <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
            <MapPin className="w-3 h-3 text-slate-500 flex-shrink-0" />
            <span>{tenant.distanceMeters}m · {tenant.district}</span>
          </p>

          {/* Realtime capacity badge */}
          <div className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${statusBg}`}>
            <span>{statusText}</span>
          </div>

          {/* Price preview */}
          <div className="mt-2 text-xs font-mono text-slate-300 flex items-center gap-3">
            <div>
              <span className="text-slate-500">{t('hourlyRateLabel')}: </span>
              <span className="text-emerald-400 font-bold">{tenant.pricing.hourlyFrom.toLocaleString()} đ</span>
            </div>
            <div>
              <span className="text-slate-500">{t('overnightFeeLabel')}: </span>
              <span className="text-blue-400 font-bold">{tenant.pricing.overnightFrom.toLocaleString()} đ</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-800">
        <button
          onClick={() => onOpenDirections(tenant)}
          className="py-2 px-3 bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-1.5 transition-colors"
        >
          <Navigation className="w-3.5 h-3.5 text-blue-400" />
          <span>{t('directions')}</span>
        </button>

        <button
          onClick={() => onOpenDetails(tenant)}
          className="py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/20 transition-all"
        >
          <span>{t('viewDetails')}</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

