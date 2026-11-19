import React from 'react';
import { useTranslation } from 'react-i18next';
import remote from './assets/remote.jpg';
import offline from './assets/offline.jpg';
import lotAerial from './assets/lot-aerial.jpg';
import { FullBleed, Plain, TeslaLinkButton } from './tesla';

interface Step {
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Register your organization',
    body: 'Create your tenant, then add sites, gates and cameras. Enter vehicles one by one or import them from a CSV file.',
  },
  {
    title: 'Install the Edge Client',
    body: 'Install it on the gatehouse PC, activate it with a code from the dashboard, and wire the barrier relay. Check each barrier model on site before go-live.',
  },
  {
    title: 'Operate from the dashboard',
    body: 'Set access rules and tariffs, watch gate events live, and open a gate remotely when staff need to.',
  },
];

export const PipelineSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <>
      <FullBleed
        id="how-it-works"
        titleId="how-decide-heading"
        image={remote}
        alt={t('A gate barrier raised under the canopy, next to the gatehouse')}
        tone="white"
        focus="50% 40%"
        title={t('Decided at the gate')}
        subtitle={t(
          'The Edge Client on the gatehouse PC checks each plate against its local copy of your vehicle list and access rules, then pulses the barrier relay. No round trip to the cloud.',
        )}
        actions={<TeslaLinkButton to="/tour">{t('Take the 3D tour')}</TeslaLinkButton>}
      />
      <FullBleed
        titleId="how-offline-heading"
        image={offline}
        alt={t('The gatehouse while its connection to the cloud is down')}
        focus="55% 50%"
        title={t('Keeps working offline')}
        subtitle={t(
          'If the internet drops, the gate keeps deciding from the last synced list and events wait in a local queue.',
        )}
        footnote={
          <>
            <span className="font-medium">{t('Know the limits:')}</span>{' '}
            {t(
              'an edge needs one successful sync before it can decide on its own, and online payments need a connection. A driver who paid just before an outage may need staff to open the gate.',
            )}
          </>
        }
      />
      <FullBleed
        titleId="how-sync-heading"
        image={lotAerial}
        alt={t('The whole lot from above, with the gate canopy and the office building')}
        focus="45% 50%"
        title={t('Syncs back when connected')}
        subtitle={t(
          'Vehicle and rule changes flow down to every edge; queued events flow up to your dashboard once the connection returns.',
        )}
      />
      <Plain
        titleId="how-heading"
        title={t('The edge decides. The cloud manages.')}
        lead={t(
          'Every gate runs on its own. Your network connection carries management and history, not the decision to lift the barrier.',
        )}
      >
        <h3 className="text-[17px] font-medium text-[var(--t-ink)]">{t('Three steps to go live')}</h3>
        <ol className="mt-8 grid gap-12 md:grid-cols-3 md:gap-10">
          {STEPS.map((step, index) => (
            <li key={step.title}>
              <span className="text-[40px] font-medium leading-none text-[var(--t-ink)]" aria-hidden="true">
                {index + 1}
              </span>
              <h4 className="mt-5 text-[17px] font-medium text-[var(--t-ink)]">{t(step.title)}</h4>
              <p className="mt-2 text-sm leading-5 text-[var(--t-body)]">{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </Plain>
    </>
  );
};
