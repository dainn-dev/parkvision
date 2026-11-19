import { describe, expect, it } from 'vitest';
import {
  BARRIER_WINDOWS,
  CAMERA_KEYS,
  CHAPTERS,
  LEGS,
  PACKETS,
  PLATES,
  READS,
  STAY_C,
  TARIFF,
  barrierEntry,
  barrierExit,
  bayOccupied,
  blockFee,
  cameraAt,
  carVisible,
  chapterIndexAt,
  entryLed,
  exitLed,
  fsmState,
  hudAt,
  isOffline,
  readStage,
  type CarId,
} from '../timeline';

const CARS: CarId[] = ['A', 'B', 'C', 'D'];
const readOf = (car: CarId, cam: string) => READS.find((r) => r.car === car && r.cam === cam)!;

describe('tour timeline', () => {
  it('chapters tile 0..1 without gaps and each focus lands in its own chapter', () => {
    expect(CHAPTERS[0].start).toBe(0);
    expect(CHAPTERS[CHAPTERS.length - 1].end).toBe(1);
    CHAPTERS.forEach((c, i) => {
      if (i > 0) expect(c.start).toBe(CHAPTERS[i - 1].end);
      expect(chapterIndexAt(c.focus)).toBe(i);
    });
    expect(chapterIndexAt(1)).toBe(CHAPTERS.length - 1);
  });

  it('camera keys are ordered and interpolation hits them exactly', () => {
    for (let i = 1; i < CAMERA_KEYS.length; i++) expect(CAMERA_KEYS[i].p).toBeGreaterThanOrEqual(CAMERA_KEYS[i - 1].p);
    for (const k of CAMERA_KEYS) expect(cameraAt(k.p).pos).toEqual(k.pos);
  });

  it('car legs are sequential and continuous', () => {
    for (const car of CARS) {
      LEGS[car].forEach((leg, i, legs) => {
        expect(leg.to).toBeGreaterThan(leg.from);
        if (i > 0) {
          expect(leg.from).toBeGreaterThanOrEqual(legs[i - 1].to);
          expect(leg.points[0]).toEqual(legs[i - 1].points[legs[i - 1].points.length - 1]);
        }
      });
    }
  });

  it('every car is visible while it drives', () => {
    for (const car of CARS) for (const leg of LEGS[car]) expect(carVisible(car, (leg.from + leg.to) / 2)).toBe(true);
  });

  it('barrier windows never overlap on the same gate', () => {
    for (const gate of ['entry', 'exit'] as const) {
      const w = BARRIER_WINDOWS[gate];
      for (let i = 1; i < w.length; i++) expect(w[i][0]).toBeGreaterThan(w[i - 1][3]);
    }
  });

  it('a car only leaves the stop line once its barrier is fully up', () => {
    expect(barrierEntry(LEGS.A[1].from)).toBe(1); // member
    expect(barrierEntry(LEGS.C[1].from)).toBe(1); // walk-in admitted
    expect(barrierEntry(LEGS.D[1].from)).toBe(1); // offline member
    expect(barrierExit(LEGS.B[2].from)).toBe(1); // paid exit grant
    expect(barrierExit(LEGS.C[4].from)).toBe(1); // walk-in settled
  });

  it('opens the entry barrier for the member only after the plate is read', () => {
    const r = readOf('A', 'entry');
    expect(readStage(r, r.tDone).text).toBe(PLATES.A);
    expect(barrierEntry(r.tDone)).toBe(0);
  });

  it('denies the walk-in before the guard admits it', () => {
    const r = readOf('C', 'entry');
    expect(entryLed(r.tDone + 0.001).msg).toBe('notRegistered');
    expect(barrierEntry(r.tDone + 0.001)).toBe(0);
    expect(hudAt(0.47).walkIn).toBe(2);
  });

  it('pays in the app and pushes the grant before car B reaches the exit', () => {
    const paid = hudAt(0.59);
    expect(paid.app).toBe('paid');
    expect(paid.grantPushed).toBe(true);
    const grant = PACKETS.find((pk) => pk.dir === 'down' && pk.a > 0.55 && pk.a < 0.6)!;
    expect(grant.b).toBeLessThan(LEGS.B[0].from);
    expect(exitLed(0.665).msg).toBe('paid');
  });

  it('settles the walk-in only after the bank transfer arrives', () => {
    expect(barrierExit(0.77)).toBe(0);
    expect(hudAt(0.773).walkOut).toBe(4);
    expect(exitLed(0.77).text).toBe('20.000 VND');
  });

  it('decides the offline arrival from the cache and flushes after reconnect', () => {
    const r = readOf('D', 'entry');
    expect(isOffline(r.tDone)).toBe(true);
    expect(barrierEntry(0.86)).toBeGreaterThan(0.5);
    expect(hudAt(0.85).outbox).toBe(1);
    expect(hudAt(0.88)).toMatchObject({ online: true, outbox: 0, flushed: true });
  });

  it('keeps bays consistent with the cars', () => {
    expect(bayOccupied('B', 0.5)).toBe(true);
    expect(bayOccupied('B', 0.65)).toBe(false);
    expect(bayOccupied('C', 0.6)).toBe(true);
    expect(bayOccupied('C', 0.75)).toBe(false);
    expect(bayOccupied('D', 0.9)).toBe(true);
  });

  it('reveals OCR text progressively', () => {
    const r = readOf('A', 'entry');
    const partial = readStage(r, (r.tOcr + r.tDone) / 2);
    expect(partial.step).toBe(3);
    expect(PLATES.A.startsWith(partial.text)).toBe(true);
    expect(partial.text.length).toBeLessThan(PLATES.A.length);
  });

  it('derives FSM state from arm motion', () => {
    expect(fsmState(0, 0)).toBe('closed');
    expect(fsmState(1, 1)).toBe('open');
    expect(fsmState(0.5, 0.4)).toBe('opening');
    expect(fsmState(0.4, 0.5)).toBe('closing');
  });

  it('prices by started block like the backend', () => {
    expect(blockFee(135, 60, 10_000)).toEqual({ blocks: 3, amount: 30_000 });
    expect(blockFee(STAY_C.minutes, TARIFF.blockMinutes, TARIFF.hourlyFrom)).toEqual({ blocks: 2, amount: 20_000 });
    expect(blockFee(60, 60, 10_000)).toEqual({ blocks: 1, amount: 10_000 });
    // hourlyFrom is per hour; a 30-minute block costs half
    expect(blockFee(45, 30, 10_000)).toEqual({ blocks: 2, amount: 10_000 });
  });
});
