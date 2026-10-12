import React from 'react';
import { ActiveParkingCard } from '../discover/ActiveParkingCard';
import { ActiveParkingSession, ParkingHistoryItem } from '../../types';
import { Car, Clock, History, CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { useParkingHistory } from '../../hooks/useParkingHistory';

interface MyParkingScreenProps {
  activeSession: ActiveParkingSession | null;
  onOpenFindVehicle: () => void;
  onOpenTenantDetail: (tenantId: string) => void;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${h}h ${m}m`;
}

function formatTimeRange(item: ParkingHistoryItem, language: string): string {
  const entry = new Date(item.entryTime);
  const exit = new Date(entry.getTime() + item.durationSeconds * 1000);
  const dateFmt = entry.toLocaleDateString(language === 'vi' ? 'vi-VN' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
  const timeFmt = (d: Date) =>
    d.toLocaleTimeString(language === 'vi' ? 'vi-VN' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit'
    });
  return `${dateFmt}, ${timeFmt(entry)} - ${timeFmt(exit)}`;
}

export const MyParkingScreen: React.FC<MyParkingScreenProps> = ({
  activeSession,
  onOpenFindVehicle,
  onOpenTenantDetail
}) => {
  const { t, language } = useLanguage();
  const { items, loading, loadMore, hasMore } = useParkingHistory(true);

  return (
    <div className="p-4 space-y-4 pb-24 bg-slate-950 min-h-screen text-slate-100">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <Car className="w-6 h-6 text-blue-400" />
          <span>{t('myParkingSessions')}</span>
        </h1>
        <p className="text-xs text-slate-400">{t('myParkingSub')}</p>
      </div>

      {/* Active Session Section */}
      {activeSession ? (
        <ActiveParkingCard
          session={activeSession}
          onOpenFindVehicle={onOpenFindVehicle}
          onOpenTenantDetail={onOpenTenantDetail}
        />
      ) : (
        <div className="p-6 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Car className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('noActiveSession')}</h3>
          <p className="text-xs text-slate-400">{t('noActiveDesc')}</p>
        </div>
      )}

      {/* History Log */}
      <div className="space-y-3 pt-2">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
          <History className="w-4 h-4 text-blue-400" />
          <span>{t('recentParkingHistory')}</span>
        </h2>

        {loading && items.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>{t('loading')}</span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
            <h3 className="text-sm font-bold text-white">{t('noHistory')}</h3>
            <p className="text-xs text-slate-400">{t('noHistoryDesc')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const locationLabel = [item.floor, item.zone].filter(Boolean).join(' - ');
              return (
                <div key={item.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
                        {item.vehiclePlate}
                      </span>
                      <span className="text-xs font-bold text-white truncate max-w-[140px]">{item.tenantName}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <Clock className="w-3 h-3 text-slate-500 flex-shrink-0" />
                      <span>{formatTimeRange(item, language)} ({formatDuration(item.durationSeconds)})</span>
                    </div>
                    {locationLabel && (
                      <div className="text-[11px] text-slate-500 font-mono">
                        {locationLabel}
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    {/* Server-estimated fee from the site's pricing rules; — when not estimable */}
                    <div className={`text-sm font-extrabold font-mono ${item.currentFeeVnd != null ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {item.currentFeeVnd != null ? `~${item.currentFeeVnd.toLocaleString()} đ` : '—'}
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold mt-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>{item.status === 'COMPLETED' ? t('completed') : item.status}</span>
                    </span>
                  </div>
                </div>
              );
            })}

            {hasMore && (
              <button
                onClick={() => void loadMore()}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
              >
                {language === 'vi' ? 'Xem thêm' : 'Load more'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
