import React from 'react';
import { ActiveParkingCard } from '../discover/ActiveParkingCard';
import { ActiveParkingSession } from '../../types';
import { Car, Clock, History, CheckCircle2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface MyParkingScreenProps {
  activeSession: ActiveParkingSession | null;
  onOpenFindVehicle: () => void;
  onOpenTenantDetail: (tenantId: string) => void;
}

export const MyParkingScreen: React.FC<MyParkingScreenProps> = ({
  activeSession,
  onOpenFindVehicle,
  onOpenTenantDetail
}) => {
  const { t, language } = useLanguage();

  const historySessions = [
    {
      id: "SESS-712839",
      tenantName: "Crescent Mall Underground",
      vehiclePlate: "51A-123.45",
      date: language === 'vi' ? "Hôm qua, 14:20 - 17:05" : "Yesterday, 14:20 - 17:05",
      duration: "2h 45m",
      feeVnd: 75000,
      status: "COMPLETED",
      spot: "B1 - Zone Blue - 104"
    },
    {
      id: "SESS-551029",
      tenantName: "Saigon Centre & Takashimaya",
      vehiclePlate: "51A-123.45",
      date: "05/08/2026, 09:10 - 18:30",
      duration: "9h 20m",
      feeVnd: 280000,
      status: "COMPLETED",
      spot: "B2 - Executive - 012"
    }
  ];

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

        <div className="space-y-2">
          {historySessions.map((item) => (
            <div key={item.id} className="p-3.5 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold bg-amber-400 text-slate-950 px-2 py-0.5 rounded">
                    {item.vehiclePlate}
                  </span>
                  <span className="text-xs font-bold text-white truncate max-w-[160px]">{item.tenantName}</span>
                </div>
                <div className="text-[11px] text-slate-400 flex items-center gap-2">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>{item.date} ({item.duration})</span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono">
                  {t('spotLabel')}: {item.spot}
                </div>
              </div>

              <div className="text-right">
                <div className="text-sm font-extrabold text-emerald-400 font-mono">
                  {item.feeVnd.toLocaleString()} đ
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold mt-1">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  <span>{t('paid')}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

