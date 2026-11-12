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
    <figure className="rounded-xl border border-border bg-card shadow-xl shadow-primary/10">
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
                  {index === 0 && (
                    <span className="rounded border-2 border-zinc-800 bg-white px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-zinc-900">
                      30A-123.45
                    </span>
                  )}
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
    <section aria-labelledby="hero-heading" className="relative overflow-hidden border-b border-border">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              'linear-gradient(to right, var(--border) 1px, transparent 1px), linear-gradient(to bottom, var(--border) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 70% 40%, #000 20%, transparent 75%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 70% 40%, #000 20%, transparent 75%)',
          }}
        />
      </div>
      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-28 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16 lg:px-8">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t('ParkVision · plate recognition for parking')}
          </p>
          <h1
            id="hero-heading"
            className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl"
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
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:-translate-y-0.5 hover:opacity-90 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
      <div
        aria-hidden="true"
        className="h-1.5 w-full opacity-80"
        style={{
          backgroundImage:
            'repeating-linear-gradient(135deg, #f5c518 0 14px, #1f2328 14px 28px)',
        }}
      />
    </section>
  );
};
