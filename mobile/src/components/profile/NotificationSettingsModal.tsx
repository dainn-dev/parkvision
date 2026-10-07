import React, { useState } from 'react';
import { X, Bell, Camera, AlertTriangle, CreditCard, Calendar, Sparkles, Volume2, Check } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  const { t } = useLanguage();
  const [isSaved, setIsSaved] = useState(false);

  const [settings, setSettings] = useState({
    pushMaster: true,
    anprAlerts: true,
    capacityAlerts: true,
    paymentReceipts: true,
    passExpiry: true,
    promotions: false,
    soundVibration: true
  });

  const toggleSetting = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">{t('notificationSettingsTitle')}</h2>
              <p className="text-[11px] text-slate-400">{t('notificationSub')}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content list */}
        <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar flex-1">
          {/* Master Toggle */}
          <div className="p-3.5 bg-blue-950/40 border border-blue-800/50 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-xl shadow-md">
                <Bell className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">{t('pushNotifications')}</span>
            </div>

            <button
              onClick={() => toggleSetting('pushMaster')}
              className={`w-12 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center ${
                settings.pushMaster ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
              }`}
            >
              <div className="w-5 h-5 bg-white rounded-full shadow-md" />
            </button>
          </div>

          {/* Sub Toggles */}
          <div className={`space-y-3 transition-opacity ${settings.pushMaster ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
            {/* ANPR Entry & Exit */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl mt-0.5">
                  <Camera className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{t('anprAlerts')}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t('anprAlertsSub')}</div>
                </div>
              </div>

              <button
                onClick={() => toggleSetting('anprAlerts')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.anprAlerts ? 'bg-emerald-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>

            {/* Low Capacity Warnings */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl mt-0.5">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{t('capacityAlerts')}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t('capacityAlertsSub')}</div>
                </div>
              </div>

              <button
                onClick={() => toggleSetting('capacityAlerts')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.capacityAlerts ? 'bg-amber-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>

            {/* Payment & Receipts */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl mt-0.5">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{t('paymentReceipts')}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t('paymentReceiptsSub')}</div>
                </div>
              </div>

              <button
                onClick={() => toggleSetting('paymentReceipts')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.paymentReceipts ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>

            {/* Pass Expiry */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl mt-0.5">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{t('passExpiryReminders')}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t('passExpiryRemindersSub')}</div>
                </div>
              </div>

              <button
                onClick={() => toggleSetting('passExpiry')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.passExpiry ? 'bg-purple-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>

            {/* Promotions */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl mt-0.5">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{t('promotionsDeals')}</div>
                  <div className="text-[10px] text-slate-400 leading-tight mt-0.5">{t('promotionsDealsSub')}</div>
                </div>
              </div>

              <button
                onClick={() => toggleSetting('promotions')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.promotions ? 'bg-rose-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>

            {/* Sound & Vibration */}
            <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-2xl flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 text-slate-300 rounded-xl">
                  <Volume2 className="w-4 h-4" />
                </div>
                <div className="text-xs font-semibold text-white">{t('soundVibration')}</div>
              </div>

              <button
                onClick={() => toggleSetting('soundVibration')}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors duration-200 flex items-center flex-shrink-0 ${
                  settings.soundVibration ? 'bg-blue-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="w-5 h-5 bg-white rounded-full shadow-md" />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 min-h-[20px]">
            {isSaved && (
              <span className="flex items-center gap-1 animate-fadeIn">
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Saved automatically</span>
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-md transition-all"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
