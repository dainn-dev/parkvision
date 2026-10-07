import React, { useState } from 'react';
import { Car, ShieldCheck, Mail, Lock, ArrowRight, Sparkles, Loader2, UserCheck } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { LanguageSelector } from '../common/LanguageSelector';

export interface UserProfile {
  name: string;
  email: string;
  avatar?: string;
  provider: 'google' | 'email' | 'guest';
}

interface LoginScreenProps {
  onLogin: (user: UserProfile) => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLogin }) => {
  const { t, language } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'email' | 'guest' | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginMethod, setLoginMethod] = useState<'google' | 'email'>('google');

  const handleGoogleLogin = () => {
    setIsLoading(true);
    setLoadingProvider('google');

    setTimeout(() => {
      setIsLoading(false);
      setLoadingProvider(null);
      onLogin({
        name: 'Dainn Dev',
        email: 'dainn.dev1112@gmail.com',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        provider: 'google'
      });
    }, 1200);
  };

  const handleEmailLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    setLoadingProvider('email');

    setTimeout(() => {
      setIsLoading(false);
      setLoadingProvider(null);
      onLogin({
        name: email.split('@')[0] || 'User',
        email: email,
        provider: 'email'
      });
    }, 1000);
  };

  const handleGuestLogin = () => {
    setIsLoading(true);
    setLoadingProvider('guest');

    setTimeout(() => {
      setIsLoading(false);
      setLoadingProvider(null);
      onLogin({
        name: language === 'vi' ? 'Khách trải nghiệm' : 'Guest User',
        email: 'guest@smartpark.io',
        provider: 'guest'
      });
    }, 800);
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
          {/* GOOGLE LOGIN BUTTON */}
          <button
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-3.5 px-4 bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-3 relative disabled:opacity-75 cursor-pointer active:scale-[0.98]"
          >
            {isLoading && loadingProvider === 'google' ? (
              <Loader2 className="w-5 h-5 animate-spin text-slate-800" />
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>
              {isLoading && loadingProvider === 'google'
                ? (language === 'vi' ? 'Đang kết nối Google...' : 'Connecting Google...')
                : (language === 'vi' ? 'Tiếp tục với Google' : 'Continue with Google')}
            </span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-800" />
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              {language === 'vi' ? 'hoặc' : 'or'}
            </span>
            <div className="flex-1 h-px bg-slate-800" />
          </div>

          {/* Login Tabs Toggle */}
          <div className="grid grid-cols-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold">
            <button
              onClick={() => setLoginMethod('google')}
              className={`py-2 rounded-lg transition-all ${
                loginMethod === 'google' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Google / SSO
            </button>
            <button
              onClick={() => setLoginMethod('email')}
              className={`py-2 rounded-lg transition-all ${
                loginMethod === 'email' ? 'bg-blue-600 text-white font-bold shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              Email / Password
            </button>
          </div>

          {loginMethod === 'email' && (
            <form onSubmit={handleEmailLogin} className="space-y-3 animate-fadeIn">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-slate-400">Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    placeholder="dainn.dev1112@gmail.com"
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
                className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 mt-2"
              >
                {isLoading && loadingProvider === 'email' ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <>
                    <span>{language === 'vi' ? 'Đăng nhập ngay' : 'Sign In Now'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Quick Guest Experience Button */}
          <div className="pt-2 border-t border-slate-800/80">
            <button
              onClick={handleGuestLogin}
              disabled={isLoading}
              className="w-full py-2.5 bg-slate-800/60 hover:bg-slate-800 text-slate-300 font-semibold text-xs rounded-xl border border-slate-700/50 transition-colors flex items-center justify-center gap-2"
            >
              {isLoading && loadingProvider === 'guest' ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
              ) : (
                <>
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span>{language === 'vi' ? 'Trải nghiệm không cần đăng nhập' : 'Continue as Guest'}</span>
                </>
              )}
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
        © 2026 SmartPark ANPR System • Dainn Dev
      </div>
    </div>
  );
};
