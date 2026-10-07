import React from 'react';
import { X, Wallet } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface PaymentEWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// In-app wallet, linked payment methods and transaction history are not
// supported by the backend yet — render an honest "coming soon" panel
// instead of fabricated balances or transactions.
export const PaymentEWalletModal: React.FC<PaymentEWalletModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, language } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
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

        <div className="p-8 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
            <Wallet className="w-7 h-7" />
          </div>
          <h3 className="text-sm font-bold text-white">{t('comingSoon')}</h3>
          <p className="text-xs text-slate-400 max-w-xs mx-auto leading-relaxed">
            {language === 'vi'
              ? 'Ví đỗ xe, liên kết ví điện tử (MoMo, ZaloPay) và lịch sử giao dịch sẽ khả dụng khi tính năng thanh toán được phát hành.'
              : 'Parking wallet, e-wallet linking (MoMo, ZaloPay) and transaction history will be available when payments are released.'}
          </p>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            {language === 'vi' ? 'Đóng' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
