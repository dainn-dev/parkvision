import React, { useState, useEffect } from 'react';
import {
  X,
  Building2,
  MapPin,
  Clock,
  Phone,
  Mail,
  User,
  AlertTriangle,
  Globe,
  Compass,
  Save,
  Check,
  Banknote
} from 'lucide-react';
import { Button } from '../ui';
import {
  DEFAULT_SITE_PUBLIC_PROFILE,
  TenantLocation,
  SitePublicProfile
} from '../../types/tenant';
import { useTranslation } from 'react-i18next';

const num = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v) || 0)));
const intOr = (v: string, dflt: number): number =>
  v.trim() === '' ? dflt : Math.max(0, Math.round(Number(v) || 0));
const clampHour = (v: string, dflt: number): number => Math.min(23, Math.max(0, intOr(v, dflt)));

interface EditLocationSheetProps {
  isOpen: boolean;
  onClose: () => void;
  location: TenantLocation;
  onSave: (updatedData: Partial<TenantLocation>) => void;
}

export const EditLocationSheet: React.FC<EditLocationSheetProps> = ({
  isOpen,
  onClose,
  location,
  onSave
}) => {
  const { t } = useTranslation('tenant');
  const clean = (v: string | undefined) => (v === '—' || v === 'No site configured' ? '' : v) ?? '';
  const [formData, setFormData] = useState({
    name: clean(location.name),
    code: clean(location.code),
    line1: clean(location.address.line1),
    line2: clean(location.address.line2),
    city: clean(location.address.city),
    province: clean(location.address.province),
    postalCode: clean(location.address.postalCode),
    country: clean(location.address.country),
    timezone: clean(location.timezone),
    latitude: location.latitude.toString(),
    longitude: location.longitude.toString(),
    phone: clean(location.phone),
    email: clean(location.email),
    emergencyContact: clean(location.emergencyContact),
    contactPerson: clean(location.contactPerson),
    capacity: (location.capacity || 0).toString(),
    description: location.description === 'Create a site to activate this location.' ? '' : location.description || '',
    // --- public listing & pricing (tenant_sites.public_profile) ---
    // Sites with no configured profile are listed by default — defaulting to
    // false would silently hide an operating site from the driver app on save.
    listed: location.publicProfile?.listed ?? true,
    publicDescription: location.publicProfile?.description ?? '',
    imageUrl: location.publicProfile?.imageUrl ?? '',
    parkingType: location.publicProfile?.parkingType ?? '',
    facilitiesCsv: (location.publicProfile?.facilities ?? []).join(', '),
    hourlyFrom: location.publicProfile?.pricing?.hourlyFrom?.toString() ?? '',
    dailyFrom: location.publicProfile?.pricing?.dailyFrom?.toString() ?? '',
    overnightFrom: location.publicProfile?.pricing?.overnightFrom?.toString() ?? '',
    monthlyFrom: location.publicProfile?.pricing?.monthlyFrom?.toString() ?? '',
    graceMinutes: (location.publicProfile?.pricing?.graceMinutes ?? 0).toString(),
    blockMinutes: (location.publicProfile?.pricing?.blockMinutes ?? 60).toString(),
    overnightStartHour: (location.publicProfile?.pricing?.overnightStartHour ?? 22).toString(),
    overnightEndHour: (location.publicProfile?.pricing?.overnightEndHour ?? 6).toString(),
    bankBin: location.bankAccount?.bin ?? '',
    bankAccountNumber: location.bankAccount?.accountNumber ?? '',
    bankAccountName: location.bankAccount?.accountName ?? ''
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: clean(location.name),
        code: clean(location.code),
        line1: clean(location.address.line1),
        line2: clean(location.address.line2),
        city: clean(location.address.city),
        province: clean(location.address.province),
        postalCode: clean(location.address.postalCode),
        country: clean(location.address.country),
        timezone: clean(location.timezone),
        latitude: location.latitude.toString(),
        longitude: location.longitude.toString(),
        phone: clean(location.phone),
        email: clean(location.email),
        emergencyContact: clean(location.emergencyContact),
        contactPerson: clean(location.contactPerson),
        capacity: (location.capacity || 0).toString(),
        description: location.description === 'Create a site to activate this location.' ? '' : location.description || '',
        // Sites with no configured profile are listed by default — defaulting to
    // false would silently hide an operating site from the driver app on save.
    listed: location.publicProfile?.listed ?? true,
        publicDescription: location.publicProfile?.description ?? '',
        imageUrl: location.publicProfile?.imageUrl ?? '',
        parkingType: location.publicProfile?.parkingType ?? '',
        facilitiesCsv: (location.publicProfile?.facilities ?? []).join(', '),
        hourlyFrom: location.publicProfile?.pricing?.hourlyFrom?.toString() ?? '',
        dailyFrom: location.publicProfile?.pricing?.dailyFrom?.toString() ?? '',
        overnightFrom: location.publicProfile?.pricing?.overnightFrom?.toString() ?? '',
        monthlyFrom: location.publicProfile?.pricing?.monthlyFrom?.toString() ?? '',
        graceMinutes: (location.publicProfile?.pricing?.graceMinutes ?? 0).toString(),
        blockMinutes: (location.publicProfile?.pricing?.blockMinutes ?? 60).toString(),
        overnightStartHour: (location.publicProfile?.pricing?.overnightStartHour ?? 22).toString(),
        overnightEndHour: (location.publicProfile?.pricing?.overnightEndHour ?? 6).toString(),
        bankBin: location.bankAccount?.bin ?? '',
        bankAccountNumber: location.bankAccount?.accountNumber ?? '',
        bankAccountName: location.bankAccount?.accountName ?? ''
      });
      setErrors({});
      setIsDirty(false);
      setShowDiscardConfirm(false);
    }
  }, [isOpen, location]);

  if (!isOpen) return null;

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim() || formData.name.trim().length < 3) {
      errs.name = t('Location name must be at least 3 characters long.');
    } else if (formData.name.trim().length > 100) {
      errs.name = t('Location name cannot exceed 100 characters.');
    }

    if (!formData.line1.trim()) {
      errs.line1 = t('Address line 1 is required.');
    }

    if (!formData.city.trim()) {
      errs.city = t('City is required.');
    }

    if (!formData.country.trim()) {
      errs.country = t('Country is required.');
    }

    if (!formData.timezone.trim()) {
      errs.timezone = t('Timezone is required.');
    }

    const lat = parseFloat(formData.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errs.latitude = t('Latitude must be between -90 and 90.');
    }

    const lng = parseFloat(formData.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errs.longitude = t('Longitude must be between -180 and 180.');
    }

    if (formData.email && !formData.email.includes('@')) {
      errs.email = t('Please provide a valid email address.');
    }

    const bankBin = formData.bankBin.trim();
    const bankNumber = formData.bankAccountNumber.trim();
    const bankName = formData.bankAccountName.trim();
    const bankFilled = [bankBin, bankNumber, bankName].filter(Boolean).length;
    if (bankFilled > 0 && bankFilled < 3) {
      errs.bankAccount = t('Fill in all three fields or leave all three empty.');
    } else if (bankFilled === 3) {
      if (!/^\d{6}$/.test(bankBin)) errs.bankAccount = t('BIN must be exactly 6 digits.');
      else if (!/^\d{6,19}$/.test(bankNumber)) errs.bankAccount = t('Account number must be 6 to 19 digits.');
      else if (bankName.length > 50) errs.bankAccount = t('Account name cannot exceed 50 characters.');
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const pricing = {
      hourlyFrom: num(formData.hourlyFrom),
      dailyFrom: num(formData.dailyFrom),
      overnightFrom: num(formData.overnightFrom),
      monthlyFrom: num(formData.monthlyFrom),
      graceMinutes: intOr(formData.graceMinutes, 0),
      blockMinutes: Math.max(5, intOr(formData.blockMinutes, 60)),
      overnightStartHour: clampHour(formData.overnightStartHour, 22),
      overnightEndHour: clampHour(formData.overnightEndHour, 6)
    };
    const publicProfile: SitePublicProfile = {
      ...DEFAULT_SITE_PUBLIC_PROFILE,
      ...(location.publicProfile ?? {}),
      listed: formData.listed,
      description: formData.publicDescription.trim() || null,
      imageUrl: formData.imageUrl.trim() || null,
      parkingType: (formData.parkingType || null) as SitePublicProfile['parkingType'],
      facilities: formData.facilitiesCsv
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      pricing
    };

    const bankAccount = formData.bankBin.trim()
      ? {
          bin: formData.bankBin.trim(),
          accountNumber: formData.bankAccountNumber.trim(),
          accountName: formData.bankAccountName.trim().toUpperCase()
        }
      : null;

    setIsSaving(true);
    setTimeout(() => {
      onSave({
        name: formData.name.trim(),
        publicProfile,
        bankAccount,
        address: {
          line1: formData.line1.trim(),
          line2: formData.line2.trim(),
          city: formData.city.trim(),
          province: formData.province.trim(),
          postalCode: formData.postalCode.trim(),
          country: formData.country.trim()
        },
        timezone: formData.timezone.trim(),
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        emergencyContact: formData.emergencyContact.trim(),
        contactPerson: formData.contactPerson.trim(),
        capacity: parseInt(formData.capacity, 10) || 800,
        description: formData.description.trim()
      });
      setIsSaving(false);
      onClose();
    }, 400);
  };

  const handleCloseAttempt = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/70 transition-opacity duration-[330ms] animate-in fade-in"
        onClick={handleCloseAttempt}
      />

      {/* Slide-over Container */}
      <div className="relative w-full max-w-xl bg-card border-l border-border h-full flex flex-col z-10 animate-in slide-in-from-right duration-[330ms]">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-background/80 ">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-medium text-foreground tracking-tight">{t('Edit Location')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('Update physical address, timezone, coordinates, and contact info')}
              </p>
            </div>
          </div>

          <button
            onClick={handleCloseAttempt}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Section 1: General Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <Building2 className="w-4 h-4 text-primary" />
              <h3>{t('General Location Details')}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium text-foreground flex items-center justify-between">
                  <span>{t('Location Name')} *</span>
                  <span className="text-[11px] text-muted-foreground">{t('3–100 characters')}</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder={t('e.g. Main Campus')}
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden ${
                    errors.name ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.name && <p className="text-[11px] text-destructive">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">
                  {t('Location Code (Read-only)')}
                </label>
                <input
                  type="text"
                  value={formData.code}
                  readOnly
                  disabled
                  className="w-full bg-background/60 border border-border/50 rounded-lg px-3 py-2 text-muted-foreground text-xs cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {t('Facility Description / Notes')}
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder={t('Brief description of the facility operations, gates, and usage...')}
                className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden resize-none"
              />
            </div>
          </div>

          {/* Section 2: Address Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <MapPin className="w-4 h-4 text-success" />
              <h3>{t('Physical Address')}</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {t('Address Line 1')} *
              </label>
              <input
                type="text"
                value={formData.line1}
                onChange={(e) => handleChange('line1', e.target.value)}
                placeholder={t('Street address, building number')}
                className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden ${
                  errors.line1 ? 'border-destructive' : 'border-border focus:border-primary'
                }`}
              />
              {errors.line1 && <p className="text-[11px] text-destructive">{errors.line1}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">
                {t('Address Line 2 (Optional)')}
              </label>
              <input
                type="text"
                value={formData.line2}
                onChange={(e) => handleChange('line2', e.target.value)}
                placeholder={t('District, Suite, Floor, Gate number')}
                className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('City')} *</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Ho Chi Minh City"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden ${
                    errors.city ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.city && <p className="text-[11px] text-destructive">{errors.city}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Province / State')}</label>
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) => handleChange('province', e.target.value)}
                  placeholder="Ho Chi Minh"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Postal Code')}</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  placeholder="70000"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden "
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Country')} *</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  placeholder="Vietnam"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden ${
                    errors.country ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.country && <p className="text-[11px] text-destructive">{errors.country}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Timezone')} *</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden cursor-pointer"
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+07:00)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok (UTC+07:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (UTC+08:00)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (UTC+09:00)</option>
                  <option value="Europe/London">Europe/London (UTC+00:00)</option>
                  <option value="America/New_York">America/New_York (UTC-05:00)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (UTC-08:00)</option>
                </select>
                <p className="text-[11px] text-muted-foreground">
                  {t('Controls scheduled access rules, timestamps, and reporting periods.')}
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Geographic Coordinates */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <Compass className="w-4 h-4 text-warning" />
              <h3>{t('Geographic Coordinates')}</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Latitude (-90 to 90)')} *</label>
                <input
                  type="text"
                  value={formData.latitude}
                  onChange={(e) => handleChange('latitude', e.target.value)}
                  placeholder="10.7769"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden ${
                    errors.latitude ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.latitude && <p className="text-[11px] text-destructive">{errors.latitude}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Longitude (-180 to 180)')} *</label>
                <input
                  type="text"
                  value={formData.longitude}
                  onChange={(e) => handleChange('longitude', e.target.value)}
                  placeholder="106.7009"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden ${
                    errors.longitude ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.longitude && <p className="text-[11px] text-destructive">{errors.longitude}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Contact & Operations */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <Phone className="w-4 h-4 text-chart-5" />
              <h3>{t('Contact Information & Capacity')}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Contact Person / Facility Manager')}</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => handleChange('contactPerson', e.target.value)}
                  placeholder="e.g. Le Hoang Nam"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Total Slot Capacity')}</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => handleChange('capacity', e.target.value)}
                  placeholder="800"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Facility Phone')}</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+84 90 311 2233"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden "
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Operational Email')}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="parking@example.com"
                  className={`w-full bg-background border rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden ${
                    errors.email ? 'border-destructive' : 'border-border focus:border-primary'
                  }`}
                />
                {errors.email && <p className="text-[11px] text-destructive">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Emergency Hotline')}</label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  placeholder="+84 91 844 5566"
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden "
                />
              </div>
            </div>
          </div>

          {/* Section 5: Public listing & session pricing (driver app) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <Globe className="w-4 h-4 text-chart-5" />
              <h3>{t('Driver App Listing & Pricing')}</h3>
            </div>

            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.listed}
                onChange={(e) => {
                  setFormData((prev) => ({ ...prev, listed: e.target.checked }));
                  setIsDirty(true);
                }}
                className="mt-0.5 accent-[#58a6ff]"
              />
              <span>
                <span className="block text-[11px] font-medium text-foreground">
                  {t('List this site in the driver app')}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {t('When off, the site is hidden from discovery and membership plans cannot be requested.')}
                </span>
              </span>
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Parking Type')}</label>
                <select
                  value={formData.parkingType}
                  onChange={(e) => handleChange('parkingType', e.target.value)}
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs focus:outline-hidden cursor-pointer"
                >
                  <option value="">{t('Not specified')}</option>
                  <option value="indoor">{t('Indoor')}</option>
                  <option value="outdoor">{t('Outdoor')}</option>
                  <option value="covered">{t('Covered')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Listing image URL')}</label>
                <input
                  type="text"
                  value={formData.imageUrl}
                  onChange={(e) => handleChange('imageUrl', e.target.value)}
                  placeholder="https://..."
                  className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden "
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">{t('Public description (shown in app)')}</label>
              <textarea
                rows={2}
                value={formData.publicDescription}
                onChange={(e) => handleChange('publicDescription', e.target.value)}
                placeholder={t('Short public description shown to drivers...')}
                className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">{t('Facilities (comma-separated)')}</label>
              <input
                type="text"
                value={formData.facilitiesCsv}
                onChange={(e) => handleChange('facilitiesCsv', e.target.value)}
                placeholder="CCTV, Security, EV Charging, 24/7"
                className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-foreground">{t('Hourly rate (VND)')}</label>
                <input type="number" min="0" value={formData.hourlyFrom} onChange={(e) => handleChange('hourlyFrom', e.target.value)} placeholder="20000" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
                <p className="text-[11px] text-muted-foreground">{t('Empty = fee not estimated')}</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Daily cap (VND)')}</label>
                <input type="number" min="0" value={formData.dailyFrom} onChange={(e) => handleChange('dailyFrom', e.target.value)} placeholder="100000" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Overnight fee (VND)')}</label>
                <input type="number" min="0" value={formData.overnightFrom} onChange={(e) => handleChange('overnightFrom', e.target.value)} placeholder="80000" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Monthly from (VND)')}</label>
                <input type="number" min="0" value={formData.monthlyFrom} onChange={(e) => handleChange('monthlyFrom', e.target.value)} placeholder="1500000" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Free grace (min)')}</label>
                <input type="number" min="0" value={formData.graceMinutes} onChange={(e) => handleChange('graceMinutes', e.target.value)} placeholder="0" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Billing block (min)')}</label>
                <input type="number" min="5" value={formData.blockMinutes} onChange={(e) => handleChange('blockMinutes', e.target.value)} placeholder="60" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Overnight from (hour)')}</label>
                <input type="number" min="0" max="23" value={formData.overnightStartHour} onChange={(e) => handleChange('overnightStartHour', e.target.value)} placeholder="22" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">{t('Overnight to (hour)')}</label>
                <input type="number" min="0" max="23" value={formData.overnightEndHour} onChange={(e) => handleChange('overnightEndHour', e.target.value)} placeholder="6" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t('Session fees in the driver app are estimates computed from these rules; the cashier confirms the final amount at exit.')}
            </p>
          </div>
          {/* Section 6: Bank account for walk-in transfers (VietQR) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-foreground font-medium border-b border-border pb-2">
              <Banknote className="w-4 h-4 text-success" />
              <h3>{t('Bank transfer account')}</h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {t('Walk-in drivers pay by scanning a VietQR code that pays into this account. Leave all three empty to disable bank transfer.')}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="bank-bin" className="text-[11px] font-medium text-muted-foreground">{t('Bank code (BIN)')}</label>
                <input id="bank-bin" type="text" inputMode="numeric" maxLength={6} value={formData.bankBin} onChange={(e) => handleChange('bankBin', e.target.value)} placeholder="970436" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="bank-number" className="text-[11px] font-medium text-muted-foreground">{t('Account number')}</label>
                <input id="bank-number" type="text" inputMode="numeric" maxLength={19} value={formData.bankAccountNumber} onChange={(e) => handleChange('bankAccountNumber', e.target.value)} placeholder="0123456789" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="bank-name" className="text-[11px] font-medium text-muted-foreground">{t('Account holder name')}</label>
                <input id="bank-name" type="text" maxLength={50} value={formData.bankAccountName} onChange={(e) => handleChange('bankAccountName', e.target.value)} placeholder="NGUYEN VAN A" className="w-full bg-background border border-border focus:border-primary rounded-lg px-3 py-2 text-foreground text-xs placeholder-muted-foreground focus:outline-hidden " />
              </div>
            </div>
            {errors.bankAccount && <p className="text-[11px] text-destructive">{errors.bankAccount}</p>}
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-border bg-background flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCloseAttempt}
            className="text-xs text-muted-foreground hover:text-foreground border-border"
          >
            {t('Cancel')}
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            onClick={handleSubmit}
            className="text-xs bg-primary hover:bg-primary/90 text-[#fff] gap-1.5 font-medium"
          >
            <Save className="w-3.5 h-3.5" />
            {t('Save Changes')}
          </Button>
        </div>

        {/* Discard Changes Warning Overlay */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-20 animate-in fade-in duration-[330ms]">
            <div className="bg-card border border-destructive/40 rounded-2xl p-5 max-w-sm w-full space-y-4 ">
              <div className="flex items-center gap-3 text-destructive">
                <div className="w-10 h-10 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-medium text-sm text-foreground">{t('Unsaved Changes')}</h4>
                  <p className="text-xs text-muted-foreground">
                    {t('You have modified location details. Are you sure you want to discard them?')}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="text-xs border-border text-foreground"
                >
                  {t('Keep Editing')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="text-xs bg-destructive/15 hover:bg-destructive/30 text-destructive border-destructive/40"
                >
                  {t('Discard Changes')}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
