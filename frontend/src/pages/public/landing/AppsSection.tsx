import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ArrowRight, Monitor, MonitorSmartphone, Smartphone, type LucideIcon } from 'lucide-react';

interface AppEntry {
  icon: LucideIcon;
  name: string;
  platform: string;
  audience: string;
  body: string;
}

const APPS: AppEntry[] = [
  {
    icon: Monitor,
    name: 'Dashboard',
    platform: 'Web browser',
    audience: 'For owners and staff',
    body: 'Sites, vehicles, rules, tariffs, live events and reports. Nothing to install.',
  },
  {
    icon: MonitorSmartphone,
    name: 'Edge Client',
    platform: 'Windows',
    audience: 'For the gatehouse PC',
    body: 'Runs the gates: reads plates, decides access, drives the barrier and keeps working offline.',
  },
  {
    icon: Smartphone,
    name: 'Driver app',
    platform: 'Android',
    audience: 'For your drivers',
    body: 'Find a lot, register vehicles, follow parking sessions, hold memberships and pay fees.',
  },
];

export const AppsSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <section id="apps" aria-labelledby="apps-heading" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">05 · {t('Apps')}</p>
            <h2 id="apps-heading" className="mt-4 max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t('Three apps, one system')}
            </h2>
          </div>
          <Link
            to="/download"
            className="inline-flex items-center gap-2 self-start text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:self-auto"
          >
            {t('Download the Edge Client and driver app')}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <ul className="mt-12 grid gap-6 md:grid-cols-3">
          {APPS.map((app) => {
            const Icon = app.icon;
            return (
              <li key={app.name} className="flex flex-col rounded-xl border border-border bg-card p-6">
                <div className="flex items-center justify-between">
                  <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  <span className="rounded border border-border px-2 py-0.5 font-mono text-xs text-muted-foreground">
                    {t(app.platform)}
                  </span>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-foreground">{t(app.name)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(app.audience)}</p>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t(app.body)}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
