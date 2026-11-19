import React from 'react';
import { useTranslation } from 'react-i18next';
import { Plain } from './tesla';

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
    <Plain
      id="solutions"
      titleId="solutions-heading"
      ash
      title={t('Built for the lots you run')}
      lead={t('The same gate, rules and dashboard, set up for how each kind of property works.')}
    >
      <ul className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4 lg:gap-10">
        {SOLUTIONS.map((solution) => (
          <li key={solution.title}>
            <h3 className="text-[17px] font-medium text-[var(--t-ink)]">{t(solution.title)}</h3>
            <p className="mt-2 text-sm leading-5 text-[var(--t-body)]">{t(solution.body)}</p>
            <p className="mt-4 text-xs leading-5 text-[var(--t-pewter)]">{t(solution.uses)}</p>
          </li>
        ))}
      </ul>
    </Plain>
  );
};
