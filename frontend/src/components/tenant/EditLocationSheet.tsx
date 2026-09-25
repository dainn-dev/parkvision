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
  Check
} from 'lucide-react';
import { Button } from '../ui';
import { TenantLocation } from '../../types/tenant';

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
    description: location.description === 'Create a site to activate this location.' ? '' : location.description || ''
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
        description: location.description === 'Create a site to activate this location.' ? '' : location.description || ''
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
      errs.name = 'Location name must be at least 3 characters long.';
    } else if (formData.name.trim().length > 100) {
      errs.name = 'Location name cannot exceed 100 characters.';
    }

    if (!formData.line1.trim()) {
      errs.line1 = 'Address line 1 is required.';
    }

    if (!formData.city.trim()) {
      errs.city = 'City is required.';
    }

    if (!formData.country.trim()) {
      errs.country = 'Country is required.';
    }

    if (!formData.timezone.trim()) {
      errs.timezone = 'Timezone is required.';
    }

    const lat = parseFloat(formData.latitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      errs.latitude = 'Latitude must be between -90 and 90.';
    }

    const lng = parseFloat(formData.longitude);
    if (isNaN(lng) || lng < -180 || lng > 180) {
      errs.longitude = 'Longitude must be between -180 and 180.';
    }

    if (formData.email && !formData.email.includes('@')) {
      errs.email = 'Please provide a valid email address.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    setTimeout(() => {
      onSave({
        name: formData.name.trim(),
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
        className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity duration-300 animate-in fade-in"
        onClick={handleCloseAttempt}
      />

      {/* Slide-over Container */}
      <div className="relative w-full max-w-xl bg-[#161b22] border-l border-[#30363d] h-full shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 border-b border-[#30363d] flex items-center justify-between bg-[#0d0e12]/80 backdrop-blur-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#58a6ff]/15 border border-[#58a6ff]/30 text-[#58a6ff] flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">Edit Location</h2>
              <p className="text-xs text-[#8b949e]">
                Update physical address, timezone, coordinates, and contact info
              </p>
            </div>
          </div>

          <button
            onClick={handleCloseAttempt}
            className="p-1.5 rounded-lg text-[#8b949e] hover:text-white hover:bg-[#21262d] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Section 1: General Info */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d] pb-2">
              <Building2 className="w-4 h-4 text-[#58a6ff]" />
              <h3>General Location Details</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9] flex items-center justify-between">
                  <span>Location Name *</span>
                  <span className="text-[10px] text-[#8b949e]">3–100 characters</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g. Main Campus"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden ${
                    errors.name ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.name && <p className="text-[10px] text-[#f85149]">{errors.name}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#8b949e]">
                  Location Code (Read-only)
                </label>
                <input
                  type="text"
                  value={formData.code}
                  readOnly
                  disabled
                  className="w-full bg-[#0d0e12]/60 border border-[#30363d]/50 rounded-lg px-3 py-2 text-[#8b949e] text-xs font-mono cursor-not-allowed"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#c9d1d9]">
                Facility Description / Notes
              </label>
              <textarea
                rows={2}
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                placeholder="Brief description of the facility operations, gates, and usage..."
                className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden resize-none"
              />
            </div>
          </div>

          {/* Section 2: Address Information */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d] pb-2">
              <MapPin className="w-4 h-4 text-[#3fb950]" />
              <h3>Physical Address</h3>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#c9d1d9]">
                Address Line 1 *
              </label>
              <input
                type="text"
                value={formData.line1}
                onChange={(e) => handleChange('line1', e.target.value)}
                placeholder="Street address, building number"
                className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden ${
                  errors.line1 ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                }`}
              />
              {errors.line1 && <p className="text-[10px] text-[#f85149]">{errors.line1}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[#8b949e]">
                Address Line 2 (Optional)
              </label>
              <input
                type="text"
                value={formData.line2}
                onChange={(e) => handleChange('line2', e.target.value)}
                placeholder="District, Suite, Floor, Gate number"
                className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">City *</label>
                <input
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Ho Chi Minh City"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden ${
                    errors.city ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.city && <p className="text-[10px] text-[#f85149]">{errors.city}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#8b949e]">Province / State</label>
                <input
                  type="text"
                  value={formData.province}
                  onChange={(e) => handleChange('province', e.target.value)}
                  placeholder="Ho Chi Minh"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#8b949e]">Postal Code</label>
                <input
                  type="text"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  placeholder="70000"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Country *</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => handleChange('country', e.target.value)}
                  placeholder="Vietnam"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden ${
                    errors.country ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.country && <p className="text-[10px] text-[#f85149]">{errors.country}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Timezone *</label>
                <select
                  value={formData.timezone}
                  onChange={(e) => handleChange('timezone', e.target.value)}
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden cursor-pointer"
                >
                  <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (UTC+07:00)</option>
                  <option value="Asia/Bangkok">Asia/Bangkok (UTC+07:00)</option>
                  <option value="Asia/Singapore">Asia/Singapore (UTC+08:00)</option>
                  <option value="Asia/Tokyo">Asia/Tokyo (UTC+09:00)</option>
                  <option value="Europe/London">Europe/London (UTC+00:00)</option>
                  <option value="America/New_York">America/New_York (UTC-05:00)</option>
                  <option value="America/Los_Angeles">America/Los_Angeles (UTC-08:00)</option>
                </select>
                <p className="text-[10px] text-[#8b949e]">
                  Controls scheduled access rules, timestamps, and reporting periods.
                </p>
              </div>
            </div>
          </div>

          {/* Section 3: Geographic Coordinates */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d] pb-2">
              <Compass className="w-4 h-4 text-[#e3b341]" />
              <h3>Geographic Coordinates</h3>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Latitude (-90 to 90) *</label>
                <input
                  type="text"
                  value={formData.latitude}
                  onChange={(e) => handleChange('latitude', e.target.value)}
                  placeholder="10.7769"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-hidden ${
                    errors.latitude ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.latitude && <p className="text-[10px] text-[#f85149]">{errors.latitude}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Longitude (-180 to 180) *</label>
                <input
                  type="text"
                  value={formData.longitude}
                  onChange={(e) => handleChange('longitude', e.target.value)}
                  placeholder="106.7009"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-hidden ${
                    errors.longitude ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.longitude && <p className="text-[10px] text-[#f85149]">{errors.longitude}</p>}
              </div>
            </div>
          </div>

          {/* Section 4: Contact & Operations */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-white font-semibold border-b border-[#30363d] pb-2">
              <Phone className="w-4 h-4 text-[#a371f7]" />
              <h3>Contact Information & Capacity</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Contact Person / Facility Manager</label>
                <input
                  type="text"
                  value={formData.contactPerson}
                  onChange={(e) => handleChange('contactPerson', e.target.value)}
                  placeholder="e.g. Le Hoang Nam"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Total Slot Capacity</label>
                <input
                  type="number"
                  value={formData.capacity}
                  onChange={(e) => handleChange('capacity', e.target.value)}
                  placeholder="800"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Facility Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+84 90 311 2233"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Operational Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="parking@example.com"
                  className={`w-full bg-[#0d0e12] border rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden ${
                    errors.email ? 'border-[#f85149]' : 'border-[#30363d] focus:border-[#58a6ff]'
                  }`}
                />
                {errors.email && <p className="text-[10px] text-[#f85149]">{errors.email}</p>}
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-[#c9d1d9]">Emergency Hotline</label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => handleChange('emergencyContact', e.target.value)}
                  placeholder="+84 91 844 5566"
                  className="w-full bg-[#0d0e12] border border-[#30363d] focus:border-[#58a6ff] rounded-lg px-3 py-2 text-white text-xs placeholder-[#8b949e] focus:outline-hidden font-mono"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#30363d] bg-[#0d0e12] flex items-center justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCloseAttempt}
            className="text-xs text-[#8b949e] hover:text-white border-[#30363d]"
          >
            Cancel
          </Button>

          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={isSaving}
            onClick={handleSubmit}
            className="text-xs bg-[#238636] hover:bg-[#2ea043] text-white gap-1.5 font-semibold"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </Button>
        </div>

        {/* Discard Changes Warning Overlay */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-6 z-20 animate-in fade-in duration-200">
            <div className="bg-[#161b22] border border-[#f85149]/40 rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-2xl">
              <div className="flex items-center gap-3 text-[#f85149]">
                <div className="w-10 h-10 rounded-xl bg-[#f85149]/15 border border-[#f85149]/30 flex items-center justify-center shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">Unsaved Changes</h4>
                  <p className="text-xs text-[#8b949e]">
                    You have modified location details. Are you sure you want to discard them?
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowDiscardConfirm(false)}
                  className="text-xs border-[#30363d] text-[#c9d1d9]"
                >
                  Keep Editing
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowDiscardConfirm(false);
                    onClose();
                  }}
                  className="text-xs bg-[#da3633]/15 hover:bg-[#da3633]/30 text-[#f85149] border-[#da3633]/40"
                >
                  Discard Changes
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
