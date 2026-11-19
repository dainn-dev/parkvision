import React from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Plain } from './tesla';

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
    <Plain
      id="faq"
      titleId="faq-heading"
      title={t('Questions owners ask')}
      lead={t('Straight answers, including what the system does not do.')}
    >
      <div className="max-w-3xl border-t border-[var(--t-line)]">
        {FAQS.map((faq, index) => (
          <details key={faq.q} className="group border-b border-[var(--t-line)]" open={index === 0}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-left text-[17px] font-medium text-[var(--t-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-blue)] [&::-webkit-details-marker]:hidden">
              <span>{t(faq.q)}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-[var(--t-pewter)] transition-transform duration-[330ms] group-open:rotate-180 motion-reduce:transition-none"
                aria-hidden="true"
              />
            </summary>
            <p className="pb-6 pr-8 text-sm leading-6 text-[var(--t-body)]">{t(faq.a)}</p>
          </details>
        ))}
      </div>
    </Plain>
  );
};
