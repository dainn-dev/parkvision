import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { SettingsSection } from '../../types/platform';
import {
  Settings,
  Lock,
  ShieldCheck,
  Database,
  Bell,
  Check,
  RotateCcw
} from 'lucide-react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Input,
  Select,
  Switch
} from '../../components/ui';

export const PlatformSettingsPage: React.FC = () => {
  const { settings, updateSettings, settingsSection, setSettingsSection, openMfaModal } = usePlatform();

  const [formData, setFormData] = useState<any>(settings[settingsSection]);

  const handleSectionChange = (section: SettingsSection) => {
    setSettingsSection(section);
    setFormData(settings[section]);
  };

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    updateSettings(settingsSection, formData);
  };

  const handleReset = () => {
    setFormData(settings[settingsSection]);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Title */}
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-indigo-400" /> Platform Global Settings
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Configure multi-tenant default security policies, token lifetimes, storage retention, and notification defaults.
        </p>
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Left Sub-Navigation */}
        <Card className="p-2 h-fit">
          <div className="space-y-1 text-xs font-medium">
            <button
              onClick={() => handleSectionChange('general')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                settingsSection === 'general'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>General Defaults</span>
            </button>

            <button
              onClick={() => handleSectionChange('authentication')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                settingsSection === 'authentication'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Authentication</span>
            </button>

            <button
              onClick={() => handleSectionChange('security')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                settingsSection === 'security'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Security Policy</span>
            </button>

            <button
              onClick={() => handleSectionChange('storage')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                settingsSection === 'storage'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Database className="w-4 h-4 text-sky-400" />
              <span>Storage & Retention</span>
            </button>

            <button
              onClick={() => handleSectionChange('notifications')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer ${
                settingsSection === 'notifications'
                  ? 'bg-indigo-600 text-white font-bold shadow-md shadow-indigo-600/20'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Bell className="w-4 h-4 text-purple-400" />
              <span>Notifications</span>
            </button>
          </div>
        </Card>

        {/* Right Settings Form Content */}
        <Card className="md:col-span-3">
          <CardHeader
            title={
              settingsSection === 'general'
                ? 'General Platform Information'
                : settingsSection === 'authentication'
                ? 'Token Lifetimes & Session Policy'
                : settingsSection === 'security'
                ? 'Password & Lockout Security Rules'
                : settingsSection === 'storage'
                ? 'Object Storage & Automatic Retention Cleanup'
                : 'Notification Dispatch Defaults'
            }
            subtitle="Changes apply globally across all platform governance services"
          />

          <CardContent className="space-y-5">
            {/* 1. GENERAL SETTINGS */}
            {settingsSection === 'general' && (
              <div className="space-y-4">
                <Input
                  label="Platform System Name"
                  value={formData.platformName || ''}
                  onChange={(e) => handleChange('platformName', e.target.value)}
                />

                <Input
                  label="Platform Base URL"
                  value={formData.platformUrl || ''}
                  onChange={(e) => handleChange('platformUrl', e.target.value)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Default Timezone"
                    value={formData.defaultTimezone || 'Asia/Ho_Chi_Minh'}
                    onChange={(e) => handleChange('defaultTimezone', e.target.value)}
                    options={[
                      { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (GMT+7)' },
                      { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' },
                      { value: 'UTC', label: 'UTC' }
                    ]}
                  />

                  <Select
                    label="Default Console Language"
                    value={formData.defaultLanguage || 'English (US)'}
                    onChange={(e) => handleChange('defaultLanguage', e.target.value)}
                    options={[
                      { value: 'English (US)', label: 'English (US)' },
                      { value: 'Vietnamese', label: 'Tiếng Việt (Vietnamese)' }
                    ]}
                  />
                </div>

                <Input
                  label="Platform Support Email"
                  type="email"
                  value={formData.supportEmail || ''}
                  onChange={(e) => handleChange('supportEmail', e.target.value)}
                />
              </div>
            )}

            {/* 2. AUTHENTICATION SETTINGS */}
            {settingsSection === 'authentication' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Access Token Lifetime (Minutes)"
                    type="number"
                    value={formData.accessTokenLifetimeMinutes || 15}
                    onChange={(e) => handleChange('accessTokenLifetimeMinutes', Number(e.target.value))}
                    helperText="Shorter token lifetime enhances token stealing protection"
                  />

                  <Input
                    label="Refresh Token Lifetime (Days)"
                    type="number"
                    value={formData.refreshTokenLifetimeDays || 7}
                    onChange={(e) => handleChange('refreshTokenLifetimeDays', Number(e.target.value))}
                    helperText="Users must re-authenticate after refresh token expires"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Idle Session Timeout (Minutes)"
                    type="number"
                    value={formData.sessionTimeoutMinutes || 30}
                    onChange={(e) => handleChange('sessionTimeoutMinutes', Number(e.target.value))}
                  />

                  <Input
                    label="Max Concurrent Sessions Per User"
                    type="number"
                    value={formData.maxConcurrentSessions || 5}
                    onChange={(e) => handleChange('maxConcurrentSessions', Number(e.target.value))}
                  />
                </div>

                <Switch
                  label="Revoke Active Sessions on Password Change"
                  description="Automatically signs out all devices when an account updates its password"
                  checked={formData.revokeSessionsOnPasswordChange ?? true}
                  onChange={(val) => handleChange('revokeSessionsOnPasswordChange', val)}
                />

                <Switch
                  label="Revoke Active Sessions on Password Reset"
                  description="Immediately invalidates all existing JWT tokens upon password reset"
                  checked={formData.revokeSessionsOnPasswordReset ?? true}
                  onChange={(val) => handleChange('revokeSessionsOnPasswordReset', val)}
                />
              </div>
            )}

            {/* 3. SECURITY SETTINGS */}
            {settingsSection === 'security' && (
              <div className="space-y-4">
                <Input
                  label="Minimum Password Length"
                  type="number"
                  value={formData.minPasswordLength || 12}
                  onChange={(e) => handleChange('minPasswordLength', Number(e.target.value))}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Switch
                    label="Require Uppercase Characters"
                    checked={formData.requireUppercase ?? true}
                    onChange={(val) => handleChange('requireUppercase', val)}
                  />

                  <Switch
                    label="Require Special Characters (!@#$%^&*)"
                    checked={formData.requireSpecialChars ?? true}
                    onChange={(val) => handleChange('requireSpecialChars', val)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Max Failed Login Attempts Before Lockout"
                    type="number"
                    value={formData.maxFailedLoginAttempts || 5}
                    onChange={(e) => handleChange('maxFailedLoginAttempts', Number(e.target.value))}
                  />

                  <Input
                    label="Account Lockout Duration (Minutes)"
                    type="number"
                    value={formData.accountLockoutMinutes || 15}
                    onChange={(e) => handleChange('accountLockoutMinutes', Number(e.target.value))}
                  />
                </div>

                <Select
                  label="Multi-Factor Authentication (MFA) Policy"
                  value={formData.mfaEnforcement || 'MANDATORY_ADMINS'}
                  onChange={(e) => handleChange('mfaEnforcement', e.target.value)}
                  options={[
                    { value: 'MANDATORY_ALL', label: 'Mandatory for ALL Users' },
                    { value: 'MANDATORY_ADMINS', label: 'Mandatory for Administrators Only' },
                    { value: 'OPTIONAL', label: 'Optional Self-Enrollment' }
                  ]}
                />

                <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center justify-between">
                  <div>
                    <h5 className="font-bold text-white text-xs">Self-Enrollment & Verification Test</h5>
                    <p className="text-[11px] text-[#8b949e] mt-0.5">
                      Pair your authenticator app, scan QR code, or test 6-digit TOTP validation.
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ShieldCheck}
                    onClick={() => openMfaModal('enroll')}
                  >
                    Setup / Verify MFA
                  </Button>
                </div>
              </div>
            )}

            {/* 4. STORAGE SETTINGS */}
            {settingsSection === 'storage' && (
              <div className="space-y-4">
                <Select
                  label="Object Storage Engine Provider"
                  value={formData.provider || 'MinIO'}
                  onChange={(e) => handleChange('provider', e.target.value)}
                  options={[
                    { value: 'MinIO', label: 'MinIO Cluster (Self-Hosted NVMe)' },
                    { value: 'Google Cloud Storage', label: 'Google Cloud Storage (GCS Bucket)' },
                    { value: 'Amazon S3', label: 'Amazon Simple Storage Service (S3)' }
                  ]}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Raw Camera Image Retention (Days)"
                    type="number"
                    value={formData.defaultImageRetentionDays || 90}
                    onChange={(e) => handleChange('defaultImageRetentionDays', Number(e.target.value))}
                  />

                  <Input
                    label="Audit Attachment Retention (Days)"
                    type="number"
                    value={formData.attachmentRetentionDays || 180}
                    onChange={(e) => handleChange('attachmentRetentionDays', Number(e.target.value))}
                  />
                </div>

                <Switch
                  label="Enable Automatic Retention Worker Cleanup"
                  description="Nightly background daemon will purge expired OCR raw image snapshots"
                  checked={formData.autoCleanupEnabled ?? true}
                  onChange={(val) => handleChange('autoCleanupEnabled', val)}
                />
              </div>
            )}

            {/* 5. NOTIFICATION SETTINGS */}
            {settingsSection === 'notifications' && (
              <div className="space-y-4">
                <Switch
                  label="Enable Platform Email Dispatch Engine"
                  description="Routes security notifications and system alerts via SMTP gateway"
                  checked={formData.emailNotificationsEnabled ?? true}
                  onChange={(val) => handleChange('emailNotificationsEnabled', val)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Sender Display Name"
                    value={formData.senderName || ''}
                    onChange={(e) => handleChange('senderName', e.target.value)}
                  />

                  <Input
                    label="Sender Email Address"
                    type="email"
                    value={formData.senderEmail || ''}
                    onChange={(e) => handleChange('senderEmail', e.target.value)}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <Switch
                    label="Notify Platform Admins on Security Threat Alerts"
                    checked={formData.notifySecurityAlerts ?? true}
                    onChange={(val) => handleChange('notifySecurityAlerts', val)}
                  />

                  <Switch
                    label="Notify Platform Admins on System Health Degradation"
                    checked={formData.notifySystemHealthAlerts ?? true}
                    onChange={(val) => handleChange('notifySystemHealthAlerts', val)}
                  />
                </div>
              </div>
            )}

            {/* Save / Reset Bar */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>
                Reset Section
              </Button>
              <Button variant="primary" size="sm" icon={Check} onClick={handleSave}>
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
