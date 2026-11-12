import React from 'react';
import { useTranslation } from 'react-i18next';

interface Solution {
  title: string;
  body: string;
  uses: string;
}

const SOLUTIONS: Solution[] = [
  {
    title: 'Office buildings and malls',
    body: 'Let staff and executive vehicles through without cards or tickets, keep visitors on a pre-approved list, and give the security desk a live view of every lane.',
    uses: 'Rules by tag and time window · visitor lists · live events',
  },
  {
    title: 'Apartments and residential areas',
    body: 'Register residents’ vehicles once, manage monthly memberships, and stop unknown vehicles at the barrier instead of at the guard’s window.',
    uses: 'Vehicle registry · memberships · CSV import',
  },
  {
    title: 'Industrial parks and logistics yards',
    body: 'Give contractor and delivery vehicles access only in their time windows, and keep an entry and exit history for every plate.',
    uses: 'Scheduled rules · event history · audit export',
  },
  {
    title: 'Paid public parking',
    body: 'Fees are calculated from your tariff by time block. Drivers pay in the app before they leave, and a paid exit lets the exit gate open.',
    uses: 'Tariffs · driver app · in-app payment (needs a connection)',
  },
];

export const SolutionsSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <section id="solutions" aria-labelledby="solutions-heading" className="scroll-mt-20 border-b border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_2fr] lg:gap-16">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">04 · {t('Solutions')}</p>
            <h2 id="solutions-heading" className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              {t('Built for the lots you run')}
            </h2>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              {t('The same gate, rules and dashboard, set up for how each kind of property works.')}
            </p>
          </div>
          <ol className="divide-y divide-border border-y border-border">
            {SOLUTIONS.map((solution, index) => (
              <li key={solution.title} className="grid gap-3 py-8 sm:grid-cols-[3rem_1fr]">
                <span className="font-mono text-sm text-primary" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{t(solution.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(solution.body)}</p>
                  <p className="mt-3 font-mono text-xs text-muted-foreground">{t(solution.uses)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
};
