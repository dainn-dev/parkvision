import { PlatformSettings } from '../types/platform';

// Platform settings defaults — merged under server rows by settingsFromRows.
export const INITIAL_SETTINGS: PlatformSettings = {
  general: {
    platformName: 'Vehicle Governance Platform Admin Console',
    platformUrl: 'https://vehicle.platform.internal',
    defaultTimezone: 'Asia/Ho_Chi_Minh',
    defaultLanguage: 'English (US)',
    supportEmail: 'platform-support@kyanon.digital',
    supportUrl: 'https://support.vehicle.platform.internal'
  },
  authentication: {
    accessTokenLifetimeMinutes: 15,
    refreshTokenLifetimeDays: 7,
    sessionTimeoutMinutes: 30,
    maxConcurrentSessions: 5,
    revokeSessionsOnPasswordChange: true,
    revokeSessionsOnPasswordReset: true
  },
  security: {
    minPasswordLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    maxFailedLoginAttempts: 5,
    accountLockoutMinutes: 15,
    mfaEnforcement: 'MANDATORY_ADMINS'
  },
  storage: {
    provider: 'MinIO',
    defaultImageRetentionDays: 90,
    attachmentRetentionDays: 180,
    maxUploadSizeBytes: 20971520, // 20 MB
    autoCleanupEnabled: true,
    warningThresholdPercent: 80
  },
  notifications: {
    emailNotificationsEnabled: true,
    senderName: 'Platform Governance Control Center',
    senderEmail: 'no-reply@vehicle.platform.internal',
    notifySecurityAlerts: true,
    notifySystemHealthAlerts: true,
    notifyTenantLifecycleAlerts: true
  }
};
