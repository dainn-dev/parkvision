import React from 'react';
import { useTranslation } from 'react-i18next';
import anpr from './assets/anpr.jpg';
import ledDeny from './assets/led-deny.jpg';
import heroGate from './assets/hero-gate.jpg';
import suvBay from './assets/suv-bay.jpg';
import kiosk from './assets/kiosk.jpg';
import barrier from './assets/barrier.jpg';
import { Plain } from './tesla';

interface Feature {
  image: string;
  alt: string;
  title: string;
  body: string;
}

const FEATURES: Feature[] = [
  {
    image: anpr,
    alt: 'The entry camera reading the plate of a car at the barrier',
    title: 'Plate recognition at the lane',
    body: 'A recognition worker next to the gate reads RTSP streams from your IP cameras and hands each plate read to the Edge Client over the local network.',
  },
  {
    image: ledDeny,
    alt: 'The gate display showing an unregistered plate',
    title: 'Priority-ordered access rules',
    body: 'Allow and deny lists, vehicle tags, days of the week and time windows. Rules run in priority order and the first match wins.',
  },
  {
    image: heroGate,
    alt: 'A car waiting at the entry stop line',
    title: 'Anti-passback',
    body: 'Stops the same plate from being let through twice in the same direction within a configurable window.',
  },
  {
    image: suvBay,
    alt: 'Parked cars in a row of bays',
    title: 'Many sites, one account',
    body: 'Sites, gates and cameras under one organization, staff roles and permissions, and data kept separate from other customers.',
  },
  {
    image: kiosk,
    alt: 'The exit kiosk showing a payment code next to the fee on the gate display',
    title: 'Parking fees and memberships',
    body: 'Time-block tariffs with an optional daily cap and overnight surcharge, monthly memberships, and in-app payment for drivers.',
  },
  {
    image: barrier,
    alt: 'The entry barrier rising for a registered car under the gate canopy',
    title: 'Live events and remote control',
    body: 'Gate events stream to the dashboard as they happen. Staff can open a gate remotely and see when the edge acknowledges the command.',
  },
];

export const FeaturesSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <Plain
      id="features"
      titleId="features-heading"
      title={t('What you run your gates with')}
      lead={t('From the camera at the lane to the fee at the exit, in one system you control.')}
    >
      <ul className="grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature) => (
          <li key={feature.title}>
            <div className="aspect-[2/1] overflow-hidden bg-[var(--t-ash)]">
              <img
                src={feature.image}
                alt={t(feature.alt)}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            </div>
            <h3 className="mt-5 text-[17px] font-medium text-[var(--t-ink)]">{t(feature.title)}</h3>
            <p className="mt-2 text-sm leading-5 text-[var(--t-body)]">{t(feature.body)}</p>
          </li>
        ))}
      </ul>
    </Plain>
  );
};
