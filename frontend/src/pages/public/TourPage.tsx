import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import {
  ArrowRight,
  BatteryFull,
  Check,
  ChevronDown,
  Download,
  Loader2,
  MapPin,
  MousePointer2,
  Printer,
  Wallet,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import type { PublicViewType } from '../../lib/publicRoutes';
import {
  CHAPTERS,
  MEMBER_STEPS,
  OFFLINE_STEPS,
  OPS_STEPS,
  PAID_EXIT_GRACE_MIN,
  PAID_EXIT_STEPS,
  PLATES,
  PRESENCE_STEPS,
  STAY_B,
  STAY_C,
  TARIFF,
  WALKIN_IN_STEPS,
  WALKIN_OUT_STEPS,
  blockFee,
  hudAt,
  type AnprStage,
  type AppScreen,
  type ChapterId,
  type FsmState,
  type HudState,
} from './tour/timeline';
import type { FrameInfo, HoverInfo, ParkingScene, PipInfo } from './tour/ParkingScene';

interface Hud extends HudState {
  fsmEntry: FsmState;
  fsmExit: FsmState;
  free: number;
  total: number;
  pipVisible: boolean;
  pipCam: PipInfo['cam'];
  pipStage: AnprStage;
}

const INITIAL_HUD: Hud = {
  ...hudAt(0),
  fsmEntry: 'closed',
  fsmExit: 'closed',
  free: 0,
  total: 0,
  pipVisible: false,
  pipCam: null,
  pipStage: { step: 0, text: '', confidence: 0 },
};

/** Navbar height: the 3D stage sticks right under it. */
const TOP = 64;
const TRACK_VH = 1800;

const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;
const FEE_B = blockFee(STAY_B.minutes, TARIFF.blockMinutes, TARIFF.hourlyFrom);
const FEE_C = blockFee(STAY_C.minutes, TARIFF.blockMinutes, TARIFF.hourlyFrom);

const COPY: Record<ChapterId, { nav: string; eyebrow: string; title: string; body: string }> = {
  overview: {
    nav: 'Overview',
    eyebrow: 'Site tour · 3D',
    title: 'From the gate to the bay',
    body: 'Scroll to follow four cars through a ParkVision site: a member, a driver who pays in the app, an unregistered walk-in and a car that arrives while the gate is offline.',
  },
  entry: {
    nav: 'Entry ANPR',
    eyebrow: '01 · Entry lane',
    title: 'The camera reads the plate',
    body: 'An IR camera on the entry pole streams to the gatehouse PC. The ANPR worker finds the plate, reads it, and hands the result to the edge client over a local loopback connection.',
  },
  decision: {
    nav: 'Edge decision',
    eyebrow: '02 · Gatehouse',
    title: 'Members drive straight in',
    body: 'The plate belongs to a driver with an active monthly membership, so it is on the whitelist the edge has synced. The edge decides locally, without a round trip to the cloud, and the relay opens the barrier from a per-gate actor outside the 50 ms state-machine tick.',
  },
  lot: {
    nav: 'Into the lot',
    eyebrow: '03 · Into the lot',
    title: 'Event to the cloud, car to its bay',
    body: 'The entry event goes to the backend over MQTT. The free-bay count drops while the driver heads for an open bay.',
  },
  presence: {
    nav: 'Bay camera',
    eyebrow: '04 · Monitor camera',
    title: 'The lot knows where each car is',
    body: 'A monitor camera over row B reports vehicle_parked with its zone. The backend records the car’s presence, so the parking map and Find my car show where it is.',
  },
  map: {
    nav: 'Parking map',
    eyebrow: '05 · Parking map',
    title: 'Every bay at a glance',
    body: 'Bay occupancy feeds the parking map in the dashboard, so operators can see free and occupied bays across the whole site, zone by zone.',
  },
  walkin: {
    nav: 'Walk-in',
    eyebrow: '06 · Unregistered car',
    title: 'Denied, then admitted as a walk-in',
    body: 'This plate is not on the whitelist, so the edge denies it. The guard admits it as a walk-in from the gatehouse screen: the edge opens a session, prints an entry ticket and lifts the barrier.',
  },
  app: {
    nav: 'Driver app',
    eyebrow: '07 · Driver app',
    title: 'Pay before you leave',
    body: 'The driver of the white SUV sees the active session in the app, pays from the wallet, and the backend pushes a one-time paid exit grant to every gate of the site.',
  },
  exit: {
    nav: 'Paid exit',
    eyebrow: '08 · Exit lane',
    title: 'The grant opens the gate once',
    body: 'The exit camera reads the plate. It is not on the whitelist, but the edge holds an unused paid exit grant for it, so it allows this one exit and reports the decision with the exit event.',
  },
  walkout: {
    nav: 'Walk-in exit',
    eyebrow: '09 · Walk-in exit',
    title: 'Priced at the gate, paid by bank transfer',
    body: 'The edge finds the open walk-in session and prices the stay from the tariff it has synced. The driver scans the VietQR on the kiosk; when the transfer arrives the backend signals the gate, the edge settles the session and prints a receipt.',
  },
  offline: {
    nav: 'Offline',
    eyebrow: '10 · Network outage',
    title: 'The gate keeps working offline',
    body: 'The MQTT link is down. A member arrives and the edge still decides from its SQLite cache and opens the barrier. The event waits in the local outbox and is sent when the link comes back.',
  },
  ops: {
    nav: 'Remote control',
    eyebrow: '11 · Operations',
    title: 'Open a gate from the dashboard',
    body: 'Operators watch live gate telemetry and can send commands. Accepted, acknowledged and barrier moved are three separate milestones; HTTP 202 only means the command was queued.',
  },
  summary: {
    nav: 'Summary',
    eyebrow: "That's ParkVision",
    title: 'One system, from the camera to the bill',
    body: 'Plate recognition at the edge, memberships, walk-ins and app payments, access decisions that keep working offline, and a live view of every bay and gate.',
  },
};

const STEP_COPY = {
  read: 'Plate read {{plate}}',
  normalize: 'Normalize plate',
  member: 'Whitelist: member · monthly plan',
  rules: 'Rules & anti-passback',
  allow: 'Decision: ALLOW',
  relay: 'Relay → open barrier',
  notListed: 'Not on the whitelist',
  grant: 'paid_exit_grant found',
  allowOnce: 'ALLOW · grant used once',
  denied: 'Edge: DENY · plate_not_registered',
  admit: 'Guard: Admit walk-in',
  ticket: 'Session {{session}} · ticket printed',
  open: 'Barrier opens',
  session: 'Open walk-in session found',
  priced: 'Priced from the synced tariff',
  qr: 'VietQR shown on the kiosk',
  bank: 'Bank transfer received → walk_in_paid',
  settled: 'Edge settles the session',
  receipt: 'Receipt printed',
  detect: 'Monitor camera sees {{plate}}',
  publish: 'MQTT vehicle_parked · zone B',
  presence: 'Presence: parked in zone B',
  live: 'Parking map & Find my car updated',
  accepted: 'POST command “open” → 202 Accepted',
  delivered: 'Command delivered over MQTT',
  ack: 'command_ack: ok',
  moving: 'Telemetry: barrier moving',
} as const;

const FSM_COPY: Record<FsmState, string> = {
  closed: 'CLOSED',
  opening: 'OPENING',
  open: 'OPEN',
  closing: 'CLOSING',
};

const PIP_LABEL: Record<NonNullable<PipInfo['cam']>, string> = {
  entry: 'ANPR · ENTRY CAM 01',
  exit: 'ANPR · EXIT CAM 02',
  monitor: 'MONITOR CAM · ZONE B',
};

type TFn = ReturnType<typeof useTranslation>['t'];

export const TourPage: React.FC<{ onNavigate: (view: PublicViewType) => void }> = ({ onNavigate }) => {
  const { t } = useTranslation('tour');
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ParkingScene | null>(null);
  const pipRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const hudKey = useRef('');
  const [hud, setHud] = useState<Hud>(INITIAL_HUD);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [tip, setTip] = useState<{ plate: string; bay: string } | null>(null);
  const [qr, setQr] = useState('');

  const labels = useMemo(
    () => ({
      welcome: t('WELCOME'),
      thanks: t('THANK YOU'),
      checking: t('CHECKING…'),
      member: t('✓ MEMBER'),
      notRegistered: t('NOT REGISTERED'),
      walkIn: t('WALK-IN · TICKET'),
      paid: t('PAID · GOODBYE'),
      remote: t('REMOTE OPEN'),
      freeBays: t('FREE BAYS'),
      offline: t('MQTT OFFLINE'),
      zone: t('ZONE'),
    }),
    [t],
  );

  useEffect(() => {
    // Demo payload only — not a real VietQR/NAPAS string or bank account.
    QRCode.toDataURL(`PARKVISION-DEMO|${STAY_C.sessionId}|${PLATES.C}`, { margin: 1, width: 160 })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  const scrollable = useCallback(() => {
    const track = trackRef.current;
    if (!track) return { top: 0, length: 1 };
    const rect = track.getBoundingClientRect();
    const stageH = window.innerHeight - TOP;
    return { top: rect.top, length: Math.max(1, rect.height - stageH) };
  }, []);

  // scroll → progress
  useEffect(() => {
    const onScroll = () => {
      const { top, length } = scrollable();
      sceneRef.current?.setProgress(Math.min(1, Math.max(0, (TOP - top) / length)));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [scrollable]);

  // three.js scene lifecycle (three is only downloaded on this route)
  useEffect(() => {
    const host = hostRef.current;
    const stage = stageRef.current;
    if (!host || !stage) return;
    let disposed = false;
    let scene: ParkingScene | null = null;
    let ro: ResizeObserver | null = null;
    let io: IntersectionObserver | null = null;
    let lastTip = '';

    const onFrame = (f: FrameInfo) => {
      if (barRef.current) barRef.current.style.transform = `scaleX(${f.progress})`;
      const pip = pipRef.current;
      if (pip) {
        pip.style.left = `${f.pip.rect.x}px`;
        pip.style.top = `${f.pip.rect.y}px`;
        pip.style.width = `${f.pip.rect.w}px`;
        pip.style.height = `${f.pip.rect.h}px`;
      }
      const box = boxRef.current;
      if (box) {
        if (f.pip.box) {
          box.style.display = 'block';
          box.style.left = `${f.pip.box.x * 100}%`;
          box.style.top = `${f.pip.box.y * 100}%`;
          box.style.width = `${f.pip.box.w * 100}%`;
          box.style.height = `${f.pip.box.h * 100}%`;
          box.style.borderColor = f.pip.stage.step === 4 ? (f.pip.cam === 'monitor' ? '#58a6ff' : '#3fb950') : '#f0b429';
        } else {
          box.style.display = 'none';
        }
      }
      const next: Hud = {
        ...hudAt(f.progress),
        fsmEntry: f.fsmEntry,
        fsmExit: f.fsmExit,
        free: f.free,
        total: f.total,
        pipVisible: f.pip.visible,
        pipCam: f.pip.cam,
        pipStage: { ...f.pip.stage, confidence: Math.round(f.pip.stage.confidence * 10) / 10 },
      };
      const key = JSON.stringify(next);
      if (key !== hudKey.current) {
        hudKey.current = key;
        setHud(next);
      }
    };

    const onHover = (h: HoverInfo | null) => {
      const el = tipRef.current;
      const k = h ? `${h.plate}|${h.bay}` : '';
      if (el) {
        el.style.display = h ? 'block' : 'none';
        if (h) el.style.transform = `translate(${Math.round(h.x)}px, ${Math.round(h.y)}px) translate(-50%, -100%)`;
      }
      stage.style.cursor = h ? 'pointer' : '';
      if (k !== lastTip) {
        lastTip = k;
        setTip(h ? { plate: h.plate, bay: h.bay } : null);
      }
    };

    import('./tour/ParkingScene')
      .then(async ({ ParkingScene }) => {
        if (disposed) return;
        scene = new ParkingScene(host, labels, onFrame, onHover);
        await scene.load();
        if (disposed) {
          scene.dispose();
          return;
        }
        sceneRef.current = scene;
        const { top, length } = scrollable();
        scene.setProgress(Math.min(1, Math.max(0, (TOP - top) / length)));
        ro = new ResizeObserver(() => scene?.resize());
        ro.observe(host);
        io = new IntersectionObserver(([e]) => (e.isIntersecting ? scene?.start() : scene?.stop()));
        io.observe(stage);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        console.error('3D tour failed to start', err);
        if (!disposed) setStatus('error');
      });

    const onVis = () => (document.hidden ? scene?.stop() : sceneRef.current && scene?.start());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVis);
      ro?.disconnect();
      io?.disconnect();
      scene?.dispose();
      sceneRef.current = null;
    };
    // LED labels are baked in at startup, so a language switch rebuilds the scene
  }, [labels, scrollable]);

  const jumpTo = (i: number) => {
    const { top, length } = scrollable();
    const y = window.scrollY + top - TOP + CHAPTERS[i].focus * length;
    window.scrollTo({ top: Math.max(0, y + 1), behavior: 'smooth' });
  };

  const onPointer = (e: React.PointerEvent, inside: boolean) => {
    if (e.pointerType !== 'mouse') return;
    sceneRef.current?.setPointer(e.clientX, e.clientY, inside);
  };

  const chapter = CHAPTERS[hud.chapter];
  const panel = <ChapterPanel id={chapter.id} hud={hud} qr={qr} t={t} />;

  return (
    <section ref={trackRef} className="relative bg-[#0d0e12]" style={{ height: `${TRACK_VH}vh` }} aria-label={t('3D site tour')}>
      <div
        ref={stageRef}
        className="sticky overflow-hidden"
        style={{ top: TOP, height: `calc(100vh - ${TOP}px)` }}
        onPointerMove={(e) => onPointer(e, true)}
        onPointerLeave={(e) => onPointer(e, false)}
      >
        <div ref={hostRef} className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0d0e12]/70 via-transparent to-transparent max-md:bg-gradient-to-t" />

        {/* progress */}
        <div className="absolute inset-x-0 top-0 h-1 bg-white/10">
          <div ref={barRef} className="h-full origin-left bg-[#58a6ff]" style={{ transform: 'scaleX(0)' }} />
        </div>

        {/* chapter nav */}
        <nav
          className="absolute left-1/2 top-4 hidden max-w-[calc(100%-2rem)] -translate-x-1/2 gap-0.5 overflow-x-auto rounded-full border border-white/10 bg-[#0d0e12]/75 p-1 backdrop-blur lg:flex"
          aria-label={t('Tour chapters')}
        >
          {CHAPTERS.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => jumpTo(i)}
              aria-current={hud.chapter === i ? 'step' : undefined}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                hud.chapter === i ? 'bg-[#58a6ff] text-slate-950' : 'text-[#8b949e] hover:bg-white/10 hover:text-white'
              }`}
            >
              {t(COPY[c.id].nav)}
            </button>
          ))}
        </nav>

        {/* chapter card */}
        <div className="pointer-events-none absolute inset-x-4 bottom-4 md:inset-x-auto md:bottom-auto md:left-8 md:top-1/2 md:w-[380px] md:-translate-y-1/2">
          <AnimatePresence mode="wait">
            <motion.div
              key={chapter.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
              className="pointer-events-auto rounded-2xl border border-white/10 bg-[#0d1117]/85 p-5 shadow-2xl backdrop-blur-md md:p-6"
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#58a6ff]">{t(COPY[chapter.id].eyebrow)}</p>
              <h1 className="mt-2 text-xl font-extrabold leading-tight text-white md:text-[26px]">{t(COPY[chapter.id].title)}</h1>
              <p className="mt-3 text-sm leading-relaxed text-[#c9d1d9] max-md:text-[13px]">{t(COPY[chapter.id].body)}</p>
              {chapter.id === 'overview' && (
                <p className="mt-4 flex items-center gap-2 text-xs text-[#8b949e]">
                  <MousePointer2 className="h-3.5 w-3.5" /> {t('Hover a parked car to read its plate.')}
                </p>
              )}
              {chapter.id === 'summary' && (
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate('register')}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#58a6ff] px-4 py-2 text-sm font-bold text-slate-950 hover:bg-[#388bfd]"
                  >
                    {t('Start free trial')} <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('download')}
                    className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
                  >
                    <Download className="h-4 w-4" /> {t('Get the apps')}
                  </button>
                </div>
              )}
              <p className="mt-4 text-[10px] text-[#6e7681]">{t('Illustrative simulation — not live data.')}</p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* chapter detail panel: right column on desktop, top of the screen on phones */}
        <div
          className={`pointer-events-none absolute right-6 top-16 w-[300px] max-md:inset-x-3 max-md:top-3 max-md:w-auto ${
            hud.pipVisible ? 'max-md:hidden' : ''
          }`}
        >
          <AnimatePresence mode="wait">
            {panel && (
              <motion.div
                key={chapter.id}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 12 }}
                transition={{ duration: 0.22 }}
              >
                {panel}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* scan picture-in-picture frame (the scene renders the camera view underneath) */}
        <div
          ref={pipRef}
          className="pointer-events-none absolute rounded-lg ring-2 ring-white/70 transition-opacity duration-200"
          style={{ opacity: hud.pipVisible && status === 'ready' ? 1 : 0 }}
        >
          <div className="absolute left-2 top-2 flex items-center gap-1.5 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff3b30]" /> {hud.pipCam ? PIP_LABEL[hud.pipCam] : ''}
          </div>
          <div ref={boxRef} className="absolute hidden rounded-sm border-2" style={{ boxShadow: '0 0 0 9999px rgba(0,0,0,0.12)' }} />
          <PipCaption stage={hud.pipStage} cam={hud.pipCam} t={t} />
        </div>

        {/* hover tooltip */}
        <div
          ref={tipRef}
          className="pointer-events-none absolute left-0 top-0 -mt-2 hidden rounded-lg border border-white/15 bg-[#0d1117]/95 px-2.5 py-1.5 text-center shadow-xl"
        >
          {tip && (
            <>
              <p className="rounded bg-[#f4f4f0] px-1.5 font-mono text-xs font-bold tracking-wide text-black">{tip.plate}</p>
              <p className="mt-0.5 text-[10px] text-[#8b949e]">{tip.bay ? t('Bay {{bay}}', { bay: tip.bay }) : t('Moving')}</p>
            </>
          )}
        </div>

        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0d0e12]">
            {status === 'loading' ? (
              <p className="flex items-center gap-2 text-sm text-[#8b949e]">
                <Loader2 className="h-4 w-4 animate-spin" /> {t('Loading 3D site…')}
              </p>
            ) : (
              <p className="max-w-sm px-6 text-center text-sm text-[#8b949e]">{t('Your browser could not start WebGL, so the 3D tour is unavailable.')}</p>
            )}
          </div>
        )}

        {hud.chapter === 0 && status === 'ready' && (
          <div className="pointer-events-none absolute bottom-6 left-1/2 hidden -translate-x-1/2 flex-col items-center text-xs text-[#c9d1d9] md:flex">
            {t('Scroll to drive in')}
            <ChevronDown className="mt-1 h-4 w-4 animate-bounce" />
          </div>
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// Chapter panels
// ---------------------------------------------------------------------------

const ChapterPanel: React.FC<{ id: ChapterId; hud: Hud; qr: string; t: TFn }> = ({ id, hud, qr, t }) => {
  switch (id) {
    case 'decision':
      return (
        <Panel title={t('Edge decision · gate E1')}>
          <Steps keys={MEMBER_STEPS} lit={hud.member} t={t} vars={{ plate: PLATES.A }} okKey="allow" />
          <FsmRow label={t('Entry barrier')} state={hud.fsmEntry} t={t} />
        </Panel>
      );
    case 'lot':
    case 'map':
      return <OccupancyPanel hud={hud} t={t} />;
    case 'presence':
      return (
        <Panel title={t('Bay presence')}>
          <Steps keys={PRESENCE_STEPS} lit={hud.presence} t={t} vars={{ plate: PLATES.A }} />
          {hud.presence >= 2 && (
            <pre className="mt-3 overflow-hidden rounded-lg bg-black/50 p-2 font-mono text-[10px] leading-relaxed text-[#9cd0ff]">
              {`…/cameras/{id}/detection
{ "type": "vehicle_parked",
  "plateNumber": "${PLATES.A}",
  "zoneCode": "B",
  "confidence": 0.93 }`}
            </pre>
          )}
        </Panel>
      );
    case 'walkin':
      return (
        <Panel title={t('Gatehouse · entry lane')}>
          <PlateRow plate={PLATES.C} tag={hud.walkIn >= 2 ? t('Walk-in') : t('Not registered')} tone={hud.walkIn >= 2 ? 'warn' : 'bad'} />
          <Steps keys={WALKIN_IN_STEPS} lit={hud.walkIn} t={t} vars={{ session: STAY_C.sessionId }} badKey="denied" />
          {hud.walkIn >= 3 && (
            <div className="mt-3 rounded-lg bg-[#f4f4f0] p-2.5 font-mono text-[10px] leading-snug text-black">
              <p className="flex items-center gap-1 font-bold">
                <Printer className="h-3 w-3" /> PARKVISION · {t('ENTRY TICKET')}
              </p>
              <p>
                {t('Plate')}: {PLATES.C}
              </p>
              <p>
                {t('Session')}: {STAY_C.sessionId}
              </p>
              <p>
                {t('Entered')}: {STAY_C.enteredAt}
              </p>
            </div>
          )}
          <FsmRow label={t('Entry barrier')} state={hud.fsmEntry} t={t} />
        </Panel>
      );
    case 'app':
      return <PhonePanel screen={hud.app} grantPushed={hud.grantPushed} t={t} />;
    case 'exit':
      return (
        <Panel title={t('Edge decision · gate X2')}>
          <Steps keys={PAID_EXIT_STEPS} lit={hud.paidExit} t={t} vars={{ plate: PLATES.B }} okKey="allowOnce" />
          <p className="mt-3 text-[11px] text-[#8b949e]">
            {t('Paid {{amount}} at {{time}} · grace {{min}} min', { amount: fmtVnd(FEE_B.amount), time: STAY_B.paidAt, min: PAID_EXIT_GRACE_MIN })}
          </p>
          <FsmRow label={t('Exit barrier')} state={hud.fsmExit} t={t} />
        </Panel>
      );
    case 'walkout':
      return (
        <Panel title={t('Walk-in · session {{session}}', { session: STAY_C.sessionId })}>
          <dl className="grid grid-cols-2 gap-y-0.5 text-xs">
            <dt className="text-[#8b949e]">{t('Entered')}</dt>
            <dd className="text-right font-mono text-white">{STAY_C.enteredAt}</dd>
            <dt className="text-[#8b949e]">{t('Exit read')}</dt>
            <dd className="text-right font-mono text-white">{STAY_C.exitAt}</dd>
            {hud.walkOut >= 2 && (
              <>
                <dt className="text-[#8b949e]">{t('Blocks')}</dt>
                <dd className="text-right font-mono text-white">
                  {FEE_C.blocks} × {fmtVnd(TARIFF.hourlyFrom)}
                </dd>
                <dt className="font-semibold text-white">{t('Total')}</dt>
                <dd className="text-right font-mono text-base font-bold text-[#f0b429]">{fmtVnd(FEE_C.amount)}</dd>
              </>
            )}
          </dl>
          {hud.walkOut >= 3 && (
            <div className="mt-2 flex items-center gap-3">
              <div className="flex gap-1 text-[10px] font-bold">
                {['Cash', 'VietQR', 'No charge'].map((m) => (
                  <span key={m} className={`rounded px-1.5 py-0.5 ${m === 'VietQR' ? 'bg-[#58a6ff] text-slate-950' : 'bg-white/10 text-[#8b949e]'}`}>
                    {t(m)}
                  </span>
                ))}
              </div>
              {qr && hud.walkOut < 5 && <img src={qr} alt="" className="h-14 w-14 rounded bg-white p-0.5" />}
            </div>
          )}
          <div className="mt-3 border-t border-white/10 pt-3">
            <Steps keys={WALKIN_OUT_STEPS} lit={hud.walkOut} t={t} />
          </div>
          {hud.walkOut >= 6 && (
            <div className="mt-3 rounded-lg bg-[#f4f4f0] p-2.5 font-mono text-[10px] leading-snug text-black">
              <p className="flex items-center gap-1 font-bold">
                <Printer className="h-3 w-3" /> PARKVISION · {t('RECEIPT')}
              </p>
              <p>
                {PLATES.C} · {STAY_C.enteredAt}–{STAY_C.exitAt}
              </p>
              <p>
                {t('Paid')}: {fmtVnd(FEE_C.amount)} · VietQR
              </p>
            </div>
          )}
          <FsmRow label={t('Exit barrier')} state={hud.fsmExit} t={t} />
        </Panel>
      );
    case 'offline':
      return (
        <Panel title={t('Edge · network')}>
          <div className="flex items-center justify-between text-xs">
            <span className="text-[#8b949e]">MQTT</span>
            {hud.online ? (
              <span className="flex items-center gap-1 rounded-full bg-[#3fb950]/20 px-2 py-0.5 font-bold text-[#3fb950]">
                <Wifi className="h-3 w-3" /> {t('Connected')}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-[#f85149]/20 px-2 py-0.5 font-bold text-[#ff7b72]">
                <WifiOff className="h-3 w-3" /> {t('Disconnected')}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-[#8b949e]">{t('Outbox (SQLite)')}</span>
            <span className="font-mono font-bold text-white">{t('{{n}} pending', { n: hud.outbox })}</span>
          </div>
          <div className="mt-3 border-t border-white/10 pt-3">
            <Steps keys={OFFLINE_STEPS} lit={hud.offlineSteps} t={t} vars={{ plate: PLATES.D }} okKey="allow" />
          </div>
          <p className="mt-3 text-[11px] leading-snug text-[#8b949e]">
            {hud.flushed ? t('Link restored · queued event sent.') : t('Decided from the local cache. Heartbeats are skipped while offline.')}
          </p>
          <FsmRow label={t('Entry barrier')} state={hud.fsmEntry} t={t} />
        </Panel>
      );
    case 'ops':
      return (
        <Panel title={t('Dashboard · gate X2 (exit)')}>
          <dl className="grid grid-cols-2 gap-y-0.5 text-xs">
            <dt className="text-[#8b949e]">{t('Heartbeat')}</dt>
            <dd className="text-right font-mono text-[#3fb950]">{t('5 s · online')}</dd>
            <dt className="text-[#8b949e]">{t('Telemetry')}</dt>
            <dd className="text-right font-mono text-white">{t('every 1 s')}</dd>
          </dl>
          <div className="mt-3 border-t border-white/10 pt-3">
            <Steps keys={OPS_STEPS} lit={hud.ops} t={t} />
          </div>
          <p className="mt-3 text-[11px] leading-snug text-[#f0b429]">{t('202 Accepted does not mean the barrier moved.')}</p>
          <FsmRow label={t('Exit barrier')} state={hud.fsmExit} t={t} />
        </Panel>
      );
    default:
      return null;
  }
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="rounded-2xl border border-white/10 bg-[#0d1117]/90 p-4 shadow-2xl backdrop-blur-md max-md:p-3">
    <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-wider text-[#8b949e] max-md:mb-2">{title}</p>
    {children}
  </div>
);

const Steps: React.FC<{
  keys: readonly (keyof typeof STEP_COPY)[];
  lit: number;
  t: TFn;
  vars?: Record<string, string>;
  okKey?: keyof typeof STEP_COPY;
  badKey?: keyof typeof STEP_COPY;
}> = ({ keys, lit, t, vars, okKey, badKey }) => (
  <ol className="space-y-1.5 max-md:space-y-1">
    {keys.map((k, i) => {
      const on = i < lit;
      const bg = !on ? 'bg-white/10' : k === badKey ? 'bg-[#f85149]' : k === okKey ? 'bg-[#3fb950]' : 'bg-[#58a6ff]';
      return (
        <li key={k} className={`flex items-center gap-2 text-xs max-md:text-[11px] ${on ? 'text-white' : 'text-[#6e7681]'}`}>
          <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${bg}`}>
            {on && (k === badKey ? <X className="h-3 w-3 text-white" /> : <Check className="h-3 w-3 text-slate-950" />)}
          </span>
          {t(STEP_COPY[k], vars)}
        </li>
      );
    })}
  </ol>
);

const PlateRow: React.FC<{ plate: string; tag: string; tone: 'warn' | 'bad' }> = ({ plate, tag, tone }) => (
  <div className="mb-3 flex items-center justify-between">
    <span className="rounded border border-black bg-[#f4f4f0] px-1.5 font-mono text-xs font-bold text-black">{plate}</span>
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${tone === 'bad' ? 'bg-[#f85149]/20 text-[#ff7b72]' : 'bg-[#f0b429]/20 text-[#f0b429]'}`}>
      {tag}
    </span>
  </div>
);

const OccupancyPanel: React.FC<{ hud: Hud; t: TFn }> = ({ hud, t }) => (
  <Panel title={t('Lot occupancy')}>
    <div className="flex items-end gap-4">
      <div>
        <p className="text-3xl font-extrabold text-[#3fb950]">{hud.free}</p>
        <p className="text-[11px] text-[#8b949e]">{t('free bays')}</p>
      </div>
      <div>
        <p className="text-3xl font-extrabold text-[#f85149]">{hud.total - hud.free}</p>
        <p className="text-[11px] text-[#8b949e]">{t('occupied')}</p>
      </div>
    </div>
    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#3fb950]/30">
      <div className="h-full bg-[#f85149]" style={{ width: `${hud.total ? ((hud.total - hud.free) / hud.total) * 100 : 0}%` }} />
    </div>
    <ul className="mt-3 space-y-1 text-[11px] text-[#c9d1d9]">
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[#3fb950]" />
        {t('Free')}
      </li>
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[#f85149]" />
        {t('Occupied')}
      </li>
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[#58a6ff]" />
        {t('Bay B-14 · {{plate}} heading in', { plate: PLATES.A })}
      </li>
    </ul>
  </Panel>
);

const FSM_COLORS: Record<FsmState, string> = {
  closed: 'bg-[#f85149]/20 text-[#ff7b72]',
  opening: 'bg-[#f0b429]/20 text-[#f0b429]',
  open: 'bg-[#3fb950]/20 text-[#3fb950]',
  closing: 'bg-[#f0b429]/20 text-[#f0b429]',
};

const FsmRow: React.FC<{ label: string; state: FsmState; t: TFn }> = ({ label, state, t }) => (
  <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3 text-xs max-md:mt-2 max-md:pt-2">
    <span className="text-[#8b949e]">{label}</span>
    <span className={`rounded-full px-2 py-0.5 font-mono font-bold ${FSM_COLORS[state]}`}>{t(FSM_COPY[state])}</span>
  </div>
);

/** Driver web app, reduced to the screens this chapter walks through. */
const PhonePanel: React.FC<{ screen: AppScreen; grantPushed: boolean; t: TFn }> = ({ screen, grantPushed, t }) => (
  <div className="mx-auto w-[260px] rounded-[2rem] border-4 border-[#30363d] bg-[#0d1117] p-3 shadow-2xl max-md:w-auto max-md:rounded-2xl max-md:border max-md:p-3">
    <div className="mb-2 flex items-center justify-between px-1 text-[10px] text-[#8b949e] max-md:hidden">
      <span>10:27</span>
      <span className="h-1.5 w-14 rounded-full bg-[#30363d]" />
      <BatteryFull className="h-3 w-3" />
    </div>
    <p className="px-1 text-[11px] font-bold text-[#58a6ff]">ParkVision · {t('Driver')}</p>
    <AnimatePresence mode="wait">
      <motion.div
        key={screen}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18 }}
        className="mt-2 rounded-xl bg-[#161b22] p-3 text-xs text-[#c9d1d9]"
      >
        {screen === 'find' && (
          <>
            <p className="font-bold text-white">{t('Find my car')}</p>
            <p className="mt-2 rounded border border-black bg-[#f4f4f0] px-1.5 text-center font-mono font-bold text-black">{PLATES.B}</p>
            <p className="mt-2 flex items-center gap-1.5 text-[#3fb950]">
              <MapPin className="h-3.5 w-3.5" /> {t('Level G · Zone B')}
            </p>
            <p className="mt-1 text-[10px] text-[#8b949e]">{t('From the latest monitor-camera sighting.')}</p>
          </>
        )}
        {screen === 'session' && (
          <>
            <p className="font-bold text-white">{t('My parking')}</p>
            <p className="mt-1 text-[10px] font-bold text-[#3fb950]">● {t('PARKED')}</p>
            <dl className="mt-2 grid grid-cols-2 gap-y-0.5">
              <dt className="text-[#8b949e]">{t('Entered')}</dt>
              <dd className="text-right font-mono">{STAY_B.enteredAt}</dd>
              <dt className="text-[#8b949e]">{t('Duration')}</dt>
              <dd className="text-right font-mono">2h15m</dd>
              <dt className="text-[#8b949e]">{t('Fee')}</dt>
              <dd className="text-right font-mono font-bold text-[#f0b429]">{fmtVnd(FEE_B.amount)}</dd>
            </dl>
            <p className="mt-3 rounded-lg bg-[#58a6ff] py-1.5 text-center font-bold text-slate-950">{t('Pay now')}</p>
          </>
        )}
        {screen === 'pay' && (
          <>
            <p className="font-bold text-white">{t('Payment method')}</p>
            <div className="mt-2 space-y-1.5">
              <p className="flex items-center justify-between rounded-lg border border-[#58a6ff] bg-[#58a6ff]/10 px-2 py-1.5">
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" /> {t('Wallet')}
                </span>
                <span className="font-mono text-[10px] text-[#8b949e]">150.000₫</span>
              </p>
              <p className="rounded-lg border border-white/10 px-2 py-1.5 text-[#8b949e]">MoMo</p>
            </div>
            <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#58a6ff] py-1.5 font-bold text-slate-950">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('Pay')} {fmtVnd(FEE_B.amount)}
            </p>
          </>
        )}
        {screen === 'paid' && (
          <>
            <p className="flex items-center gap-1.5 font-bold text-[#3fb950]">
              <Check className="h-4 w-4" /> {t('Paid')} {fmtVnd(FEE_B.amount)}
            </p>
            <p className="mt-2">{t('Drive to the exit within {{min}} minutes. The gate will open once for {{plate}}.', { min: PAID_EXIT_GRACE_MIN, plate: PLATES.B })}</p>
          </>
        )}
      </motion.div>
    </AnimatePresence>
    <p className={`mt-2 px-1 text-[10px] leading-snug ${grantPushed ? 'text-[#f0b429]' : 'text-[#6e7681]'}`}>
      {grantPushed ? t('✓ paid_exit_grant pushed to every gate of the site') : t('Wallet payments are debited and marked paid in one step.')}
    </p>
  </div>
);

const PipCaption: React.FC<{ stage: AnprStage; cam: PipInfo['cam']; t: TFn }> = ({ stage, cam, t }) => {
  if (stage.step === 0) return null;
  const done = cam === 'monitor' ? `vehicle_parked · ${t('zone B')} · ${stage.confidence.toFixed(1)}%` : `${stage.text} · ${stage.confidence.toFixed(1)}%`;
  const msg =
    stage.step === 1
      ? t('Detecting vehicle…')
      : stage.step === 2
        ? cam === 'monitor'
          ? t('Vehicle localized')
          : t('Plate localized')
        : stage.step === 3
          ? `OCR · ${stage.text}▌`
          : done;
  return (
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 rounded-b-lg bg-black/75 px-2 py-1 font-mono text-[11px] text-white max-md:text-[10px]">
      <span className={`truncate ${stage.step === 4 ? 'font-bold text-[#3fb950]' : ''}`}>{msg}</span>
      {stage.step === 4 && <span className="shrink-0 text-[#8b949e]">{cam === 'monitor' ? '→ MQTT' : t('→ edge')}</span>}
    </div>
  );
};
