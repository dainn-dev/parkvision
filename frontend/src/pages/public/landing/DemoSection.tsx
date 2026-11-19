import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import heroGate from './assets/hero-gate.jpg';
import { Plain } from './tesla';

type DemoStatus = 'ALLOWED' | 'DENIED' | 'CRITICAL_BLOCK';

interface DemoScenario {
  id: string;
  name: string;
  plate: string;
  vehicleType: string;
  owner: string;
  status: DemoStatus;
  winningRule: string;
  reason: string;
}

const SCAN_DELAY_PRESET_MS = 600;
const SCAN_DELAY_CUSTOM_MS = 500;

const DEMO_SCENARIOS: DemoScenario[] = [
  {
    id: 'vip',
    name: 'VIP / Executive Vehicle',
    plate: '51A-888.88',
    vehicleType: 'Black sedan',
    owner: 'Executive, registered',
    status: 'ALLOWED',
    winningRule: '#1 · VIP access, any time',
    reason: 'The plate is on the VIP list. The barrier opens automatically.',
  },
  {
    id: 'employee',
    name: 'Employee Vehicle (Day Shift)',
    plate: '29A-123.45',
    vehicleType: 'White SUV',
    owner: 'Staff, finance department',
    status: 'ALLOWED',
    winningRule: '#4 · Staff access, 06:00–20:00',
    reason: 'Inside the staff time window and the registration is valid. The barrier opens.',
  },
  {
    id: 'visitor',
    name: 'Unregistered Visitor Vehicle',
    plate: '43B-999.01',
    vehicleType: 'Silver hatchback',
    owner: 'Not registered',
    status: 'DENIED',
    winningRule: '#99 · Default: deny unregistered',
    reason: 'The plate is not in your vehicle list. The guard checks the visitor by hand.',
  },
  {
    id: 'blacklist',
    name: 'Security-Flagged Vehicle',
    plate: '30G-666.99',
    vehicleType: 'Red pickup',
    owner: 'Flagged for repeated violations',
    status: 'CRITICAL_BLOCK',
    winningRule: '#0 · Blocklist',
    reason: 'The plate is on the blocklist. The barrier stays down and the event is flagged on the dashboard.',
  },
];

// Simulated matching for a typed plate: 666/404 -> blocklist, 888/999 -> pre-approved, else unregistered.
function classifyCustomPlate(input: string): DemoScenario {
  const plate = input.trim().toUpperCase();
  const clean = plate.replace(/[^A-Z0-9]/g, '');
  const base = { name: plate, plate, vehicleType: 'Vehicle' };
  if (clean.includes('666') || clean.includes('404')) {
    return {
      ...base,
      id: 'custom-block',
      owner: 'Suspected forged plate',
      status: 'CRITICAL_BLOCK',
      winningRule: '#0 · Blocklist',
      reason: 'The plate matches the blocklist. The barrier stays down and the event is flagged on the dashboard.',
    };
  }
  if (clean.includes('888') || clean.includes('999')) {
    return {
      ...base,
      id: 'custom-vip',
      owner: 'Pre-registered guest',
      status: 'ALLOWED',
      winningRule: '#3 · Pre-approved visitors',
      reason: 'The plate is pre-approved. The barrier opens automatically.',
    };
  }
  return {
    ...base,
    id: 'custom-unregistered',
    owner: 'Not registered',
    status: 'DENIED',
    winningRule: '#99 · Default: deny unregistered',
    reason: 'No valid registration or membership found. Staff decide manually.',
  };
}

const STATUS_VIEW: Record<DemoStatus, { decision: string; barrier: string; dot: string }> = {
  ALLOWED: { decision: 'Entry allowed', barrier: 'Arm raised', dot: 'bg-[#2e9e5b]' },
  DENIED: { decision: 'Denied: staff check', barrier: 'Arm down', dot: 'bg-[#d9a400]' },
  CRITICAL_BLOCK: { decision: 'Blocked: flagged', barrier: 'Arm locked', dot: 'bg-[#d4342c]' },
};

/** Where the plate sits in hero-gate.jpg (percent of the 16:9 frame). */
const PLATE_SPOT = { left: '45.75%', top: '69.6%' };

const BarrierArm: React.FC<{ isRaised: boolean }> = ({ isRaised }) => (
  <svg viewBox="0 0 120 60" className="h-12 w-24 text-[var(--t-pewter)]" aria-hidden="true">
    <rect x="8" y="22" width="14" height="38" rx="1" fill="currentColor" fillOpacity="0.6" />
    <rect
      x="15"
      y="22"
      width="100"
      height="6"
      rx="1"
      className={`origin-left fill-[var(--t-ink)] transition-transform duration-700 [transform-box:fill-box] motion-reduce:transition-none ${
        isRaised ? '-rotate-[75deg]' : 'rotate-0'
      }`}
    />
  </svg>
);

export const DemoSection: React.FC = () => {
  const { t } = useTranslation('landing');
  const [scenario, setScenario] = useState<DemoScenario>(DEMO_SCENARIOS[0]);
  const [plateInput, setPlateInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const scan = (next: DemoScenario, delayMs: number) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsScanning(true);
    timerRef.current = setTimeout(() => {
      setScenario(next);
      setIsScanning(false);
    }, delayMs);
  };

  const handleSelect = (preset: DemoScenario) => {
    setPlateInput(preset.plate);
    scan(preset, SCAN_DELAY_PRESET_MS);
  };

  const handleCustomScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!plateInput.trim()) return;
    scan(classifyCustomPlate(plateInput), SCAN_DELAY_CUSTOM_MS);
  };

  const view = STATUS_VIEW[scenario.status];
  const details: [string, string][] = [
    ['Vehicle', t(scenario.vehicleType)],
    ['Registered as', t(scenario.owner)],
    ['Matched rule', t(scenario.winningRule)],
  ];

  return (
    <Plain
      id="simulator"
      titleId="demo-heading"
      ash
      title={t('Try a gate decision')}
      lead={t(
        'Pick a vehicle or type a plate to see how a rule is matched and what the barrier does. This is a simulation in your browser; no camera is involved.',
      )}
    >
      <div className="grid gap-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-14">
        <div>
          <h3 className="text-[17px] font-medium text-[var(--t-ink)]">{t('Sample vehicles')}</h3>
          <ul className="mt-4">
            {DEMO_SCENARIOS.map((preset) => {
              const isSelected = preset.id === scenario.id;
              return (
                <li key={preset.id}>
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelect(preset)}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-[4px] px-3 py-3 text-left transition-colors duration-[330ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--t-blue)] ${
                      isSelected ? 'bg-[var(--t-canvas)]' : 'hover:bg-[var(--t-canvas)]'
                    }`}
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_VIEW[preset.status].dot}`} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-[var(--t-ink)]">{t(preset.name)}</span>
                      <span className="block text-xs text-[var(--t-pewter)]">{preset.plate}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <form onSubmit={handleCustomScan} className="mt-8">
            <label htmlFor="demo-plate" className="text-sm font-medium text-[var(--t-ink)]">
              {t('Or type any plate')}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="demo-plate"
                type="text"
                value={plateInput}
                onChange={(e) => setPlateInput(e.target.value)}
                placeholder="59X1-888.99"
                maxLength={16}
                autoComplete="off"
                className="min-h-10 min-w-0 flex-1 rounded-[4px] border border-[var(--t-line-strong)] bg-[var(--t-canvas)] px-3 text-sm uppercase text-[var(--t-ink)] placeholder:text-[var(--t-fog)] focus:border-[var(--t-ink)] focus:outline-none"
              />
              <button
                type="submit"
                disabled={isScanning || !plateInput.trim()}
                className="min-h-10 cursor-pointer rounded-[4px] bg-[var(--t-blue)] px-5 text-sm font-medium text-[#fff] transition-colors duration-[330ms] hover:bg-[var(--t-blue-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t('Scan')}
              </button>
            </div>
          </form>
        </div>

        <div>
          <div className="relative aspect-video overflow-hidden bg-[#171a20]">
            <img
              src={heroGate}
              alt={t('A car stopped at the entry lane, its plate facing the gate camera')}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="absolute left-3 top-3 rounded-[4px] bg-white/90 px-2 py-1 text-xs font-medium text-[#393c41]">
              {t('Lane 01 · entry')} · {t('simulated')}
            </span>
            <div className="absolute -translate-x-1/2 -translate-y-1/2" style={PLATE_SPOT}>
              <div
                className="rounded-[2px] p-[3px]"
                style={{ outline: isScanning ? '2px dashed #ffffff' : '2px solid #3e6ae1' }}
              >
                <div className="whitespace-nowrap rounded-[2px] border border-[#171a20] bg-[#f4f4f0] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[#171a20] sm:text-xs">
                  {isScanning ? '·······' : scenario.plate}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 min-h-[168px]" aria-live="polite">
            {isScanning ? (
              <p className="text-sm text-[var(--t-pewter)]">{t('Reading plate…')}</p>
            ) : (
              <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[17px] font-medium text-[var(--t-ink)]">
                    <span className={`h-2 w-2 rounded-full ${view.dot}`} aria-hidden="true" />
                    {t(view.decision)}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-[var(--t-body)]">{t(scenario.reason)}</p>
                  <dl className="mt-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
                    {details.map(([label, value]) => (
                      <React.Fragment key={label}>
                        <dt className="text-[var(--t-pewter)]">{t(label)}</dt>
                        <dd className="text-[var(--t-ink)]">{value}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </div>
                <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                  <BarrierArm isRaised={scenario.status === 'ALLOWED'} />
                  <span className="text-xs text-[var(--t-pewter)]">{t(view.barrier)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Plain>
  );
};
