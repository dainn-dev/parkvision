import React, { useEffect, useState } from 'react';
import {
  X,
  Shield,
  KeyRound,
  Smartphone,
  Eye,
  EyeOff,
  ChevronRight,
  Download,
  Trash2,
  Loader2,
  LogOut,
  CheckCircle2,
  Fingerprint,
  EyeOff as EyeOffIcon,
  MapPin,
  ShieldCheck
} from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { changePassword, listAuthSessions, revokeAuthSession } from '../../api/driver';
import { AuthSessionOut } from '../../api/types';
import { ApiError } from '../../lib/api';

export interface SecurityPrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SecurityPrivacyModal: React.FC<SecurityPrivacyModalProps> = ({
  isOpen,
  onClose
}) => {
  const { t, language } = useLanguage();

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

  // Active auth sessions from the backend
  const [sessions, setSessions] = useState<AuthSessionOut[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState<boolean>(false);
  const [sessionsError, setSessionsError] = useState<string>('');
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSessionsLoading(true);
    setSessionsError('');
    listAuthSessions()
      .then(setSessions)
      .catch((e) => setSessionsError(e instanceof ApiError ? e.message : t('networkError')))
      .finally(() => setSessionsLoading(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isOpen) return null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassError('');

    if (newPassword.length < 8) {
      setPassError(
        language === 'vi'
          ? 'Mật khẩu mới phải có ít nhất 8 ký tự.'
          : 'New password must be at least 8 characters.'
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
    try {
      await changePassword(currentPassword, newPassword);
      setPassChangeSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setPassChangeSuccess(false);
        setShowChangePassword(false);
      }, 1500);
    } catch (err) {
      setPassError(err instanceof ApiError ? err.message : t('networkError'));
    } finally {
      setIsSubmittingPass(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    setRevokingId(sessionId);
    setSessionsError('');
    try {
      await revokeAuthSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (e) {
      setSessionsError(e instanceof ApiError ? e.message : t('networkError'));
    } finally {
      setRevokingId(null);
    }
  };

  const comingSoonRow = (icon: React.ReactNode, title: string, sub: string) => (
    <div className="p-3.5 flex items-center justify-between gap-3 opacity-60">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-slate-800 text-slate-400 rounded-xl">{icon}</div>
        <div>
          <div className="text-xs font-bold text-white flex items-center gap-2">
            <span>{title}</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
              {t('comingSoon')}
            </span>
          </div>
          <div className="text-[10px] text-slate-400">{sub}</div>
        </div>
      </div>
      <div className="w-11 h-6 bg-slate-800 rounded-full flex items-center p-0.5">
        <div className="w-5 h-5 bg-slate-600 rounded-full" />
      </div>
    </div>
  );

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
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'vi'
                  ? 'Quản lý mật khẩu & thiết bị đang đăng nhập'
                  : 'Manage password & signed-in devices'}
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
          {/* Section 1: Authentication */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-indigo-400" />
              <span>{language === 'vi' ? 'Xác thực' : 'Authentication'}</span>
            </h3>

            <div className="bg-slate-850 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {/* Change Password — real API */}
              <div
                onClick={() => setShowChangePassword(true)}
                className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-800 text-slate-300 rounded-xl">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold text-white">
                    {language === 'vi' ? 'Đổi mật khẩu tài khoản' : 'Change Account Password'}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500" />
              </div>

              {/* Not yet supported by the driver backend — honest disabled state */}
              {comingSoonRow(
                <Fingerprint className="w-4 h-4" />,
                language === 'vi' ? 'Đăng nhập bằng Face ID / Vân tay' : 'Biometric Login',
                language === 'vi' ? 'Chưa được hỗ trợ' : 'Not supported yet'
              )}
              {comingSoonRow(
                <Smartphone className="w-4 h-4" />,
                language === 'vi' ? 'Xác thực 2 yếu tố (2FA / OTP)' : 'Two-Factor Authentication (2FA)',
                language === 'vi' ? 'Chưa được hỗ trợ' : 'Not supported yet'
              )}
            </div>
          </div>

          {/* Section 2: Privacy — disabled until backend supports preferences */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <EyeOffIcon className="w-3.5 h-3.5 text-blue-400" />
              <span>{language === 'vi' ? 'Quyền riêng tư Dữ liệu Xe & ANPR' : 'Vehicle & ANPR Privacy'}</span>
            </h3>

            <div className="bg-slate-850 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {comingSoonRow(
                <EyeOffIcon className="w-4 h-4" />,
                language === 'vi' ? 'Che mờ biển số trên màn hình công cộng' : 'Blur Plate on Public LED Screens',
                language === 'vi' ? 'Chưa được hỗ trợ' : 'Not supported yet'
              )}
              {comingSoonRow(
                <MapPin className="w-4 h-4" />,
                language === 'vi' ? 'Chia sẻ vị trí xe đỗ cho người thân' : 'Share Parked Spot with Family',
                language === 'vi' ? 'Chưa được hỗ trợ' : 'Not supported yet'
              )}
            </div>
          </div>

          {/* Section 3: Active Device Sessions — real data */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
              <span>{language === 'vi' ? 'Thiết bị đang đăng nhập' : 'Active Devices'}</span>
            </h3>

            {sessionsError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl">
                {sessionsError}
              </div>
            )}

            {sessionsLoading ? (
              <div className="p-4 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('loading')}</span>
              </div>
            ) : sessions.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs bg-slate-850 border border-slate-800 rounded-xl">
                {language === 'vi' ? 'Không tải được danh sách thiết bị' : 'No sessions could be loaded'}
              </div>
            ) : (
              <div className="space-y-2">
                {sessions.map((sess) => {
                  const lastSeen = sess.lastSeenAt
                    ? new Date(sess.lastSeenAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-GB')
                    : null;
                  return (
                    <div
                      key={sess.id}
                      className="p-3 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="p-2 bg-slate-800 text-slate-300 rounded-xl flex-shrink-0">
                          <Smartphone className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span className="truncate">{sess.userAgent || (language === 'vi' ? 'Thiết bị không xác định' : 'Unknown device')}</span>
                            {sess.current && (
                              <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20 flex-shrink-0">
                                {language === 'vi' ? 'Thiết bị này' : 'This Device'}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                            {sess.ip && <span className="font-mono">{sess.ip}</span>}
                            {lastSeen && (
                              <>
                                <span>•</span>
                                <span>{lastSeen}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {!sess.current && (
                        <button
                          onClick={() => void handleRevokeSession(sess.id)}
                          disabled={revokingId === sess.id}
                          className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors flex-shrink-0"
                          title={language === 'vi' ? 'Đăng xuất thiết bị' : 'Log out device'}
                        >
                          {revokingId === sess.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <LogOut className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Personal data — not supported yet */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {language === 'vi' ? 'Quản lý Dữ liệu Cá nhân' : 'Personal Data Management'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between opacity-60">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg">
                    <Download className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white">
                      {language === 'vi' ? 'Xuất dữ liệu lịch sử' : 'Export My Data'}
                    </div>
                    <div className="text-[10px] text-amber-400">{t('comingSoon')}</div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-slate-850 border border-slate-800 rounded-xl flex items-center justify-between opacity-60">
                <div className="flex items-center gap-2.5">
                  <div className="p-1.5 bg-rose-500/10 text-rose-400 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-rose-400">
                      {language === 'vi' ? 'Xóa tài khoản' : 'Delete Account'}
                    </div>
                    <div className="text-[10px] text-amber-400">{t('comingSoon')}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Change Password Sub-Modal */}
      {showChangePassword && (
        <div className="fixed inset-0 z-[60] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {language === 'vi' ? 'Đổi mật khẩu' : 'Change Password'}
              </h3>
              <button
                onClick={() => setShowChangePassword(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} className="p-4 space-y-3">
              {passError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl">
                  {passError}
                </div>
              )}
              {passChangeSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{language === 'vi' ? 'Đổi mật khẩu thành công' : 'Password changed successfully'}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {language === 'vi' ? 'Mật khẩu hiện tại' : 'Current password'}
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPass ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-3 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPass(!showCurrentPass)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                  >
                    {showCurrentPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {language === 'vi' ? 'Mật khẩu mới' : 'New password'}
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-2.5 text-slate-500 hover:text-white"
                  >
                    {showNewPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">
                  {language === 'vi' ? 'Xác nhận mật khẩu mới' : 'Confirm new password'}
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmittingPass}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                {isSubmittingPass && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{language === 'vi' ? 'Cập nhật mật khẩu' : 'Update Password'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
