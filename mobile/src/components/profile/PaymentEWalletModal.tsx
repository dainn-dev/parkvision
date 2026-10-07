import React, { useState } from 'react';
import {
  X,
  Wallet,
  CreditCard,
  Plus,
  Check,
  ChevronRight,
  ArrowDownLeft,
  ArrowUpRight,
  ShieldCheck,
  Smartphone,
  Building2,
  Sparkles,
  RefreshCw,
  History,
  Lock,
  Trash2,
  CheckCircle2,
  QrCode
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface PaymentEWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LinkedMethod {
  id: string;
  type: 'momo' | 'zalopay' | 'card' | 'bank';
  name: string;
  details: string;
  isDefault: boolean;
  iconBg: string;
}

interface Transaction {
  id: string;
  title: string;
  location?: string;
  type: 'topup' | 'parking' | 'membership';
  amount: number;
  time: string;
  date: string;
  status: 'success' | 'pending' | 'failed';
  paymentMethod: string;
}

export const PaymentEWalletModal: React.FC<PaymentEWalletModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, language } = useLanguage();

  const [walletBalance, setWalletBalance] = useState<number>(250000);
  const [autoDeduct, setAutoDeduct] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<'methods' | 'history'>('methods');

  // Top Up Modal State
  const [showTopUp, setShowTopUp] = useState<boolean>(false);
  const [topUpAmount, setTopUpAmount] = useState<number>(100000);
  const [customAmount, setCustomAmount] = useState<string>('');
  const [selectedTopUpSource, setSelectedTopUpSource] = useState<string>('momo');
  const [isProcessingTopUp, setIsProcessingTopUp] = useState<boolean>(false);
  const [topUpSuccess, setTopUpSuccess] = useState<boolean>(false);

  // Add Method Modal State
  const [showAddMethod, setShowAddMethod] = useState<boolean>(false);
  const [newMethodType, setNewMethodType] = useState<'momo' | 'zalopay' | 'card' | 'bank'>('momo');
  const [newAccountInput, setNewAccountInput] = useState<string>('');
  const [isLinking, setIsLinking] = useState<boolean>(false);

  // Linked Methods State
  const [linkedMethods, setLinkedMethods] = useState<LinkedMethod[]>([
    {
      id: '1',
      type: 'momo',
      name: 'Ví MoMo',
      details: '098****123',
      isDefault: true,
      iconBg: 'bg-pink-600'
    },
    {
      id: '2',
      type: 'zalopay',
      name: 'Ví ZaloPay',
      details: '098****123',
      isDefault: false,
      iconBg: 'bg-blue-600'
    },
    {
      id: '3',
      type: 'card',
      name: 'Thẻ Visa International',
      details: '•••• •••• •••• 8888',
      isDefault: false,
      iconBg: 'bg-indigo-600'
    }
  ]);

  // Transactions State
  const [transactions, setTransactions] = useState<Transaction[]>([
    {
      id: 'tx-101',
      title: language === 'vi' ? 'Thanh toán đỗ xe ANPR' : 'ANPR Parking Fee',
      location: 'Vincom Center Landmark 81',
      type: 'parking',
      amount: -30000,
      time: '09:45',
      date: '11/08/2026',
      status: 'success',
      paymentMethod: language === 'vi' ? 'Ví đỗ xe ANPR' : 'ANPR Wallet'
    },
    {
      id: 'tx-102',
      title: language === 'vi' ? 'Nạp tiền vào Ví đỗ xe' : 'Top up Parking Wallet',
      type: 'topup',
      amount: 200000,
      time: '18:20',
      date: '10/08/2026',
      status: 'success',
      paymentMethod: 'Ví MoMo'
    },
    {
      id: 'tx-103',
      title: language === 'vi' ? 'Gia hạn Vé tháng Cư dân' : 'Resident Monthly Pass Renewal',
      location: 'Vinhomes Central Park',
      type: 'membership',
      amount: -1200000,
      time: '14:00',
      date: '01/08/2026',
      status: 'success',
      paymentMethod: 'Thẻ Visa (•••• 8888)'
    },
    {
      id: 'tx-104',
      title: language === 'vi' ? 'Thanh toán đỗ xe ANPR' : 'ANPR Parking Fee',
      location: 'Crescent Mall Quận 7',
      type: 'parking',
      amount: -20000,
      time: '16:30',
      date: '28/07/2026',
      status: 'success',
      paymentMethod: 'Ví ZaloPay'
    }
  ]);

  if (!isOpen) return null;

  const handleSetDefaultMethod = (id: string) => {
    setLinkedMethods(prev =>
      prev.map(m => ({
        ...m,
        isDefault: m.id === id
      }))
    );
  };

  const handleRemoveMethod = (id: string) => {
    setLinkedMethods(prev => prev.filter(m => m.id !== id));
  };

  const handleConfirmTopUp = () => {
    const finalAmount = customAmount ? parseInt(customAmount, 10) : topUpAmount;
    if (isNaN(finalAmount) || finalAmount <= 0) return;

    setIsProcessingTopUp(true);

    setTimeout(() => {
      setIsProcessingTopUp(false);
      setWalletBalance(prev => prev + finalAmount);
      setTopUpSuccess(true);

      // Add to transaction history
      const newTx: Transaction = {
        id: `tx-${Date.now()}`,
        title: language === 'vi' ? 'Nạp tiền vào Ví đỗ xe' : 'Top up Parking Wallet',
        type: 'topup',
        amount: finalAmount,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: new Date().toLocaleDateString('en-GB'),
        status: 'success',
        paymentMethod:
          selectedTopUpSource === 'momo'
            ? 'Ví MoMo'
            : selectedTopUpSource === 'zalopay'
            ? 'Ví ZaloPay'
            : selectedTopUpSource === 'card'
            ? 'Thẻ Visa/Mastercard'
            : 'Chuyển khoản VietQR'
      };

      setTransactions(prev => [newTx, ...prev]);

      setTimeout(() => {
        setTopUpSuccess(false);
        setShowTopUp(false);
        setCustomAmount('');
      }, 1200);
    }, 1000);
  };

  const handleAddMethodSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLinking(true);

    setTimeout(() => {
      setIsLinking(false);
      const newId = Date.now().toString();
      let name = 'Ví Điện Tử';
      let details = newAccountInput || '098****888';
      let iconBg = 'bg-blue-600';

      if (newMethodType === 'momo') {
        name = 'Ví MoMo';
        iconBg = 'bg-pink-600';
      } else if (newMethodType === 'zalopay') {
        name = 'Ví ZaloPay';
        iconBg = 'bg-blue-600';
      } else if (newMethodType === 'card') {
        name = 'Thẻ Visa / Mastercard';
        details = newAccountInput ? `•••• ${newAccountInput.slice(-4)}` : '•••• •••• •••• 9999';
        iconBg = 'bg-indigo-600';
      } else {
        name = 'Tài khoản Ngân hàng';
        details = newAccountInput ? `VietQR - ${newAccountInput}` : 'VietQR Techcombank';
        iconBg = 'bg-emerald-600';
      }

      const newMethod: LinkedMethod = {
        id: newId,
        type: newMethodType,
        name,
        details,
        isDefault: linkedMethods.length === 0,
        iconBg
      };

      setLinkedMethods(prev => [...prev, newMethod]);
      setShowAddMethod(false);
      setNewAccountInput('');
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-2xl">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{language === 'vi' ? 'Thanh toán & Ví điện tử' : 'Payments & E-Wallets'}</span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  256-Bit
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'vi'
                  ? 'Quản lý số dư, ví liên kết & tự động qua rào ANPR'
                  : 'Manage parking balance, linked wallets & auto ANPR'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Parking E-Wallet Card */}
          <div className="p-4 bg-gradient-to-br from-blue-900 via-indigo-950 to-slate-900 border border-blue-500/30 rounded-2xl shadow-lg relative overflow-hidden space-y-3">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-blue-300">
                <Wallet className="w-4 h-4 text-blue-400" />
                <span>{language === 'vi' ? 'Ví Đỗ Xe Tự Động (ANPR Wallet)' : 'ANPR Parking Wallet'}</span>
              </div>
              <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono font-bold border border-blue-400/30">
                ACTIVE
              </span>
            </div>

            <div>
              <div className="text-[11px] text-slate-400 font-medium">
                {language === 'vi' ? 'Số dư hiện tại' : 'Current Balance'}
              </div>
              <div className="text-2xl font-extrabold text-white font-mono tracking-tight flex items-baseline gap-1 mt-0.5">
                <span>{walletBalance.toLocaleString('vi-VN')}</span>
                <span className="text-xs text-blue-400 font-sans font-bold">VNĐ</span>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-500/20 flex items-center justify-between gap-2">
              <button
                onClick={() => setShowTopUp(true)}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{language === 'vi' ? 'Nạp tiền vào ví' : 'Top Up Wallet'}</span>
              </button>

              <button
                onClick={() => setActiveTab(activeTab === 'history' ? 'methods' : 'history')}
                className="py-2 px-3 bg-slate-800/80 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <History className="w-4 h-4 text-blue-400" />
                <span>{language === 'vi' ? 'Lịch sử' : 'History'}</span>
              </button>
            </div>
          </div>

          {/* Auto Deduct Setting Toggle */}
          <div className="p-3.5 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">
                  {language === 'vi' ? 'Tự động trừ tiền khi qua barie ANPR' : 'Auto ANPR Barrier Deduction'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {language === 'vi'
                    ? 'Tự động mở cổng không cần quét mã hay chờ thanh toán'
                    : 'Instant barrier open without scanning QR codes'}
                </div>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoDeduct}
                onChange={e => setAutoDeduct(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
            </label>
          </div>

          {/* Tabs Switcher: Linked Methods vs Transaction History */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setActiveTab('methods')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'methods'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>{language === 'vi' ? 'Ví & Thẻ liên kết' : 'Linked Methods'}</span>
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`flex-1 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              <History className="w-4 h-4" />
              <span>{language === 'vi' ? 'Lịch sử giao dịch' : 'Transactions'}</span>
            </button>
          </div>

          {/* TAB 1: LINKED PAYMENT METHODS */}
          {activeTab === 'methods' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {language === 'vi' ? 'Phương thức đã kết nối' : 'Connected Methods'}
                </span>
                <button
                  onClick={() => setShowAddMethod(true)}
                  className="text-xs text-blue-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{language === 'vi' ? 'Thêm liên kết mới' : 'Add New'}</span>
                </button>
              </div>

              <div className="space-y-2">
                {linkedMethods.map(method => (
                  <div
                    key={method.id}
                    className="p-3.5 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 ${method.iconBg} text-white rounded-xl font-bold text-xs shadow-sm`}>
                        {method.type === 'momo' ? (
                          'MoMo'
                        ) : method.type === 'zalopay' ? (
                          'Zalo'
                        ) : method.type === 'card' ? (
                          <CreditCard className="w-4 h-4" />
                        ) : (
                          <Building2 className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-white flex items-center gap-2">
                          <span>{method.name}</span>
                          {method.isDefault && (
                            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 px-2 py-0.2 rounded border border-blue-500/20">
                              {language === 'vi' ? 'Mặc định' : 'Default'}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono mt-0.5">{method.details}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {!method.isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefaultMethod(method.id)}
                          className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-semibold rounded-lg transition-colors"
                        >
                          {language === 'vi' ? 'Đặt mặc định' : 'Set Default'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRemoveMethod(method.id)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                        title={language === 'vi' ? 'Hủy liên kết' : 'Unlink'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: TRANSACTION HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-400 uppercase tracking-wider">
                <span>{language === 'vi' ? 'Giao dịch gần đây' : 'Recent Transactions'}</span>
                <span className="text-[10px] text-slate-500">{transactions.length} items</span>
              </div>

              <div className="space-y-2">
                {transactions.map(tx => {
                  const isPositive = tx.amount > 0;
                  return (
                    <div
                      key={tx.id}
                      className="p-3 bg-slate-850 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-2 rounded-xl text-white font-bold ${
                            isPositive
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-blue-500/20 text-blue-400'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-white">{tx.title}</div>
                          {tx.location && <div className="text-[11px] text-slate-400">{tx.location}</div>}
                          <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                            <span>{tx.time} - {tx.date}</span>
                            <span>•</span>
                            <span className="text-slate-400">{tx.paymentMethod}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div
                          className={`text-xs font-bold font-mono ${
                            isPositive ? 'text-emerald-400' : 'text-slate-200'
                          }`}
                        >
                          {isPositive ? '+' : ''}{tx.amount.toLocaleString('vi-VN')} đ
                        </div>
                        <span className="text-[9px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20 inline-block mt-1">
                          {language === 'vi' ? 'Thành công' : 'Success'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium text-[11px]">
            <Lock className="w-3.5 h-3.5" />
            <span>{language === 'vi' ? 'Bảo mật bởi ANPR Pay Gate 4.0' : 'Secured by ANPR Pay Gate'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>

      {/* INNER MODAL: TOP UP WALLET */}
      {showTopUp && (
        <div className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Wallet className="w-4 h-4 text-blue-400" />
                <span>{language === 'vi' ? 'Nạp tiền Ví đỗ xe' : 'Top Up Parking Wallet'}</span>
              </div>
              <button
                onClick={() => setShowTopUp(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {topUpSuccess ? (
              <div className="py-6 text-center space-y-3 animate-fadeIn">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                  <CheckCircle2 className="w-7 h-7 animate-bounce" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  {language === 'vi' ? 'Nạp tiền thành công!' : 'Top Up Successful!'}
                </h3>
                <p className="text-xs text-slate-300">
                  {language === 'vi'
                    ? 'Số dư ví đỗ xe của bạn đã được cộng thêm ngay lập tức.'
                    : 'Your parking wallet balance has been updated.'}
                </p>
              </div>
            ) : (
              <>
                {/* Select Preset Amount */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'vi' ? 'Chọn số tiền nạp' : 'Select Amount'}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[50000, 100000, 200000, 500000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => {
                          setTopUpAmount(amt);
                          setCustomAmount('');
                        }}
                        className={`py-2 px-3 rounded-xl font-mono text-xs font-bold border transition-all ${
                          topUpAmount === amt && !customAmount
                            ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                            : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        {amt.toLocaleString('vi-VN')} VNĐ
                      </button>
                    ))}
                  </div>

                  <input
                    type="number"
                    placeholder={language === 'vi' ? 'Hoặc nhập số tiền khác...' : 'Or enter custom amount...'}
                    value={customAmount}
                    onChange={e => setCustomAmount(e.target.value)}
                    className="w-full mt-2 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* Select Funding Source */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'vi' ? 'Nguồn tiền nạp' : 'Payment Source'}
                  </label>
                  <div className="space-y-1.5">
                    {[
                      { id: 'momo', label: 'Ví MoMo', iconBg: 'bg-pink-600' },
                      { id: 'zalopay', label: 'Ví ZaloPay', iconBg: 'bg-blue-600' },
                      { id: 'vietqr', label: 'Chuyển khoản VietQR', iconBg: 'bg-emerald-600' },
                      { id: 'card', label: 'Thẻ Visa / Mastercard', iconBg: 'bg-indigo-600' }
                    ].map(src => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => setSelectedTopUpSource(src.id)}
                        className={`w-full p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                          selectedTopUpSource === src.id
                            ? 'bg-blue-500/10 border-blue-500 text-white font-bold'
                            : 'bg-slate-800 border-slate-750 text-slate-300 hover:bg-slate-750'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className={`w-2.5 h-2.5 rounded-full ${src.iconBg}`} />
                          <span>{src.label}</span>
                        </div>
                        {selectedTopUpSource === src.id && <Check className="w-4 h-4 text-blue-400" />}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Confirm Action */}
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => setShowTopUp(false)}
                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    onClick={handleConfirmTopUp}
                    disabled={isProcessingTopUp}
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isProcessingTopUp ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{language === 'vi' ? 'Đang xử lý...' : 'Processing...'}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{language === 'vi' ? 'Xác nhận nạp' : 'Confirm'}</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* INNER MODAL: ADD NEW LINKED PAYMENT METHOD */}
      {showAddMethod && (
        <div className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handleAddMethodSubmit}
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Plus className="w-4 h-4 text-blue-400" />
                <span>{language === 'vi' ? 'Thêm liên kết thanh toán' : 'Link Payment Method'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowAddMethod(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">
                {language === 'vi' ? 'Chọn loại ví / phương thức' : 'Method Type'}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'momo', label: 'Ví MoMo', bg: 'bg-pink-600' },
                  { id: 'zalopay', label: 'Ví ZaloPay', bg: 'bg-blue-600' },
                  { id: 'card', label: 'Thẻ Quốc tế', bg: 'bg-indigo-600' },
                  { id: 'bank', label: 'Ngân hàng', bg: 'bg-emerald-600' }
                ].map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setNewMethodType(item.id as any)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
                      newMethodType === item.id
                        ? 'bg-blue-600 text-white border-blue-400 shadow-md'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${item.bg}`} />
                    <span className="truncate">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">
                {newMethodType === 'card'
                  ? language === 'vi'
                    ? 'Số thẻ Visa / Mastercard'
                    : 'Card Number'
                  : newMethodType === 'bank'
                  ? language === 'vi'
                    ? 'Số tài khoản / Thẻ ATM'
                    : 'Account Number'
                  : language === 'vi'
                  ? 'Số điện thoại đăng ký ví'
                  : 'Phone Number'}
              </label>
              <input
                type="text"
                required
                placeholder={
                  newMethodType === 'card'
                    ? '4123 4567 8901 2345'
                    : newMethodType === 'bank'
                    ? '190388889999'
                    : '0981234567'
                }
                value={newAccountInput}
                onChange={e => setNewAccountInput(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 font-mono"
              />
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAddMethod(false)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                disabled={isLinking}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLinking ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>{language === 'vi' ? 'Đang xác thực...' : 'Verifying...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{language === 'vi' ? 'Liên kết ngay' : 'Link Now'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
