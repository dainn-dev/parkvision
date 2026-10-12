import React from 'react';
import { DriverMembership, MembershipStatus } from '../../types';
import { CreditCard, ShieldCheck, Car, Clock, XCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { translations } from '../../i18n/translations';

interface MembershipsScreenProps {
  memberships: DriverMembership[];
  loading: boolean;
  onCancel: (id: string) => Promise<void>;
  onOpenDiscover: () => void;
}

type TKey = keyof (typeof translations)['en'];

const STATUS_STYLE: Record<MembershipStatus, { cls: string; key: TKey }> = {
  pending: { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', key: 'membershipPending' },
  active: { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', key: 'membershipActive' },
  rejected: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', key: 'membershipRejected' },
  cancelled: { cls: 'bg-slate-700/40 text-slate-400 border-slate-600/40', key: 'membershipCancelled' },
  expired: { cls: 'bg-slate-700/40 text-slate-400 border-slate-600/40', key: 'membershipExpired' },
  revoked: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', key: 'membershipRevoked' },
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString() : '—';

export const MembershipsScreen: React.FC<MembershipsScreenProps> = ({
  memberships,
  loading,
  onCancel,
  onOpenDiscover
}) => {
  const { t } = useLanguage();
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  const handleCancel = async (id: string) => {
    setCancelling(id);
    try {
      await onCancel(id);
    } finally {
      setCancelling(null);
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24 bg-slate-950 min-h-screen text-slate-100">
      <div className="space-y-1">
        <h1 className="text-xl font-black text-white flex items-center gap-2">
          <CreditCard className="w-6 h-6 text-blue-400" />
          <span>{t('tenantMemberships')}</span>
        </h1>
        <p className="text-xs text-slate-400">{t('membershipsSub')}</p>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-400 text-xs">{t('loading')}</div>
      ) : memberships.length === 0 ? (
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
          {memberships.map((mem) => {
            const st = STATUS_STYLE[mem.status];
            const cancellable = mem.status === 'pending' || mem.status === 'active';
            return (
              <div
                key={mem.id}
                className="p-4 bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 border border-blue-500/40 rounded-2xl shadow-xl space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-white truncate">{mem.siteName}</h3>
                    <div className="text-xs text-slate-300 font-semibold">{mem.plan.name}</div>
                    <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                      {mem.plan.priceVnd.toLocaleString()}đ / {mem.plan.durationDays} {t('days')}
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 border text-[10px] font-bold rounded uppercase whitespace-nowrap ${st.cls}`}>
                    {t(st.key)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-900/80 border border-slate-800 rounded-xl text-xs font-mono">
                  <div>
                    <span className="text-slate-400 text-[10px] flex items-center gap-1">
                      <Car className="w-3 h-3" /> {t('registeredPlate')}
                    </span>
                    <div className="text-amber-400 font-bold">{mem.plateNumber}</div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px]">{t('validUntil')}</span>
                    <div className="text-emerald-400 font-bold">{fmtDate(mem.endsAt)}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-2">
                  {mem.status === 'pending' ? (
                    <span className="flex items-center gap-1 text-amber-300 font-medium">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{t('awaitingApproval')}</span>
                    </span>
                  ) : mem.status === 'active' ? (
                    <span className="flex items-center gap-1 text-emerald-400 font-medium">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>{t('anprFastEntry')}</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">{t('requestedOn')}: {fmtDate(mem.createdAt)}</span>
                  )}
                  {cancellable && (
                    <button
                      onClick={() => void handleCancel(mem.id)}
                      disabled={cancelling === mem.id}
                      className="flex items-center gap-1 text-rose-400 hover:text-rose-300 font-semibold disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>{mem.status === 'pending' ? t('cancelRequest') : t('cancelMembership')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
