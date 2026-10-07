import React, { useState } from 'react';
import { X, CreditCard, CheckCircle2, Car, ArrowRight } from 'lucide-react';
import { Tenant, MembershipPlan, UserMembership } from '../../types';
import { useLanguage } from '../../i18n/LanguageContext';

interface MembershipModalProps {
  isOpen: boolean;
  tenant: Tenant | null;
  plan: MembershipPlan | null;
  onClose: () => void;
  onSuccess: (membership: UserMembership) => void;
}

export const MembershipModal: React.FC<MembershipModalProps> = ({
  isOpen,
  tenant,
  plan,
  onClose,
  onSuccess
}) => {
  const { t } = useLanguage();
  const [vehiclePlate, setVehiclePlate] = useState('51A-123.45');
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'zalopay' | 'card' | 'bank'>('momo');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  if (!isOpen || !tenant || !plan) return null;

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setIsCompleted(true);

      const newMembership: UserMembership = {
        id: `MEM-${Math.floor(100000 + Math.random() * 900000)}`,
        tenantId: tenant.id,
        tenantName: tenant.name,
        planName: plan.name,
        vehiclePlate: vehiclePlate.toUpperCase(),
        startDate: new Date().toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString().split('T')[0],
        status: 'ACTIVE',
        pricePaid: plan.price
      };

      setTimeout(() => {
        onSuccess(newMembership);
        setIsCompleted(false);
        onClose();
      }, 1800);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-400" />
            <h2 className="text-base font-bold text-white">{t('registerMembershipPass')}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        {isCompleted ? (
          <div className="p-8 text-center space-y-4 animate-fadeIn">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 animate-bounce" />
            </div>
            <h3 className="text-xl font-black text-white">{t('membershipActivated')}</h3>
            <p className="text-xs text-slate-300">
              <span className="font-mono font-bold text-amber-400">{vehiclePlate}</span> - {tenant.name}
            </p>
          </div>
        ) : (
          <form onSubmit={handleRegister} className="p-4 space-y-4 text-slate-200">
            {/* Selected Plan Summary Card */}
            <div className="p-3.5 bg-gradient-to-r from-blue-950 to-slate-900 border border-blue-800/60 rounded-xl space-y-1">
              <div className="text-xs text-blue-400 font-semibold">{tenant.name}</div>
              <div className="text-base font-bold text-white">{plan.name}</div>
              <div className="text-lg font-black text-emerald-400 font-mono">
                {plan.price.toLocaleString()} đ <span className="text-xs font-normal text-slate-400">/ {plan.durationLabel}</span>
              </div>
            </div>

            {/* Vehicle Plate Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>{t('vehiclePlateLabel')}</span>
                <span className="text-[10px] text-blue-400">ANPR Auto LPR</span>
              </label>
              <div className="relative">
                <Car className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. 51A-123.45"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-800 border border-slate-700 rounded-xl font-mono font-bold text-amber-400 tracking-wider focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {t('selectPaymentMethod')}
              </label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'momo', label: t('momoWallet') },
                  { id: 'zalopay', label: t('zaloPay') },
                  { id: 'card', label: t('creditCard') },
                  { id: 'bank', label: t('bankTransfer') }
                ].map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() => setPaymentMethod(pm.id as any)}
                    className={`p-2.5 rounded-xl border text-left font-medium transition-all ${
                      paymentMethod === pm.id
                        ? 'bg-blue-950/80 text-blue-300 border-blue-500 font-bold'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-750'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isProcessing}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <span>{t('registeringAnpr')}</span>
              ) : (
                <>
                  <span>{t('confirmAndPayAmount')} {plan.price.toLocaleString()} đ</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

