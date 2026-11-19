import React from 'react';
import { useTranslation } from 'react-i18next';
import type { PublicViewType } from '../../../lib/publicRoutes';
import { ArrowRight } from 'lucide-react';
import { TeslaButton } from './tesla';

interface FinalCtaSectionProps {
  onNavigate: (view: PublicViewType) => void;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  return (
    <section className="marketing-cta bg-[#17212b] py-20 text-white sm:py-28">
      <div className="mx-auto flex max-w-[1383px] flex-col justify-between gap-10 px-6 sm:px-10 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#aebbc4]">ParkVision</p>
          <h2 id="cta-heading" className="text-[32px] font-medium leading-tight tracking-[-0.03em] sm:text-[44px]">
            {t('Put ParkVision on your first gate')}
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[#c7cacf] sm:text-base">
            {t('Register your organization, connect one lane, and watch its decisions arrive in your dashboard.')}
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <TeslaButton onClick={() => onNavigate('register')}>{t('Create your organization')}</TeslaButton>
          <TeslaButton variant="onImage" onClick={() => onNavigate('login')}>
            {t('Sign in to an existing account')} <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
          </TeslaButton>
        </div>
      </div>
    </section>
  );
};
