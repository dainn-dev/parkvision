import React from 'react';
import {
  Car,
  ShieldCheck,
  Phone,
  Mail,
  MapPin,
  ExternalLink,
  CheckCircle2,
  Lock,
  Server,
  Layers,
  Sparkles,
  ArrowRight,
  Globe
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PublicViewType } from './PublicNavbar';

interface PublicFooterProps {
  onNavigate: (view: PublicViewType) => void;
  onScrollToSection?: (sectionId: string) => void;
}

export const PublicFooter: React.FC<PublicFooterProps> = ({
  onNavigate,
  onScrollToSection
}) => {
  const { t } = useTranslation('layout');
  return (
    <footer className="border-t border-[#30363d] bg-[#0d0e12] text-[#8b949e] font-sans">
      {/* Top Banner CTA */}
      <div className="border-b border-[#30363d] bg-gradient-to-r from-[#161b22] via-[#0d0e12] to-[#161b22] py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#58a6ff]/10 border border-[#58a6ff]/30 text-[#58a6ff] text-xs font-mono">
              <Sparkles className="w-3.5 h-3.5" /> {t('Full-featured 14-day trial')}
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              {t('Ready to upgrade your parking lot with smart barriers?')}
            </h3>
            <p className="text-sm text-[#8b949e] max-w-2xl">
              {t('No barrier hardware replacement needed. Works with your existing IP cameras. Deployed in just 4 working hours.')}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('register')}
              className="px-6 py-3 rounded-xl bg-[#58a6ff] hover:bg-[#388bfd] text-slate-950 font-bold text-sm shadow-lg shadow-[#58a6ff]/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>{t('Register a Trial Tenant')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                if (onScrollToSection) onScrollToSection('simulator');
              }}
              className="px-5 py-3 rounded-xl bg-[#21262d] hover:bg-[#30363d] text-white font-semibold text-sm border border-[#30363d] transition-colors cursor-pointer"
            >
              {t('Watch Live Demo')}
            </button>
          </div>
        </div>
      </div>

      {/* Main Footer Links */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
          {/* Brand Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] flex items-center justify-center text-slate-950 font-black shadow-md">
                <Car className="w-5 h-5 text-slate-950" />
              </div>
              <span className="text-lg font-extrabold text-white tracking-tight font-mono">
                ANPR<span className="text-[#58a6ff]">.CLOUD</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-[#8b949e] max-w-sm">
              {t('A next-generation vehicle access control platform powered by Edge AI ANPR, automating barriers and centrally managing multi-site parking in the cloud.')}
            </p>

            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <MapPin className="w-4 h-4 text-[#58a6ff] shrink-0" />
                <span>{t('12th Floor, Bitexco Financial Tower, District 1, Ho Chi Minh City')}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <Phone className="w-4 h-4 text-[#3fb950] shrink-0" />
                <span>{t('Consulting & Support Hotline: 1900 8899 / (028) 7300 8899')}</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#c9d1d9]">
                <Mail className="w-4 h-4 text-[#d29922] shrink-0" />
                <span>Email: contact@anprcloud.vn / support@anprcloud.vn</span>
              </div>
            </div>

            {/* Compliance Badges */}
            <div className="pt-2 flex flex-wrap items-center gap-2 text-[11px] font-mono">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#3fb950]">
                <CheckCircle2 className="w-3 h-3" /> {t('Decree 13/2023/ND-CP')}
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#58a6ff]">
                <Lock className="w-3 h-3" /> TLS 1.3 & AES-256
              </span>
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#21262d] border border-[#30363d] text-[#a371f7]">
                <Server className="w-3 h-3" /> SLA 99.9% Uptime
              </span>
            </div>
          </div>

          {/* Solutions Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {t('Solutions by Industry')}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Office Buildings & Shopping Malls')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Residential Areas & Premium Apartments')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Industrial Parks & Warehouses')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Hospitals & Government Offices')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('solutions');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Automated-fee Smart Parking Lots')}
                </button>
              </li>
            </ul>
          </div>

          {/* Platform & Product Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {t('Platform & Technology')}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('AI OCR License Plate Recognition')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Policy Rules Engine')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Anti-Tailgating & Anti-Passback')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('features');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('On-site Offline Failover')}
                </button>
              </li>
              <li>
                <button
                  onClick={() => {
                    onNavigate('landing');
                    if (onScrollToSection) onScrollToSection('pricing');
                  }}
                  className="hover:text-white transition-colors cursor-pointer text-left"
                >
                  {t('Pricing & Plans')}
                </button>
              </li>
            </ul>
          </div>

          {/* Legal & Policy Column */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
              {t('Policies & Legal')}
            </h4>
            <ul className="space-y-2 text-xs">
              <li>
                <button
                  onClick={() => onNavigate('privacy')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>{t('Privacy Policy')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('terms')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>{t('Terms of Service')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('sla')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5"
                >
                  <span>{t('SLA Commitment (99.9%)')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('login')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5 text-[#58a6ff]"
                >
                  <span>{t('Customer Login Portal')}</span>
                </button>
              </li>
              <li>
                <button
                  onClick={() => onNavigate('register')}
                  className="hover:text-white transition-colors cursor-pointer text-left flex items-center gap-1.5 text-[#3fb950]"
                >
                  <span>{t('New Tenant Signup (14 days)')}</span>
                </button>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-12 pt-6 border-t border-[#30363d] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
          <p>{t('© 2026 ANPR.CLOUD SaaS Platform. All rights reserved by Global Digital Security Solutions JSC.')}</p>
          <div className="flex items-center gap-6">
            <button onClick={() => onNavigate('privacy')} className="hover:text-white transition-colors">
              {t('Data Privacy')}
            </button>
            <button onClick={() => onNavigate('terms')} className="hover:text-white transition-colors">
              {t('Terms of Use')}
            </button>
            <button onClick={() => onNavigate('sla')} className="hover:text-white transition-colors">
              SLA 99.9%
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
};
