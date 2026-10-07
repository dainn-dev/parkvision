import React, { useState } from 'react';
import { Car, Bell, Shield, CreditCard, ChevronRight, CheckCircle2, Plus, Globe, LogOut, Star, Trash2 } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageSelector } from '../common/LanguageSelector';
import { NotificationSettingsModal } from '../profile/NotificationSettingsModal';
import { PaymentEWalletModal } from '../profile/PaymentEWalletModal';
import { SecurityPrivacyModal } from '../profile/SecurityPrivacyModal';
import { VehicleModal, Vehicle } from '../profile/VehicleModal';

export interface ProfileScreenProps {
  user?: {
    name: string;
    email: string;
    avatar?: string;
    provider?: string;
  } | null;
  onLogout?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({ user, onLogout }) => {
  const { t, language } = useLanguage();

  const [isNotifModalOpen, setIsNotifModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [vehicles, setVehicles] = useState<Vehicle[]>([
    { id: '1', plate: "51A-123.45", model: "Toyota Camry 2.5Q", isPrimary: true },
    { id: '2', plate: "51F-882.11", model: "Honda SH 150i", isPrimary: false }
  ]);

  const [isVehicleModalOpen, setIsVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState<Vehicle | null>(null);

  const userName = user?.name || "Dainn Dev";
  const userEmail = user?.email || "dainn.dev1112@gmail.com";
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || "DD";

  const handleOpenAddVehicle = () => {
    setEditingVehicle(null);
    setIsVehicleModalOpen(true);
  };

  const handleOpenEditVehicle = (vehicle: Vehicle) => {
    setEditingVehicle(vehicle);
    setIsVehicleModalOpen(true);
  };

  const handleSaveVehicle = (savedVehicle: Vehicle, originalPlate?: string) => {
    setVehicles(prevVehicles => {
      let updatedList = [...prevVehicles];

      if (originalPlate) {
        // Editing existing vehicle
        updatedList = updatedList.map(v => v.plate === originalPlate ? { ...v, ...savedVehicle } : v);
      } else {
        // Adding new vehicle
        const newVehicleItem: Vehicle = {
          id: Date.now().toString(),
          ...savedVehicle
        };
        updatedList.push(newVehicleItem);
      }

      // If set as primary or if it's the only vehicle, make it primary and unset others
      if (savedVehicle.isPrimary || updatedList.length === 1) {
        updatedList = updatedList.map(v => ({
          ...v,
          isPrimary: v.plate === savedVehicle.plate
        }));
      }

      return updatedList;
    });
  };

  const handleDeleteVehicle = (plateToDelete: string) => {
    setVehicles(prevVehicles => {
      const filtered = prevVehicles.filter(v => v.plate !== plateToDelete);
      // If deleted vehicle was primary and remaining exist, make first vehicle primary
      if (filtered.length > 0 && !filtered.some(v => v.isPrimary)) {
        filtered[0].isPrimary = true;
      }
      return filtered;
    });
  };

  const handleConfirmLogout = () => {
    setShowLogoutConfirm(false);
    if (onLogout) {
      onLogout();
    }
  };

  return (
    <div className="p-4 space-y-4 pb-24 bg-slate-950 min-h-screen text-slate-100">
      {/* Profile Header */}
      <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl flex items-center justify-between gap-3.5">
        <div className="flex items-center gap-3.5">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={userName}
              referrerPolicy="no-referrer"
              className="w-14 h-14 rounded-full border-2 border-blue-400 shadow-md object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-full bg-blue-600 text-white font-bold text-xl flex items-center justify-center border-2 border-blue-400 shadow-md">
              {userInitials}
            </div>
          )}
          <div>
            <h2 className="text-base font-bold text-white">{userName}</h2>
            <p className="text-xs text-slate-400">{userEmail}</p>
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <CheckCircle2 className="w-3 h-3" />
              <span>{user?.provider === 'google' ? 'GOOGLE Verified Account' : 'MEMBER Global Account'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Language Preference Setting Box */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500/20 text-blue-400 rounded-lg">
            <Globe className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-semibold text-white">
              {language === 'vi' ? 'Ngôn ngữ ứng dụng' : 'App Language'}
            </div>
            <div className="text-[10px] text-slate-400">
              {language === 'vi' ? 'Chuyển đổi Tiếng Việt / English' : 'Switch English / Tiếng Việt'}
            </div>
          </div>
        </div>
        <LanguageSelector />
      </div>

      {/* Registered Vehicles */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Car className="w-4 h-4 text-blue-400" />
            <span>{t('myVehicles')}</span>
          </h3>
          <button
            onClick={handleOpenAddVehicle}
            className="text-xs text-blue-400 font-semibold flex items-center gap-1 hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('addVehicle')}
          </button>
        </div>

        <div className="space-y-2">
          {vehicles.map((v, i) => (
            <div
              key={v.id || i}
              onClick={() => handleOpenEditVehicle(v)}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-slate-700 rounded-xl flex items-center justify-between cursor-pointer transition-all group"
            >
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-1 bg-amber-400 text-slate-950 font-mono font-extrabold text-xs rounded shadow-sm border border-amber-300">
                  {v.plate}
                </span>
                <div>
                  <div className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors flex items-center gap-1.5">
                    <span>{v.model}</span>
                  </div>
                  {v.isPrimary ? (
                    <div className="text-[10px] text-blue-400 font-bold flex items-center gap-1 mt-0.5">
                      <Star className="w-3 h-3 fill-blue-400" />
                      <span>{t('primaryVehicle')}</span>
                    </div>
                  ) : (
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {language === 'vi' ? 'Bấm để chỉnh sửa' : 'Click to edit'}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeletingVehicle(v);
                  }}
                  title={t('deleteVehicle') || 'Remove'}
                  className="p-1.5 bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Account Settings List */}
      <div className="space-y-1 pt-2">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          {t('settingsPreferences')}
        </h3>
        {[
          { id: 'notif', label: t('notificationSettings'), sub: t('notificationSub'), icon: Bell },
          { id: 'payment', label: t('paymentEwallets'), sub: t('paymentSub'), icon: CreditCard },
          { id: 'security', label: t('securityPrivacy'), sub: t('securitySub'), icon: Shield }
        ].map((item, idx) => {
          const Icon = item.icon;
          return (
            <div
              key={idx}
              onClick={() => {
                if (item.id === 'notif') setIsNotifModalOpen(true);
                if (item.id === 'payment') setIsPaymentModalOpen(true);
                if (item.id === 'security') setIsSecurityModalOpen(true);
              }}
              className="p-3.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between cursor-pointer transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-800 text-blue-400 rounded-lg">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white">{item.label}</div>
                  <div className="text-[10px] text-slate-400">{item.sub}</div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-500" />
            </div>
          );
        })}

        {/* Logout Item */}
        <div
          onClick={() => setShowLogoutConfirm(true)}
          className="p-3.5 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-900/40 rounded-xl flex items-center justify-between cursor-pointer transition-colors text-rose-400 mt-3"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
              <LogOut className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-rose-300">{t('logout')}</div>
              <div className="text-[10px] text-rose-400/80">{t('logoutSub')}</div>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-rose-500/60" />
        </div>
      </div>

      {/* Notification Settings Modal */}
      <NotificationSettingsModal
        isOpen={isNotifModalOpen}
        onClose={() => setIsNotifModalOpen(false)}
      />

      {/* Payment & E-Wallet Modal */}
      <PaymentEWalletModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
      />

      {/* Security & Privacy Modal */}
      <SecurityPrivacyModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
      />

      {/* Vehicle Add / Edit Modal */}
      <VehicleModal
        isOpen={isVehicleModalOpen}
        onClose={() => setIsVehicleModalOpen(false)}
        onSave={handleSaveVehicle}
        onDelete={handleDeleteVehicle}
        editingVehicle={editingVehicle}
      />

      {/* Logout Confirmation Dialog */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-white">{t('logoutConfirmTitle')}</h3>
              <p className="text-xs text-slate-400">{t('logoutConfirmMessage')}</p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleConfirmLogout}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all"
              >
                {t('confirmLogout')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Vehicle Confirmation Dialog */}
      {deletingVehicle && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">
                {language === 'vi' ? 'Xóa xe này?' : 'Delete vehicle?'}
              </h3>
              <p className="text-xs text-slate-300">
                {language === 'vi'
                  ? `Bạn có chắc chắn muốn xóa xe ${deletingVehicle.plate} (${deletingVehicle.model}) khỏi danh sách?`
                  : `Are you sure you want to remove ${deletingVehicle.plate} (${deletingVehicle.model})?`}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeletingVehicle(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-750 text-slate-300 font-semibold text-xs rounded-xl transition-colors"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  handleDeleteVehicle(deletingVehicle.plate);
                  setDeletingVehicle(null);
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('deleteVehicle') || (language === 'vi' ? 'Xóa xe' : 'Delete')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
