import React from 'react';
import { UserMembership } from '../../types';
import { CreditCard, ShieldCheck, QrCode } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface MembershipsScreenProps {
  memberships: UserMembership[];
  onOpenDiscover: () => void;
}

export const MembershipsScreen: React.FC<MembershipsScreenProps> = ({
  memberships,
  onOpenDiscover
}) => {
  const { t } = useLanguage();

  return (
    <div className="p-4 space-y-4 pb-24 bg-slate-950 min-h-screen text-slate-100">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-400" />
          <span>{t('tenantMemberships')}</span>
        </h1>
        <p className="text-xs text-slate-400">{t('membershipsSub')}</p>
      </div>

      {memberships.length === 0 ? (
        <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <CreditCard className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('noMemberships')}</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {t('noMembershipsDesc')}
          </p>
          <button
            onClick={onOpenDiscover}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            {t('exploreParkingLots')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {memberships.map((mem) => (
            <div
              key={mem.id}
              className="p-4 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-500/40 rounded-2xl shadow-xl space-y-3 relative overflow-hidden"
            >
              <div className="flex items-start justify-between">
                <div>
                  <span className="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-bold font-mono rounded uppercase">
                    ANPR Fast Pass
                  </span>
                  <h3 className="text-base font-bold text-white mt-1">{mem.tenantName}</h3>
                  <div className="text-xs text-slate-300 font-semibold">{mem.planName}</div>
                </div>

                <div className="p-2 bg-white rounded-xl shadow-md flex-shrink-0">
                  <QrCode className="w-10 h-10 text-slate-950" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-mono">
                <div>
                  <span className="text-slate-400 text-[10px]">{t('registeredPlate')}</span>
                  <div className="text-amber-400 font-bold">{mem.vehiclePlate}</div>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px]">{t('validUntil')}</span>
                  <div className="text-emerald-400 font-bold">{mem.expiryDate}</div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>{t('statusLabel')}: {mem.status}</span>
                </span>
                <span className="font-mono">{mem.id}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

