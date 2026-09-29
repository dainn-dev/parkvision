import React from 'react';
import {
  ShieldCheck,
  Lock,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Server,
  ArrowLeft,
  ChevronRight,
  Database,
  EyeOff,
  Scale
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';
import { useTranslation } from 'react-i18next';

interface PrivacyPolicyPageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const PrivacyPolicyPage: React.FC<PrivacyPolicyPageProps> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  return (
    <div className="w-full bg-[#0d0e12] text-[#c9d1d9] font-sans antialiased py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Navigation Back */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => onNavigate('landing')}
            className="inline-flex items-center gap-2 text-xs font-semibold text-[#58a6ff] hover:text-[#79c0ff] cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t('Back to Home')}</span>
          </button>
          <span className="text-xs text-[#8b949e] font-mono">{t('Effective version: 01/2026')}</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-mono font-semibold">
            <ShieldCheck className="w-4 h-4" /> {t('Information & Data Security Commitment')}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Privacy Policy')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            {t('The ANPR Cloud SaaS system is committed to protecting personal data, vehicle information and traffic data of business customers (Tenants) and vehicle owners according to international security standards and in compliance with Vietnam Government Decree 13/2023/ND-CP.')}
          </p>
        </div>

        {/* Table of Contents */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4 text-xs space-y-2">
          <div className="font-bold text-white font-mono uppercase tracking-wider">{t('Table of Contents:')}</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[#58a6ff]">
            <li><a href="#section-1" className="hover:underline">{t('1. Data collection & processing')}</a></li>
            <li><a href="#section-2" className="hover:underline">{t('2. Data processing purposes')}</a></li>
            <li><a href="#section-3" className="hover:underline">{t('3. Encryption & data protection standards')}</a></li>
            <li><a href="#section-4" className="hover:underline">{t('4. Compliance with Decree 13/2023/ND-CP')}</a></li>
            <li><a href="#section-5" className="hover:underline">{t('5. Retention period & data deletion rights')}</a></li>
            <li><a href="#section-6" className="hover:underline">{t('6. Rights of data subjects & Tenants')}</a></li>
          </ul>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-[#c9d1d9]">
          {/* Section 1 */}
          <section id="section-1" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Database className="w-5 h-5 text-[#58a6ff]" />
              {t('1. Types of Data Collected & Processed')}
            </h2>
            <p>
              {t('When a vehicle approaches barrier gates connected to ANPR Cloud, the system automatically records and processes the following technical information:')}
            </p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>{t('Cropped Plate Image:')}</strong> {t('A close-up cropped image containing the license plate for OCR character analysis.')}</li>
              <li><strong>{t('Overview Vehicle Snapshot:')}</strong> {t('A wide-angle capture recording the vehicle\'s body style and paint color at the moment it approaches the barrier stop line.')}</li>
              <li><strong>{t('License plate character string:')}</strong> {t('Letters and digits automatically extracted with a recognition Confidence Score.')}</li>
              <li><strong>{t('Time and space data:')}</strong> {t('Exact timestamp (millisecond precision), gate lane (Gate ID), site (Site ID) and travel direction (In/Out).')}</li>
              <li><strong>{t('Member data provided by the Tenant:')}</strong> {t('Vehicle owner name, phone number, apartment/department, monthly pass type (if declared by the Tenant on the system).')}</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section id="section-2" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Scale className="w-5 h-5 text-[#3fb950]" />
              {t('2. Data Processing Purposes')}
            </h2>
            <p>{t('Data is collected and processed solely for the following legitimate operational purposes:')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">{t('Barrier open/close automation')}</div>
                <p className="text-[11px] text-[#8b949e]">{t('Match plates against the monthly pass list to send the arm-lift command in <100ms.')}</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">{t('Fraud & tailgating prevention')}</div>
                <p className="text-[11px] text-[#8b949e]">{t('Detect pass looping (Anti-passback) and vehicles tailgating without a valid credential.')}</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">{t('Security & Blocklist control')}</div>
                <p className="text-[11px] text-[#8b949e]">{t('Alert on vehicles on the suspicion list or violating parking regulations.')}</p>
              </div>
              <div className="p-3 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
                <div className="font-bold text-white text-xs">{t('Transparent reconciliation & reporting')}</div>
                <p className="text-[11px] text-[#8b949e]">{t('Provide evidence imagery for investigating collisions or parking disputes.')}</p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section id="section-3" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#d29922]" />
              {t('3. Encryption Standards & Infrastructure Safety')}
            </h2>
            <p>{t('We apply the strictest information security standards:')}</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>{t('In-Transit Encryption:')}</strong> {t('100% of data transmitted between on-site Edge Gateways and the Cloud Server is protected by TLS 1.3 and mTLS (Mutual TLS).')}</li>
              <li><strong>{t('At-Rest Encryption:')}</strong> {t('Images and sensitive data are encrypted with military-grade AES-256 on Cloud Storage.')}</li>
              <li><strong>{t('Multi-Tenant Row-Level Security (RLS):')}</strong> {t('Each business\'s data is fully partitioned. No Tenant can view or access another Tenant\'s data.')}</li>
              <li><strong>{t('Two-Factor Authentication (TOTP MFA / FIDO2):')}</strong> {t('All system administrator accounts are required to enable two-layer security.')}</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section id="section-4" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#a371f7]" />
              {t('4. Compliance with Decree 13/2023/ND-CP (Personal Data Protection)')}
            </h2>
            <p>
              {t('ANPR Cloud SaaS operates as the')} <strong>{t('Personal Data Processor')}</strong> {t('on behalf of the business customer (the Data Controller).')}
            </p>
            <p className="text-[#8b949e]">
              {t('We commit to never selling, renting or sharing license plate image data with any third party for advertising or commercial purposes. Data is only provided to competent authorities upon official written request under Vietnamese law.')}
            </p>
          </section>

          {/* Section 5 */}
          <section id="section-5" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-[#58a6ff]" />
              {t('5. Retention Period & Data Deletion Rights (Data Retention & Purging)')}
            </h2>
            <p>
              {t('Tenants can self-configure the event image log retention period to fit their facility\'s needs (from 30 days, 90 days up to 365 days).')}
            </p>
            <p className="text-[#8b949e]">
              {t('After the retention period expires or the service contract ends, all historical data and vehicle imagery will be automatically and permanently deleted (Cryptographic Erasure) from all backup servers within 30 days.')}
            </p>
          </section>

          {/* Section 6 */}
          <section id="section-6" className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <EyeOff className="w-5 h-5 text-[#3fb950]" />
              {t('6. Customer Rights & Data Security Contact')}
            </h2>
            <p>
              {t('Customers have full rights to export data (Data Export), edit vehicle information or request account cancellation through the Tenant Settings Portal.')}
            </p>
            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] text-xs space-y-1 font-mono">
              <div>{t('Data Protection Officer (DPO):')}</div>
              <div className="text-white">Email: privacy@anprcloud.vn / security@anprcloud.vn</div>
              <div>{t('Security Hotline: (028) 7300 8899 (Ext. 3)')}</div>
            </div>
          </section>
        </div>

        {/* Footer Actions */}
        <div className="pt-6 border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            onClick={() => onNavigate('landing')}
            className="px-5 py-2.5 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white text-xs font-semibold border border-[#30363d] cursor-pointer"
          >
            ← {t('Back to Home')}
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onNavigate('terms')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              {t('View Terms of Service')} →
            </button>
            <span className="text-[#8b949e]">•</span>
            <button
              onClick={() => onNavigate('sla')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              {t('View SLA Commitment')} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
