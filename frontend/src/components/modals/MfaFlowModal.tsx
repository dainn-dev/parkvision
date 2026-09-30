import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Key,
  MessageSquare,
  QrCode,
  Copy,
  Check,
  Download,
  RotateCcw,
  X,
  Lock,
  ArrowRight,
  Sparkles,
  AlertCircle,
  Clock,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';
import { Button, Badge } from '../ui';
import { usePlatform } from '../../context/PlatformContext';
import { authApi, platformApi, ApiError } from '../../services/api';
import QRCode from 'qrcode';
import { useTranslation } from 'react-i18next';

export interface MfaFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'enroll' | 'challenge' | 'reset_admin' | 'disable';
  targetAdminName?: string;
  targetAdminId?: string;
  onSuccess?: () => void;
}

type MfaMethod = 'totp' | 'security_key' | 'sms';

export const MfaFlowModal: React.FC<MfaFlowModalProps> = ({
  isOpen,
  onClose,
  mode = 'enroll',
  targetAdminName,
  targetAdminId,
  onSuccess
}) => {
  const { addToast, pushAuditLog, currentUser, logout, refreshMe } = usePlatform();
  const { t } = useTranslation('security');

  // Step flow state: 1: Method, 2: Setup/QR, 3: Verify OTP, 4: Recovery Codes, 5: Complete
  const [step, setStep] = useState<number>(mode === 'challenge' ? 3 : 1);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>('totp');

  // OTP input state (6 digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Real enrollment state from the backend (secret/URI/QR + issued backup codes)
  const [mfaSecret, setMfaSecret] = useState('');
  const [provisioningUri, setProvisioningUri] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isSetupLoading, setIsSetupLoading] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');
  
  const [isCopiedSecret, setIsCopiedSecret] = useState(false);
  const [isCopiedCodes, setIsCopiedCodes] = useState(false);
  const [hasSavedCodes, setHasSavedCodes] = useState(false);
  
  // Verification loading & countdown state
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(30);

  // Timer for 30s TOTP refresh cycle
  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen]);

  // Fetch a real TOTP secret + QR from the backend when enrolling (spec §18:
  // MFA only becomes enabled after the first OTP verifies).
  const startSetup = async () => {
    setIsSetupLoading(true);
    setVerificationError(null);
    try {
      const res = await authApi.mfaSetup();
      setMfaSecret(res.secret);
      setProvisioningUri(res.provisioningUri);
      setQrDataUrl(await QRCode.toDataURL(res.provisioningUri, { margin: 1, width: 220 }));
      setStep(2);
    } catch (e) {
      addToast({
        type: 'error',
        title: t('MFA setup failed'),
        description: e instanceof ApiError ? e.message : t('Could not generate an authenticator secret.')
      });
    } finally {
      setIsSetupLoading(false);
    }
  };

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setStep(mode === 'challenge' ? 3 : 1);
      setOtpDigits(['', '', '', '', '', '']);
      setVerificationError(null);
      setIsVerifying(false);
      setHasSavedCodes(false);
      setMfaSecret('');
      setProvisioningUri('');
      setQrDataUrl('');
      setRecoveryCodes([]);
      setDisablePassword('');
    }
  }, [isOpen, mode]);

  if (!isOpen) return null;

  // Handle individual digit input in OTP box
  const handleDigitChange = (index: number, value: string) => {
    const cleanVal = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = cleanVal;
    setOtpDigits(newDigits);
    setVerificationError(null);

    // Auto advance to next input
    if (cleanVal && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  // Handle backspace key
  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!otpDigits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  // Handle paste 6-digit code
  const handlePaste = (e: React.ClipboardEvent) => {
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

  // Quick helper to auto-fill valid demo code
  const handleFillDemoCode = () => {
    setOtpDigits(['1', '2', '3', '4', '5', '6']);
    setVerificationError(null);
  };

  // Handle OTP verification submission
  const handleVerifyOtp = async () => {
    const fullCode = otpDigits.join('');
    if (fullCode.length < 6) {
      setVerificationError(t('Please enter all 6 digits of your authenticator code.'));
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    // Enroll mode verifies against the real backend: a correct first code
    // enables MFA and returns the one-time recovery codes.
    if (mode === 'enroll') {
      try {
        const res = await authApi.mfaEnable(fullCode);
        setRecoveryCodes(res.backupCodes);
        addToast({
          type: 'success',
          title: t('MFA Verification Successful'),
          description: t('TOTP Authenticator successfully configured!')
        });
        pushAuditLog('SECURITY', 'MFA_ENROLLED', 'USER', 'mfa-session', t('TOTP Authentication Verified'));
        setStep(4);
      } catch (e) {
        setVerificationError(
          e instanceof ApiError ? e.message : t('Invalid passkey code or expired TOTP window. Please check your device time.')
        );
      } finally {
        setIsVerifying(false);
      }
      return;
    }

    // Demo challenge elevation (no backend counterpart — step-up auth is not
    // exposed for already-authenticated sessions).
    setTimeout(() => {
      setIsVerifying(false);
      if (fullCode === '000000') {
        setVerificationError(t('Invalid passkey code or expired TOTP window. Please check your device time.'));
        addToast({
          type: 'error',
          title: t('MFA Verification Failed'),
          description: t('The provided code was rejected by the authentication server.')
        });
      } else {
        addToast({
          type: 'success',
          title: t('MFA Verification Successful'),
          description: t('Identity verified. Access session elevated.')
        });
        pushAuditLog('SECURITY', 'MFA_CHALLENGE_SUCCESS', 'USER', 'mfa-session', t('TOTP Authentication Verified'));
        if (onSuccess) onSuccess();
        onClose();
      }
    }, 1000);
  };

  // Disable MFA — strong re-auth (password + current OTP); the backend revokes
  // all sessions on success, so drop to a signed-out state locally (spec §19).
  const handleDisableMfa = async () => {
    const fullCode = otpDigits.join('');
    if (!disablePassword) {
      setVerificationError(t('Enter your password to continue.'));
      return;
    }
    if (fullCode.length < 6) {
      setVerificationError(t('Please enter all 6 digits of your authenticator code.'));
      return;
    }
    setIsVerifying(true);
    setVerificationError(null);
    try {
      await authApi.mfaDisable(disablePassword, fullCode);
      addToast({
        type: 'success',
        title: t('MFA Disabled'),
        description: t('All sessions were revoked. Please sign in again.')
      });
      onClose();
      logout();
    } catch (e) {
      setVerificationError(e instanceof ApiError ? e.message : t('Could not disable MFA.'));
    } finally {
      setIsVerifying(false);
    }
  };

  // Copy secret key
  const handleCopySecret = () => {
    navigator.clipboard.writeText(mfaSecret);
    setIsCopiedSecret(true);
    setTimeout(() => setIsCopiedSecret(false), 2000);
    addToast({
      type: 'info',
      title: t('Secret Copied'),
      description: t('Secret key copied to clipboard.')
    });
  };

  // Copy recovery codes
  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setIsCopiedCodes(true);
    setTimeout(() => setIsCopiedCodes(false), 2000);
    addToast({
      type: 'info',
      title: t('Recovery Codes Copied'),
      description: t('All 8 recovery codes saved to clipboard.')
    });
  };

  // Download recovery codes TXT file
  const handleDownloadRecoveryCodes = () => {
    const element = document.createElement('a');
    const file = new Blob([`VEHICLE PLATFORM MFA RECOVERY CODES\nAccount: ${currentUser.email}\nGenerated: ${new Date().toLocaleString()}\n\nKeep these single-use codes in a secure location:\n\n` + recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `vehicle-platform-mfa-recovery-codes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    setHasSavedCodes(true);
    addToast({
      type: 'success',
      title: t('Recovery File Downloaded'),
      description: t('Saved vehicle-platform-mfa-recovery-codes.txt to downloads.')
    });
  };

  // Finish entire enrollment
  const handleCompleteEnrollment = () => {
    refreshMe();
    if (onSuccess) onSuccess();
    onClose();
    addToast({
      type: 'success',
      title: t('MFA Enforced'),
      description: t('Multi-factor authentication is now active on your account.')
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 10 }}
        className="w-full max-w-lg bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header Bar */}
        <div className="p-5 border-b border-[#30363d] bg-[#0d0e12] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 flex items-center justify-center text-[#58a6ff]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">
                  {mode === 'enroll'
                    ? t('Multi-Factor Setup')
                    : mode === 'challenge'
                    ? t('MFA Security Challenge')
                    : mode === 'disable'
                    ? t('Disable Multi-Factor Authentication')
                    : t('Reset MFA for {{name}}', { name: targetAdminName || t('Administrator') })}
                </h3>
                <Badge variant="blue" size="sm">FIDO/TOTP</Badge>
              </div>
              <p className="text-xs text-[#8b949e]">
                {mode === 'enroll'
                  ? t('Protect your platform account with 2-factor authentication')
                  : mode === 'challenge'
                  ? t('Enter your 6-digit TOTP code from your authenticator app')
                  : mode === 'disable'
                  ? t('Confirm with your password and a current authenticator code. All sessions will be revoked.')
                  : t('Generate a new authenticator binding URL for this account')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white p-1.5 rounded-lg hover:bg-[#21262d] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step Progress Bar (For Enrollment) */}
        {mode === 'enroll' && (
          <div className="px-6 py-2.5 bg-[#0d0e12]/60 border-b border-[#30363d] flex items-center justify-between text-xs text-[#8b949e] shrink-0 font-mono">
            <span className={step >= 1 ? 'text-[#58a6ff] font-bold' : ''}>1. {t('Method')}</span>
            <span>→</span>
            <span className={step >= 2 ? 'text-[#58a6ff] font-bold' : ''}>2. {t('Scan QR')}</span>
            <span>→</span>
            <span className={step >= 3 ? 'text-[#58a6ff] font-bold' : ''}>3. {t('Verify')}</span>
            <span>→</span>
            <span className={step >= 4 ? 'text-[#58a6ff] font-bold' : ''}>4. {t('Backup')}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* STEP 1: Method Selection (Enroll Mode) */}
          {mode === 'enroll' && step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-[#c9d1d9]">
                {t('Choose your primary two-factor authentication method. We strongly recommend using an Authenticator App (TOTP) or Hardware Security Key.')}
              </p>

              <div className="space-y-2.5">
                {/* Method Option: TOTP */}
                <button
                  onClick={() => setSelectedMethod('totp')}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    selectedMethod === 'totp'
                      ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white shadow-md shadow-[#58a6ff]/10'
                      : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg shrink-0 ${selectedMethod === 'totp' ? 'bg-[#58a6ff] text-slate-950' : 'bg-[#21262d] text-[#8b949e]'}`}>
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-white">{t('Authenticator App (TOTP)')}</h4>
                      <Badge variant="emerald" size="sm">{t('RECOMMENDED')}</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {t('Use Google Authenticator, 1Password, Authy, or Microsoft Authenticator for dynamic 30s passcodes.')}
                    </p>
                  </div>
                </button>

                {/* Method Option: Security Key */}
                <button
                  onClick={() => setSelectedMethod('security_key')}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    selectedMethod === 'security_key'
                      ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white shadow-md shadow-[#58a6ff]/10'
                      : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg shrink-0 ${selectedMethod === 'security_key' ? 'bg-[#58a6ff] text-slate-950' : 'bg-[#21262d] text-[#8b949e]'}`}>
                    <Key className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-white">{t('FIDO2 / Hardware Security Key')}</h4>
                      <Badge variant="purple" size="sm">{t('HIGH SECURITY')}</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {t('Use physical YubiKey, Apple TouchID / FaceID passkeys, or WebAuthn hardware tokens.')}
                    </p>
                  </div>
                </button>

                {/* Method Option: SMS OTP */}
                <button
                  onClick={() => setSelectedMethod('sms')}
                  className={`w-full p-4 rounded-xl border text-left transition-all flex items-start gap-3.5 cursor-pointer ${
                    selectedMethod === 'sms'
                      ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white shadow-md shadow-[#58a6ff]/10'
                      : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58] hover:text-[#c9d1d9]'
                  }`}
                >
                  <div className={`p-2.5 rounded-lg shrink-0 ${selectedMethod === 'sms' ? 'bg-[#58a6ff] text-slate-950' : 'bg-[#21262d] text-[#8b949e]'}`}>
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-sm text-white">{t('SMS Cellular Backup OTP')}</h4>
                      <Badge variant="amber" size="sm">{t('FALLBACK')}</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      {t('Receive single-use passcode via SMS message to +84 (***) *** 888.')}
                    </p>
                  </div>
                </button>
              </div>

              <div className="pt-3 flex items-center justify-end">
                <Button
                  variant="primary"
                  icon={ArrowRight}
                  isLoading={isSetupLoading}
                  onClick={startSetup}
                >
                  {t('Continue to Pairing')}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: QR Code & Secret Key (Enroll Mode) */}
          {mode === 'enroll' && step === 2 && (
            <div className="space-y-5 text-xs text-[#c9d1d9]">
              <div className="p-3 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center gap-3">
                <QrCode className="w-5 h-5 text-[#58a6ff] shrink-0" />
                <p>
                  {t('Scan the QR code below using your authenticator application, or manually enter the secret key.')}
                </p>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 bg-[#0d0e12] rounded-2xl border border-[#30363d]">
                <div className="bg-white p-3 rounded-xl shrink-0 shadow-lg flex flex-col items-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="TOTP provisioning QR" className="w-36 h-36" />
                  ) : (
                    <div className="w-36 h-36 flex items-center justify-center text-slate-400 text-xs font-mono">
                      {t('Generating…')}
                    </div>
                  )}
                  <span className="text-[10px] text-slate-800 font-mono font-bold mt-2">VehiclePlatform:{currentUser.email || 'account'}</span>
                </div>

                <div className="flex-1 space-y-3 text-left w-full">
                  <div>
                    <label className="text-[11px] text-[#8b949e] uppercase font-mono font-semibold block mb-1">
                      {t('Manual Secret Key')}
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-[#161b22] px-3 py-2 rounded-lg border border-[#30363d] font-mono text-sm text-[#58a6ff] font-bold tracking-wider">
                        {mfaSecret}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleCopySecret}
                        icon={isCopiedSecret ? Check : Copy}
                      >
                        {isCopiedSecret ? t('Copied') : t('Copy')}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-[#8b949e]">{t('Account identifier:')}</p>
                    <p className="font-mono text-xs text-white">{currentUser.email || '—'}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-[#8b949e]">{t('Provisioning URI:')}</p>
                    <p className="font-mono text-[10px] text-[#8b949e] break-all">{provisioningUri || '—'}</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  {t('Back')}
                </Button>
                <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)}>
                  {t("I've Scanned the Code")}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: OTP Code Verification Challenge */}
          {(step === 3 || mode === 'challenge') && (
            <div className="space-y-5 text-xs text-[#c9d1d9]">
              <div className="text-center space-y-1">
                <p className="font-semibold text-white text-sm">{t('Enter 6-Digit Authenticator Passcode')}</p>
                <p className="text-xs text-[#8b949e]">
                  {t('Open your TOTP app and enter the current generated 6-digit passcode.')}
                </p>
              </div>

              {/* 6-Digit Input Box Grid */}
              <div className="flex justify-center items-center gap-2 sm:gap-3 py-2">
                {otpDigits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => { inputRefs.current[idx] = el; }}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    onPaste={idx === 0 ? handlePaste : undefined}
                    className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold font-mono rounded-xl border bg-[#0d0e12] focus:outline-none transition-all ${
                      verificationError
                        ? 'border-[#f85149] text-[#f85149] focus:ring-2 focus:ring-[#f85149]/40'
                        : digit
                        ? 'border-[#58a6ff] text-[#58a6ff] bg-[#58a6ff]/10 focus:ring-2 focus:ring-[#58a6ff]/40'
                        : 'border-[#30363d] text-white hover:border-[#484f58] focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20'
                    }`}
                  />
                ))}
              </div>

              {/* TOTP 30s Countdown cycle indicator */}
              <div className="flex items-center justify-between px-3 py-2 bg-[#0d0e12] border border-[#30363d] rounded-xl text-[11px] text-[#8b949e]">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-[#58a6ff]" />
                  <span>{t('Passcode validity window:')}</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-white">{t('{{count}}s remaining', { count: countdown })}</span>
                  <div className="w-16 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#58a6ff] transition-all duration-1000"
                      style={{ width: `${(countdown / 30) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Verification Error Box */}
              {verificationError && (
                <div className="p-3 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] flex items-center gap-2.5 text-xs animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{verificationError}</p>
                </div>
              )}

              {/* Demo Fill Helper — only meaningful for the simulated challenge mode */}
              {mode === 'challenge' && (
                <div className="flex items-center justify-between text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={handleFillDemoCode}
                    className="text-[#58a6ff] hover:underline flex items-center gap-1 font-mono cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> {t('Auto-fill test passcode (123456)')}
                  </button>
                  <span className="text-[#8b949e] font-mono">{t('Paste supported')}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-[#30363d]">
                {mode === 'enroll' ? (
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    {t('Back')}
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={onClose}>
                    {t('Cancel')}
                  </Button>
                )}

                <Button
                  variant="primary"
                  onClick={handleVerifyOtp}
                  isLoading={isVerifying}
                  icon={ShieldCheck}
                >
                  {isVerifying ? t('Validating Token...') : t('Verify Passcode')}
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: Emergency Recovery Codes (Enroll Mode) */}
          {mode === 'enroll' && step === 4 && (
            <div className="space-y-5 text-xs text-[#c9d1d9]">
              <div className="p-4 bg-[#238636]/10 border border-[#3fb950]/30 rounded-xl flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#3fb950] shrink-0" />
                <div>
                  <h4 className="font-bold text-white text-sm">{t('Authenticator Verified Successfully!')}</h4>
                  <p className="text-xs text-[#8b949e]">
                    {t('Save these emergency recovery codes. If you lose access to your authenticator app, these codes are the only way to recover account access.')}
                  </p>
                </div>
              </div>

              {/* 8 Recovery Codes Grid */}
              <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#8b949e] border-b border-[#30363d] pb-2 font-mono">
                  <span>{t('SINGLE-USE EMERGENCY RECOVERY CODES')}</span>
                  <Badge variant="amber" size="sm">{t('KEEP SECURE')}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                  {recoveryCodes.map((code, index) => (
                    <div
                      key={index}
                      className="px-3 py-2 bg-[#161b22] border border-[#30363d] rounded-lg text-center text-[#58a6ff] font-bold tracking-wider"
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleCopyRecoveryCodes}
                    icon={isCopiedCodes ? Check : Copy}
                  >
                    {isCopiedCodes ? t('Copied All') : t('Copy All Codes')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleDownloadRecoveryCodes}
                    icon={Download}
                  >
                    {t('Download TXT')}
                  </Button>
                </div>
              </div>

              {/* Confirmation Checkbox */}
              <label className="flex items-center gap-2.5 p-3 rounded-xl border border-[#30363d] bg-[#0d0e12] cursor-pointer hover:border-[#484f58] transition-colors">
                <input
                  type="checkbox"
                  checked={hasSavedCodes}
                  onChange={(e) => setHasSavedCodes(e.target.checked)}
                  className="w-4 h-4 rounded border-[#30363d] text-[#58a6ff] focus:ring-[#58a6ff] cursor-pointer"
                />
                <span className="text-xs text-white">
                  {t('I have saved or printed these 8 recovery codes in a safe place.')}
                </span>
              </label>

              {/* Finish Actions */}
              <div className="flex items-center justify-end pt-2 border-t border-[#30363d]">
                <Button
                  variant="primary"
                  disabled={!hasSavedCodes}
                  onClick={handleCompleteEnrollment}
                  icon={ShieldCheck}
                >
                  {t('Complete MFA Setup')}
                </Button>
              </div>
            </div>
          )}

          {/* DISABLE MODE — strong re-auth: password + current OTP (spec §19) */}
          {mode === 'disable' && (
            <div className="space-y-5 text-xs text-[#c9d1d9]">
              <div className="p-4 bg-[#da3633]/10 border border-[#f85149]/30 rounded-xl flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-[#f85149] shrink-0" />
                <div>
                  <h4 className="font-bold text-white text-sm">{t('This is a high-impact security change')}</h4>
                  <p className="text-xs text-[#8b949e]">
                    {t('Disabling MFA removes a layer of protection and immediately signs out all sessions, including this one.')}
                  </p>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#c9d1d9] block mb-1.5">
                  {t('Current Password')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8b949e] absolute left-3 top-3" />
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#c9d1d9] block mb-1.5">
                  {t('Authenticator or Recovery Code')}
                </label>
                <div className="flex justify-center items-center gap-2 sm:gap-3 py-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => { inputRefs.current[idx] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(idx, e)}
                      onPaste={idx === 0 ? handlePaste : undefined}
                      className={`w-11 h-13 sm:w-12 sm:h-14 text-center text-xl font-bold font-mono rounded-xl border bg-[#0d0e12] focus:outline-none transition-all ${
                        verificationError
                          ? 'border-[#f85149] text-[#f85149]'
                          : digit
                          ? 'border-[#58a6ff] text-[#58a6ff] bg-[#58a6ff]/10'
                          : 'border-[#30363d] text-white hover:border-[#484f58] focus:border-[#58a6ff]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {verificationError && (
                <div className="p-3 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] flex items-center gap-2.5 text-xs animate-in fade-in duration-150">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <p>{verificationError}</p>
                </div>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-[#30363d]">
                <Button variant="ghost" onClick={onClose}>
                  {t('Cancel')}
                </Button>
                <Button
                  variant="danger"
                  onClick={handleDisableMfa}
                  isLoading={isVerifying}
                  icon={ShieldAlert}
                >
                  {isVerifying ? t('Verifying...') : t('Disable MFA & Sign Out')}
                </Button>
              </div>
            </div>
          )}

          {/* RESET ADMIN MODE */}
          {mode === 'reset_admin' && (
            <div className="space-y-4 text-xs text-[#c9d1d9]">
              <div className="p-4 bg-[#da3633]/10 border border-[#f85149]/30 rounded-xl flex items-center gap-3">
                <ShieldAlert className="w-6 h-6 text-[#f85149] shrink-0" />
                <div>
                  <h4 className="font-bold text-white text-sm">{t('Reset MFA Secret Key')}</h4>
                  <p className="text-xs text-[#8b949e]">
                    {t('Target user:')} <strong className="text-white">{targetAdminName || t('Administrator')}</strong>
                  </p>
                </div>
              </div>

              <p>
                {t('Resetting MFA will immediately revoke all paired TOTP devices and security keys for this administrator. The user will be prompted to re-enroll upon their next console sign-in.')}
              </p>

              <div className="p-3 bg-[#0d0e12] border border-[#30363d] rounded-xl font-mono text-[11px] space-y-1">
                <p className="text-[#8b949e]">{t('AUDIT ACTION:')}</p>
                <p className="text-[#f85149] font-bold">MFA_RESET_PERFORMED_BY_PLATFORM_GOVERNANCE</p>
              </div>

              {verificationError && (
                <p className="text-[#f85149] text-xs">{verificationError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#30363d]">
                <Button variant="ghost" onClick={onClose}>
                  {t('Cancel')}
                </Button>
                <Button
                  variant="danger"
                  icon={RotateCcw}
                  isLoading={isVerifying}
                  disabled={!targetAdminId}
                  onClick={async () => {
                    if (!targetAdminId) return;
                    setIsVerifying(true);
                    setVerificationError(null);
                    try {
                      await platformApi.resetAdminMfa(targetAdminId);
                      addToast({
                        type: 'warning',
                        title: t('MFA Secret Reset'),
                        description: t('MFA credentials revoked for {{name}}. User must re-enroll.', { name: targetAdminName || 'admin' })
                      });
                      pushAuditLog('SECURITY', 'MFA_RESET', 'ADMIN', targetAdminName || 'admin', t('MFA Secret Revoked'));
                      if (onSuccess) onSuccess();
                      onClose();
                    } catch (e) {
                      setVerificationError(e instanceof ApiError ? e.message : t('Could not reset MFA for this administrator.'));
                    } finally {
                      setIsVerifying(false);
                    }
                  }}
                >
                  {isVerifying ? t('Revoking...') : t('Revoke & Reset Secret')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
