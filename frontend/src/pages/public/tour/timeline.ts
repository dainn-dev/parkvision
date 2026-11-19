/**
 * Scroll timeline for the 3D site tour. Pure functions only (no three.js) so the
 * choreography can be unit tested. All positions are in *Blender* coordinates
 * (x right, y forward into the lot, z up) — the scene converts them to three.js.
 *
 * Cast:
 *  A  member car (monthly plan)       → entry ANPR, edge allow, parks in B-14, seen by a monitor camera
 *  B  driver-app user                 → pays in the app, paid_exit_grant, exits once
 *  C  unregistered walk-in            → denied, admitted as walk-in, priced on the edge, VietQR, exits
 *  D  member arriving while offline   → decided from the SQLite cache, event queued, flushed on reconnect
 */

export type Vec3 = readonly [number, number, number];
export type CarId = 'A' | 'B' | 'C' | 'D';

export type ChapterId =
  | 'overview'
  | 'entry'
  | 'decision'
  | 'lot'
  | 'presence'
  | 'map'
  | 'walkin'
  | 'app'
  | 'exit'
  | 'walkout'
  | 'offline'
  | 'ops'
  | 'summary';

export interface Chapter {
  id: ChapterId;
  start: number;
  end: number;
  /** progress the chapter nav jumps to (the chapter's key moment) */
  focus: number;
}

export const CHAPTERS: readonly Chapter[] = [
  { id: 'overview', start: 0, end: 0.05, focus: 0 },
  { id: 'entry', start: 0.05, end: 0.15, focus: 0.135 },
  { id: 'decision', start: 0.15, end: 0.21, focus: 0.195 },
  { id: 'lot', start: 0.21, end: 0.29, focus: 0.275 },
  { id: 'presence', start: 0.29, end: 0.35, focus: 0.335 },
  { id: 'map', start: 0.35, end: 0.4, focus: 0.38 },
  { id: 'walkin', start: 0.4, end: 0.52, focus: 0.49 },
  { id: 'app', start: 0.52, end: 0.59, focus: 0.58 },
  { id: 'exit', start: 0.59, end: 0.69, focus: 0.668 },
  { id: 'walkout', start: 0.69, end: 0.79, focus: 0.78 },
  { id: 'offline', start: 0.79, end: 0.89, focus: 0.852 },
  { id: 'ops', start: 0.89, end: 0.95, focus: 0.925 },
  { id: 'summary', start: 0.95, end: 1, focus: 0.985 },
];

export function chapterIndexAt(p: number): number {
  const i = CHAPTERS.findIndex((c) => p < c.end);
  return i === -1 ? CHAPTERS.length - 1 : i;
}

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
/** 0 before `a`, 1 after `b`, eased in between. */
export const span = (p: number, a: number, b: number) => smooth((p - a) / (b - a));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Eased 0→1→0 window: rises over [a,b], holds, falls over [c,d]. */
export const windowed = (p: number, a: number, b: number, c: number, d: number) => span(p, a, b) * (1 - span(p, c, d));

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

interface CamKey {
  p: number;
  pos: Vec3;
  target: Vec3;
}

type Shot = Pick<CamKey, 'pos' | 'target'>;
// low enough that the horizon and a band of sky stay in frame above the plot
const AERIAL: Shot = { pos: [-66, -104, 34], target: [4, 4, 19] };
const APPROACH: Shot = { pos: [-15, -42, 6.5], target: [-5, -27, 1.4] };
const ENTRY_CAM: Shot = { pos: [-8.2, -11.8, 3.8], target: [-5, -23, 0.8] };
const ENTRY_READ: Shot = { pos: [-7.8, -12.3, 3.3], target: [-5, -20.4, 0.9] };
const BOOTH_1: Shot = { pos: [-12, -29.5, 3.4], target: [-1.5, -18, 1.3] };
const BOOTH_2: Shot = { pos: [-11.5, -30.5, 4.2], target: [-2, -17.5, 1.3] };
const EXIT_CAM: Shot = { pos: [9.9, -9.4, 5], target: [5, -18.5, 0.7] };
const EXIT_READ: Shot = { pos: [9.4, -10, 5], target: [4.2, -19.2, 0.9] };
const TOP_DOWN: Shot = { pos: [0, -16, 52], target: [0, 9, 0] };
const KIOSK: Shot = { pos: [6.5, -12.5, 3.6], target: [1, -17, 1.2] };
/** gatehouse with the MQTT link to the cloud above it */
const GATEHOUSE_HIGH: Shot = { pos: [-12, -31, 6], target: [0, -18, 3.5] };

export const CAMERA_KEYS: readonly CamKey[] = [
  { p: 0.0, ...AERIAL },
  { p: 0.025, pos: [-34, -66, 24], target: [-4, -36, 0] },
  { p: 0.06, ...APPROACH },
  { p: 0.095, ...ENTRY_CAM },
  { p: 0.14, ...ENTRY_READ },
  { p: 0.16, ...BOOTH_1 },
  { p: 0.2, ...BOOTH_2 },
  { p: 0.235, pos: [-13, -15, 9.5], target: [-3, -4, 0] },
  { p: 0.285, pos: [-5, -9, 11.5], target: [4, 5.5, 0] },
  { p: 0.3, pos: [-2.5, -5, 8.5], target: [3.5, 7.5, 1] },
  { p: 0.345, pos: [-1.5, -4.5, 7.5], target: [3.5, 7.5, 1] },
  { p: 0.37, ...TOP_DOWN },
  { p: 0.395, ...TOP_DOWN },
  { p: 0.42, ...APPROACH },
  { p: 0.44, ...ENTRY_CAM },
  { p: 0.465, ...ENTRY_READ },
  { p: 0.485, ...BOOTH_1 },
  { p: 0.5, ...BOOTH_2 },
  { p: 0.525, pos: [-16, -12, 11], target: [-6, 2, 0] },
  { p: 0.55, pos: [24, -3, 9], target: [15.6, 6.8, 0.8] },
  { p: 0.59, pos: [21, -1, 6.5], target: [15.6, 6.8, 0.8] },
  { p: 0.605, pos: [24, -6, 13], target: [13, 4, 0] },
  { p: 0.645, pos: [14, -7, 7.5], target: [5, -14, 1] },
  { p: 0.655, ...EXIT_CAM },
  { p: 0.668, ...EXIT_READ },
  { p: 0.69, pos: [15, -33, 8], target: [4, -24, 1] },
  { p: 0.71, pos: [-3, -6, 9], target: [-8, 4.5, 0.8] },
  { p: 0.745, ...EXIT_CAM },
  { p: 0.758, ...EXIT_READ },
  { p: 0.768, ...KIOSK },
  { p: 0.782, ...KIOSK },
  { p: 0.797, ...GATEHOUSE_HIGH },
  { p: 0.81, ...GATEHOUSE_HIGH },
  { p: 0.825, ...APPROACH },
  { p: 0.837, ...ENTRY_CAM },
  { p: 0.85, ...ENTRY_READ },
  { p: 0.865, ...GATEHOUSE_HIGH },
  { p: 0.885, pos: [-14, -36, 11], target: [0, -18, 6] },
  { p: 0.9, pos: [16, -34, 7], target: [2, -21, 1.5] },
  { p: 0.945, pos: [15, -33, 6.5], target: [2.5, -21, 1.5] },
  { p: 1.0, ...AERIAL },
];

const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export function cameraAt(p: number): Shot {
  const keys = CAMERA_KEYS;
  if (p <= keys[0].p) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (p <= b.p) {
      const t = smooth((p - a.p) / (b.p - a.p));
      return { pos: mix3(a.pos, b.pos, t), target: mix3(a.target, b.target, t) };
    }
  }
  return keys[keys.length - 1];
}

/** Windows during which the camera chases a car driving through the lot. */
export const CHASES: readonly { car: CarId; w: readonly [number, number, number, number] }[] = [
  { car: 'A', w: [0.235, 0.25, 0.27, 0.29] },
  { car: 'B', w: [0.612, 0.62, 0.638, 0.65] },
  { car: 'B', w: [0.672, 0.68, 0.7, 0.712] },
  { car: 'C', w: [0.718, 0.725, 0.738, 0.748] },
];

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------

export interface PathLeg {
  /** global progress window during which the car travels this leg */
  from: number;
  to: number;
  /** waypoints, z omitted (ground) */
  points: readonly (readonly [number, number])[];
  /** car drives backwards along this leg */
  reverse?: boolean;
}

export const slotX = (k: number) => -29.9 + 2.6 * k + 1.3;

export type Row = 'A_W' | 'A_E' | 'B' | 'C' | 'D';
export const slotCenter = (row: Row, k: number): readonly [number, number] => {
  switch (row) {
    case 'A_W':
      return [-29.9 + 2.6 * k + 1.3, -5.4];
    case 'A_E':
      return [29.9 - 2.6 * k - 1.3, -5.4];
    case 'B':
      return [slotX(k), 6.8];
    case 'C':
      return [slotX(k), 12.0];
    case 'D':
      return [slotX(k), 24.2];
  }
};

/** Bay ids are `<row>-<n>`, n 1-based. */
export const SCRIPTED_BAYS: Record<CarId, string> = { A: 'B-14', B: 'B-18', C: 'B-09', D: 'B-11' };

const STREET_IN: readonly (readonly [number, number])[] = [
  [42, -43.5],
  [16, -43.5],
  [-1, -42.5],
  [-4.6, -38],
  [-5, -30],
  [-5, -21.3],
];
const STREET_OUT: readonly (readonly [number, number])[] = [
  [5, -18.65],
  [5, -30],
  [4.6, -38.5],
  [1.5, -42.6],
  [-6, -43.5],
  [-46, -43.5],
];
const intoBay = (k: number): (readonly [number, number])[] => {
  const x = slotX(k);
  const side = Math.sign(x + 5) || 1;
  return [
    [-5, -21.3],
    [-5, -12],
    [-4.8, -3.5],
    [-5 + side * 1.2, 0.6],
    [x - side * 0.9, 3.4],
    [x, 6.8],
  ];
};

export const LEGS: Record<CarId, readonly PathLeg[]> = {
  A: [
    { from: 0.025, to: 0.105, points: STREET_IN },
    {
      from: 0.2,
      to: 0.285,
      points: [
        [-5, -21.3],
        [-5, -12],
        [-4.6, -3.5],
        [-2.2, 0.2],
        [slotX(13) - 3.2, 1.0],
        [slotX(13) - 0.5, 3.6],
        [slotX(13), 6.8],
      ],
    },
  ],
  B: [
    {
      from: 0.595,
      to: 0.61,
      reverse: true,
      points: [
        [slotX(17), 6.8],
        [slotX(17), 4.2],
        [slotX(17) + 1.2, 2.4],
        [slotX(17) + 3.0, 1.6],
      ],
    },
    {
      from: 0.612,
      to: 0.645,
      points: [
        [slotX(17) + 3.0, 1.6],
        [slotX(17) - 0.6, 0.8],
        [8.5, 0.4],
        [5.6, -3],
        [5, -9],
        [5, -18.65],
      ],
    },
    { from: 0.672, to: 0.705, points: STREET_OUT },
  ],
  C: [
    { from: 0.385, to: 0.44, points: STREET_IN },
    { from: 0.495, to: 0.55, points: intoBay(8) },
    {
      from: 0.7,
      to: 0.715,
      reverse: true,
      points: [
        [slotX(8), 6.8],
        [slotX(8), 4.2],
        [slotX(8) - 1.0, 2.4],
        [slotX(8) - 2.8, 1.6],
      ],
    },
    {
      from: 0.718,
      to: 0.745,
      points: [
        [slotX(8) - 2.8, 1.6],
        [slotX(8) + 0.8, 0.6],
        [1, 0.4],
        [4.4, -2.2],
        [5, -9],
        [5, -18.65],
      ],
    },
    { from: 0.787, to: 0.82, points: STREET_OUT },
  ],
  D: [
    { from: 0.8, to: 0.835, points: STREET_IN },
    { from: 0.862, to: 0.895, points: intoBay(10) },
  ],
};

/** Where each scripted car sits before its first leg (B starts parked). */
export const START_BAY: Partial<Record<CarId, string>> = { B: 'B-18' };

export function carVisible(car: CarId, p: number): boolean {
  switch (car) {
    case 'A':
      return p > 0.015;
    case 'B':
      return p < 0.71;
    case 'C':
      return p > 0.38 && p < 0.825;
    case 'D':
      return p > 0.795;
  }
}

/** Whether each scripted bay is occupied at progress p. */
export function bayOccupied(car: CarId, p: number): boolean {
  switch (car) {
    case 'A':
      return p >= 0.285;
    case 'B':
      return p < 0.6;
    case 'C':
      return p >= 0.55 && p < 0.703;
    case 'D':
      return p >= 0.895;
  }
}

// ---------------------------------------------------------------------------
// Plates, reads and barriers
// ---------------------------------------------------------------------------

export const PLATES: Record<CarId, string> = {
  A: '51K-888.68',
  B: '30A-123.45',
  C: '43C-555.21',
  D: '59A-246.80',
};
export const PLATE_A = PLATES.A;
export const PLATE_B = PLATES.B;

export interface Read {
  car: CarId;
  /** entry/exit ANPR, or a monitor camera in the lot */
  cam: 'entry' | 'exit' | 'monitor';
  t0: number;
  tOcr: number;
  tDone: number;
  tEnd: number;
  /** picture-in-picture visible over this window */
  pip: readonly [number, number];
  confidence: number;
}

export const READS: readonly Read[] = [
  { car: 'A', cam: 'entry', t0: 0.095, tOcr: 0.11, tDone: 0.135, tEnd: 0.2, pip: [0.09, 0.155], confidence: 97.4 },
  { car: 'A', cam: 'monitor', t0: 0.298, tOcr: 0.304, tDone: 0.31, tEnd: 0.35, pip: [0.296, 0.348], confidence: 93.0 },
  { car: 'C', cam: 'entry', t0: 0.432, tOcr: 0.442, tDone: 0.458, tEnd: 0.52, pip: [0.428, 0.47], confidence: 95.8 },
  { car: 'B', cam: 'exit', t0: 0.636, tOcr: 0.642, tDone: 0.652, tEnd: 0.69, pip: [0.632, 0.668], confidence: 96.1 },
  { car: 'C', cam: 'exit', t0: 0.742, tOcr: 0.746, tDone: 0.755, tEnd: 0.79, pip: [0.738, 0.772], confidence: 95.2 },
  { car: 'D', cam: 'entry', t0: 0.83, tOcr: 0.836, tDone: 0.845, tEnd: 0.89, pip: [0.826, 0.86], confidence: 98.0 },
];

export interface AnprStage {
  /** 0 idle, 1 detecting vehicle, 2 plate localized, 3 OCR in progress, 4 read */
  step: 0 | 1 | 2 | 3 | 4;
  /** characters of the plate revealed so far */
  text: string;
  confidence: number;
}

export function readStage(r: Read, p: number): AnprStage {
  const plate = PLATES[r.car];
  if (p < r.t0 || p > r.tEnd) return { step: 0, text: '', confidence: 0 };
  if (p < r.t0 + (r.tOcr - r.t0) / 2) return { step: 1, text: '', confidence: 0 };
  if (p < r.tOcr) return { step: 2, text: '', confidence: 0 };
  if (p < r.tDone) {
    const f = (p - r.tOcr) / (r.tDone - r.tOcr);
    return { step: 3, text: plate.slice(0, Math.floor(f * plate.length)), confidence: r.confidence * (0.6 + 0.4 * f) };
  }
  return { step: 4, text: plate, confidence: r.confidence };
}

/** The read whose picture-in-picture is on screen at p, if any. */
export const activeRead = (p: number): Read | undefined => READS.find((r) => p >= r.pip[0] && p <= r.pip[1]);

/** Barrier arm windows: rise over [a,b], fall over [c,d]. */
export const BARRIER_WINDOWS: Record<'entry' | 'exit', readonly (readonly [number, number, number, number])[]> = {
  entry: [
    [0.18, 0.195, 0.225, 0.245], // A, member
    [0.482, 0.492, 0.51, 0.525], // C, walk-in admitted
    [0.853, 0.862, 0.875, 0.885], // D, offline
  ],
  exit: [
    [0.662, 0.672, 0.69, 0.7], // B, paid exit grant
    [0.776, 0.786, 0.8, 0.815], // C, walk-in settled
    [0.913, 0.923, 0.935, 0.945], // remote open from the dashboard
  ],
};

/** Barrier arm angle (0 = down, 1 = fully up). */
export const barrierLift = (gate: 'entry' | 'exit', p: number) =>
  Math.max(0, ...BARRIER_WINDOWS[gate].map(([a, b, c, d]) => windowed(p, a, b, c, d)));
export const barrierEntry = (p: number) => barrierLift('entry', p);
export const barrierExit = (p: number) => barrierLift('exit', p);

export type FsmState = 'closed' | 'opening' | 'open' | 'closing';
export function fsmState(lift: number, prevLift: number): FsmState {
  if (lift <= 0.001) return 'closed';
  if (lift >= 0.999) return 'open';
  return lift >= prevLift ? 'opening' : 'closing';
}

// ---------------------------------------------------------------------------
// Edge decisions, billing and the other story beats
// ---------------------------------------------------------------------------

/** Steps lit so far in a sequence that starts at `start` and lights one step every `every`. */
const lit = (p: number, start: number, every: number, n: number) =>
  p < start ? 0 : Math.min(n, 1 + Math.floor((p - start) / every));

export const MEMBER_STEPS = ['read', 'normalize', 'member', 'rules', 'allow', 'relay'] as const;
export const PAID_EXIT_STEPS = ['read', 'normalize', 'notListed', 'grant', 'allowOnce', 'relay'] as const;
export const OFFLINE_STEPS = ['read', 'normalize', 'member', 'allow', 'relay'] as const;
export const WALKIN_IN_STEPS = ['denied', 'admit', 'ticket', 'open'] as const;
export const WALKIN_OUT_STEPS = ['session', 'priced', 'qr', 'bank', 'settled', 'receipt'] as const;
export const PRESENCE_STEPS = ['detect', 'publish', 'presence', 'live'] as const;
export const APP_SCREENS = ['find', 'session', 'pay', 'paid'] as const;
export const OPS_STEPS = ['accepted', 'delivered', 'ack', 'moving'] as const;

export type AppScreen = (typeof APP_SCREENS)[number];

/** Block pricing as in backend pricing_service / edge pricing.rs (no daily cap or overnight here). */
export function blockFee(minutes: number, blockMinutes: number, perHourVnd: number): { blocks: number; amount: number } {
  const blocks = Math.max(1, Math.ceil(minutes / blockMinutes));
  return { blocks, amount: Math.ceil((blocks * perHourVnd * blockMinutes) / 60) };
}

export const TARIFF = { blockMinutes: 60, hourlyFrom: 10_000 } as const;
export const STAY_B = { enteredAt: '08:12', paidAt: '10:27', minutes: 135 } as const;
export const STAY_C = { sessionId: 'W-0193', enteredAt: '09:05', exitAt: '10:25', minutes: 80 } as const;
/** backend default PAID_EXIT_GRACE_MINUTES */
export const PAID_EXIT_GRACE_MIN = 15;

export const isOffline = (p: number) => p >= 0.795 && p < 0.865;

export interface HudState {
  chapter: number;
  member: number;
  paidExit: number;
  offlineSteps: number;
  walkIn: number;
  walkOut: number;
  presence: number;
  app: AppScreen;
  grantPushed: boolean;
  online: boolean;
  outbox: number;
  flushed: boolean;
  ops: number;
}

const passed = (p: number, marks: readonly number[]) => marks.filter((t) => p >= t).length;

export function hudAt(p: number): HudState {
  const app: AppScreen = p < 0.535 ? 'find' : p < 0.55 ? 'session' : p < 0.563 ? 'pay' : 'paid';
  return {
    chapter: chapterIndexAt(p),
    member: lit(p, 0.15, 0.006, MEMBER_STEPS.length),
    paidExit: lit(p, 0.652, 0.002, PAID_EXIT_STEPS.length),
    offlineSteps: lit(p, 0.845, 0.0018, OFFLINE_STEPS.length),
    walkIn: passed(p, [0.458, 0.468, 0.476, 0.482]),
    walkOut: passed(p, [0.755, 0.76, 0.765, 0.772, 0.776, 0.782]),
    presence: passed(p, [0.304, 0.31, 0.32, 0.33]),
    app,
    grantPushed: p >= 0.585,
    online: !isOffline(p),
    outbox: p >= 0.846 && p < 0.87 ? 1 : 0,
    flushed: p >= 0.87,
    ops: passed(p, [0.895, 0.905, 0.912, 0.913]),
  };
}

/** MQTT packets between the gatehouse (or the monitor camera) and the cloud. */
export const PACKETS: readonly { a: number; b: number; dir: 'up' | 'down'; from: 'booth' | 'monitor'; count?: number }[] = [
  { a: 0.19, b: 0.21, dir: 'up', from: 'booth' }, // entry event (A)
  { a: 0.31, b: 0.32, dir: 'up', from: 'monitor' }, // vehicle_parked (A)
  { a: 0.49, b: 0.505, dir: 'up', from: 'booth' }, // walk_in_entry (C)
  { a: 0.568, b: 0.585, dir: 'down', from: 'booth' }, // paid_exit_grant (B)
  { a: 0.675, b: 0.69, dir: 'up', from: 'booth' }, // exit event with edgeDecision (B)
  { a: 0.766, b: 0.772, dir: 'down', from: 'booth' }, // walk_in_paid (C)
  { a: 0.79, b: 0.795, dir: 'up', from: 'booth' }, // walk_in_exit (C)
  { a: 0.866, b: 0.88, dir: 'up', from: 'booth', count: 3 }, // outbox flush after reconnect
  { a: 0.897, b: 0.905, dir: 'down', from: 'booth' }, // remote open command
  { a: 0.905, b: 0.912, dir: 'up', from: 'booth' }, // command_ack
];

// ---------------------------------------------------------------------------
// LED panels at the gates
// ---------------------------------------------------------------------------

export type LedMsg = 'welcome' | 'thanks' | 'checking' | 'member' | 'notRegistered' | 'walkIn' | 'paid' | 'remote' | 'raw';
export type LedTone = 'brand' | 'warn' | 'ok' | 'bad';
export interface LedState {
  top: string;
  msg: LedMsg;
  tone: LedTone;
  /** for msg = 'raw' */
  text?: string;
}

const fmtVnd = (n: number) => `${n.toLocaleString('vi-VN')} VND`;

export function entryLed(p: number): LedState {
  if (p >= 0.135 && p < 0.174) return { top: PLATES.A, msg: 'checking', tone: 'warn' };
  if (p >= 0.174 && p < 0.25) return { top: PLATES.A, msg: 'member', tone: 'ok' };
  if (p >= 0.458 && p < 0.468) return { top: PLATES.C, msg: 'notRegistered', tone: 'bad' };
  if (p >= 0.468 && p < 0.53) return { top: PLATES.C, msg: 'walkIn', tone: 'warn' };
  if (p >= 0.845 && p < 0.854) return { top: PLATES.D, msg: 'checking', tone: 'warn' };
  if (p >= 0.854 && p < 0.89) return { top: PLATES.D, msg: 'member', tone: 'ok' };
  return { top: 'PARKVISION', msg: 'welcome', tone: 'brand' };
}

export function exitLed(p: number): LedState {
  const feeC = blockFee(STAY_C.minutes, TARIFF.blockMinutes, TARIFF.hourlyFrom).amount;
  if (p >= 0.652 && p < 0.664) return { top: PLATES.B, msg: 'checking', tone: 'warn' };
  if (p >= 0.664 && p < 0.71) return { top: PLATES.B, msg: 'paid', tone: 'ok' };
  if (p >= 0.755 && p < 0.76) return { top: PLATES.C, msg: 'raw', tone: 'warn', text: '1h20m' };
  if (p >= 0.76 && p < 0.776) return { top: PLATES.C, msg: 'raw', tone: 'warn', text: fmtVnd(feeC) };
  if (p >= 0.776 && p < 0.82) return { top: PLATES.C, msg: 'paid', tone: 'ok' };
  if (p >= 0.913 && p < 0.945) return { top: 'PARKVISION', msg: 'remote', tone: 'warn' };
  return { top: 'PARKVISION', msg: 'thanks', tone: 'brand' };
}

/** VietQR / bank transfer on the kiosk screen. */
export const kioskQrVisible = (p: number) => p >= 0.763 && p < 0.777;
/** Zone labels in the lot (presence + map chapters). */
export const zoneLabels = (p: number) => windowed(p, 0.29, 0.3, 0.395, 0.405);
/** Row-B outline while the monitor camera resolves the zone. */
export const zoneBHighlight = (p: number) => windowed(p, 0.296, 0.305, 0.345, 0.355);
