import React, { useState } from 'react';
import { usePlatform } from '../../context/PlatformContext';
import { SettingsSection } from '../../types/platform';
import {
  Settings,
  Lock,
  ShieldCheck,
  ShieldAlert,
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
import { useTranslation } from 'react-i18next';

export const PlatformSettingsPage: React.FC = () => {
  const { t } = useTranslation('platform');
  const { settings, updateSettings, settingsSection, setSettingsSection, openMfaModal, currentUser } = usePlatform();

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
          <Settings className="w-5 h-5 text-indigo-400" /> {t('Platform Global Settings')}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {t('Configure multi-tenant default security policies, token lifetimes, storage retention, and notification defaults.')}
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
              <span>{t('General Defaults')}</span>
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
              <span>{t('Authentication')}</span>
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
              <span>{t('Security Policy')}</span>
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
              <span>{t('Storage & Retention')}</span>
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
              <span>{t('Notifications')}</span>
            </button>
          </div>
        </Card>

        {/* Right Settings Form Content */}
        <Card className="md:col-span-3">
          <CardHeader
            title={
              settingsSection === 'general'
                ? t('General Platform Information')
                : settingsSection === 'authentication'
                ? t('Token Lifetimes & Session Policy')
                : settingsSection === 'security'
                ? t('Password & Lockout Security Rules')
                : settingsSection === 'storage'
                ? t('Object Storage & Automatic Retention Cleanup')
                : t('Notification Dispatch Defaults')
            }
            subtitle={t('Changes apply globally across all platform governance services')}
          />

          <CardContent className="space-y-5">
            {/* 1. GENERAL SETTINGS */}
            {settingsSection === 'general' && (
              <div className="space-y-4">
                <Input
                  label={t('Platform System Name')}
                  value={formData.platformName || ''}
                  onChange={(e) => handleChange('platformName', e.target.value)}
                />

                <Input
                  label={t('Platform Base URL')}
                  value={formData.platformUrl || ''}
                  onChange={(e) => handleChange('platformUrl', e.target.value)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label={t('Default Timezone')}
                    value={formData.defaultTimezone || 'Asia/Ho_Chi_Minh'}
                    onChange={(e) => handleChange('defaultTimezone', e.target.value)}
                    options={[
                      { value: 'Asia/Ho_Chi_Minh', label: 'Asia/Ho_Chi_Minh (GMT+7)' },
                      { value: 'Asia/Singapore', label: 'Asia/Singapore (GMT+8)' },
                      { value: 'UTC', label: 'UTC' }
                    ]}
                  />

                  <Select
                    label={t('Default Console Language')}
                    value={formData.defaultLanguage || 'English (US)'}
                    onChange={(e) => handleChange('defaultLanguage', e.target.value)}
                    options={[
                      { value: 'English (US)', label: 'English (US)' },
                      { value: 'Vietnamese', label: 'Tiếng Việt (Vietnamese)' }
                    ]}
                  />
                </div>

                <Input
                  label={t('Platform Support Email')}
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
                    label={t('Access Token Lifetime (Minutes)')}
                    type="number"
                    value={formData.accessTokenLifetimeMinutes || 15}
                    onChange={(e) => handleChange('accessTokenLifetimeMinutes', Number(e.target.value))}
                    helperText={t('Shorter token lifetime enhances token stealing protection')}
                  />

                  <Input
                    label={t('Refresh Token Lifetime (Days)')}
                    type="number"
                    value={formData.refreshTokenLifetimeDays || 7}
                    onChange={(e) => handleChange('refreshTokenLifetimeDays', Number(e.target.value))}
                    helperText={t('Users must re-authenticate after refresh token expires')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={t('Idle Session Timeout (Minutes)')}
                    type="number"
                    value={formData.sessionTimeoutMinutes || 30}
                    onChange={(e) => handleChange('sessionTimeoutMinutes', Number(e.target.value))}
                  />

                  <Input
                    label={t('Max Concurrent Sessions Per User')}
                    type="number"
                    value={formData.maxConcurrentSessions || 5}
                    onChange={(e) => handleChange('maxConcurrentSessions', Number(e.target.value))}
                  />
                </div>

                <Switch
                  label={t('Revoke Active Sessions on Password Change')}
                  description={t('Automatically signs out all devices when an account updates its password')}
                  checked={formData.revokeSessionsOnPasswordChange ?? true}
                  onChange={(val) => handleChange('revokeSessionsOnPasswordChange', val)}
                />

                <Switch
                  label={t('Revoke Active Sessions on Password Reset')}
                  description={t('Immediately invalidates all existing JWT tokens upon password reset')}
                  checked={formData.revokeSessionsOnPasswordReset ?? true}
                  onChange={(val) => handleChange('revokeSessionsOnPasswordReset', val)}
                />
              </div>
            )}

            {/* 3. SECURITY SETTINGS */}
            {settingsSection === 'security' && (
              <div className="space-y-4">
                <Input
                  label={t('Minimum Password Length')}
                  type="number"
                  value={formData.minPasswordLength || 12}
                  onChange={(e) => handleChange('minPasswordLength', Number(e.target.value))}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <Switch
                    label={t('Require Uppercase Characters')}
                    checked={formData.requireUppercase ?? true}
                    onChange={(val) => handleChange('requireUppercase', val)}
                  />

                  <Switch
                    label={t('Require Special Characters (!@#$%^&*)')}
                    checked={formData.requireSpecialChars ?? true}
                    onChange={(val) => handleChange('requireSpecialChars', val)}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={t('Max Failed Login Attempts Before Lockout')}
                    type="number"
                    value={formData.maxFailedLoginAttempts || 5}
                    onChange={(e) => handleChange('maxFailedLoginAttempts', Number(e.target.value))}
                  />

                  <Input
                    label={t('Account Lockout Duration (Minutes)')}
                    type="number"
                    value={formData.accountLockoutMinutes || 15}
                    onChange={(e) => handleChange('accountLockoutMinutes', Number(e.target.value))}
                  />
                </div>

                <Select
                  label={t('Multi-Factor Authentication (MFA) Policy')}
                  value={formData.mfaEnforcement || 'MANDATORY_ADMINS'}
                  onChange={(e) => handleChange('mfaEnforcement', e.target.value)}
                  options={[
                    { value: 'MANDATORY_ALL', label: t('Mandatory for ALL Users') },
                    { value: 'MANDATORY_ADMINS', label: t('Mandatory for Administrators Only') },
                    { value: 'OPTIONAL', label: t('Optional Self-Enrollment') }
                  ]}
                />

                <div className="p-4 bg-[#0d0e12] border border-[#30363d] rounded-xl flex items-center justify-between gap-3">
                  <div>
                    <h5 className="font-bold text-white text-xs">{t('Self-Enrollment & Verification Test')}</h5>
                    <p className="text-[11px] text-[#8b949e] mt-0.5">
                      {t('Pair your authenticator app, scan QR code, or test 6-digit TOTP validation.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {currentUser.mfaEnabled && (
                      <Button
                        variant="danger"
                        size="sm"
                        icon={ShieldAlert}
                        onClick={() => openMfaModal('disable')}
                      >
                        {t('Disable MFA')}
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      icon={ShieldCheck}
                      onClick={() => openMfaModal('enroll')}
                    >
                      {currentUser.mfaEnabled ? t('Re-enroll MFA') : t('Setup / Verify MFA')}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* 4. STORAGE SETTINGS */}
            {settingsSection === 'storage' && (
              <div className="space-y-4">
                <Select
                  label={t('Object Storage Engine Provider')}
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
                    label={t('Raw Camera Image Retention (Days)')}
                    type="number"
                    value={formData.defaultImageRetentionDays || 90}
                    onChange={(e) => handleChange('defaultImageRetentionDays', Number(e.target.value))}
                  />

                  <Input
                    label={t('Audit Attachment Retention (Days)')}
                    type="number"
                    value={formData.attachmentRetentionDays || 180}
                    onChange={(e) => handleChange('attachmentRetentionDays', Number(e.target.value))}
                  />
                </div>

                <Switch
                  label={t('Enable Automatic Retention Worker Cleanup')}
                  description={t('Nightly background daemon will purge expired OCR raw image snapshots')}
                  checked={formData.autoCleanupEnabled ?? true}
                  onChange={(val) => handleChange('autoCleanupEnabled', val)}
                />
              </div>
            )}

            {/* 5. NOTIFICATION SETTINGS */}
            {settingsSection === 'notifications' && (
              <div className="space-y-4">
                <Switch
                  label={t('Enable Platform Email Dispatch Engine')}
                  description={t('Routes security notifications and system alerts via SMTP gateway')}
                  checked={formData.emailNotificationsEnabled ?? true}
                  onChange={(val) => handleChange('emailNotificationsEnabled', val)}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={t('Sender Display Name')}
                    value={formData.senderName || ''}
                    onChange={(e) => handleChange('senderName', e.target.value)}
                  />

                  <Input
                    label={t('Sender Email Address')}
                    type="email"
                    value={formData.senderEmail || ''}
                    onChange={(e) => handleChange('senderEmail', e.target.value)}
                  />
                </div>

                <div className="space-y-2 pt-2">
                  <Switch
                    label={t('Notify Platform Admins on Security Threat Alerts')}
                    checked={formData.notifySecurityAlerts ?? true}
                    onChange={(val) => handleChange('notifySecurityAlerts', val)}
                  />

                  <Switch
                    label={t('Notify Platform Admins on System Health Degradation')}
                    checked={formData.notifySystemHealthAlerts ?? true}
                    onChange={(val) => handleChange('notifySystemHealthAlerts', val)}
                  />
                </div>
              </div>
            )}

            {/* Save / Reset Bar */}
            <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-800">
              <Button variant="ghost" size="sm" icon={RotateCcw} onClick={handleReset}>
                {t('Reset Section')}
              </Button>
              <Button variant="primary" size="sm" icon={Check} onClick={handleSave}>
                {t('Save Changes')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
