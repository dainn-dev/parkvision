import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';
import { publicApi, type PlanOut } from '../../../services/api';
import { Plain, TeslaButton } from './tesla';

interface PricingSectionProps {
  onNavigate: (view: PublicViewType) => void;
  onSelectPlan?: (planId: string) => void;
}

interface PricingPlan {
  id: string;
  name: string;
  badge: string;
  price: string;
  currency?: string;
  period: string;
  description: string;
  features: string[];
  popular: boolean;
  ctaText: string;
}

// Commercial terms: shown verbatim when the live catalogue is unavailable.
const FALLBACK_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    badge: 'Small Lots & Condos',
    price: '1.990.000',
    period: 'month',
    description: 'For standalone parking lots, mini condos or small-to-medium company offices.',
    features: [
      'Up to 2 Barrier Lanes (1 In - 1 Out)',
      'Capacity up to 500 vehicles',
      'ANPR camera with AI OCR plate recognition',
      'Basic access rules engine',
      '30-day event history retention',
      'Technical support via Email & Zalo',
    ],
    popular: false,
    ctaText: 'Start Starter Trial',
  },
  {
    id: 'business',
    name: 'Business',
    badge: 'Most Popular ★',
    price: '4.990.000',
    period: 'month',
    description: 'The perfect solution for grade A-B office buildings, shopping malls and premium residential areas.',
    features: [
      'Up to 8 multi-direction Barrier Lanes',
      'Capacity up to 3,000 vehicles',
      'Deterministic Policy Engine (Priority #1 - #9999)',
      'Anti-Tailgating & Anti-passback',
      'On-site Offline Failover when Internet drops',
      'Webhook integration (Telegram/Slack) & Open API',
      '1-year image & event retention',
      '24/7 dedicated Hotline support',
    ],
    popular: true,
    ctaText: 'Start Business Trial',
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    badge: 'Chains & Logistics Parks',
    price: 'Contact us',
    period: 'custom quote',
    description: 'For corporations managing building chains, industrial parks, large hospitals and logistics centers.',
    features: [
      'Unlimited Barrier Lanes & access gates',
      'Unlimited stored vehicles',
      'Dedicated isolated database (Dedicated RLS DB)',
      'Deep integration with BMS, SAP, Oracle ERP, VietQR',
      'Compensated 99.99% Uptime SLA commitment',
      'Customized dedicated plate OCR algorithms',
      'On-site installation & maintenance engineers',
    ],
    popular: false,
    ctaText: 'Enterprise Consultation',
  },
];

// Marketing card id -> plan code in the backend catalogue.
const PLAN_CODE_ALIAS: Record<string, string> = { business: 'pro' };

function mergeLivePlans(fallback: PricingPlan[], live: PlanOut[] | null): PricingPlan[] {
  if (!live) return fallback;
  return fallback.map((plan) => {
    const apiPlan = live.find((p) => p.code === (PLAN_CODE_ALIAS[plan.id] ?? plan.id));
    if (!apiPlan) return plan;
    const isVnd = apiPlan.currency === 'VND';
    const price =
      apiPlan.priceMonthlyCents > 0
        ? new Intl.NumberFormat(isVnd ? 'vi-VN' : 'en-US').format(apiPlan.priceMonthlyCents / 100)
        : 'Contact us';
    return { ...plan, name: apiPlan.name, price, currency: apiPlan.currency };
  });
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onNavigate, onSelectPlan }) => {
  const { t } = useTranslation('landing');
  const [livePlans, setLivePlans] = useState<PlanOut[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    publicApi
      .plans()
      .then((plans) => {
        if (!cancelled) setLivePlans(plans);
      })
      .catch(() => {
        // Catalogue unreachable: the fallback cards stay on screen.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const plans = mergeLivePlans(FALLBACK_PLANS, livePlans);

  const handleChoose = (planId: string) => {
    onSelectPlan?.(planId);
    onNavigate('register');
  };

  return (
    <Plain
      id="pricing"
      titleId="pricing-heading"
      ash
      title={t('Plans by lanes and sites')}
      lead={t('Every plan starts with a free trial. Pick the one that fits how many lanes and sites you run.')}
    >
      <ul className="grid gap-6 lg:grid-cols-3">
        {plans.map((plan) => (
          <li key={plan.id} className={`flex flex-col border-t-2 bg-[var(--t-canvas)] p-7 sm:p-8 ${plan.popular ? 'border-[var(--t-blue)]' : 'border-[var(--t-line-strong)]'}`}>
            <p className={`text-xs font-medium ${plan.popular ? 'text-[var(--t-blue)]' : 'text-[var(--t-pewter)]'}`}>
              {t(plan.badge)}
            </p>
            <h3 className="mt-2 text-[28px] font-medium leading-tight text-[var(--t-ink)]">{plan.name}</h3>
            <p className="mt-2 text-sm leading-5 text-[var(--t-body)]">{t(plan.description)}</p>
            <p className="mt-8 flex flex-wrap items-baseline gap-x-2">
              <span className="text-[32px] font-medium leading-none text-[var(--t-ink)] tabular-nums">{t(plan.price)}</span>
              <span className="text-sm text-[var(--t-pewter)]">
                {plan.currency?.toLowerCase() ?? 'vnd'}/{t(plan.period)}
              </span>
            </p>
            <p className="mt-8 text-sm font-medium text-[var(--t-ink)]">{t('Included benefits:')}</p>
            <ul className="mt-3 flex-1 space-y-2 text-sm text-[var(--t-body)]">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--t-pewter)]" aria-hidden="true" />
                  <span>{t(feature)}</span>
                </li>
              ))}
            </ul>
            <TeslaButton
              variant={plan.popular ? 'primary' : 'secondary'}
              className="mt-10 sm:w-full"
              onClick={() => handleChoose(plan.id)}
            >
              {t(plan.ctaText)}
            </TeslaButton>
          </li>
        ))}
      </ul>
    </Plain>
  );
};
