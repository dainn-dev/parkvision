import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';
import { publicApi, type PlanOut } from '../../../services/api';

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
      'Manage 1 Site',
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
      'Manage up to 3 Sites simultaneously',
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
      'Unlimited Sites and stored vehicles',
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
    <section id="pricing" aria-labelledby="pricing-heading" className="scroll-mt-20 border-b border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">06 · {t('Pricing')}</p>
        <h2 id="pricing-heading" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('Plans by lanes and sites')}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t('Every plan starts with a free trial. Pick the one that fits how many lanes and sites you run.')}
        </p>

        <ul className="mt-14 grid gap-6 lg:grid-cols-3">
          {plans.map((plan) => (
            <li
              key={plan.id}
              className={`flex flex-col rounded-xl border bg-card p-6 sm:p-8 ${
                plan.popular ? 'border-primary ring-1 ring-primary' : 'border-border'
              }`}
            >
              <p className="font-mono text-xs text-primary">{t(plan.badge)}</p>
              <h3 className="mt-2 text-2xl font-semibold text-foreground">{plan.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(plan.description)}</p>

              <p className="mt-6 flex flex-wrap items-baseline gap-x-2 border-y border-border py-5">
                <span className="font-mono text-3xl font-semibold text-foreground">{t(plan.price)}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {plan.currency?.toLowerCase() ?? 'vnd'}/{t(plan.period)}
                </span>
              </p>

              <p className="mt-6 font-mono text-xs uppercase tracking-wider text-muted-foreground">
                {t('Included benefits:')}
              </p>
              <ul className="mt-3 flex-1 space-y-2.5 text-sm text-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{t(feature)}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleChoose(plan.id)}
                className={`mt-8 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  plan.popular
                    ? 'bg-primary text-primary-foreground hover:opacity-90'
                    : 'border border-border bg-secondary text-secondary-foreground hover:bg-muted'
                }`}
              >
                {t(plan.ctaText)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
