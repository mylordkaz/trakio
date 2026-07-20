import { createSessionRuntime } from '@/telemetry/session-runtime';
import type { TimingLineRow, TrackRow } from '@/db/types';
import type { TelemetrySample } from '@/telemetry/types';

// The cascade re-anchor accepts a sample that is consistent with the
// previously REJECTED sample (the rejected chain is the true path, the
// accepted anchor was displaced). Timing must then run on that validated
// chain — never on the displaced-anchor chord, which was just proven
// impossible and can cross gates the car never crossed.

const LAT0 = 35;
const LNG0 = 139;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;

function sampleXY(xM: number, yM: number, tS: number, speedMps = 25): TelemetrySample {
  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + yM / M_LAT,
    lng: LNG0 + xM / M_LNG,
    speedMps,
    accuracyM: 4,
    headingDeg: 0,
    altitudeM: 30,
    source: 'gps',
  };
}

function gateAtY(yM: number, xFromM: number, xToM: number): TimingLineRow {
  return {
    id: 'sf',
    trackId: 't',
    name: 'SF',
    type: 'start_finish',
    seq: 0,
    a: { latitude: LAT0 + yM / M_LAT, longitude: LNG0 + xFromM / M_LNG },
    b: { latitude: LAT0 + yM / M_LAT, longitude: LNG0 + xToM / M_LNG },
    createdAt: '',
    updatedAt: '',
  } as TimingLineRow;
}

type StartLapCapture = {
  lapNumber: number;
  startedLatitude?: number | null;
  startedLongitude?: number | null;
};

function mockRecorder(startLaps: StartLapCapture[] = []) {
  return {
    createSession: async () => {},
    startLap: async (input: StartLapCapture) => {
      startLaps.push(input);
    },
    finishLap: async () => {},
    setLapInLap: async () => {},
    insertLapSector: async () => {},
    recordRejectedSample: async () => {},
    appendGpsSample: async () => {},
    flushGpsBuffer: async () => {},
    finalizeSession: async () => {},
    getBufferedPointCount: () => 0,
  };
}

// True path: northbound along x=50 at 30 m/s. At t=4 a displaced-but-
// plausible anchor (12, 110) is accepted; t=5 (r1) and t=6 (r2) continue the
// true path and are rejected against the anchor; r2 is consistent with r1,
// so it re-anchors.
const TRUE_PATH = [
  sampleXY(50, 0, 0),
  sampleXY(50, 30, 1),
  sampleXY(50, 60, 2),
  sampleXY(50, 90, 3),
];
const ANCHOR = sampleXY(12, 110, 4);
const R1 = sampleXY(50, 150, 5);
const R2 = sampleXY(50, 180, 6);
const AFTER = sampleXY(50, 210, 7);

async function runCascade(gate: TimingLineRow, jumpReanchorEnabled: boolean) {
  const runtime = createSessionRuntime({
    track: { id: 't' } as TrackRow,
    timingLines: [gate],
    recorder: mockRecorder() as never,
    config: { jumpReanchorEnabled },
  });
  await runtime.start();

  const accepted: boolean[] = [];
  const crossings: { elapsedMs: number; lat: number; lng: number }[] = [];
  for (const sample of [...TRUE_PATH, ANCHOR, R1, R2, AFTER]) {
    const result = await runtime.handleSample(sample);
    accepted.push(result.accepted);
    if (result.accepted) {
      for (const event of result.events) {
        if (event.type === 'start_finish_crossed') {
          crossings.push({
            elapsedMs: event.sampleElapsedMs,
            lat: event.sampleLat,
            lng: event.sampleLng,
          });
        }
      }
    }
  }
  await runtime.stop();
  return { accepted, crossings };
}

describe('re-anchor timing detection', () => {
  it('re-anchors on the second consecutive consistent jump', async () => {
    // Gate far away — pure filter behavior.
    const { accepted } = await runCascade(gateAtY(-500, -20, 20), true);
    // true path accepted, anchor accepted (displaced but within allowance),
    // r1 rejected (first jump), r2 accepted via re-anchor, then normal.
    expect(accepted).toEqual([true, true, true, true, true, false, true, true]);
  });

  it('never times across the displaced-anchor chord', async () => {
    // Gate placed so ONLY the impossible chord anchor->r2 crosses it
    // (at x≈28 on y=140); the true path along x=50 never does.
    const { accepted, crossings } = await runCascade(gateAtY(140, 15, 40), true);
    expect(accepted[6]).toBe(true); // re-anchor fired
    expect(crossings).toHaveLength(0); // no false crossing from the chord
  });

  it('detects a real crossing on the validated rejected chain', async () => {
    // Gate on the true path between r1 and r2: crossing at exactly halfway.
    const { accepted, crossings } = await runCascade(gateAtY(165, 35, 65), true);
    expect(accepted[6]).toBe(true);
    expect(crossings).toHaveLength(1);
    // Interpolated on r1->r2 (t=5.5 s), NOT on the anchor->r2 chord (t≈5.57 s).
    expect(crossings[0].elapsedMs).toBe(5500);
    // The event position sits on the chain too: (50, 165) — the value the
    // lap row freezes for display clipping.
    expect((crossings[0].lat - LAT0) * M_LAT).toBeCloseTo(165, 4);
    expect((crossings[0].lng - LNG0) * M_LNG).toBeCloseTo(50, 4);
  });

  it('persists the crossing position on first and subsequent lap starts', async () => {
    const startLaps: StartLapCapture[] = [];
    const runtime = createSessionRuntime({
      track: { id: 't' } as TrackRow,
      timingLines: [gateAtY(100, 0, 100)],
      recorder: mockRecorder(startLaps) as never,
      config: {},
    });
    await runtime.start();

    // Northbound through the gate, U-turn far up-track, southbound back
    // through it: two crossings — the arming one (first startLap) and the
    // lap-1 rollover (second startLap).
    for (let t = 0; t <= 70; t++) {
      const y = t <= 35 ? 30 * t : 30 * 35 - 30 * (t - 35);
      await runtime.handleSample(sampleXY(50, y, t, 30));
    }
    await runtime.stop();

    expect(startLaps.length).toBeGreaterThanOrEqual(2);
    for (const lap of startLaps) {
      expect(Number.isFinite(lap.startedLatitude ?? NaN)).toBe(true);
      expect(Number.isFinite(lap.startedLongitude ?? NaN)).toBe(true);
      expect((lap.startedLatitude! - LAT0) * M_LAT).toBeCloseTo(100, 4);
      expect((lap.startedLongitude! - LNG0) * M_LNG).toBeCloseTo(50, 4);
    }
  });

  it('keeps the whole cascade rejected when the flag is off', async () => {
    const { accepted } = await runCascade(gateAtY(-500, -20, 20), false);
    // Without the re-anchor everything stays rejected against the stale
    // displaced anchor until the growing time allowance catches up.
    expect(accepted).toEqual([true, true, true, true, true, false, false, false]);
  });

  it('long gap: no chain timing, and the liveness fallback restores capture without timing', async () => {
    // A displaced anchor followed by real GPS silence, where the vehicle
    // moves faster than the reported speed grows the allowance: the direct
    // path NEVER becomes anchor-consistent. The chain re-anchor must not
    // fire (a long gap cannot prove which side is true) — but capture must
    // not stay dead either. Once the stream has been self-consistent for
    // longer than recoveryMinGapMs, the liveness fallback re-anchors with
    // detection suppressed: capture resumes, nothing across the ambiguous
    // span is timed. Gate placed where only the anchor chords would cross.
    const gate = gateAtY(200, 15, 40);
    const runtime = createSessionRuntime({
      track: { id: 't' } as TrackRow,
      timingLines: [gate],
      recorder: mockRecorder() as never,
      config: { jumpReanchorEnabled: true, detectionConfig: { recoveryEnabled: true } },
    });
    await runtime.start();

    const accepted: boolean[] = [];
    let crossingCount = 0;
    const samples = [
      sampleXY(50, 30, 1),
      sampleXY(50, 60, 2),
      sampleXY(50, 90, 3),
      sampleXY(12, 110, 4), // displaced anchor, accepted
      sampleXY(50, 390, 14), // post-silence; divergence begins (reported 25, actual 30 m/s)
      sampleXY(50, 420, 15), // chain-consistent, but the gap is 11 s: no chain re-anchor
      sampleXY(50, 450, 16),
      sampleXY(50, 480, 17),
      sampleXY(50, 510, 18), // streak duration 4.0 s: still within the bound
      sampleXY(50, 540, 19), // streak 5.0 s > recoveryMinGapMs: liveness fallback
      sampleXY(50, 570, 20), // normal capture against the new anchor
    ];
    for (const sample of samples) {
      const result = await runtime.handleSample(sample);
      accepted.push(result.accepted);
      if (result.accepted) {
        crossingCount += result.events.filter((e) => e.type === 'start_finish_crossed').length;
      }
    }
    await runtime.stop();

    expect(accepted).toEqual([
      true, true, true, true,
      false, false, false, false, false,
      true, true,
    ]);
    expect(crossingCount).toBe(0);
  });

  it('recovers an in-hole crossing when the re-entry is consistent with the anchor', async () => {
    // The honest hole case: the anchor is the true last fix, and the first
    // post-hole fix agrees with it within the (time-grown) allowance. The
    // uncontradicted chord spans the hole and crossing recovery times the
    // in-hole crossing on it, flagged.
    const gate = gateAtY(150, 35, 65);
    const runtime = createSessionRuntime({
      track: { id: 't' } as TrackRow,
      timingLines: [gate],
      recorder: mockRecorder() as never,
      config: { jumpReanchorEnabled: true, detectionConfig: { recoveryEnabled: true } },
    });
    await runtime.start();

    const crossings: { elapsedMs: number }[] = [];
    const accepted: boolean[] = [];
    for (const sample of [sampleXY(50, 0, 0, 30), sampleXY(50, 270, 9, 30)]) {
      const result = await runtime.handleSample(sample);
      accepted.push(result.accepted);
      if (result.accepted) {
        for (const event of result.events) {
          if (event.type === 'start_finish_crossed') {
            crossings.push({ elapsedMs: event.sampleElapsedMs });
          }
        }
      }
    }
    await runtime.stop();

    expect(accepted).toEqual([true, true]);
    expect(crossings).toHaveLength(1);
    expect(crossings[0].elapsedMs).toBe(5000); // y=150 at t=5 s, mid-hole
  });
});
