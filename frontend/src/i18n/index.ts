import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import viCommon from './locales/vi/common.json';
import viLayout from './locales/vi/layout.json';
import viLanding from './locales/vi/landing.json';
import viAuth from './locales/vi/auth.json';
import viPlatform from './locales/vi/platform.json';
import viMonitoring from './locales/vi/monitoring.json';
import viSecurity from './locales/vi/security.json';
import viAudit from './locales/vi/audit.json';
import viTenant from './locales/vi/tenant.json';

export const LANG_STORAGE_KEY = 'pv-language';
export type AppLanguage = 'en' | 'vi';

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null;
const initialLng: AppLanguage = stored === 'vi' ? 'vi' : 'en';

void i18n.use(initReactI18next).init({
  lng: initialLng,
  fallbackLng: 'en',
  supportedLngs: ['en', 'vi'],
  defaultNS: 'common',
  ns: ['common', 'layout', 'landing', 'auth', 'platform', 'monitoring', 'security', 'audit', 'tenant'],
  resources: {
    vi: {
      common: viCommon,
      layout: viLayout,
      landing: viLanding,
      auth: viAuth,
      platform: viPlatform,
      monitoring: viMonitoring,
      security: viSecurity,
      audit: viAudit,
      tenant: viTenant,
    },
  },
  // English copy lives inline as the translation key, so keys must be taken literally.
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  partialBundledLanguages: true,
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lng);
  } catch {
    // storage unavailable (private mode) — ignore
  }
  document.documentElement.lang = lng;
});
document.documentElement.lang = initialLng;

export default i18n;
