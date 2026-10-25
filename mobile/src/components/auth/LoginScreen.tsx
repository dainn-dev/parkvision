import React, { useState } from 'react';
import { Car, ShieldCheck, Mail, Lock, ArrowRight, Sparkles, Loader2, UserCheck, User } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageSelector } from '../common/LanguageSelector';
import { ApiError } from '../../lib/api';

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (body: { email: string; password: string; fullName: string }) => Promise<void>;
  onGuest: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin, onRegister, onGuest }) => {
  const { t, language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    if (mode === 'signup' && password.length < 8) {
      setErrorMsg(t('passwordMinLength'));
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    try {
      if (mode === 'signin') {
        await onLogin(email, password);
      } else {
        await onRegister({ email, password, fullName: fullName.trim() || email.split('@')[0] });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'invalid_credentials' || err.status === 401) {
          setErrorMsg(t('invalidCredentials'));
        } else if (err.code === 'conflict' || err.status === 409) {
          setErrorMsg(t('emailAlreadyRegistered'));
        } else if (err.code === 'validation_error' || err.status === 422) {
          const fieldErrors = (err.details as { errors?: Array<{ loc?: unknown[] }> } | undefined)?.errors ?? [];
          const isPasswordError = fieldErrors.some((e) => Array.isArray(e.loc) && e.loc.includes('password'));
          setErrorMsg(isPasswordError ? t('passwordMinLength') : err.message);
        } else {
          setErrorMsg(err.message);
        }
      } else {
        setErrorMsg(t('networkError'));
      }
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col justify-between p-4 sm:p-6 text-slate-100 relative overflow-hidden">
      {/* Background ambient lighting effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[350px] h-[350px] bg-blue-600/15 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[350px] h-[350px] bg-emerald-600/15 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header Bar with Language Switcher */}
      <div className="w-full max-w-md mx-auto flex items-center justify-between z-10 pt-2">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-blue-600 rounded-xl shadow-lg shadow-blue-600/30 text-white font-bold">
            <Car className="w-5 h-5" />
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">SmartPark ANPR</span>
        </div>

        <LanguageSelector />
      </div>

      {/* Center Auth Card */}
      <div className="w-full max-w-md mx-auto my-auto py-8 z-10 space-y-6">
        {/* Title & Branding */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full text-[11px] font-bold">
            <Sparkles className="w-3.5 h-3.5 text-amber-300" />
            <span>AI License Plate Recognition</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            {language === 'vi' ? 'Đăng nhập SmartPark' : 'Welcome to SmartPark'}
          </h1>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {language === 'vi'
              ? 'Hệ thống quản lý bãi đỗ xe thông minh & nhận diện biển số tự động'
              : 'Realtime ANPR Smart Parking & License Plate Recognition'}
          </p>
        </div>

        {/* Main Auth Actions Box */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-md space-y-5">
          {/* Sign In / Register Toggle */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => { setMode('signin'); setErrorMsg(''); }}
              className={`py-2 rounded-lg transition-all ${
                mode === 'signin' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('signIn')}
            </button>
            <button
              onClick={() => { setMode('signup'); setErrorMsg(''); }}
              className={`py-2 rounded-lg transition-all ${
                mode === 'signup' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              {t('signUp')}
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold rounded-xl">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">{t('fullName')}</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder={language === 'vi' ? 'Nguyễn Văn A' : 'Your name'}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-semibold text-slate-400">{language === 'vi' ? 'Mật khẩu' : 'Password'}</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  minLength={8}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-60"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-white" />
              ) : (
                <>
                  <span>{mode === 'signin' ? t('signIn') : t('signUp')}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Quick Guest Experience Button */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              onClick={onGuest}
              disabled={isLoading}
              className="w-full py-2.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700/50 transition-colors flex items-center justify-center gap-2"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>{t('continueAsGuest')}</span>
            </button>
          </div>
        </div>

        {/* Security / ANPR note */}
        <div className="flex items-center justify-center gap-2 text-[11px] text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>{language === 'vi' ? 'Bảo mật AES-256 & Tự động kết nối ANPR LPR' : 'AES-256 Protected & Auto ANPR Integration'}</span>
        </div>
      </div>

      {/* Footer copyright */}
      <div className="w-full max-w-md mx-auto text-center text-[10px] text-slate-600 z-10 pb-2">
        © 2026 ParkVision
      </div>
    </div>
  );
};
