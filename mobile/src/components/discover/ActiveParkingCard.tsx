import React, { useState, useEffect } from 'react';
import { MapPin, Clock, DollarSign, Navigation, ChevronRight } from 'lucide-react';
import { ActiveParkingSession } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface ActiveParkingCardProps {
  session: ActiveParkingSession | null;
  onOpenFindVehicle: () => void;
  onOpenTenantDetail?: (tenantId: string) => void;
}

export const ActiveParkingCard: React.FC<ActiveParkingCardProps> = ({
  session,
  onOpenFindVehicle,
  onOpenTenantDetail
}) => {
  if (!session) return null;

  const { t } = useLanguage();

  // Live timer tick for active duration and calculated fee
  const [elapsedSeconds, setElapsedSeconds] = useState(session.durationSeconds);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;

  const currentFee = session.currentFeeVnd;

  return (
    <div className="w-full bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 border border-blue-500/40 rounded-2xl shadow-xl overflow-hidden relative group animate-fadeIn">
      {/* Top Header Badge */}
      <div className="px-4 py-2 bg-blue-600/30 border-b border-blue-500/30 flex items-center justify-between text-xs font-semibold text-blue-300">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span className="uppercase tracking-wider">{t('activeSession')}</span>
        </div>
        <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px] font-mono border border-blue-400/30 text-blue-200">
          {t('anprVerified')}{session.anprConfidence != null ? ` (${Math.round(session.anprConfidence * (session.anprConfidence <= 1 ? 100 : 1))}%)` : ''}
        </span>
      </div>

      <div className="p-4 space-y-3">
        {/* Row 1: Vehicle & Spot info */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-amber-400 text-slate-950 font-mono font-black text-sm rounded-lg shadow-sm tracking-wide border border-amber-300">
                {session.vehiclePlate}
              </span>
              <span className="text-xs text-slate-300 font-medium bg-slate-800/80 px-2 py-0.5 rounded-md">
                {session.tenantName}
              </span>
            </div>
            <div className="mt-1.5 text-xs text-slate-300 flex items-center gap-1 font-mono">
              <MapPin className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-semibold text-white">
                {[session.floor, session.zone].filter(Boolean).join(' · ') || '—'}
              </span>
            </div>
          </div>

          <button
            onClick={() => onOpenTenantDetail && onOpenTenantDetail(session.tenantId)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            title={t('tenantDetails')}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Row 2: Live Timer & Current Fee */}
        <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl">
          <div className="space-y-0.5">
            <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <Clock className="w-3 h-3 text-blue-400" />
              <span>{t('parkingDuration')}</span>
            </div>
            <div className="text-base font-bold text-white font-mono tracking-tight">
              {hours}h {minutes}m <span className="text-xs text-blue-400">{seconds}s</span>
            </div>
          </div>

          <div className="space-y-0.5 text-right border-l border-slate-800 pl-3">
            <div className="text-[11px] font-medium text-slate-400 flex items-center justify-end gap-1">
              <DollarSign className="w-3 h-3 text-emerald-400" />
              <span>{t('currentFee')}</span>
            </div>
            <div className="text-base font-extrabold text-emerald-400 font-mono">
              {currentFee != null ? `${currentFee.toLocaleString()} đ` : '—'}
            </div>
          </div>
        </div>

        {/* Action Button: Find My Vehicle */}
        <button
          onClick={onOpenFindVehicle}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2 group/btn"
        >
          <Navigation className="w-4 h-4 text-blue-200 group-hover/btn:rotate-45 transition-transform" />
          <span>{t('findMyVehicle')}</span>
        </button>
      </div>
    </div>
  );
};

