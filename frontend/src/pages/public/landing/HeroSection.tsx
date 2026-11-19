import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowRight, Check, Radio } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';
import hero from './assets/hero.jpg';
import { TeslaButton } from './tesla';

interface HeroSectionProps {
  onNavigate: (view: PublicViewType) => void;
}

function scrollToDemo() {
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  document
    .getElementById('simulator')
    ?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  return (
    <section aria-labelledby="hero-heading" className="relative overflow-hidden bg-[#f2f4f5] pt-24 dark:bg-[#171a20] sm:pt-28 lg:pt-32">
      <div className="mx-auto grid min-h-[620px] max-w-[1383px] items-center gap-10 px-6 pb-16 sm:px-10 lg:grid-cols-[0.88fr_1.12fr] lg:gap-14 lg:pb-20">
        <div className="relative z-10 max-w-xl">
          <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#52616d] dark:text-[#9aabb7]">
            <span className="h-px w-7 bg-[#3e6ae1]" />
            {t('Parking access control, at the gate')}
          </p>
          <h1 id="hero-heading" className="text-[38px] font-medium leading-[1.08] tracking-[-0.04em] text-[#17212b] dark:text-[#f4f4f4] sm:text-[54px] lg:text-[62px]">
            {t('Gate control by number plate, decided at the gate.')}
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-[#52616d] dark:text-[#c7cacf] sm:text-lg">
            {t('Reads RTSP IP camera streams')} · {t('Drives your existing barrier')} · {t('Keeps deciding offline')}
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <TeslaButton onClick={() => onNavigate('register')}>{t('Start 14-day free trial')}</TeslaButton>
            <TeslaButton variant="secondary" onClick={scrollToDemo}>
              {t('See the demo')} <ArrowDown className="ml-2 h-4 w-4" aria-hidden="true" />
            </TeslaButton>
          </div>
          <div className="mt-10 flex items-start gap-3 border-t border-[#d8dee3] pt-5 text-sm text-[#52616d] dark:border-[#3a3f48] dark:text-[#c7cacf]">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#28734e]" aria-hidden="true" />
            <p>{t('Works with your current IP cameras and barrier relay.')}</p>
          </div>
        </div>

        <div className="relative min-w-0">
          <div className="relative aspect-[1.25/1] overflow-hidden bg-[#d7dde1] dark:bg-[#252c35]">
            <img
              src={hero}
              alt={t('A car stopped at the entry lane, its plate facing the gate camera')}
              loading="eager"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover object-[50%_58%] grayscale-[.55] contrast-[.92]"
            />
            <div className="absolute inset-0 bg-[#152331]/10" aria-hidden="true" />
            <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4 bg-gradient-to-t from-[#101820]/75 to-transparent px-5 pb-5 pt-20 text-white sm:px-7 sm:pb-7">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">{t('Entry lane 01')}</p>
                <p className="mt-1 text-sm font-medium">{t('Local decision · Edge Client')}</p>
              </div>
              <span className="flex items-center gap-2 text-xs text-white/80">
                <Radio className="h-3.5 w-3.5" aria-hidden="true" /> {t('Illustrative view')}
              </span>
            </div>
          </div>

          <div className="absolute -bottom-5 right-4 w-[min(280px,78%)] border border-[#d8dee3] bg-white p-4 shadow-[0_10px_28px_rgba(20,32,43,0.12)] sm:-bottom-6 sm:right-7 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[#687782]">{t('Plate recognized')}</p>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[#28734e]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#28734e]" /> {t('Access allowed')}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-[#e7ebee] pt-3">
              <span className="font-mono text-xl font-semibold tracking-[0.08em] text-[#17212b]">51K-888.68</span>
              <ArrowRight className="h-4 w-4 text-[#687782]" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
