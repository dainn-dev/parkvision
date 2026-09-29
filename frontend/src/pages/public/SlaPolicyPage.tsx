import React from 'react';
import {
  Server,
  Zap,
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  DollarSign,
  ArrowLeft,
  Activity,
  Headphones,
  Check
} from 'lucide-react';
import { PublicViewType } from '../../components/layout/PublicNavbar';
import { useTranslation } from 'react-i18next';

interface SlaPolicyPageProps {
  onNavigate: (view: PublicViewType) => void;
}

export const SlaPolicyPage: React.FC<SlaPolicyPageProps> = ({ onNavigate }) => {
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
          <span className="text-xs text-[#8b949e] font-mono">{t('Enterprise-grade service standard (Enterprise SLA)')}</span>
        </div>

        {/* Header Title */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 sm:p-8 space-y-3 shadow-xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#a371f7]/10 border border-[#a371f7]/30 text-[#a371f7] text-xs font-mono font-semibold">
            <Server className="w-4 h-4" /> {t('Compensated 99.9% Uptime Commitment')}
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            {t('Service Level Agreement (SLA)')}
          </h1>
          <p className="text-xs sm:text-sm text-[#8b949e] leading-relaxed">
            {t('ANPR Cloud is committed to delivering the most continuous, stable and highly secure access control service, with a clear refund policy if committed metrics are not met.')}
          </p>
        </div>

        {/* Key SLA Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#3fb950] font-mono">99.9%</div>
            <div className="text-xs font-bold text-white mt-1">{t('Monthly Uptime Availability')}</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">{t('Maximum downtime < 43 min/month')}</p>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#58a6ff] font-mono">&lt; 100ms</div>
            <div className="text-xs font-bold text-white mt-1">{t('Barrier Response Latency')}</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">{t('Arm relay activation time')}</p>
          </div>

          <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-5 text-center">
            <div className="text-3xl font-black text-[#d29922] font-mono">&lt; 15 {t('min')}</div>
            <div className="text-xs font-bold text-white mt-1">{t('Severity-1 Incident Response Time')}</div>
            <p className="text-[11px] text-[#8b949e] mt-0.5">{t('Emergency technical support 24/7/365')}</p>
          </div>
        </div>

        {/* Section 1: Incident Severity Matrix */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-[#f85149]" />
            {t('1. Incident Severity Matrix & Resolution Time (MTTR)')}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-[#30363d] text-[#8b949e] font-mono">
                  <th className="py-2.5 px-3">{t('Severity level')}</th>
                  <th className="py-2.5 px-3">{t('Incident description')}</th>
                  <th className="py-2.5 px-3">{t('Response time')}</th>
                  <th className="py-2.5 px-3">{t('Resolution time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#30363d] text-[#c9d1d9]">
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#da3633]/20 text-[#f85149] font-bold font-mono">
                      SEV 1 - CRITICAL
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {t('All barrier gates at the site are paralyzed; vehicles cannot enter/exit automatically.')}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#f85149] font-bold">&lt; 15 {t('min')}</td>
                  <td className="py-3 px-3 font-mono font-bold">&lt; 2 {t('hrs')}</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#d29922]/20 text-[#d29922] font-bold font-mono">
                      SEV 2 - HIGH
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {t('A single barrier lane loses camera connection or recognition latency spikes.')}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#d29922] font-bold">&lt; 30 {t('min')}</td>
                  <td className="py-3 px-3 font-mono font-bold">&lt; 4 {t('hrs')}</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#388bfd]/20 text-[#58a6ff] font-bold font-mono">
                      SEV 3 - MEDIUM
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {t('Excel report export is slow; the Dashboard UI shows missing data.')}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#58a6ff]">&lt; 2 {t('hrs')}</td>
                  <td className="py-3 px-3 font-mono">&lt; 24 {t('hrs')}</td>
                </tr>
                <tr>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded bg-[#21262d] text-[#8b949e] font-mono">
                      SEV 4 - LOW
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {t('Requests for configuration guidance, form adjustments or new feature feedback.')}
                  </td>
                  <td className="py-3 px-3 font-mono text-[#8b949e]">&lt; 4 {t('hrs')}</td>
                  <td className="py-3 px-3 font-mono">{t('Per roadmap')}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 2: Compensation Matrix */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#3fb950]" />
            {t('2. Refund / Service Credits Policy')}
          </h2>
          <p className="text-xs text-[#8b949e]">
            {t('If monthly availability falls below 99.9%, the Tenant is entitled to corresponding service credits applied as a direct deduction on the next billing invoice:')}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#d29922] font-mono text-sm">99.0% - 99.89%</div>
              <div className="text-xs font-bold text-white">{t('10% Monthly Fee Credit')}</div>
              <p className="text-[11px] text-[#8b949e]">{t('Downtime from 44 min to 7.2 hrs/month')}</p>
            </div>

            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#f85149] font-mono text-sm">95.0% - 98.9%</div>
              <div className="text-xs font-bold text-white">{t('25% Monthly Fee Credit')}</div>
              <p className="text-[11px] text-[#8b949e]">{t('Downtime from 7.2 hrs to 36 hrs/month')}</p>
            </div>

            <div className="p-4 bg-[#0d0e12] rounded-xl border border-[#30363d] space-y-1">
              <div className="font-bold text-[#f85149] font-mono text-sm">&lt; 95.0%</div>
              <div className="text-xs font-bold text-white">{t('50% Monthly Fee Credit')}</div>
              <p className="text-[11px] text-[#8b949e]">{t('Severe downtime over 36 hrs/month')}</p>
            </div>
          </div>
        </div>

        {/* Section 3: Offline Redundancy Guarantee */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-2xl p-6 space-y-3">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#58a6ff]" />
            {t('3. Offline Operation Guarantee (Offline Edge Guarantee)')}
          </h2>
          <p className="text-xs text-[#8b949e] leading-relaxed">
            {t('Even when the Cloud Server is under maintenance or the Internet fiber is completely cut, the on-site Edge Gateway keeps operating independently and continues opening the barrier for 100% of valid vehicles in its local cache (Local Snapshot Database). We guarantee uninterrupted vehicle flow at the gate.')}
          </p>
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
              onClick={() => onNavigate('terms')}
              className="text-xs text-[#58a6ff] hover:underline cursor-pointer"
            >
              {t('Terms of Service')} →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
