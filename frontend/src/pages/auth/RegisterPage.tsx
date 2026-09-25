import React, { useState } from 'react';
import {
  Building2,
  Car,
  User,
  Mail,
  Lock,
  Phone,
  ArrowRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  ShieldCheck,
  Layers,
  ArrowLeft,
  Check,
  AlertCircle
} from 'lucide-react';
import { Button, Badge } from '../../components/ui';
import { usePlatform } from '../../context/PlatformContext';
import { publicApi, ApiError } from '../../services/api';
import { PublicViewType } from '../../components/layout/PublicNavbar';

interface RegisterPageProps {
  initialPlan?: string;
  onNavigate: (view: PublicViewType) => void;
  onRegistrationSuccess?: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({
  initialPlan = 'business',
  onNavigate,
  onRegistrationSuccess
}) => {
  const { login, setTenantNavTab, addToast } = usePlatform();

  // Wizard Steps: 1: Organization -> 2: Scale & Plan -> 3: Admin Credentials
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form Fields
  const [orgName, setOrgName] = useState('');
  const [slug, setSlug] = useState('');
  const [orgType, setOrgType] = useState('OFFICE_BUILDING');

  const [expectedSites, setExpectedSites] = useState('1');
  const [expectedGates, setExpectedGates] = useState('2-4');
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);

  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Auto-generate slug from org name
  const handleOrgNameChange = (val: string) => {
    setOrgName(val);
    const generatedSlug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generatedSlug || 'my-tenant');
  };

  const handleStep1Next = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim()) {
      setErrorMessage('Vui lòng nhập tên công ty hoặc tòa nhà của bạn.');
      return;
    }
    setErrorMessage(null);
    setCurrentStep(2);
  };

  const handleStep2Next = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setCurrentStep(3);
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || !adminEmail.trim() || !password) {
      setErrorMessage('Vui lòng nhập đầy đủ họ tên, email và mật khẩu.');
      return;
    }
    if (password.length < 10) {
      setErrorMessage('Mật khẩu tối thiểu phải từ 10 ký tự trở lên.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Mật khẩu xác nhận không trùng khớp.');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage('Vui lòng xác nhận đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      const planCode = { starter: 'starter', business: 'pro', enterprise: 'enterprise' }[selectedPlan] ?? selectedPlan;
      await publicApi.register({
        tenantName: orgName,
        slug,
        planCode,
        contactEmail: adminEmail,
        ownerEmail: adminEmail,
        ownerFullName: adminName,
        ownerPassword: password
      });

      const res = await login(adminEmail, password);
      if (res.requiresMfa || !res.success) {
        setErrorMessage(res.message || 'Đăng ký thành công nhưng đăng nhập thất bại — vui lòng đăng nhập thủ công.');
        onNavigate('login');
        return;
      }

      setTenantNavTab('dashboard');

      addToast({
        type: 'success',
        title: 'Khởi tạo Tenant thành công!',
        description: `Chào mừng ${orgName}! Tenant của bạn đã được đăng ký.`
      });

      if (onRegistrationSuccess) {
        onRegistrationSuccess();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : 'Đăng ký thất bại. Vui lòng thử lại.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#0d0e12] text-[#c9d1d9] flex flex-col justify-between p-4 sm:p-6 lg:p-8 relative font-sans selection:bg-[#58a6ff] selection:text-slate-950">
      {/* Background Subtle Glows */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[300px] bg-[#58a6ff]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[300px] bg-[#3fb950]/10 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <div className="max-w-3xl mx-auto w-full flex items-center justify-between z-10 pb-6">
        <button
          onClick={() => onNavigate('landing')}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[#8b949e] hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Về Trang Chủ</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8b949e]">Đã có tài khoản?</span>
          <button
            onClick={() => onNavigate('login')}
            className="text-xs font-bold text-[#58a6ff] hover:underline cursor-pointer"
          >
            Đăng nhập ngay
          </button>
        </div>
      </div>

      {/* Registration Card */}
      <div className="max-w-2xl mx-auto w-full bg-[#161b22] border border-[#30363d] rounded-2xl shadow-2xl overflow-hidden relative z-10 my-auto">
        {/* Card Header & Steps Progress Bar */}
        <div className="p-6 border-b border-[#30363d] bg-[#0d0e12]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
                <Car className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white tracking-tight">
                  Đăng Ký Nền Tảng ANPR Cloud
                </h2>
                <p className="text-xs text-[#8b949e]">
                  Dùng thử 14 ngày miễn phí • Không cần thẻ tín dụng
                </p>
              </div>
            </div>
            <Badge variant="emerald" size="sm" className="font-mono text-[10px]">
              Step {currentStep} / 3
            </Badge>
          </div>

          {/* Stepper Wizard Indicator */}
          <div className="grid grid-cols-3 gap-2">
            <div className={`h-1.5 rounded-full transition-all ${
              currentStep >= 1 ? 'bg-[#58a6ff]' : 'bg-[#30363d]'
            }`} />
            <div className={`h-1.5 rounded-full transition-all ${
              currentStep >= 2 ? 'bg-[#58a6ff]' : 'bg-[#30363d]'
            }`} />
            <div className={`h-1.5 rounded-full transition-all ${
              currentStep === 3 ? 'bg-[#58a6ff]' : 'bg-[#30363d]'
            }`} />
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          {errorMessage && (
            <div className="mb-5 p-3.5 bg-[#da3633]/20 border border-[#f85149]/40 rounded-xl text-[#f85149] text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* STEP 1: ORGANIZATION INFO */}
          {currentStep === 1 && (
            <form onSubmit={handleStep1Next} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Tên Doanh nghiệp / Tòa nhà / Bãi xe <span className="text-[#f85149]">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder="Ví dụ: Tòa nhà Central Point Tower"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Mã định danh Tenant (Subdomain Slug)
                </label>
                <div className="flex items-center">
                  <span className="px-3 py-2.5 bg-[#21262d] border border-r-0 border-[#30363d] rounded-l-xl text-xs font-mono text-[#8b949e]">
                    anpr.cloud/
                  </span>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="central-point"
                    className="flex-1 px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-r-xl text-xs sm:text-sm font-mono text-[#58a6ff] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
                <p className="text-[11px] text-[#8b949e] mt-1">Dùng để phân vùng dữ liệu an toàn độc lập (Multi-Tenant RLS).</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Loại hình cơ sở
                </label>
                <select
                  value={orgType}
                  onChange={(e) => setOrgType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="OFFICE_BUILDING">Tòa nhà văn phòng & Trung tâm thương mại</option>
                  <option value="RESIDENTIAL">Khu dân cư & Chung cư cao cấp</option>
                  <option value="INDUSTRIAL">Khu công nghiệp & Kho vận Logistics</option>
                  <option value="PARKING_LOT">Bãi đỗ xe thương mại thông minh</option>
                  <option value="HOSPITAL_CAMPUS">Bệnh viện, Trường học & Cơ quan nhà nước</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" variant="primary" icon={ArrowRight} className="py-2.5 px-6">
                  Tiếp tục: Quy mô bãi xe
                </Button>
              </div>
            </form>
          )}

          {/* STEP 2: DEPLOYMENT SCALE & SUBSCRIPTION PLAN */}
          {currentStep === 2 && (
            <form onSubmit={handleStep2Next} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Số lượng Cơ sở (Sites) dự kiến
                  </label>
                  <select
                    value={expectedSites}
                    onChange={(e) => setExpectedSites(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                  >
                    <option value="1">1 Cơ sở duy nhất</option>
                    <option value="2-3">2 - 3 Cơ sở</option>
                    <option value="4-10">4 - 10 Cơ sở</option>
                    <option value=">10">&gt; 10 Cơ sở (Chuỗi bãi xe toàn quốc)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Tổng số Làn Barrier (Cổng Vào/Ra)
                  </label>
                  <select
                    value={expectedGates}
                    onChange={(e) => setExpectedGates(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                  >
                    <option value="1-2">1 - 2 Làn Barrier</option>
                    <option value="3-6">3 - 6 Làn Barrier</option>
                    <option value="7-15">7 - 15 Làn Barrier</option>
                    <option value=">15">&gt; 15 Làn Barrier quy mô lớn</option>
                  </select>
                </div>
              </div>

              {/* Plan Choice Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  Chọn gói dùng thử 14 ngày:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    onClick={() => setSelectedPlan('starter')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'starter'
                        ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}
                  >
                    <div className="font-bold text-xs">Gói Starter</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">Tối đa 2 Làn Barrier</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">Phù hợp bãi xe mini, chung cư nhỏ.</p>
                  </div>

                  <div
                    onClick={() => setSelectedPlan('business')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all relative ${
                      selectedPlan === 'business'
                        ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white shadow-md'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}
                  >
                    <span className="absolute -top-2 right-2 px-1.5 py-0.5 rounded bg-[#58a6ff] text-slate-950 text-[9px] font-bold">
                      Khuyên dùng
                    </span>
                    <div className="font-bold text-xs">Gói Business</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">Tới 8 Làn Barrier</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">Rule Engine & Offline Failover.</p>
                  </div>

                  <div
                    onClick={() => setSelectedPlan('enterprise')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'enterprise'
                        ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}
                  >
                    <div className="font-bold text-xs">Gói Enterprise</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">Không giới hạn cổng</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">KCN & Tích hợp ERP chuyên sâu.</p>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  icon={ChevronLeft}
                  onClick={() => setCurrentStep(1)}
                >
                  Quay lại
                </Button>
                <Button type="submit" variant="primary" icon={ArrowRight} className="py-2.5 px-6">
                  Tiếp tục: Tài khoản quản trị
                </Button>
              </div>
            </form>
          )}

          {/* STEP 3: ADMINISTRATOR ACCOUNT & CONFIRMATION */}
          {currentStep === 3 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  Họ và tên người quản trị <span className="text-[#f85149]">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn Hoàng"
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Email đăng nhập <span className="text-[#f85149]">*</span>
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="admin@doanhnghiep.vn"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Số điện thoại liên hệ
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="0912 345 678"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Mật khẩu truy cập <span className="text-[#f85149]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tối thiểu 10 ký tự"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    Xác nhận mật khẩu <span className="text-[#f85149]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Nhập lại mật khẩu"
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                </div>
              </div>

              {/* Agreement Checkbox */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer text-xs text-[#8b949e]">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 rounded border-[#30363d] text-[#58a6ff] focus:ring-0 cursor-pointer"
                  />
                  <span>
                    Tôi đồng ý với{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('terms')}
                      className="text-[#58a6ff] hover:underline"
                    >
                      Điều khoản dịch vụ
                    </button>{' '}
                    và{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('privacy')}
                      className="text-[#58a6ff] hover:underline"
                    >
                      Chính sách bảo mật dữ liệu
                    </button>{' '}
                    của ANPR Cloud.
                  </span>
                </label>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  icon={ChevronLeft}
                  onClick={() => setCurrentStep(2)}
                >
                  Quay lại
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  icon={CheckCircle2}
                  className="py-2.5 px-6 shadow-lg shadow-[#58a6ff]/25"
                >
                  Hoàn tất & Mở Workspace
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Card Footer */}
        <div className="p-4 bg-[#0d0e12] border-t border-[#30363d] text-center text-xs text-[#8b949e] flex items-center justify-between font-mono">
          <span>Cam kết bảo mật dữ liệu AES-256</span>
          <span className="text-[#3fb950] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> Miễn phí 14 ngày dùng thử
          </span>
        </div>
      </div>

      {/* Bottom Legal Links */}
      <div className="max-w-3xl mx-auto w-full text-center text-xs text-[#8b949e] pt-6 flex items-center justify-center gap-6">
        <button onClick={() => onNavigate('privacy')} className="hover:text-white transition-colors">
          Chính sách bảo mật
        </button>
        <span>•</span>
        <button onClick={() => onNavigate('terms')} className="hover:text-white transition-colors">
          Điều khoản sử dụng
        </button>
        <span>•</span>
        <button onClick={() => onNavigate('sla')} className="hover:text-white transition-colors">
          Cam kết SLA 99.9%
        </button>
      </div>
    </div>
  );
};
