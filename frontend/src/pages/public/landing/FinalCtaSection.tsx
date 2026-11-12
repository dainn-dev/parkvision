import React from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import type { PublicViewType } from '../../../lib/publicRoutes';

interface FinalCtaSectionProps {
  onNavigate: (view: PublicViewType) => void;
}

export const FinalCtaSection: React.FC<FinalCtaSectionProps> = ({ onNavigate }) => {
  const { t } = useTranslation('landing');
  return (
    <section aria-labelledby="cta-heading">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="relative overflow-hidden rounded-xl border border-border bg-card px-6 py-12 shadow-xl shadow-primary/10 sm:px-12 sm:py-16">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-1.5 opacity-80"
            style={{
              backgroundImage: 'repeating-linear-gradient(135deg, #f5c518 0 14px, #1f2328 14px 28px)',
            }}
          />
          <h2 id="cta-heading" className="max-w-2xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('Put ParkVision on your first gate')}
          </h2>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
            {t('Register your organization, connect one lane, and watch its decisions arrive in your dashboard.')}
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => onNavigate('register')}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
            >
              {t('Create your organization')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onNavigate('login')}
              className="inline-flex items-center justify-center rounded-lg border border-border bg-background px-6 py-3 text-sm font-semibold text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('Sign in to an existing account')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
