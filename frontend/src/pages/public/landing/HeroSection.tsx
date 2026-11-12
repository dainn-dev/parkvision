import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Camera, Cloud, Cpu, type LucideIcon } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';

interface HeroSectionProps {
  onNavigate: (view: PublicViewType) => void;
}

interface PipelineNode {
  icon: LucideIcon;
  label: string;
  title: string;
  detail: string;
}

interface PipelineLink {
  label: string;
}

const NODES: PipelineNode[] = [
  {
    icon: Camera,
    label: 'Lane camera',
    title: 'Camera',
    detail: 'IP camera at the lane streams video; the recognition worker reads the plate.',
  },
  {
    icon: Cpu,
    label: 'Gatehouse PC',
    title: 'Edge Client',
    detail: 'Decides access from its local copy of your vehicle list and rules, then drives the barrier relay.',
  },
  {
    icon: Cloud,
    label: 'ParkVision cloud',
    title: 'Dashboard',
    detail: 'Sites, vehicles, rules, fees and the event history for every gate.',
  },
];

const LINKS: PipelineLink[] = [
  { label: 'plate read · local network' },
  { label: 'events and sync · queued while offline' },
];

function scrollToDemo() {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document
    .getElementById('simulator')
    ?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

const PipelineDiagram: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <figure className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="font-mono text-xs text-muted-foreground">{t('pipeline')}</span>
        <span className="font-mono text-xs text-muted-foreground">camera → edge → cloud</span>
      </div>
      <ol className="p-5 sm:p-6" aria-label={t('How a plate read flows')}>
        {NODES.map((node, index) => {
          const Icon = node.icon;
          const isEdge = index === 1;
          const link = LINKS[index];
          return (
            <li key={node.title}>
              <div
                className={`flex gap-4 rounded-lg border p-4 ${
                  isEdge ? 'border-primary bg-accent' : 'border-border bg-background'
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${
                    isEdge ? 'border-primary text-primary' : 'border-border text-muted-foreground'
                  }`}
                  aria-hidden="true"
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-semibold text-foreground">{t(node.title)}</span>
                    <span className="font-mono text-xs text-muted-foreground">{t(node.label)}</span>
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(node.detail)}</p>
                </div>
              </div>
              {link && (
                <div className="flex items-center gap-3 py-2 pl-[2.2rem]" aria-hidden="true">
                  <span className="h-8 w-px border-l border-dashed border-border" />
                  <span className="font-mono text-xs text-muted-foreground">{t(link.label)}</span>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <figcaption className="border-t border-border px-5 py-3 text-xs leading-relaxed text-muted-foreground">
        {t('The gate decision is made on site. The cloud is where you manage it.')}
      </figcaption>
    </figure>
  );
};

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  return (
    <section aria-labelledby="hero-heading" className="border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">
            {t('ParkVision · plate recognition for parking')}
          </p>
          <h1
            id="hero-heading"
            className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight text-foreground sm:text-5xl"
          >
            {t('Gate control by number plate, decided at the gate.')}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {t(
              'ParkVision reads plates at your lanes, opens the barrier for the vehicles you allow, and gives you one dashboard for every site, vehicle and parking fee.',
            )}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {t('Start 14-day free trial')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={scrollToDemo}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('See the demo')}
            </button>
          </div>
          <ul className="mt-10 grid gap-3 font-mono text-xs text-muted-foreground sm:grid-cols-3">
            <li className="border-l border-border pl-3">{t('Reads RTSP IP camera streams')}</li>
            <li className="border-l border-border pl-3">{t('Drives your existing barrier')}</li>
            <li className="border-l border-border pl-3">{t('Keeps deciding offline')}</li>
          </ul>
        </div>
        <PipelineDiagram />
      </div>
    </section>
  );
};
