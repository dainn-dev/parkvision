import React from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  Camera,
  ListOrdered,
  Receipt,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react';

interface Feature {
  icon: LucideIcon;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    icon: Camera,
    title: 'Plate recognition at the lane',
    body: 'A recognition worker next to the gate reads RTSP streams from your IP cameras and hands each plate read to the Edge Client over the local network.',
  },
  {
    icon: ListOrdered,
    title: 'Priority-ordered access rules',
    body: 'Allow and deny lists, vehicle tags, days of the week and time windows. Rules run in priority order and the first match wins.',
  },
  {
    icon: RotateCcw,
    title: 'Anti-passback',
    body: 'Stops the same plate from being let through twice in the same direction within a configurable window.',
  },
  {
    icon: Building2,
    title: 'Many sites, one account',
    body: 'Sites, gates and cameras under one organization, staff roles and permissions, and data kept separate from other customers.',
  },
  {
    icon: Receipt,
    title: 'Parking fees and memberships',
    body: 'Time-block tariffs with an optional daily cap and overnight surcharge, monthly memberships, and in-app payment for drivers.',
  },
  {
    icon: Activity,
    title: 'Live events and remote control',
    body: 'Gate events stream to the dashboard as they happen. Staff can open a gate remotely and see when the edge acknowledges the command.',
  },
];

export const FeaturesSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <section id="features" aria-labelledby="features-heading" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">03 · {t('Features')}</p>
        <h2 id="features-heading" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('What you run your gates with')}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t('From the camera at the lane to the fee at the exit, in one system you control.')}
        </p>

        <ul className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <li key={feature.title} className="bg-card p-6 sm:p-8">
                <Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                <h3 className="mt-5 text-base font-semibold text-foreground">{t(feature.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(feature.body)}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
};
