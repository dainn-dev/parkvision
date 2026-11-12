import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: 'Do I have to replace my barriers?',
    a: 'Usually not. The Edge Client drives a barrier through a relay contact: a camera alarm output, a serial or Modbus relay board, or an access controller. The barrier board keeps its own safety logic, such as the loop detector and auto-close. Wiring presets are only a starting point, so each barrier model is checked on site before go-live.',
  },
  {
    q: 'What happens when the internet goes down?',
    a: 'The Edge Client keeps deciding from the vehicle list and rules it last synced, and drives the barrier locally. Events are queued on the gatehouse PC and sent once the connection returns. An edge that has never synced has nothing to decide from, and online payments need a connection: a driver who paid just before an outage may need staff to open the gate.',
  },
  {
    q: 'Which cameras can I use?',
    a: 'The recognition worker reads standard RTSP video streams from IP cameras. Camera position, angle and lighting at the lane matter most for reading plates, so check them on site before go-live.',
  },
  {
    q: 'Is our data kept separate from other customers?',
    a: 'Yes. Each organization is a separate tenant, isolated in the database by row-level security. Staff sign in with role-based permissions, and dashboard accounts can use multi-factor authentication.',
  },
  {
    q: 'How do drivers pay for parking?',
    a: 'Fees are calculated by time block from your tariff, with an optional daily cap and overnight surcharge. Drivers pay in the driver app with MoMo or their in-app wallet, and can hold monthly memberships.',
  },
  {
    q: 'How do we get started?',
    a: 'Register your organization for a free trial and add your sites, gates and vehicles, or import vehicles from a CSV file. Then install the Edge Client on the gatehouse PC and activate it with a code from the dashboard.',
  },
];

export const FaqSection: React.FC = () => {
  const { t } = useTranslation('landing');
  return (
    <section id="faq" aria-labelledby="faq-heading" className="scroll-mt-20 border-b border-border">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-28 lg:grid-cols-[1fr_2fr] lg:gap-16 lg:px-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-primary">07 · {t('FAQ')}</p>
          <h2 id="faq-heading" className="mt-4 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            {t('Questions owners ask')}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            {t('Straight answers, including what the system does not do.')}
          </p>
        </div>
        <div className="divide-y divide-border border-y border-border">
          {FAQS.map((faq, index) => (
            <details key={faq.q} className="group" open={index === 0}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-base font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                <span>{t(faq.q)}</span>
                <ChevronDown
                  className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
                  aria-hidden="true"
                />
              </summary>
              <p className="pb-6 pr-8 text-sm leading-relaxed text-muted-foreground">{t(faq.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
};
