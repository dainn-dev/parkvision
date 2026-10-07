import React, { useState } from 'react';
import {
  X,
  Shield,
  Lock,
  KeyRound,
  Smartphone,
  Fingerprint,
  EyeOff,
  Eye,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ChevronRight,
  Download,
  Trash2,
  RefreshCw,
  Clock,
  MapPin,
  Check,
  ShieldCheck,
  UserCheck,
  FileSpreadsheet
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';

export interface SecurityPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActiveSession {
  id: string;
  deviceName: string;
  location: string;
  ipAddress: string;
  lastActive: string;
  isCurrent: boolean;
}

export const SecurityPrivacyModal: React.FC<SecurityPrivacyModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, language } = useLanguage();

  // Biometric & Quick PIN Toggles
  const [useBiometrics, setUseBiometrics] = useState<boolean>(true);
  const [requirePinForPayment, setRequirePinForPayment] = useState<boolean>(true);
  const [hidePlateInPublic, setHidePlateInPublic] = useState<boolean>(false);
  const [shareLocationWithFamily, setShareLocationWithFamily] = useState<boolean>(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState<boolean>(false);

  // Change Password Form State
  const [showChangePassword, setShowChangePassword] = useState<boolean>(false);
  const [currentPassword, setCurrentPassword] = useState<string>('');
  const [newPassword, setNewPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [showCurrentPass, setShowCurrentPass] = useState<boolean>(false);
  const [showNewPass, setShowNewPass] = useState<boolean>(false);
  const [passChangeSuccess, setPassChangeSuccess] = useState<boolean>(false);
  const [passError, setPassError] = useState<string>('');
  const [isSubmittingPass, setIsSubmittingPass] = useState<boolean>(false);

  // Data Export / Delete State
  const [exportSuccess, setExportSuccess] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<boolean>(false);

  // Active Sessions State
  const [sessions, setSessions] = useState<ActiveSession[]>([
    {
      id: 'sess-1',
      deviceName: 'iPhone 15 Pro Max (Ứng dụng chính)',
      location: 'TP. Hồ Chí Minh, Việt Nam',
      ipAddress: '113.161.42.10',
      lastActive: language === 'vi' ? 'Đang hoạt động' : 'Active Now',
      isCurrent: true
    },
    {
      id: 'sess-2',
      deviceName: 'Samsung Galaxy Tab S9 (Web Kiosk)',
      location: 'Quận 7, TP. HCM',
      ipAddress: '14.241.112.89',
      lastActive: language === 'vi' ? '2 giờ trước' : '2 hours ago',
      isCurrent: false
    }
  ]);

  if (!isOpen) return null;

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');

    if (newPassword.length < 6) {
      setPassError(
        language === 'vi'
          ? 'Mật khẩu mới phải có ít nhất 6 ký tự.'
          : 'New password must be at least 6 characters.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setPassError(
        language === 'vi'
          ? 'Mật khẩu xác nhận không trùng khớp.'
          : 'Passwords do not match.'
      );
      return;
    }

    setIsSubmittingPass(true);

    setTimeout(() => {
      setIsSubmittingPass(false);
      setPassChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      setTimeout(() => {
        setPassChangeSuccess(false);
        setShowChangePassword(false);
      }, 1500);
    }, 1000);
  };

  const handleLogOutSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
  };

  const handleExportData = () => {
    setIsExporting(true);
    setTimeout(() => {
      setIsExporting(false);
      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 3000);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fadeIn">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-slate-900 border-b border-slate-800/80 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-2xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>{language === 'vi' ? 'Bảo mật & Quyền riêng tư' : 'Security & Privacy'}</span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  ISO 27001
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'vi'
                  ? 'Bảo vệ tài khoản, sinh trắc học & quyền dữ liệu xe'
                  : 'Protect account, biometrics & vehicle data privacy'}
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
          {/* Section 1: Authentication & Biometrics */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              <span>{language === 'vi' ? 'Xác thực & Sinh trắc học' : 'Authentication & Biometrics'}</span>
            </h3>

            <div className="bg-slate-850 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {/* Biometrics Toggle */}
              <div className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-xl">
                    <Fingerprint className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Đăng nhập bằng Face ID / Vân tay' : 'Biometric Login (Face ID / Fingerprint)'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi'
                        ? 'Xác thực nhanh khi mở app hoặc thanh toán qua barie'
                        : 'Quick auth on app open or barrier payment'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBiometrics}
                    onChange={e => setUseBiometrics(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              {/* PIN for Payment */}
              <div className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                    <Lock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Mã PIN thanh toán 6 chữ số' : '6-Digit Payment PIN'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi'
                        ? 'Yêu cầu nhập mã PIN khi thanh toán tiền vé xe > 500.000đ'
                        : 'Require PIN for transactions over 500,000 VND'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requirePinForPayment}
                    onChange={e => setRequirePinForPayment(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-500"></div>
                </label>
              </div>

              {/* 2FA Toggle */}
              <div className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Xác thực 2 yếu tố (2FA / OTP)' : 'Two-Factor Authentication (2FA)'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi'
                        ? 'Gửi mã OTP qua SMS/Zalo khi đăng nhập trên thiết bị lạ'
                        : 'Send OTP SMS when logging in from new devices'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={twoFactorAuth}
                    onChange={e => setTwoFactorAuth(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
              </div>

              {/* Change Password Button */}
              <div
                onClick={() => setShowChangePassword(true)}
                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 text-slate-300 rounded-xl">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Đổi mật khẩu tài khoản' : 'Change Account Password'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi' ? 'Cập nhật mật khẩu gần nhất: 30 ngày trước' : 'Last updated 30 days ago'}
                    </div>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>
            </div>
          </div>

          {/* Section 2: ANPR & Vehicle Data Privacy */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <EyeOff className="w-3.5 h-3.5 text-blue-400" />
              <span>{language === 'vi' ? 'Quyền riêng tư Dữ liệu Xe & ANPR' : 'Vehicle & ANPR Privacy'}</span>
            </h3>

            <div className="bg-slate-850 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {/* Hide Plate on Public Displays */}
              <div className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/20 text-blue-400 rounded-xl">
                    <EyeOff className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Che mờ biển số trên màn hình công cộng' : 'Blur Plate on Public LED Screens'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi'
                        ? 'Che 3 số cuối biển xe trên màn hình LED tại cổng chào bãi xe'
                        : 'Blur last 3 digits of license plate on entry LED display'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hidePlateInPublic}
                    onChange={e => setHidePlateInPublic(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                </label>
              </div>

              {/* Location Share with Family */}
              <div className="p-3.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Chia sẻ vị trí xe đỗ cho người thân' : 'Share Parked Spot with Family'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {language === 'vi'
                        ? 'Cho phép thành viên gia đình xem vị trí xe đỗ trong hầm'
                        : 'Allow family members to view exact indoor parked slot'}
                    </div>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={shareLocationWithFamily}
                    onChange={e => setShareLocationWithFamily(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-500"></div>
                </label>
              </div>
            </div>
          </div>

          {/* Section 3: Active Device Sessions */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'vi' ? 'Thiết bị đang đăng nhập' : 'Active Devices'}</span>
            </h3>

            <div className="space-y-2">
              {sessions.map(sess => (
                <div
                  key={sess.id}
                  className="p-3 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-800 text-slate-300 rounded-xl">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>{sess.deviceName}</span>
                        {sess.isCurrent && (
                          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded border border-emerald-500/20">
                            {language === 'vi' ? 'Thiết bị này' : 'This Device'}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                        <span>{sess.location}</span>
                        <span>•</span>
                        <span className="font-mono">{sess.ipAddress}</span>
                      </div>
                    </div>
                  </div>

                  {!sess.isCurrent && (
                    <button
                      onClick={() => handleLogOutSession(sess.id)}
                      className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors"
                      title={language === 'vi' ? 'Đăng xuất thiết bị' : 'Log out device'}
                    >
                      <LogOut className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Section 4: Data Export & Account Deletion */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Quản lý Dữ liệu Cá nhân' : 'Personal Data Management'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Export Data Button */}
              <button
                onClick={handleExportData}
                disabled={isExporting}
                className="p-3 bg-slate-850 hover:bg-slate-800 border border-slate-800 rounded-xl flex items-center justify-between transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                    {isExporting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Xuất dữ liệu lịch sử' : 'Export My Data'}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {exportSuccess
                        ? language === 'vi'
                          ? 'Đã gửi file về Email!'
                          : 'Sent file to Email!'
                        : language === 'vi'
                        ? 'Tải file JSON/CSV lượt đỗ'
                        : 'Download JSON/CSV logs'}
                    </div>
                  </div>
                </div>
              </button>

              {/* Request Account Delete Button */}
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="p-3 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/30 rounded-xl flex items-center justify-between transition-colors text-left cursor-pointer text-rose-400"
              >
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-500/20 text-rose-400 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-rose-300">
                      {language === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
                    </div>
                    <div className="text-[10px] text-rose-400/80">
                      {language === 'vi' ? 'Xóa vĩnh viễn dữ liệu' : 'Permanently remove data'}
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-slate-900 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5 text-indigo-400 font-medium text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>{language === 'vi' ? 'Mã hóa AES-256 Cloud Vault' : 'Encrypted with AES-256'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl transition-colors"
          >
            {t('cancel')}
          </button>
        </div>
      </div>

      {/* CHANGE PASSWORD MODAL */}
      {showChangePassword && (
        <div className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <form
            onSubmit={handlePasswordSubmit}
            className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <KeyRound className="w-4 h-4 text-indigo-400" />
                <span>{language === 'vi' ? 'Đổi Mật Khẩu' : 'Change Password'}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowChangePassword(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {passChangeSuccess ? (
              <div className="py-6 text-center space-y-3 animate-fadeIn">
                <div className="w-12 h-12 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-sm font-bold text-white">
                  {language === 'vi' ? 'Đổi mật khẩu thành công!' : 'Password Updated!'}
                </h3>
              </div>
            ) : (
              <>
                {passError && (
                  <div className="p-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span>{passError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'vi' ? 'Mật khẩu hiện tại' : 'Current Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      required
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 pr-9 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass(!showCurrentPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'vi' ? 'Mật khẩu mới' : 'New Password'}
                  </label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 pr-9 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass(!showNewPass)}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                    >
                      {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    {language === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm New Password'}
                  </label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowChangePassword(false)}
                    className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
                  >
                    {t('cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingPass}
                    className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isSubmittingPass ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>{language === 'vi' ? 'Lưu mật khẩu' : 'Save Password'}</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </form>
        </div>
      )}

      {/* DELETE ACCOUNT CONFIRM MODAL */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm p-5 space-y-4 shadow-2xl text-center">
            <div className="w-12 h-12 bg-rose-500/20 text-rose-400 rounded-full flex items-center justify-center mx-auto border border-rose-500/30">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-white">
                {language === 'vi' ? 'Xác nhận xóa tài khoản?' : 'Delete Account Confirmation'}
              </h3>
              <p className="text-xs text-slate-300">
                {language === 'vi'
                  ? 'Toàn bộ dữ liệu phương tiện, số dư ví đỗ xe và lịch sử giao dịch sẽ bị khóa và loại bỏ hoàn toàn khỏi hệ thống.'
                  : 'All vehicles, wallet balance and parking history will be permanently erased.'}
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  onClose();
                }}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all"
              >
                {language === 'vi' ? 'Yêu cầu xóa' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
