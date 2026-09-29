import React, { useState } from 'react';
import { ShieldCheck, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '../../components/ui';
import { authApi, ApiError } from '../../services/api';
import { PublicViewType } from '../../components/layout/PublicNavbar';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';

interface ResetPasswordPageProps {
  onNavigate: (view: PublicViewType) => void;
  token: string;
}

export const ResetPasswordPage: React.FC<ResetPasswordPageProps> = ({ onNavigate, token }) => {
  const { t } = useTranslation('auth');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    token ? null : t('This reset link is missing its token.')
  );
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setErrorMessage(t('Password must be at least 10 characters.'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('Passwords do not match.'));
      return;
    }
    setErrorMessage(null);
    setIsLoading(true);
    try {
      await authApi.passwordReset(token, password);
      setIsDone(true);
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError
          ? err.message
          : t('Reset failed — request a new link from the login page.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0e12] text-[#c9d1d9] flex items-center justify-center p-4 relative font-sans selection:bg-[#58a6ff] selection:text-slate-950">
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-[#58a6ff]/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="absolute top-4 right-4 z-20">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md z-10">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#8b949e] hover:text-white transition-colors cursor-pointer mb-8"
        >
          <ArrowLeft className="w-4 h-4" /> {t('Back to Home')}
        </button>

        <div className="bg-[#161b22]/80 border border-[#30363d] rounded-2xl p-8 backdrop-blur-xs shadow-xl">
          <div className="w-12 h-12 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 flex items-center justify-center text-[#58a6ff] mb-5">
            <ShieldCheck className="w-6 h-6" />
          </div>

          {isDone ? (
            <div className="space-y-4">
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-[#3fb950]" /> {t('Password updated')}
              </h1>
              <p className="text-sm text-[#8b949e]">
                {t('Your password was reset and all existing sessions were signed out.')}
              </p>
              <Button variant="primary" className="w-full" onClick={() => onNavigate('login')}>
                {t('Sign In')}
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-white">{t('Choose a new password')}</h1>
              <p className="text-sm text-[#8b949e] mt-1 mb-6">
                {t('Enter a new password for your account. This link is single-use and expires.')}
              </p>

              {errorMessage && (
                <div className="mb-4 p-3 rounded-lg bg-[#f85149]/10 border border-[#f85149]/30 text-[#f85149] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">{t('New Password')}</label>
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('At least 10 characters')}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#c9d1d9] mb-1.5">{t('Confirm Password')}</label>
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('Re-enter password')}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <Button type="submit" variant="primary" className="w-full" disabled={isLoading || !token}>
                  {isLoading ? t('Updating...') : t('Reset Password')}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
