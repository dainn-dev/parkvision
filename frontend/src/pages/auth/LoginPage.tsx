import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  Mail,
  Key,
  Smartphone,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  User,
  Shield,
  Layers,
  Activity,
  Check,
  Eye,
  EyeOff,
  ArrowLeft
} from 'lucide-react';
import { Button, Badge } from '../../components/ui';
import { usePlatform } from '../../context/PlatformContext';
import { useAuth } from '../../context/AuthContext';
import { ApiError } from '../../api/client';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface LoginPageProps {
  onNavigate?: (view: PublicViewType) => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onNavigate }) => {
  const { addToast } = usePlatform();
  const { login, verifyMfa } = useAuth();

  // Login Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<'mfa_off' | 'mfa_on'>('mfa_off');

  // Flow Step: 'credentials' | 'mfa_challenge' | 'backup_code'
  const [step, setStep] = useState<'credentials' | 'mfa_challenge' | 'backup_code'>('credentials');

  // OTP Input State (6 Digits)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [backupCode, setBackupCode] = useState('');

  // Status & Timers
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(30);

  // 30s TOTP countdown timer
  useEffect(() => {
    if (step !== 'mfa_challenge') return;
    const interval = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 30 : prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  // Focus first OTP input when stepping into MFA challenge
  useEffect(() => {
    if (step === 'mfa_challenge') {
      setTimeout(() => inputRefs.current[0]?.focus(), 150);
    }
  }, [step]);

  // Development presets match the users created by backend/scripts/seed.py.
  const handleSelectPreset = (presetType: 'mfa_off' | 'mfa_on') => {
    setErrorMessage(null);
    setStep('credentials');
    setSelectedPreset(presetType);
    if (presetType === 'mfa_off') {
      setEmail('owner@demo.example.com');
      setPassword('DemoOwner!123');
      addToast({
        type: 'info',
        title: 'Đã chọn Tenant Demo',
        description: 'Tài khoản được tạo bởi backend seed.'
      });
    } else {
      setEmail('admin@example.com');
      setPassword('ChangeMe!123');
      addToast({
        type: 'info',
        title: 'Đã chọn Platform Admin',
        description: 'Backend sẽ yêu cầu MFA nếu tài khoản đã kích hoạt TOTP.'
      });
    }
  };

  // Handle credentials submit (Step 1)
  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ Email và Mật khẩu.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const result = await login(email, password);
      if (result.requiresMfa) {
        setStep('mfa_challenge');
        addToast({
          type: 'warning',
          title: 'MFA Required',
          description: 'Mật khẩu hợp lệ. Vui lòng nhập mã TOTP từ ứng dụng Authenticator.'
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Đăng nhập thành công',
        description: `Chào mừng ${email} quay trở lại bảng điều khiển.`
      });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không thể kết nối tới máy chủ.');
    } finally {
      setIsLoading(false);
    }
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

  const completeMfaChallenge = async (code: string, backup = false) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await verifyMfa(code);
      addToast({
        type: 'success',
        title: backup ? 'Đăng nhập bằng Mã khôi phục' : 'Xác thực MFA thành công',
        description: backup
          ? 'Đã xác thực bằng mã sao lưu khẩn cấp.'
          : 'Mã TOTP hợp lệ. Đang khởi tạo phiên làm việc bảo mật...'
      });
    } catch (error) {
      setErrorMessage(error instanceof ApiError ? error.message : 'Không thể xác thực MFA.');
    } finally {
      setIsLoading(false);
    }
  };

  // Submit MFA Code (Step 2)
  const handleMfaSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = otpDigits.join('');

    if (code.length < 6) {
      setErrorMessage('Vui lòng nhập đủ 6 chữ số mã xác thực.');
      return;
    }

    void completeMfaChallenge(code);
  };

  // Submit Backup Code
  const handleBackupCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupCode.trim()) {
      setErrorMessage('Vui lòng nhập mã khôi phục dự phòng.');
      return;
    }

    void completeMfaChallenge(backupCode.trim(), true);
  };

  return (
    <div className="min-h-screen w-screen bg-[#0d0e12] text-[#c9d1d9] flex flex-col items-center justify-center p-4 relative overflow-hidden font-sans selection:bg-[#58a6ff] selection:text-slate-950">
      {/* Background Subtle Glowing Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#58a6ff]/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#8250df]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top navigation helper when onNavigate is provided */}
      {onNavigate && (
        <div className="w-full max-w-md flex items-center justify-between mb-3 z-10 text-xs">
          <button
            type="button"
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-1.5 text-[#8b949e] hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Về Trang Chủ</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('register')}
            className="text-[#58a6ff] hover:underline font-semibold cursor-pointer"
          >
            Đăng ký dùng thử 14 ngày →
          </button>
        </div>
      )}

      {/* Main Container */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="w-full max-w-md bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden relative z-10 flex flex-col"
      >
        {/* Header Header */}
        <div className="p-6 border-b border-[#30363d] bg-[#0d0e12] text-center relative">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-extrabold text-white tracking-tight">
            Vehicle Fleet Governance
          </h2>
          <p className="text-xs text-[#8b949e] mt-1 font-mono">
            Hệ thống Quản trị Bảng điều khiển & An ninh Trung tâm
          </p>
        </div>

        {/* Demo Account Quick Selector Pills */}
        <div className="p-3 bg-[#0d0e12]/80 border-b border-[#30363d] flex items-center justify-center gap-2 text-xs">
          <span className="text-[11px] text-[#8b949e] font-mono mr-1">Thử nghiệm luồng:</span>
          <button
            type="button"
            onClick={() => handleSelectPreset('mfa_off')}
            className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedPreset === 'mfa_off'
                ? 'bg-[#238636]/20 border-[#3fb950] text-[#3fb950] font-bold shadow-sm'
                : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58]'
            }`}
          >
            <User className="w-3 h-3" /> Chưa bật MFA
          </button>

          <button
            type="button"
            onClick={() => handleSelectPreset('mfa_on')}
            className={`px-2.5 py-1 rounded-lg border font-mono text-[11px] transition-all cursor-pointer flex items-center gap-1.5 ${
              selectedPreset === 'mfa_on'
                ? 'bg-[#8250df]/20 border-[#8250df] text-[#a371f7] font-bold shadow-sm'
                : 'bg-[#161b22] border-[#30363d] text-[#8b949e] hover:text-white hover:border-[#484f58]'
            }`}
          >
            <Shield className="w-3 h-3" /> Đã bật MFA (2FA)
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {/* STEP 1: CREDENTIALS FORM */}
          {step === 'credentials' && (
            <form onSubmit={handleCredentialsSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#c9d1d9] block mb-1.5">
                  Địa chỉ Email Administrator
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#8b949e] absolute left-3 top-3" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@vehicleplatform.com"
                    className="w-full pl-9 pr-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20 transition-all font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[#c9d1d9] block mb-1.5">
                  Mật khẩu truy cập
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#8b949e] absolute left-3 top-3" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full pl-9 pr-9 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-[#8b949e] hover:text-white cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-[#8250df]/20 text-[#a371f7]">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-bold text-white block">MFA do máy chủ quyết định</span>
                  <span className="text-[10px] text-[#8b949e] block">
                    Bước nhập mã chỉ xuất hiện khi tài khoản đã kích hoạt TOTP.
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                className="w-full py-2.5"
                isLoading={isLoading}
                icon={ArrowRight}
              >
                {isLoading ? 'Đang kiểm tra thông tin...' : 'Tiếp tục đăng nhập'}
              </Button>
            </form>
          )}

          {/* STEP 2: MFA TOTP CHALLENGE */}
          {step === 'mfa_challenge' && (
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#8250df]/20 text-[#a371f7] border border-[#8250df]/30 text-[11px] font-mono font-semibold">
                  <ShieldCheck className="w-3.5 h-3.5" /> Luồng bảo mật 2FA (TOTP)
                </div>
                <h3 className="text-sm font-bold text-white pt-2">Nhập mã xác thực 6 chữ số</h3>
                <p className="text-xs text-[#8b949e]">
                  Mở ứng dụng Google Authenticator hoặc Authy trên điện thoại của bạn.
                </p>
              </div>

              {/* 6 Digit Input Grid */}
              <form onSubmit={handleMfaSubmit} className="space-y-4">
                <div className="flex justify-center items-center gap-2">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => (inputRefs.current[index] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className={`w-11 h-13 text-center text-xl font-bold font-mono rounded-xl border bg-[#0d0e12] focus:outline-none transition-all ${
                        errorMessage
                          ? 'border-[#f85149] text-[#f85149]'
                          : digit
                          ? 'border-[#58a6ff] text-[#58a6ff] bg-[#58a6ff]/10'
                          : 'border-[#30363d] text-white hover:border-[#484f58] focus:border-[#58a6ff]'
                      }`}
                    />
                  ))}
                </div>

                {/* Live Countdown Timer */}
                <div className="flex items-center justify-between px-3 py-2 bg-[#0d0e12] border border-[#30363d] rounded-xl text-[11px] text-[#8b949e]">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-[#58a6ff]" />
                    <span>Thời gian đổi mã:</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-white">{countdown}s</span>
                    <div className="w-14 h-1.5 bg-[#21262d] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#58a6ff] transition-all duration-1000"
                        style={{ width: `${(countdown / 30) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <div className="p-3 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="flex items-center justify-end text-[11px] pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('backup_code');
                      setErrorMessage(null);
                    }}
                    className="text-[#8b949e] hover:text-white hover:underline font-mono cursor-pointer"
                  >
                    Dùng mã khôi phục
                  </button>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStep('credentials');
                      setErrorMessage(null);
                    }}
                    icon={ChevronLeft}
                  >
                    Quay lại
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    className="flex-1 py-2.5"
                    isLoading={isLoading}
                    icon={ShieldCheck}
                  >
                    Xác nhận mã OTP
                  </Button>
                </div>
              </form>
            </div>
          )}

          {/* STEP 3: BACKUP RECOVERY CODE */}
          {step === 'backup_code' && (
            <form onSubmit={handleBackupCodeSubmit} className="space-y-4 animate-in fade-in duration-200">
              <div className="text-center space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#d29922]/20 text-[#d29922] border border-[#d29922]/30 text-[11px] font-mono font-semibold">
                  <Key className="w-3.5 h-3.5" /> Emergency Recovery Code
                </div>
                <h3 className="text-sm font-bold text-white pt-2">Nhập mã khôi phục khẩn cấp</h3>
                <p className="text-xs text-[#8b949e]">
                  Nhập một trong 8 mã sao lưu 8 ký tự được cấp lúc kích hoạt 2FA.
                </p>
              </div>

              <div>
                <input
                  type="text"
                  required
                  value={backupCode}
                  onChange={(e) => setBackupCode(e.target.value)}
                  placeholder="e.g. a7f9-4b2c"
                  className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-sm font-mono font-bold text-center text-[#58a6ff] tracking-widest placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-2 focus:ring-[#58a6ff]/20 uppercase"
                />
              </div>

              {errorMessage && (
                <div className="p-3 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStep('mfa_challenge');
                    setErrorMessage(null);
                  }}
                  icon={ChevronLeft}
                >
                  Trở lại TOTP
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="flex-1 py-2.5"
                  isLoading={isLoading}
                  icon={CheckCircle2}
                >
                  Xác thực bằng Mã khôi phục
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="p-4 bg-[#0d0e12] border-t border-[#30363d] text-center text-[11px] text-[#8b949e] font-mono flex items-center justify-between">
          <span>VehiclePlatform v4.8.2-prod</span>
          <span className="flex items-center gap-1 text-[#3fb950]">
            <Check className="w-3 h-3" /> FIDO2 / TOTP Enabled
          </span>
        </div>
      </motion.div>

      {/* Bottom Legal Navigation */}
      {onNavigate && (
        <div className="w-full max-w-md text-center text-[11px] text-[#8b949e] mt-4 flex items-center justify-center gap-4 z-10">
          <button
            type="button"
            onClick={() => onNavigate('privacy')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Chính sách bảo mật
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => onNavigate('terms')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Điều khoản dịch vụ
          </button>
          <span>•</span>
          <button
            type="button"
            onClick={() => onNavigate('sla')}
            className="hover:text-white transition-colors cursor-pointer"
          >
            Cam kết SLA 99.9%
          </button>
        </div>
      )}
    </div>
  );
};
