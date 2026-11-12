import React from 'react';
import { useTranslation } from 'react-i18next';

interface Principle {
  tag: string;
  title: string;
  body: string;
}

interface Step {
  title: string;
  body: string;
}

const PRINCIPLES: Principle[] = [
  {
    tag: 'decide',
    title: 'Decided at the gate',
    body: 'The Edge Client on the gatehouse PC checks each plate against its local copy of your vehicle list and access rules, then pulses the barrier relay. No round trip to the cloud.',
  },
  {
    tag: 'offline',
    title: 'Keeps working offline',
    body: 'If the internet drops, the gate keeps deciding from the last synced list and events wait in a local queue.',
  },
  {
    tag: 'sync',
    title: 'Syncs back when connected',
    body: 'Vehicle and rule changes flow down to every edge; queued events flow up to your dashboard once the connection returns.',
  },
];

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
    <section id="how-it-works" aria-labelledby="how-heading" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">01 · {t('How it works')}</p>
        <h2 id="how-heading" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('The edge decides. The cloud manages.')}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t(
            'Every gate runs on its own. Your network connection carries management and history, not the decision to lift the barrier.',
          )}
        </p>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-3">
          {PRINCIPLES.map((principle) => (
            <div key={principle.tag} className="bg-card p-6 sm:p-8">
              <span className="font-mono text-xs text-primary">{principle.tag}</span>
              <h3 className="mt-3 text-lg font-semibold text-foreground">{t(principle.title)}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(principle.body)}</p>
            </div>
          ))}
        </div>

        <p className="mt-6 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{t('Know the limits:')}</span>{' '}
          {t(
            'an edge needs one successful sync before it can decide on its own, and online payments need a connection. A driver who paid just before an outage may need staff to open the gate.',
          )}
        </p>

        <h3 className="mt-20 text-xl font-semibold text-foreground">{t('Three steps to go live')}</h3>
        <ol className="mt-8 grid gap-8 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="border-t border-border pt-6">
              <span className="font-mono text-sm text-primary" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h4 className="mt-3 text-base font-semibold text-foreground">{t(step.title)}</h4>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};
