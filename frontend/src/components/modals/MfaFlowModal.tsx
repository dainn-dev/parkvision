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

export interface MfaFlowModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode?: 'enroll' | 'challenge' | 'reset_admin';
  targetAdminName?: string;
  onSuccess?: () => void;
}

type MfaMethod = 'totp' | 'security_key' | 'sms';

export const MfaFlowModal: React.FC<MfaFlowModalProps> = ({
  isOpen,
  onClose,
  mode = 'enroll',
  targetAdminName,
  onSuccess
}) => {
  const { addToast, pushAuditLog } = usePlatform();

  // Step flow state: 1: Method, 2: Setup/QR, 3: Verify OTP, 4: Recovery Codes, 5: Complete
  const [step, setStep] = useState<number>(mode === 'challenge' ? 3 : 1);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>('totp');
  
  // OTP input state (6 digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Secret & Recovery state
  const [mfaSecret] = useState('K43X-6MZP-9QL2-W8VY');
  const [recoveryCodes] = useState<string[]>([
    'a7f9-4b2c',
    '9x3e-8k1m',
    '5p2r-7w9q',
    '3m8v-1n4k',
    '8j5t-2z6p',
    '4d1c-9g7h',
    '6k3w-8s2x',
    '2v9y-5f4b'
  ]);
  
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

  // Reset modal state on open
  useEffect(() => {
    if (isOpen) {
      setStep(mode === 'challenge' ? 3 : 1);
      setOtpDigits(['', '', '', '', '', '']);
      setVerificationError(null);
      setIsVerifying(false);
      setHasSavedCodes(false);
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
  const handleVerifyOtp = () => {
    const fullCode = otpDigits.join('');
    if (fullCode.length < 6) {
      setVerificationError('Please enter all 6 digits of your authenticator code.');
      return;
    }

    setIsVerifying(true);
    setVerificationError(null);

    // Simulate MFA verification
    setTimeout(() => {
      setIsVerifying(false);

      // Any 6-digit code except starting with '000000' is considered valid for demo
      if (fullCode === '000000') {
        setVerificationError('Invalid passkey code or expired TOTP window. Please check your device time.');
        addToast({
          type: 'error',
          title: 'MFA Verification Failed',
          description: 'The provided code was rejected by the authentication server.'
        });
      } else {
        addToast({
          type: 'success',
          title: 'MFA Verification Successful',
          description: mode === 'challenge' ? 'Identity verified. Access session elevated.' : 'TOTP Authenticator successfully configured!'
        });

        pushAuditLog('SECURITY', mode === 'challenge' ? 'MFA_CHALLENGE_SUCCESS' : 'MFA_ENROLLED', 'USER', 'mfa-session', 'TOTP Authentication Verified');

        if (mode === 'challenge') {
          if (onSuccess) onSuccess();
          onClose();
        } else if (mode === 'reset_admin') {
          if (onSuccess) onSuccess();
          onClose();
        } else {
          setStep(4); // Move to recovery codes step
        }
      }
    }, 1000);
  };

  // Copy secret key
  const handleCopySecret = () => {
    navigator.clipboard.writeText(mfaSecret);
    setIsCopiedSecret(true);
    setTimeout(() => setIsCopiedSecret(false), 2000);
    addToast({
      type: 'info',
      title: 'Secret Copied',
      description: 'Secret key copied to clipboard.'
    });
  };

  // Copy recovery codes
  const handleCopyRecoveryCodes = () => {
    navigator.clipboard.writeText(recoveryCodes.join('\n'));
    setIsCopiedCodes(true);
    setTimeout(() => setIsCopiedCodes(false), 2000);
    addToast({
      type: 'info',
      title: 'Recovery Codes Copied',
      description: 'All 8 recovery codes saved to clipboard.'
    });
  };

  // Download recovery codes TXT file
  const handleDownloadRecoveryCodes = () => {
    const element = document.createElement('a');
    const file = new Blob([`VEHICLE PLATFORM MFA RECOVERY CODES\nAccount: anh.nh@kyanon.digital\nGenerated: ${new Date().toLocaleString()}\n\nKeep these single-use codes in a secure location:\n\n` + recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join('\n')], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `vehicle-platform-mfa-recovery-codes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);

    setHasSavedCodes(true);
    addToast({
      type: 'success',
      title: 'Recovery File Downloaded',
      description: 'Saved vehicle-platform-mfa-recovery-codes.txt to downloads.'
    });
  };

  // Finish entire enrollment
  const handleCompleteEnrollment = () => {
    if (onSuccess) onSuccess();
    onClose();
    addToast({
      type: 'success',
      title: 'MFA Enforced',
      description: 'Multi-factor authentication is now active on your account.'
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
                    ? 'Multi-Factor Setup'
                    : mode === 'challenge'
                    ? 'MFA Security Challenge'
                    : `Reset MFA for ${targetAdminName || 'Administrator'}`}
                </h3>
                <Badge variant="blue" size="sm">FIDO/TOTP</Badge>
              </div>
              <p className="text-xs text-[#8b949e]">
                {mode === 'enroll'
                  ? 'Protect your platform account with 2-factor authentication'
                  : mode === 'challenge'
                  ? 'Enter your 6-digit TOTP code from your authenticator app'
                  : 'Generate a new authenticator binding URL for this account'}
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
            <span className={step >= 1 ? 'text-[#58a6ff] font-bold' : ''}>1. Method</span>
            <span>→</span>
            <span className={step >= 2 ? 'text-[#58a6ff] font-bold' : ''}>2. Scan QR</span>
            <span>→</span>
            <span className={step >= 3 ? 'text-[#58a6ff] font-bold' : ''}>3. Verify</span>
            <span>→</span>
            <span className={step >= 4 ? 'text-[#58a6ff] font-bold' : ''}>4. Backup</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* STEP 1: Method Selection (Enroll Mode) */}
          {mode === 'enroll' && step === 1 && (
            <div className="space-y-4">
              <p className="text-xs text-[#c9d1d9]">
                Choose your primary two-factor authentication method. We strongly recommend using an Authenticator App (TOTP) or Hardware Security Key.
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
                      <h4 className="font-bold text-sm text-white">Authenticator App (TOTP)</h4>
                      <Badge variant="emerald" size="sm">RECOMMENDED</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      Use Google Authenticator, 1Password, Authy, or Microsoft Authenticator for dynamic 30s passcodes.
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
                      <h4 className="font-bold text-sm text-white">FIDO2 / Hardware Security Key</h4>
                      <Badge variant="purple" size="sm">HIGH SECURITY</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      Use physical YubiKey, Apple TouchID / FaceID passkeys, or WebAuthn hardware tokens.
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
                      <h4 className="font-bold text-sm text-white">SMS Cellular Backup OTP</h4>
                      <Badge variant="amber" size="sm">FALLBACK</Badge>
                    </div>
                    <p className="text-xs text-[#8b949e] mt-1">
                      Receive single-use passcode via SMS message to +84 (***) *** 888.
                    </p>
                  </div>
                </button>
              </div>

              <div className="pt-3 flex items-center justify-end">
                <Button
                  variant="primary"
                  icon={ArrowRight}
                  onClick={() => setStep(2)}
                >
                  Continue to Pairing
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
                  Scan the QR code below using your authenticator application, or manually enter the secret key.
                </p>
              </div>

              {/* QR Code Container */}
              <div className="flex flex-col sm:flex-row items-center gap-6 p-5 bg-[#0d0e12] rounded-2xl border border-[#30363d]">
                <div className="bg-white p-3 rounded-xl shrink-0 shadow-lg flex flex-col items-center">
                  {/* SVG Simulated Clean QR Code */}
                  <svg className="w-36 h-36" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect width="100" height="100" fill="white" />
                    {/* Corners */}
                    <rect x="5" y="5" width="25" height="25" fill="#0f172a" />
                    <rect x="9" y="9" width="17" height="17" fill="white" />
                    <rect x="13" y="13" width="9" height="9" fill="#0f172a" />

                    <rect x="70" y="5" width="25" height="25" fill="#0f172a" />
                    <rect x="74" y="9" width="17" height="17" fill="white" />
                    <rect x="78" y="13" width="9" height="9" fill="#0f172a" />

                    <rect x="5" y="70" width="25" height="25" fill="#0f172a" />
                    <rect x="9" y="74" width="17" height="17" fill="white" />
                    <rect x="13" y="78" width="9" height="9" fill="#0f172a" />

                    {/* Data pixels pattern */}
                    <rect x="35" y="10" width="8" height="8" fill="#0f172a" />
                    <rect x="48" y="10" width="8" height="8" fill="#0f172a" />
                    <rect x="58" y="18" width="8" height="8" fill="#0f172a" />

                    <rect x="35" y="28" width="8" height="8" fill="#0f172a" />
                    <rect x="48" y="32" width="12" height="8" fill="#0f172a" />
                    <rect x="70" y="35" width="8" height="8" fill="#0f172a" />

                    <rect x="10" y="38" width="8" height="8" fill="#0f172a" />
                    <rect x="20" y="48" width="8" height="8" fill="#0f172a" />

                    <rect x="35" y="50" width="12" height="12" fill="#0f172a" />
                    <rect x="55" y="50" width="8" height="12" fill="#0f172a" />
                    <rect x="70" y="50" width="12" height="8" fill="#0f172a" />

                    <rect x="38" y="70" width="8" height="8" fill="#0f172a" />
                    <rect x="50" y="75" width="12" height="8" fill="#0f172a" />
                    <rect x="70" y="70" width="18" height="18" fill="#0f172a" />
                    <rect x="75" y="75" width="8" height="8" fill="white" />
                  </svg>
                  <span className="text-[10px] text-slate-800 font-mono font-bold mt-2">VehiclePlatform:anh.nh</span>
                </div>

                <div className="flex-1 space-y-3 text-left w-full">
                  <div>
                    <label className="text-[11px] text-[#8b949e] uppercase font-mono font-semibold block mb-1">
                      Manual Secret Key
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
                        {isCopiedSecret ? 'Copied' : 'Copy'}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-[#8b949e]">Account identifier:</p>
                    <p className="font-mono text-xs text-white">anh.nh@kyanon.digital</p>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[11px] text-[#8b949e]">Issuer domain:</p>
                    <p className="font-mono text-xs text-white">VehiclePlatform Operational Governance</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button variant="primary" icon={ArrowRight} onClick={() => setStep(3)}>
                  I've Scanned the Code
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: OTP Code Verification Challenge */}
          {(step === 3 || mode === 'challenge') && (
            <div className="space-y-5 text-xs text-[#c9d1d9]">
              <div className="text-center space-y-1">
                <p className="font-semibold text-white text-sm">Enter 6-Digit Authenticator Passcode</p>
                <p className="text-xs text-[#8b949e]">
                  Open your TOTP app and enter the current generated 6-digit passcode.
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
                  <span>Passcode validity window:</span>
                </div>
                <div className="flex items-center gap-2 font-mono">
                  <span className="font-bold text-white">{countdown}s remaining</span>
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

              {/* Demo Fill Helper */}
              <div className="flex items-center justify-between text-[11px] pt-1">
                <button
                  type="button"
                  onClick={handleFillDemoCode}
                  className="text-[#58a6ff] hover:underline flex items-center gap-1 font-mono cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Auto-fill test passcode (123456)
                </button>
                <span className="text-[#8b949e] font-mono">Paste supported</span>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-[#30363d]">
                {mode === 'enroll' ? (
                  <Button variant="ghost" onClick={() => setStep(2)}>
                    Back
                  </Button>
                ) : (
                  <Button variant="ghost" onClick={onClose}>
                    Cancel
                  </Button>
                )}

                <Button
                  variant="primary"
                  onClick={handleVerifyOtp}
                  isLoading={isVerifying}
                  icon={ShieldCheck}
                >
                  {isVerifying ? 'Validating Token...' : 'Verify Passcode'}
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
                  <h4 className="font-bold text-white text-sm">Authenticator Verified Successfully!</h4>
                  <p className="text-xs text-[#8b949e]">
                    Save these emergency recovery codes. If you lose access to your authenticator app, these codes are the only way to recover account access.
                  </p>
                </div>
              </div>

              {/* 8 Recovery Codes Grid */}
              <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-3">
                <div className="flex items-center justify-between text-[11px] text-[#8b949e] border-b border-[#30363d] pb-2 font-mono">
                  <span>SINGLE-USE EMERGENCY RECOVERY CODES</span>
                  <Badge variant="amber" size="sm">KEEP SECURE</Badge>
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
                    {isCopiedCodes ? 'Copied All' : 'Copy All Codes'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={handleDownloadRecoveryCodes}
                    icon={Download}
                  >
                    Download TXT
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
                  I have saved or printed these 8 recovery codes in a safe place.
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
                  Complete MFA Setup
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
                  <h4 className="font-bold text-white text-sm">Reset MFA Secret Key</h4>
                  <p className="text-xs text-[#8b949e]">
                    Target user: <strong className="text-white">{targetAdminName || 'Administrator'}</strong>
                  </p>
                </div>
              </div>

              <p>
                Resetting MFA will immediately revoke all paired TOTP devices and security keys for this administrator. The user will be prompted to re-enroll upon their next console sign-in.
              </p>

              <div className="p-3 bg-[#0d0e12] border border-[#30363d] rounded-xl font-mono text-[11px] space-y-1">
                <p className="text-[#8b949e]">AUDIT ACTION:</p>
                <p className="text-[#f85149] font-bold">MFA_RESET_PERFORMED_BY_PLATFORM_GOVERNANCE</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-[#30363d]">
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  icon={RotateCcw}
                  onClick={() => {
                    addToast({
                      type: 'warning',
                      title: 'MFA Secret Reset',
                      description: `MFA credentials revoked for ${targetAdminName || 'admin'}. User must re-enroll.`
                    });
                    pushAuditLog('SECURITY', 'MFA_RESET', 'ADMIN', targetAdminName || 'admin', 'MFA Secret Revoked');
                    if (onSuccess) onSuccess();
                    onClose();
                  }}
                >
                  Revoke & Reset Secret
                </Button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};
