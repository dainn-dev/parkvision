import React, { useCallback, useEffect, useState } from 'react';
import { X, Wallet, Loader2, BadgeCheck, Car, CreditCard, PlusCircle } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { ApiError } from '../../lib/api';
import { memberships as membershipsApi, sessions as sessionsApi, PaymentCreateBody } from '../../api/driver';
import { usePayments } from '../../hooks/usePayments';
import { DriverMembership, ParkingHistoryItem } from '../../types';

export interface PaymentEWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_KEY = {
  created: 'payCreated',
  paid: 'payPaid',
  failed: 'payFailed',
  cancelled: 'payCancelled',
  expired: 'payExpired',
  refunded: 'payRefunded',
} as const;

const STATUS_STYLE: Record<string, string> = {
  created: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  paid: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  refunded: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  failed: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  cancelled: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  expired: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

// Matches backend TOPUP_MIN_VND / TOPUP_MAX_VND in payment_service.py.
const TOPUP_MIN_VND = 10_000;
const TOPUP_MAX_VND = 50_000_000;

const KIND_KEY = { membership: 'membershipPayment', session: 'parkingFeePayment', topup: 'topUpPayment' } as const;
const TXN_KIND_KEY = {
  topup_credit: 'txnTopup',
  spend_debit: 'txnSpend',
  refund_credit: 'txnRefundCredit',
  refund_debit: 'txnRefundDebit',
} as const;

// Real payments screen: payable memberships + sessions priced by the
// backend fee engine, and the driver's payment history. Provider hand-off
// is a hosted payUrl (MoMo) opened in a new tab; status is polled via the
// backend's gateway query. When the deployment has no gateway configured,
// create calls return 503 payments_not_configured → honest fallback panel.
export const PaymentEWalletModal: React.FC<PaymentEWalletModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, language } = useLanguage();
  const { payments, wallet, busyId, payAndWatch, hasPaymentFor, canAfford, refetch } = usePayments(isOpen);
  const [memberships, setMemberships] = useState<DriverMembership[]>([]);
  const [sessions, setSessions] = useState<ParkingHistoryItem[]>([]);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [topupAmount, setTopupAmount] = useState('200000');

  const loadPayables = useCallback(async () => {
    try {
      const [ms, active, hist] = await Promise.all([
        membershipsApi.list(),
        sessionsApi.active(),
        sessionsApi.history(1, 20),
      ]);
      setMemberships(ms);
      setSessions([...active, ...hist.items]);
    } catch {
      /* list call failures leave payables empty; history below still renders */
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void loadPayables();
    void refetch();
  }, [isOpen, loadPayables, refetch]);

  if (!isOpen) return null;

  const fmt = (v: number) => `${v.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} đ`;

  const payableMemberships = memberships.filter(
    (m) =>
      m.status === 'pending' && m.plan.priceVnd > 0 && !hasPaymentFor('membership', m.id)
  );
  const payableSessions = sessions.filter(
    (s) => (s.currentFeeVnd ?? 0) > 0 && !hasPaymentFor('session', s.id)
  );

  const pay = async (body: PaymentCreateBody) => {
    setError(null);
    try {
      await payAndWatch(body, () => void loadPayables());
    } catch (e) {
      if (e instanceof ApiError && e.code === 'payments_not_configured') {
        setNotConfigured(true);
      } else {
        setError(e instanceof Error ? e.message : 'payment_failed');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('paymentEwallets')}</h2>
              <p className="text-[11px] text-slate-400">{t('paymentSub')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {notConfigured ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Wallet className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-white">{t('comingSoon')}</h3>
            <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
              {language === 'vi'
                ? 'Thanh toán trực tuyến chưa được bật trên hệ thống này. Vui lòng thanh toán trực tiếp tại bãi xe.'
                : 'Online payments are not enabled on this deployment. Please pay at the parking office.'}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-4 overflow-y-auto">
            {error && (
              <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            {/* Wallet */}
            <section className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-400" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {t('walletBalance')}
                  </span>
                </div>
                <span className="text-sm font-bold text-white font-mono">
                  {fmt(wallet?.balanceVnd ?? 0)}
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={TOPUP_MIN_VND}
                  max={TOPUP_MAX_VND}
                  step={10000}
                  value={topupAmount}
                  onChange={(e) => setTopupAmount(e.target.value)}
                  className="flex-1 min-w-0 bg-slate-950/60 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-emerald-500/60"
                />
                <button
                  disabled={
                    busyId !== null ||
                    Number(topupAmount) < TOPUP_MIN_VND ||
                    Number(topupAmount) > TOPUP_MAX_VND
                  }
                  onClick={() => void pay({ kind: 'topup', amountVnd: Math.max(0, Math.floor(Number(topupAmount) || 0)) })}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors"
                >
                  {busyId ? <Loader2 className="w-3 h-3 animate-spin" /> : <PlusCircle className="w-3 h-3" />}
                  {t('topUp')}
                </button>
              </div>
              {(wallet?.transactions.length ?? 0) > 0 && (
                <div className="space-y-1 pt-1 border-t border-slate-700/50">
                  {wallet!.transactions.slice(0, 4).map((tx) => (
                    <div key={tx.id} className="flex justify-between text-[10px] text-slate-400">
                      <span>{t(TXN_KIND_KEY[tx.kind as keyof typeof TXN_KIND_KEY] ?? 'txnSpend')}</span>
                      <span className="font-mono">
                        {tx.kind.endsWith('debit') ? '−' : '+'}{fmt(tx.amountVnd)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Payable items */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t('toPay')}
              </h3>
              {payableMemberships.length === 0 && payableSessions.length === 0 && (
                <p className="text-xs text-slate-500 py-2">{t('nothingToPay')}</p>
              )}
              {payableMemberships.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <BadgeCheck className="w-4 h-4 text-blue-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {m.plan.name} · {m.siteName}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">{m.plateNumber}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-stretch gap-1">
                    <button
                      disabled={busyId !== null}
                      onClick={() => void pay({ kind: 'membership', membershipId: m.id })}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors"
                    >
                      {busyId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                      {fmt(m.plan.priceVnd)}
                    </button>
                    <button
                      disabled={busyId !== null || !canAfford(m.plan.priceVnd, 'wallet')}
                      title={canAfford(m.plan.priceVnd, 'wallet') ? undefined : t('insufficientBalance')}
                      onClick={() => void pay({ kind: 'membership', membershipId: m.id, method: 'wallet' })}
                      className="flex items-center justify-center gap-1.5 px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-[10px] font-bold rounded-lg transition-colors"
                    >
                      <Wallet className="w-3 h-3" />
                      {t('payWithWallet')}
                    </button>
                  </div>
                </div>
              ))}
              {payableSessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Car className="w-4 h-4 text-amber-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">
                        {s.tenantName}
                      </p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        {s.vehiclePlate} · {t('estFee')}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-stretch gap-1">
                    <button
                      disabled={busyId !== null}
                      onClick={() => void pay({ kind: 'session', sessionId: s.id })}
                      className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors"
                    >
                      {busyId ? <Loader2 className="w-3 h-3 animate-spin" /> : <CreditCard className="w-3 h-3" />}
                      {fmt(s.currentFeeVnd ?? 0)}
                    </button>
                    <button
                      disabled={busyId !== null || !canAfford(s.currentFeeVnd ?? 0, 'wallet')}
                      title={canAfford(s.currentFeeVnd ?? 0, 'wallet') ? undefined : t('insufficientBalance')}
                      onClick={() => void pay({ kind: 'session', sessionId: s.id, method: 'wallet' })}
                      className="flex items-center justify-center gap-1.5 px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-[10px] font-bold rounded-lg transition-colors"
                    >
                      <Wallet className="w-3 h-3" />
                      {t('payWithWallet')}
                    </button>
                  </div>
                </div>
              ))}
            </section>

            {/* History */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                {t('paymentHistory')}
              </h3>
              {payments.length === 0 && (
                <p className="text-xs text-slate-500 py-2">{t('noPaymentsYet')}</p>
              )}
              {payments.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 bg-slate-800/40 border border-slate-800 rounded-xl px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">
                      {t(KIND_KEY[p.kind] ?? 'parkingFeePayment')}
                      {p.siteName ? ` · ${p.siteName}` : ''}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      {new Date(p.createdAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}
                      {p.plateNumber ? ` · ${p.plateNumber}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-white font-mono">
                      {fmt(p.amountVnd)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded border ${STATUS_STYLE[p.status]}`}
                    >
                      {t(STATUS_KEY[p.status])}
                    </span>
                    {p.status === 'created' && p.payUrl && (
                      <a
                        href={p.payUrl}
                        target="_blank"
                        rel="noopener"
                        className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300"
                      >
                        {t('payNow')}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};
