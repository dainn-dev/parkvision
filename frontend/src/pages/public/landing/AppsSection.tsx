import React from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Monitor, MonitorSmartphone, Smartphone, type LucideIcon } from 'lucide-react';
import { Plain } from './tesla';

interface AppEntry {
  icon: LucideIcon;
  name: string;
  platform: string;
  audience: string;
  body: string;
  link: { to: string; label: string };
}

const APPS: AppEntry[] = [
  {
    icon: Monitor,
    name: 'Dashboard',
    platform: 'Web browser',
    audience: 'For owners and staff',
    body: 'Sites, vehicles, rules, tariffs, live events and reports. Nothing to install.',
    link: { to: '/login', label: 'Sign in' },
  },
  {
    icon: MonitorSmartphone,
    name: 'Edge Client',
    platform: 'Windows',
    audience: 'For the gatehouse PC',
    body: 'Runs the gates: reads plates, decides access, drives the barrier and keeps working offline.',
    link: { to: '/download', label: 'Download' },
  },
  {
    icon: Smartphone,
    name: 'Driver app',
    platform: 'Android',
    audience: 'For your drivers',
    body: 'Find a lot, register vehicles, follow parking sessions, hold memberships and pay fees.',
    link: { to: '/download', label: 'Download' },
  },
];

export const AppsSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <Plain id="apps" titleId="apps-heading" title={t('Three apps, one system')}>
      <ul className="grid gap-x-6 gap-y-14 md:grid-cols-3">
        {APPS.map((app) => {
          const Icon = app.icon;
          return (
            <li key={app.name} className="flex flex-col items-center text-center">
              <div className="flex aspect-[16/10] w-full items-center justify-center border-y border-[var(--t-line)] bg-[var(--t-ash)]">
                <Icon className="h-16 w-16 text-[var(--t-pewter)]" strokeWidth={1.25} aria-hidden="true" />
              </div>
              <h3 className="mt-5 text-[17px] font-medium text-[var(--t-ink)]">{t(app.name)}</h3>
              <p className="mt-1 text-sm text-[var(--t-pewter)]">
                {t(app.audience)} · {t(app.platform)}
              </p>
              <p className="mt-3 max-w-xs text-sm leading-5 text-[var(--t-body)]">{t(app.body)}</p>
              <div className="mt-4 flex gap-6 text-sm">
                <Link to={app.link.to} className="tesla-link">
                  {t(app.link.label)}
                </Link>
                <Link to="/tour" className="tesla-link">
                  {t('Take the 3D tour')}
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-16 text-center text-sm">
        <Link to="/download" className="tesla-link">
          {t('Download the Edge Client and driver app')}
        </Link>
      </p>
    </Plain>
  );
};
