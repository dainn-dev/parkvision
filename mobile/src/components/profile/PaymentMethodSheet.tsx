import React from 'react';
import { X, Wallet, CreditCard, Loader2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { paymentMethodAvailability } from '../../lib/payments';
import { PaymentMethod } from '../../types';

export interface PaymentMethodSheetProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  amountVnd: number;
  walletBalanceVnd: number | null | undefined;
  /** Set after the server answered 503 payments_not_configured for MoMo. */
  momoUnavailable: boolean;
  busy: boolean;
  error?: string | null;
  onSelect: (method: PaymentMethod) => void;
  onClose: () => void;
}

/** Bottom sheet that asks the driver to choose MoMo or Wallet before a
 * payment is created; the caller sends the chosen `method` explicitly. */
export const PaymentMethodSheet: React.FC<PaymentMethodSheetProps> = ({
  isOpen,
  title,
  subtitle,
  amountVnd,
  walletBalanceVnd,
  momoUnavailable,
  busy,
  error,
  onSelect,
  onClose
}) => {
  const { t, language } = useLanguage();
  if (!isOpen) return null;

  const fmt = (v: number) => `${v.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} đ`;
  const options = paymentMethodAvailability({ amountVnd, walletBalanceVnd, momoUnavailable });

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center animate-fadeIn"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white truncate">{title}</h2>
            {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            aria-label={t('close')}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400">{t('amountToPay')}</span>
            <span className="text-sm font-bold text-white font-mono">{fmt(amountVnd)}</span>
          </div>

          {error && (
            <div className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl px-3 py-2">
              {error}
            </div>
          )}

          {options.map((o) => {
            const isWallet = o.method === 'wallet';
            return (
              <button
                key={o.method}
                disabled={busy || !o.enabled}
                onClick={() => onSelect(o.method)}
                className="w-full flex items-center justify-between gap-3 bg-slate-800/60 border border-slate-700/60 hover:border-emerald-500/50 disabled:opacity-50 disabled:hover:border-slate-700/60 rounded-xl px-3 py-3 text-left transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {isWallet ? (
                    <Wallet className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <CreditCard className="w-5 h-5 text-pink-400 shrink-0" />
                  )}
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-white">
                      {isWallet ? t('payWithWallet') : t('payWithMomo')}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {isWallet
                        ? `${t('walletBalance')}: ${fmt(walletBalanceVnd ?? 0)}`
                        : t('momoHint')}
                    </span>
                    {o.reason === 'insufficient_balance' && (
                      <span className="block text-[11px] text-amber-300">{t('insufficientBalance')}</span>
                    )}
                    {o.reason === 'not_configured' && (
                      <span className="block text-[11px] text-amber-300">{t('momoNotConfigured')}</span>
                    )}
                  </span>
                </span>
                {busy && o.enabled && <Loader2 className="w-4 h-4 animate-spin text-slate-400 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
