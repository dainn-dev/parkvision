import React, { useEffect, useState } from 'react';
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
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '../../components/common/LanguageSwitcher';

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
  const { t } = useTranslation('auth');

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
  const [slugCheck, setSlugCheck] = useState<{ available: boolean; slug?: string | null; reason?: string | null } | null>(null);

  // Debounced slug availability check (GET /tenants/check-code)
  useEffect(() => {
    if (!slug || slug.length < 2) {
      setSlugCheck(null);
      return;
    }
    const t = setTimeout(() => {
      publicApi
        .checkCode(slug)
        .then((r) => setSlugCheck({ available: r.available, slug: r.slug, reason: r.reason }))
        .catch(() => setSlugCheck(null));
    }, 350);
    return () => clearTimeout(t);
  }, [slug]);

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
      setErrorMessage(t('Please enter your company or building name.'));
      return;
    }
    if (slugCheck && !slugCheck.available) {
      setErrorMessage(
        slugCheck.reason === 'invalid_slug'
          ? t('Tenant code may only contain lowercase letters, numbers and hyphens.')
          : t('This tenant code is already taken — please choose another.')
      );
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
      setErrorMessage(t('Please fill in full name, email and password.'));
      return;
    }
    if (password.length < 10) {
      setErrorMessage(t('Password must be at least 10 characters.'));
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage(t('Passwords do not match.'));
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage(t('Please agree to the Terms of Service and Privacy Policy.'));
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
        setErrorMessage(res.message || t('Registration succeeded but auto sign-in failed — please sign in manually.'));
        onNavigate('login');
        return;
      }

      setTenantNavTab('dashboard');

      addToast({
        type: 'success',
        title: t('Tenant created successfully!'),
        description: t('Welcome {{org}}! Your tenant has been registered.', { org: orgName })
      });

      if (onRegistrationSuccess) {
        onRegistrationSuccess();
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t('Registration failed. Please try again.');
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
          <span>{t('Back to Home')}</span>
        </button>

        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <span className="text-xs text-[#8b949e]">{t('Already have an account?')}</span>
          <button
            onClick={() => onNavigate('login')}
            className="text-xs font-bold text-[#58a6ff] hover:underline cursor-pointer"
          >
            {t('Sign in now')}
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
                  {t('Register for ANPR Cloud')}
                </h2>
                <p className="text-xs text-[#8b949e]">
                  {t('14-day free trial • No credit card required')}
                </p>
              </div>
            </div>
            <Badge variant="emerald" size="sm" className="font-mono text-[10px]">
              {t('Step {{step}} / 3', { step: currentStep })}
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
                  {t('Business / Building / Parking Lot Name')} <span className="text-[#f85149]">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={orgName}
                    onChange={(e) => handleOrgNameChange(e.target.value)}
                    placeholder={t('e.g. Central Point Tower')}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff] focus:ring-1 focus:ring-[#58a6ff]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  {t('Tenant Identifier (Subdomain Slug)')}
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
                {slugCheck && (
                  <p className={`text-[11px] mt-1 ${slugCheck.available ? 'text-[#3fb950]' : 'text-[#f85149]'}`}>
                    {slugCheck.available
                      ? t('✓ anpr.cloud/{{slug}} is available', { slug: slugCheck.slug ?? slug })
                      : slugCheck.reason === 'invalid_slug'
                        ? t('✗ Only lowercase letters, numbers and hyphens (a-z, 0-9, -)')
                        : t('✗ This identifier is already taken')}
                  </p>
                )}
                <p className="text-[11px] text-[#8b949e] mt-1">{t('Used to isolate your data securely (Multi-Tenant RLS).')}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  {t('Facility Type')}
                </label>
                <select
                  value={orgType}
                  onChange={(e) => setOrgType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                >
                  <option value="OFFICE_BUILDING">{t('Office Building & Shopping Mall')}</option>
                  <option value="RESIDENTIAL">{t('Residential Area & Premium Apartments')}</option>
                  <option value="INDUSTRIAL">{t('Industrial Park & Logistics Warehouse')}</option>
                  <option value="PARKING_LOT">{t('Smart Commercial Parking Lot')}</option>
                  <option value="HOSPITAL_CAMPUS">{t('Hospital, School & Government Office')}</option>
                </select>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" variant="primary" icon={ArrowRight} className="py-2.5 px-6">
                  {t('Continue: Parking Scale')}
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
                    {t('Expected Number of Sites')}
                  </label>
                  <select
                    value={expectedSites}
                    onChange={(e) => setExpectedSites(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                  >
                    <option value="1">{t('1 Single Site')}</option>
                    <option value="2-3">{t('2 - 3 Sites')}</option>
                    <option value="4-10">{t('4 - 10 Sites')}</option>
                    <option value=">10">{t('> 10 Sites (Nationwide parking chain)')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    {t('Total Barrier Lanes (Entry/Exit Gates)')}
                  </label>
                  <select
                    value={expectedGates}
                    onChange={(e) => setExpectedGates(e.target.value)}
                    className="w-full px-3 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white focus:outline-none focus:border-[#58a6ff]"
                  >
                    <option value="1-2">{t('1 - 2 Barrier Lanes')}</option>
                    <option value="3-6">{t('3 - 6 Barrier Lanes')}</option>
                    <option value="7-15">{t('7 - 15 Barrier Lanes')}</option>
                    <option value=">15">{t('> 15 Large-scale Barrier Lanes')}</option>
                  </select>
                </div>
              </div>

              {/* Plan Choice Cards */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-white">
                  {t('Choose your 14-day trial plan:')}
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
                    <div className="font-bold text-xs">{t('Starter Plan')}</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">{t('Up to 2 Barrier Lanes')}</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">{t('Fits small lots & condos.')}</p>
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
                      {t('Recommended')}
                    </span>
                    <div className="font-bold text-xs">{t('Business Plan')}</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">{t('Up to 8 Barrier Lanes')}</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">{t('Rule Engine & Offline Failover.')}</p>
                  </div>

                  <div
                    onClick={() => setSelectedPlan('enterprise')}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      selectedPlan === 'enterprise'
                        ? 'bg-[#58a6ff]/10 border-[#58a6ff] text-white'
                        : 'bg-[#0d0e12] border-[#30363d] text-[#8b949e] hover:border-[#484f58]'
                    }`}
                  >
                    <div className="font-bold text-xs">{t('Enterprise Plan')}</div>
                    <div className="text-[11px] font-mono text-[#58a6ff] mt-0.5">{t('Unlimited gates')}</div>
                    <p className="text-[10px] mt-1 text-[#8b949e]">{t('Industrial parks & deep ERP integration.')}</p>
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
                  {t('Back')}
                </Button>
                <Button type="submit" variant="primary" icon={ArrowRight} className="py-2.5 px-6">
                  {t('Continue: Admin Account')}
                </Button>
              </div>
            </form>
          )}

          {/* STEP 3: ADMINISTRATOR ACCOUNT & CONFIRMATION */}
          {currentStep === 3 && (
            <form onSubmit={handleFinalSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-white mb-1.5">
                  {t('Administrator Full Name')} <span className="text-[#f85149]">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    placeholder={t('e.g. Nguyen Van Hoang')}
                    className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    {t('Sign-in Email')} <span className="text-[#f85149]">*</span>
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
                    {t('Contact Phone Number')}
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
                    {t('Access Password')} <span className="text-[#f85149]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('At least 10 characters')}
                      className="w-full pl-10 pr-4 py-2.5 bg-[#0d0e12] border border-[#30363d] rounded-xl text-xs sm:text-sm text-white placeholder-[#8b949e] focus:outline-none focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-white mb-1.5">
                    {t('Confirm Password')} <span className="text-[#f85149]">*</span>
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8b949e] absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={t('Re-enter password')}
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
                    {t('I agree to the')}{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('terms')}
                      className="text-[#58a6ff] hover:underline"
                    >
                      {t('Terms of Service')}
                    </button>{' '}
                    {t('and')}{' '}
                    <button
                      type="button"
                      onClick={() => onNavigate('privacy')}
                      className="text-[#58a6ff] hover:underline"
                    >
                      {t('Data Privacy Policy')}
                    </button>{' '}
                    {t('of ANPR Cloud.')}
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
                  {t('Back')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isLoading}
                  icon={CheckCircle2}
                  className="py-2.5 px-6 shadow-lg shadow-[#58a6ff]/25"
                >
                  {t('Finish & Open Workspace')}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Card Footer */}
        <div className="p-4 bg-[#0d0e12] border-t border-[#30363d] text-center text-xs text-[#8b949e] flex items-center justify-between font-mono">
          <span>{t('AES-256 Data Security Commitment')}</span>
          <span className="text-[#3fb950] flex items-center gap-1">
            <Check className="w-3.5 h-3.5" /> {t('14-day free trial')}
          </span>
        </div>
      </div>

      {/* Bottom Legal Links */}
      <div className="max-w-3xl mx-auto w-full text-center text-xs text-[#8b949e] pt-6 flex items-center justify-center gap-6">
        <button onClick={() => onNavigate('privacy')} className="hover:text-white transition-colors">
          {t('Privacy Policy')}
        </button>
        <span>•</span>
        <button onClick={() => onNavigate('terms')} className="hover:text-white transition-colors">
          {t('Terms of Service')}
        </button>
        <span>•</span>
        <button onClick={() => onNavigate('sla')} className="hover:text-white transition-colors">
          {t('99.9% SLA Commitment')}
        </button>
      </div>
    </div>
  );
};
