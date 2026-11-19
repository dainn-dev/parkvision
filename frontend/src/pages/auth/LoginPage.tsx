import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router';
import { AlertCircle, CheckCircle2, Clock, Eye, EyeOff } from 'lucide-react';
import { TeslaButton } from '../public/landing/tesla';
import heroGate from '../public/landing/assets/hero-gate.jpg';
import { usePlatform } from '../../context/PlatformContext';
import { authApi } from '../../services/api';
import type { PublicViewType } from '../../lib/publicRoutes';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';

interface LoginPageProps {
  onNavigate?: (view: PublicViewType) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { login, addToast } = usePlatform();
  const { t } = useTranslation('auth');

  // Login Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Flow Step: 'credentials' | 'mfa_challenge' | 'backup_code' | 'forgot_password'
  const [step, setStep] = useState<'credentials' | 'mfa_challenge' | 'backup_code' | 'forgot_password'>('credentials');

  // OTP Input State (6 Digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [backupCode, setBackupCode] = useState('');

  // Status & Timers
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(30);
  const [mfaSessionTimeLeft, setMfaSessionTimeLeft] = useState<number>(600);
  const [forgotSent, setForgotSent] = useState(false);

  // Resume a pending MFA transaction after a browser refresh (spec §27).
  // A live mfa_pending cookie means credentials already passed — jump
  // straight back to the OTP challenge instead of asking for the password.
  useEffect(() => {
    authApi
      .mfaSession()
      .then(() => setStep('mfa_challenge'))
      .catch(() => undefined);
  }, []);

  // 30s TOTP countdown timer
  useEffect(() => {
    if (step !== 'mfa_challenge') return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // 600s MFA session expiry countdown — starts when entering the MFA step;
  // switching between OTP and backup_code does not reset it.
  const mfaActive = step === 'mfa_challenge' || step === 'backup_code';
  useEffect(() => {
    if (!mfaActive) return;
    setMfaSessionTimeLeft(600);
    const interval = setInterval(() => {
      setMfaSessionTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setStep('credentials');
          setOtpDigits(['', '', '', '', '', '']);
          setErrorMessage(t('Your MFA session has expired. Please sign in again.'));
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [mfaActive, t]);

  // Focus first OTP input when stepping into MFA challenge
  useEffect(() => {
    if (step === 'mfa_challenge') {
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [step]);

  // Handle credentials submit (Step 1)
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage(t('Please enter both Email and Password.'));
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);
    const res = await login(email, password);
    setIsLoading(false);

    if (!res.success) {
      setErrorMessage(res.message ?? t('Incorrect email or password.'));
      return;
    }
    if (res.requiresMfa) {
      setStep('mfa_challenge');
      addToast({
        type: 'warning',
        title: t('MFA Required'),
        description: t('Password accepted. Please enter the TOTP code from your Authenticator app.')
      });
      return;
    }
    addToast({
      type: 'success',
      title: t('Signed in successfully'),
      description: t('Welcome back, {{email}}.', { email })
    });
  };

  // Handle OTP digit change
  const handleOtpChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);
    setErrorMessage(null);

    if (cleanVal && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle keydown backspace
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  // Handle paste 6 digits
  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted) {
      const newDigits = [...otpDigits];
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || '';
      }
      setOtpDigits(newDigits);
      if (pasted.length === 6) {
        inputRefs.current[5]?.focus();
      }
    }
  };

  // Submit MFA Code (Step 2)
  const handleMfaSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('');

    if (code.length < 6) {
      setErrorMessage(t('Please enter all 6 verification digits.'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await login(email, password, code);
    setIsLoading(false);
    if (!res.success) {
      // Expired/exhausted transaction → restart at credentials (spec §26).
      if (res.code === 'mfa_session_expired' || res.code === 'mfa_session_invalid' || res.code === 'mfa_too_many_attempts') {
        setStep('credentials');
        setOtpDigits(['', '', '', '', '', '']);
        setErrorMessage(res.message ?? t('Your authentication session expired. Please sign in again.'));
        return;
      }
      setErrorMessage(res.message ?? t('Invalid or expired TOTP code. Please try again.'));
    } else {
      addToast({
        type: 'success',
        title: t('MFA verified'),
        description: t('Valid TOTP code. Initializing secure session...')
      });
    }
  };

  // Submit Backup Code
  const handleBackupCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCode.trim()) {
      setErrorMessage(t('Please enter a backup recovery code.'));
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await login(email, password, backupCode.trim());
    setIsLoading(false);
    if (res.success) {
      addToast({
        type: 'success',
        title: t('Signed in with Recovery Code'),
        description: t('Verified using an emergency backup code.')
      });
    } else if (res.code === 'mfa_session_expired' || res.code === 'mfa_session_invalid' || res.code === 'mfa_too_many_attempts') {
      setStep('credentials');
      setErrorMessage(res.message ?? t('Your authentication session expired. Please sign in again.'));
    } else {
      setErrorMessage(res.message ?? t('Invalid recovery code.'));
    }
  };

  // Forgot password (Step 0) — response never reveals whether the email exists.
  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setErrorMessage(t('Please enter your account email.'));
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await authApi.passwordForgot(email.toLowerCase());
    } catch {
      // Even a transport failure gets the same neutral message.
    }
    setIsLoading(false);
    setForgotSent(true);
  };

  const goTo = (view: PublicViewType) => (e: React.MouseEvent) => {
    if (!onNavigate) return;
    e.preventDefault();
    onNavigate(view);
  };

  const field =
    'block w-full min-h-10 rounded-[4px] border border-[var(--t-line-strong)] bg-transparent px-3 text-sm text-[var(--t-ink)] placeholder:text-[var(--t-fog)] transition-[border-color,box-shadow] duration-[330ms] focus:border-[var(--t-blue)] focus:outline-none focus:shadow-[0_0_0_1px_var(--t-blue)]';
  const label = 'mb-1.5 block text-sm font-medium text-[var(--t-ink)]';
  const textLink =
    'cursor-pointer text-sm text-[var(--t-pewter)] transition-colors duration-[330ms] hover:text-[var(--t-ink)] focus-visible:outline-none focus-visible:underline';
  const fullBtn = 'sm:w-full!';

  const errorBox = errorMessage && (
    <p role="alert" className="flex items-start gap-2 rounded-[4px] bg-[var(--t-ash)] px-3 py-2.5 text-sm text-[#c0392b] dark:text-[#ff8a7a]">
      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{errorMessage}</span>
    </p>
  );

  const sessionWarning = mfaSessionTimeLeft > 0 && mfaSessionTimeLeft < 60 && (
    <p role="status" className="flex items-center gap-2 rounded-[4px] bg-[var(--t-ash)] px-3 py-2.5 text-sm text-[var(--t-body)]">
      <Clock aria-hidden="true" className="size-4 shrink-0" />
      <span>{t('MFA session expires in {{seconds}}s', { seconds: mfaSessionTimeLeft })}</span>
    </p>
  );

  const emailField = (
    <div>
      <label htmlFor="login-email" className={label}>
        {t('Email')}
      </label>
      <input
        id="login-email"
        type="email"
        required
        autoComplete="username"
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="name@company.com"
        className={field}
      />
    </div>
  );

  const heading = (title: string, hint?: string) => (
    <div className="mb-8">
      <h1 className="text-[28px] font-medium leading-[1.2] text-[var(--t-ink)] sm:text-[40px]">{title}</h1>
      {hint && <p className="mt-2 text-sm leading-5 text-[var(--t-body)]">{hint}</p>}
    </div>
  );

  const back = (onClick: () => void, text: string) => (
    <TeslaButton variant="secondary" className={fullBtn} onClick={onClick}>
      {text}
    </TeslaButton>
  );

  return (
    <div className="tesla min-h-screen w-full bg-[var(--t-canvas)] font-sans text-[var(--t-body)] antialiased lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,0.85fr)]">
      {/* The photograph carries the brand; the form stays plain. */}
      <aside className="relative hidden overflow-hidden lg:block" aria-hidden="true">
        <img src={heroGate} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: '55% 50%' }} />
        <div className="absolute inset-0 [background-image:linear-gradient(to_bottom,rgba(10,16,22,0.5),rgba(10,16,22,0)_30%,rgba(10,16,22,0)_62%,rgba(10,16,22,0.55))]" />
        <Link
          to="/"
          tabIndex={-1}
          onClick={goTo('landing')}
          className="absolute left-10 top-3 text-[15px] font-medium leading-8 tracking-[0.32em] text-[#fff]"
        >
          PARKVISION
        </Link>
        <p className="absolute bottom-12 left-10 max-w-sm text-[22px] font-medium leading-[1.3] text-[#fff]">
          {t('Every gate, plate and payment in one place.')}
        </p>
      </aside>

      <div className="flex min-h-screen flex-col">
        <div className="flex h-14 items-center justify-between px-6 sm:px-10">
          <Link
            to="/"
            onClick={goTo('landing')}
            className="text-[15px] font-medium tracking-[0.32em] text-[var(--t-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-blue)] lg:invisible"
            aria-label="ParkVision"
          >
            PARKVISION
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to="/" onClick={goTo('landing')} className={textLink}>
              {t('Back to Home')}
            </Link>
          </div>
        </div>

        <main className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[380px]">
            {/* STEP 1: CREDENTIALS */}
            {step === 'credentials' && (
              <form onSubmit={handleCredentialsSubmit} className="space-y-5" noValidate>
                {heading(t('Sign in'), t('Centralized Dashboard & Security Administration'))}
                {emailField}
                <div>
                  <label htmlFor="login-password" className={label}>
                    {t('Password')}
                  </label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className={`${field} pr-11`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? t('Hide password') : t('Show password')}
                      className="absolute inset-y-0 right-0 flex w-10 cursor-pointer items-center justify-center text-[var(--t-fog)] transition-colors duration-[330ms] hover:text-[var(--t-ink)]"
                    >
                      {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                    </button>
                  </div>
                </div>

                {errorBox}

                <TeslaButton type="submit" className={fullBtn} disabled={isLoading} aria-busy={isLoading}>
                  {isLoading ? t('Verifying credentials...') : t('Sign in')}
                </TeslaButton>

                <div className="flex items-center justify-between gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('forgot_password');
                      setErrorMessage(null);
                      setForgotSent(false);
                    }}
                    className={textLink}
                  >
                    {t('Forgot your password?')}
                  </button>
                  <Link to="/register" onClick={goTo('register')} className={textLink}>
                    {t('Sign up for a 14-day trial →')}
                  </Link>
                </div>
              </form>
            )}

            {/* STEP 0: FORGOT PASSWORD */}
            {step === 'forgot_password' && (
              <form onSubmit={handleForgotSubmit} className="space-y-5" noValidate>
                {heading(t('Reset your password'), t('Enter your account email and we will send you a reset link.'))}
                {forgotSent ? (
                  <p role="status" className="flex items-start gap-2 rounded-[4px] bg-[var(--t-ash)] px-3 py-2.5 text-sm text-[var(--t-ink)]">
                    <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--t-blue)]" />
                    <span>{t('If an account exists for this email, a reset link was sent.')}</span>
                  </p>
                ) : (
                  emailField
                )}
                {errorBox}
                {!forgotSent && (
                  <TeslaButton type="submit" className={fullBtn} disabled={isLoading} aria-busy={isLoading}>
                    {t('Send reset link')}
                  </TeslaButton>
                )}
                {back(() => {
                  setStep('credentials');
                  setErrorMessage(null);
                }, t('Back'))}
              </form>
            )}

            {/* STEP 2: TOTP CHALLENGE */}
            {step === 'mfa_challenge' && (
              <form onSubmit={handleMfaSubmit} className="space-y-5">
                {heading(t('Enter your 6-digit verification code'), t('Open Google Authenticator or Authy on your phone.'))}
                <div className="flex items-center justify-between gap-2" role="group" aria-label={t('2FA Security Flow (TOTP)')}>
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => {
                        inputRefs.current[index] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      autoComplete={index === 0 ? 'one-time-code' : 'off'}
                      maxLength={1}
                      value={digit}
                      aria-label={`${index + 1} / 6`}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className={`h-12 w-full min-w-0 rounded-[4px] border bg-transparent text-center text-xl font-medium text-[var(--t-ink)] transition-[border-color,box-shadow] duration-[330ms] focus:outline-none focus:shadow-[0_0_0_1px_var(--t-blue)] ${
                        errorMessage
                          ? 'border-[#c0392b]'
                          : digit
                            ? 'border-[var(--t-ink)]'
                            : 'border-[var(--t-line-strong)] focus:border-[var(--t-blue)]'
                      }`}
                    />
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm text-[var(--t-pewter)]">
                  <span>{t('Code refreshes in:')}</span>
                  <span className="flex items-center gap-2">
                    <span className="w-8 text-right font-medium tabular-nums text-[var(--t-ink)]">{countdown}s</span>
                    <span className="h-1 w-16 overflow-hidden rounded-[2px] bg-[var(--t-line)]">
                      <span className="block h-full bg-[var(--t-blue)] transition-[width] duration-1000 ease-linear" style={{ width: `${(countdown / 30) * 100}%` }} />
                    </span>
                  </span>
                </div>

                {sessionWarning}
                {errorBox}

                <TeslaButton type="submit" className={fullBtn} disabled={isLoading} aria-busy={isLoading}>
                  {t('Verify OTP Code')}
                </TeslaButton>
                <div className="flex items-center justify-between gap-4 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('credentials');
                      setErrorMessage(null);
                    }}
                    className={textLink}
                  >
                    {t('Back')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('backup_code');
                      setErrorMessage(null);
                    }}
                    className={textLink}
                  >
                    {t('Use a recovery code')}
                  </button>
                </div>
              </form>
            )}

            {/* STEP 3: RECOVERY CODE */}
            {step === 'backup_code' && (
              <form onSubmit={handleBackupCodeSubmit} className="space-y-5">
                {heading(
                  t('Enter an emergency recovery code'),
                  t('Enter one of the 8 backup codes (8 characters) issued when 2FA was enabled.'),
                )}
                <div>
                  <label htmlFor="login-recovery" className={label}>
                    {t('Emergency Recovery Code')}
                  </label>
                  <input
                    id="login-recovery"
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    value={backupCode}
                    onChange={(e) => setBackupCode(e.target.value)}
                    placeholder="a7f9-4b2c"
                    className={`${field} text-center font-mono tracking-[0.2em] uppercase`}
                  />
                </div>
                {sessionWarning}
                {errorBox}
                <TeslaButton type="submit" className={fullBtn} disabled={isLoading} aria-busy={isLoading}>
                  {t('Verify with Recovery Code')}
                </TeslaButton>
                {back(() => {
                  setStep('mfa_challenge');
                  setErrorMessage(null);
                }, t('Back to TOTP'))}
              </form>
            )}
          </div>
        </main>

        <footer className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 px-6 pb-6 text-xs text-[var(--t-pewter)]">
          {(
            [
              ['privacy', 'Privacy Policy', '/privacy'],
              ['terms', 'Terms of Service', '/terms'],
              ['sla', '99.9% SLA Commitment', '/sla'],
            ] as const
          ).map(([view, text, to]) => (
            <Link key={view} to={to} onClick={goTo(view)} className="transition-colors duration-[330ms] hover:text-[var(--t-ink)]">
              {t(text)}
            </Link>
          ))}
        </footer>
      </div>
    </div>
  );
};
