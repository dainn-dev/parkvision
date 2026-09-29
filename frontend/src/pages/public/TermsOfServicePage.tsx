import React from 'react';
import {
  FileText,
  Scale,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowLeft,
  DollarSign,
  ShieldAlert,
  Server,
  Building2,
  Key
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';
import { useTranslation } from 'react-i18next';

interface TermsOfServicePageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const TermsOfServicePage: React.FC<TermsOfServicePageProps> = ({ onNavigate }) => {
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
          <span className="text-xs text-[#8b949e] font-mono">{t('Effective from: 01/01/2026')}</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#3fb950]/10 border border-[#3fb950]/30 text-[#3fb950] text-xs font-mono font-semibold">
            <Scale className="w-4 h-4" /> {t('B2B Platform Usage Agreement')}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Terms of Service')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            {t('This document constitutes a legally binding agreement between the Business Customer / Organization registering for the service (hereinafter "Tenant") and Global Digital Security Solutions JSC (hereinafter "ANPR Cloud" or "We").')}
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-xs sm:text-sm leading-relaxed text-[#c9d1d9]">
          {/* Section 1 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-[#58a6ff]" />
              {t('1. Definitions')}
            </h2>
            <ul className="space-y-2 text-[#8b949e]">
              <li><strong className="text-white">{t('"ANPR Cloud Platform":')}</strong> {t('A Software-as-a-Service (SaaS) offering AI license plate recognition, an access-rule evaluation engine and remote barrier relay control.')}</li>
              <li><strong className="text-white">{t('"Edge Gateway":')}</strong> {t('A dedicated mini-computer hardware device installed at the Tenant\'s parking facility to interface with IP cameras and the barrier relay.')}</li>
              <li><strong className="text-white">{t('"Tenant Administrator":')}</strong> {t('The individual designated by the Tenant as the top-level manager of the organization account, authorized to invite users, configure the lot and handle billing.')}</li>
              <li><strong className="text-white">{t('"Gate Lane":')}</strong> {t('A physical control point consisting of 01 ANPR camera and 01 controlled barrier arm.')}</li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-[#3fb950]" />
              {t('2. Usage Rights & 14-Day Trial Program')}
            </h2>
            <p>
              {t('When registering a new Tenant account, you are granted free trial access for')} <strong>{t('14 days')}</strong> {t('with the full features of the selected service plan (no payment card required upfront).')}
            </p>
            <p className="text-[#8b949e]">
              {t('After 14 days, if the Tenant does not select a subscription plan, the system will suspend automatic control commands to the barrier (guards can still open it via the on-site mechanical push button). All configuration data is preserved for the next 60 days.')}
            </p>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#d29922]" />
              {t('3. Service Fees, Quotas & Payment')}
            </h2>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li><strong>{t('Subscription model:')}</strong> {t('Service fees are billed Monthly or Annually based on the number of Gate Lanes and the stored-vehicle quota.')}</li>
              <li><strong>{t('VAT invoices:')}</strong> {t('ANPR Cloud issues valid electronic VAT invoices per Vietnam General Department of Taxation regulations after each billing cycle.')}</li>
              <li><strong>{t('Payment terms:')}</strong> {t('Recurring invoices must be paid within 07 business days from the billing notice date.')}</li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#a371f7]" />
              {t('4. Customer (Tenant) Responsibilities')}
            </h2>
            <p>{t('To ensure smooth system operation, the Tenant is responsible for:')}</p>
            <ul className="list-disc list-inside space-y-1.5 pl-2 text-[#8b949e]">
              <li>{t('Periodic hardware maintenance at the lot: cleaning IP camera lenses, checking safety sensors (loop detector coils or photocell anti-crush sensors for the barrier arm).')}</li>
              <li>{t('Account security: enabling two-factor authentication (2FA) for all admin staff and gate guards.')}</li>
              <li>{t('Ensuring the legality of the vehicle list and owner phone numbers uploaded to the system.')}</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-[#f85149]" />
              {t('5. Limitation of Liability & Force Majeure')}
            </h2>
            <p className="text-[#8b949e]">
              {t('ANPR Cloud is not liable for property damage or vehicle collisions caused by mechanical hardware failures of the barrier (e.g., arm broken by storms, snapped assist springs, motor failure) or by drivers intentionally bypassing the barrier before the green signal.')}
            </p>
          </section>

          {/* Section 6 */}
          <section className="space-y-3 bg-[#161b22] border border-[#30363d] rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Server className="w-5 h-5 text-[#58a6ff]" />
              {t('6. Governing Law & Dispute Resolution')}
            </h2>
            <p className="text-[#8b949e]">
              {t('This agreement is governed by and construed under the laws of the Socialist Republic of Vietnam. Disputes shall first be negotiated in a spirit of conciliation and cooperation. If unresolved within 30 days, the dispute will be referred to the Vietnam International Arbitration Centre (VIAC) or a competent court in Ho Chi Minh City.')}
            </p>
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
              onClick={() => onNavigate('privacy')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              {t('Privacy Policy')} →
            </button>
            <span className="text-[#8b949e]">•</span>
            <button
              onClick={() => onNavigate('sla')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              {t('99.9% SLA Commitment')} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
