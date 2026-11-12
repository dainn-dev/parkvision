import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

const STATUS_VIEW: Record<DemoStatus, { decision: string; barrier: string; tone: string; dot: string }> = {
  ALLOWED: { decision: 'Entry allowed', barrier: 'Arm raised', tone: 'text-[var(--success)]', dot: 'bg-[var(--success)]' },
  DENIED: { decision: 'Denied: staff check', barrier: 'Arm down', tone: 'text-[var(--warning)]', dot: 'bg-[var(--warning)]' },
  CRITICAL_BLOCK: { decision: 'Blocked: flagged', barrier: 'Arm locked', tone: 'text-destructive', dot: 'bg-destructive' },
};

const CarFront: React.FC = () => (
  <svg viewBox="0 0 320 200" className="h-full w-full text-muted-foreground" aria-hidden="true">
    <line x1="0" y1="186" x2="320" y2="186" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="6 6" />
    <path d="M78 92 L104 44 H216 L242 92 Z" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
    <path d="M96 88 L114 54 H206 L224 88 Z" fill="currentColor" fillOpacity="0.08" />
    <rect x="34" y="90" width="252" height="74" rx="18" fill="currentColor" fillOpacity="0.22" stroke="currentColor" strokeWidth="2" />
    <rect x="52" y="104" width="44" height="14" rx="5" fill="currentColor" fillOpacity="0.55" />
    <rect x="224" y="104" width="44" height="14" rx="5" fill="currentColor" fillOpacity="0.55" />
    <rect x="118" y="106" width="84" height="8" rx="3" fill="currentColor" fillOpacity="0.35" />
    <rect x="48" y="160" width="40" height="24" rx="6" fill="currentColor" fillOpacity="0.45" />
    <rect x="232" y="160" width="40" height="24" rx="6" fill="currentColor" fillOpacity="0.45" />
    <rect x="22" y="80" width="18" height="10" rx="3" fill="currentColor" fillOpacity="0.4" />
    <rect x="280" y="80" width="18" height="10" rx="3" fill="currentColor" fillOpacity="0.4" />
  </svg>
);

const BarrierArm: React.FC<{ isRaised: boolean }> = ({ isRaised }) => (
  <svg viewBox="0 0 120 60" className="h-12 w-24 text-muted-foreground" aria-hidden="true">
    <rect x="8" y="22" width="14" height="38" rx="2" fill="currentColor" fillOpacity="0.5" />
    <rect
      x="15"
      y="22"
      width="100"
      height="6"
      rx="3"
      className={`fill-foreground origin-left transition-transform duration-700 [transform-box:fill-box] motion-reduce:transition-none ${
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
    <section id="simulator" aria-labelledby="demo-heading" className="scroll-mt-20 border-b border-border bg-card/40">
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">02 · {t('Demo')}</p>
        <h2 id="demo-heading" className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {t('Try a gate decision')}
        </h2>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
          {t('Pick a vehicle or type a plate to see how a rule is matched and what the barrier does. This is a simulation in your browser; no camera is involved.')}
        </p>

        <div className="mt-12 grid gap-6 lg:grid-cols-[2fr_3fr]">
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{t('Sample vehicles')}</h3>
            <ul className="mt-4 space-y-2">
              {DEMO_SCENARIOS.map((preset) => {
                const isSelected = preset.id === scenario.id;
                return (
                  <li key={preset.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => handleSelect(preset)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        isSelected ? 'border-primary bg-accent' : 'border-border bg-background hover:bg-secondary'
                      }`}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_VIEW[preset.status].dot}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{t(preset.name)}</span>
                        <span className="block font-mono text-xs text-muted-foreground">{preset.plate}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <form onSubmit={handleCustomScan} className="mt-6 border-t border-border pt-5">
              <label htmlFor="demo-plate" className="text-sm font-medium text-foreground">
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
                  className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm uppercase text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="submit"
                  disabled={isScanning || !plateInput.trim()}
                  className="rounded-lg border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t('Scan')}
                </button>
              </div>
            </form>
          </div>

          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="dark">
              <div className="relative aspect-[16/10] bg-background">
                <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3 font-mono text-xs text-muted-foreground">
                  <span>{t('Lane 01 · entry')}</span>
                  <span className="rounded border border-border px-2 py-0.5">{t('simulated')}</span>
                </div>
                <div className="absolute inset-x-[12%] bottom-[6%] top-[14%]">
                  <CarFront />
                  <div className="absolute left-1/2 top-[64%] -translate-x-1/2 -translate-y-1/2">
                    <div className={`rounded-sm p-1 ${isScanning ? 'border-2 border-dashed border-muted-foreground' : 'border-2 border-primary'}`}>
                      <div className="whitespace-nowrap rounded-sm border border-background bg-foreground px-2 py-0.5 font-mono text-xs font-bold tracking-wider text-background sm:text-sm">
                        {isScanning ? '·······' : scenario.plate}
                      </div>
                    </div>
                  </div>
                </div>
                {isScanning && (
                  <div className="absolute inset-x-0 top-1/2 h-px bg-primary motion-safe:animate-pulse" aria-hidden="true" />
                )}
              </div>
            </div>

            <div className="p-5 sm:p-6" aria-live="polite">
              {isScanning ? (
                <p className="font-mono text-sm text-muted-foreground">{t('Reading plate…')}</p>
              ) : (
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className={`text-lg font-semibold ${view.tone}`}>{t(view.decision)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{t(scenario.reason)}</p>
                    <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
                      {details.map(([label, value]) => (
                        <React.Fragment key={label}>
                          <dt className="font-mono text-xs text-muted-foreground sm:pt-0.5">{t(label)}</dt>
                          <dd className="text-foreground">{value}</dd>
                        </React.Fragment>
                      ))}
                    </dl>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                    <BarrierArm isRaised={scenario.status === 'ALLOWED'} />
                    <span className={`font-mono text-xs ${view.tone}`}>{t(view.barrier)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
