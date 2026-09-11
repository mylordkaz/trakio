import { createSessionRuntime } from '@/telemetry/session-runtime';
import { detectTimingLineCrossings } from '@/telemetry/detection';
import type { TimingLineRow, TrackRow } from '@/db/types';
import type { DetectionState, TelemetrySample } from '@/telemetry/types';

// Point-to-point timing: a run opens on a 'start' line and closes on a
// separate 'finish' line, then waits armed for the next start. Closed
// circuits keep one 'start_finish' line and must behave exactly as before.

const LAT0 = 50;
const LNG0 = 7;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;
const SPEED_MPS = 30;

/** x is metres east of the gate centreline, y is metres north of the origin. */
function sampleXY(xM: number, yM: number, tS: number): TelemetrySample {
  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + yM / M_LAT,
    lng: LNG0 + xM / M_LNG,
    speedMps: SPEED_MPS,
    accuracyM: 4,
    headingDeg: 0,
    altitudeM: 30,
    source: 'gps',
  };
}

// Gates span 80 m across the x = 0 centreline, so a pass along x = 0 crosses
// them and a return leg out at x = 200 misses them entirely.
function gate(
  id: string,
  type: TimingLineRow['type'],
  seq: number,
  yM: number,
): TimingLineRow {
  return {
    id,
    trackId: 't',
    name: id,
    type,
    seq,
    a: { latitude: LAT0 + yM / M_LAT, longitude: LNG0 - 40 / M_LNG },
    b: { latitude: LAT0 + yM / M_LAT, longitude: LNG0 + 40 / M_LNG },
    createdAt: '',
    updatedAt: '',
  } as TimingLineRow;
}

/**
 * Continuous 1 Hz motion through the waypoints. The validation filter rejects
 * teleports, so a second pass has to be driven round rather than restarted.
 */
function drive(waypoints: { x: number; y: number }[], startT = 0): TelemetrySample[] {
  const out: TelemetrySample[] = [];
  let t = startT;
  let previous = waypoints[0];

  out.push(sampleXY(previous.x, previous.y, t));
  t += 1;

  for (const to of waypoints.slice(1)) {
    const dx = to.x - previous.x;
    const dy = to.y - previous.y;
    const steps = Math.max(1, Math.round(Math.hypot(dx, dy) / SPEED_MPS));

    for (let step = 1; step <= steps; step += 1) {
      out.push(sampleXY(previous.x + (dx * step) / steps, previous.y + (dy * step) / steps, t));
      t += 1;
    }

    previous = to;
  }

  return out;
}

const START = gate('start', 'start', 0, 100);
const SECTOR_1 = gate('s1', 'sector', 1, 400);
const SECTOR_2 = gate('s2', 'sector', 2, 700);
const FINISH = gate('finish', 'finish', 3, 1000);
const P2P_LINES = [START, SECTOR_1, SECTOR_2, FINISH];

/** One pass north through every gate, then a wide loop back to the start. */
function pass(topY: number) {
  return [
    { x: 0, y: 0 },
    { x: 0, y: topY },
    { x: 200, y: topY },
    { x: 200, y: 0 },
    { x: 0, y: 0 },
  ];
}

type LapRecord = {
  id: string;
  lapNumber: number;
  lapTimeMs?: number | null;
  isInvalid?: number;
  endedLatitude?: number | null;
  endedLongitude?: number | null;
};

function mockRecorder(started: LapRecord[], finished: LapRecord[]) {
  const byId = new Map<string, LapRecord>();

  return {
    createSession: async () => {},
    startLap: async (input: LapRecord) => {
      byId.set(input.id, input);
      started.push(input);
    },
    finishLap: async (input: {
      lapId: string;
      lapTimeMs: number | null;
      isInvalid?: number;
      endedLatitude?: number | null;
      endedLongitude?: number | null;
    }) => {
      finished.push({
        id: input.lapId,
        lapNumber: byId.get(input.lapId)?.lapNumber ?? -1,
        lapTimeMs: input.lapTimeMs,
        isInvalid: input.isInvalid ?? 0,
        endedLatitude: input.endedLatitude,
        endedLongitude: input.endedLongitude,
      });
    },
    setLapInLap: async () => {},
    insertLapSector: async () => {},
    recordRejectedSample: async () => {},
    appendGpsSample: async () => {},
    flushGpsBuffer: async () => {},
    finalizeSession: async () => {},
    getBufferedPointCount: () => 0,
  };
}

async function runWith(lines: TimingLineRow[], samples: TelemetrySample[]) {
  const started: LapRecord[] = [];
  const finished: LapRecord[] = [];
  const runtime = createSessionRuntime({
    track: { id: 't' } as TrackRow,
    timingLines: lines,
    recorder: mockRecorder(started, finished) as never,
  });
  await runtime.start();

  const events: string[] = [];
  for (const sample of samples) {
    const result = await runtime.handleSample(sample);
    if (result.accepted) {
      for (const event of result.events) {
        events.push(event.type);
      }
    }
  }

  const snapshot = runtime.getSnapshot();
  await runtime.stop();

  return { started, finished, events, snapshot };
}

function stateWith(overrides: Partial<DetectionState> = {}): DetectionState {
  return {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
    ...overrides,
  };
}

// detectTimingLineCrossings copies the state it is given — the runtime owns
// advancing it — so these cases set the state up explicitly.
function crossingsOver(
  line: TimingLineRow,
  yM: number,
  state: DetectionState,
  atS = 100,
) {
  const before = sampleXY(0, yM - 15, atS);
  const after = sampleXY(0, yM + 15, atS + 1);

  return detectTimingLineCrossings(before, after, [line], state).map((event) => event.type);
}

describe('point-to-point detection', () => {
  it('emits start_crossed and finish_crossed for the new line types', () => {
    expect(crossingsOver(START, 100, stateWith())).toEqual(['start_crossed']);
    expect(
      crossingsOver(FINISH, 1000, stateWith({ currentLapStartedElapsedMs: 0 }), 100),
    ).toEqual(['finish_crossed']);
  });

  it('suppresses a finish with no run open, so it never reaches the runtime', () => {
    expect(crossingsOver(FINISH, 1000, stateWith())).toEqual([]);
  });

  it('rejects a sector crossed outside an open run', () => {
    expect(crossingsOver(SECTOR_1, 400, stateWith())).toEqual([]);
  });

  it('rejects a finish that arrives before the minimum lap time', () => {
    // Run opened 11 s before the crossing, under the 15 s floor.
    expect(
      crossingsOver(FINISH, 1000, stateWith({ currentLapStartedElapsedMs: 100_000 }), 110),
    ).toEqual([]);
  });
});

describe('point-to-point runtime', () => {
  it('records a run and returns to armed', async () => {
    const { started, finished, events, snapshot } = await runWith(
      P2P_LINES,
      drive([{ x: 0, y: 0 }, { x: 0, y: 1100 }]),
    );

    expect(events).toEqual([
      'start_crossed',
      'sector_crossed',
      'sector_crossed',
      'finish_crossed',
    ]);
    expect(started.map((lap) => lap.lapNumber)).toEqual([1]);
    expect(finished).toHaveLength(1);
    expect(finished[0].lapTimeMs).toBeGreaterThan(0);
    expect(finished[0].isInvalid).toBe(0);
    expect(snapshot.status).toBe('armed');
    expect(snapshot.totalLaps).toBe(1);
  });

  it('persists the interpolated finish coordinate', async () => {
    const { finished } = await runWith(P2P_LINES, drive([{ x: 0, y: 0 }, { x: 0, y: 1100 }]));

    expect(Number.isFinite(finished[0].endedLatitude ?? NaN)).toBe(true);
    expect(Number.isFinite(finished[0].endedLongitude ?? NaN)).toBe(true);
    // The finish gate sits 1000 m north of the origin.
    expect((finished[0].endedLatitude! - LAT0) * M_LAT).toBeCloseTo(1000, 0);
  });

  it('numbers a second run 2, so the unique lap number holds', async () => {
    const { started, finished, snapshot } = await runWith(
      P2P_LINES,
      drive([...pass(1100), { x: 0, y: 1100 }]),
    );

    expect(started.map((lap) => lap.lapNumber)).toEqual([1, 2]);
    expect(new Set(started.map((lap) => lap.lapNumber)).size).toBe(2);
    expect(finished.filter((lap) => (lap.lapTimeMs ?? 0) > 0)).toHaveLength(2);
    expect(snapshot.totalLaps).toBe(2);
  });

  it('abandons and restarts when start is crossed twice, without counting it', async () => {
    // Up to sector 1 only, loop round, then a full run.
    const samples = drive([
      { x: 0, y: 0 },
      { x: 0, y: 500 },
      { x: 200, y: 500 },
      { x: 200, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 1100 },
    ]);
    const { started, finished, snapshot } = await runWith(P2P_LINES, samples);

    expect(started.map((lap) => lap.lapNumber)).toEqual([1, 2]);

    const abandoned = finished.find((lap) => lap.lapNumber === 1)!;
    expect(abandoned.lapTimeMs).toBeNull();
    expect(abandoned.isInvalid).toBe(1);

    const completed = finished.find((lap) => lap.lapNumber === 2)!;
    expect(completed.lapTimeMs).toBeGreaterThan(0);

    // The abandoned attempt reaches neither the count nor the results.
    expect(snapshot.totalLaps).toBe(1);
    expect(snapshot.completedLaps.map((lap) => lap.lapNumber)).toEqual([2]);
  });
});

describe('restart guard', () => {
  it('ignores a second start inside the minimum lap time', () => {
    // Run opened 1.5 s before the re-crossing: jitter near the line must not
    // abandon it.
    expect(
      crossingsOver(START, 100, stateWith({ currentLapStartedElapsedMs: 100_000 }), 101),
    ).toEqual([]);
  });

  it('accepts a second start once the minimum lap time has passed', () => {
    expect(
      crossingsOver(START, 100, stateWith({ currentLapStartedElapsedMs: 100_000 }), 140),
    ).toEqual(['start_crossed']);
  });

  it('always allows the first start, which has no run to guard', () => {
    expect(crossingsOver(START, 100, stateWith(), 1)).toEqual(['start_crossed']);
  });
});

describe('timing topology gates what detection sees', () => {
  it('opens nothing for a half-configured track', async () => {
    // A lone start could open a run that nothing could ever close.
    const { started, events, snapshot } = await runWith(
      [START, SECTOR_1],
      drive([{ x: 0, y: 0 }, { x: 0, y: 1100 }]),
    );

    expect(events).toEqual([]);
    expect(started).toEqual([]);
    expect(snapshot.status).toBe('armed');
  });

  it('feeds only the closed configuration when a track carries both', async () => {
    const sf = gate('sf', 'start_finish', 0, 100);
    const { events } = await runWith(
      [sf, START, SECTOR_1, SECTOR_2, FINISH],
      drive([{ x: 0, y: 0 }, { x: 0, y: 1100 }]),
    );

    expect(events).toContain('start_finish_crossed');
    expect(events).not.toContain('start_crossed');
    expect(events).not.toContain('finish_crossed');
  });
});

describe('failed persistence leaves the runtime untouched', () => {
  it('does not advance the snapshot when the lap insert fails', async () => {
    const runtime = createSessionRuntime({
      track: { id: 't' } as TrackRow,
      timingLines: P2P_LINES,
      recorder: {
        createSession: async () => {},
        startLap: async () => {
          throw new Error('insert failed');
        },
        finishLap: async () => {},
        setLapInLap: async () => {},
        insertLapSector: async () => {},
        recordRejectedSample: async () => {},
        appendGpsSample: async () => {},
        flushGpsBuffer: async () => {},
        finalizeSession: async () => {},
        getBufferedPointCount: () => 0,
      } as never,
    });
    await runtime.start();

    let threw = false;
    for (const sample of drive([{ x: 0, y: 0 }, { x: 0, y: 300 }])) {
      try {
        await runtime.handleSample(sample);
      } catch {
        threw = true;
      }
    }

    const snapshot = runtime.getSnapshot();
    await runtime.stop();

    expect(threw).toBe(true);
    // No phantom lap id, and the run was never treated as open.
    expect(snapshot.currentLapId).toBeNull();
    expect(snapshot.status).not.toBe('lap_in_progress');
  });
});

describe('a failed restart leaves a truthful state', () => {
  it('does not claim the closed attempt is still running', async () => {
    const finishedIds: string[] = [];
    let startCalls = 0;
    const runtime = createSessionRuntime({
      track: { id: 't' } as TrackRow,
      timingLines: P2P_LINES,
      recorder: {
        createSession: async () => {},
        startLap: async () => {
          startCalls += 1;
          // The first run opens; the replacement after the abandon fails.
          if (startCalls > 1) {
            throw new Error('insert failed');
          }
        },
        finishLap: async (input: { lapId: string }) => {
          finishedIds.push(input.lapId);
        },
        setLapInLap: async () => {},
        insertLapSector: async () => {},
        recordRejectedSample: async () => {},
        appendGpsSample: async () => {},
        flushGpsBuffer: async () => {},
        finalizeSession: async () => {},
        getBufferedPointCount: () => 0,
      } as never,
    });
    await runtime.start();

    // Open a run, loop round, then re-cross the start so the attempt is
    // abandoned and its replacement insert fails.
    const samples = drive([
      { x: 0, y: 0 },
      { x: 0, y: 500 },
      { x: 200, y: 500 },
      { x: 200, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 300 },
    ]);

    let threw = false;
    for (const sample of samples) {
      try {
        await runtime.handleSample(sample);
      } catch {
        threw = true;
      }
    }

    const snapshot = runtime.getSnapshot();
    await runtime.stop();

    expect(threw).toBe(true);
    // The replacement was attempted; it may be retried on later samples, which
    // is harmless because the abandon below happens only once.
    expect(startCalls).toBeGreaterThanOrEqual(2);
    // The abandoned lap really was closed in the database, exactly once...
    expect(finishedIds).toHaveLength(1);
    // ...so the runtime must not still be pointing at it.
    expect(snapshot.status).toBe('armed');
    expect(snapshot.currentLapId).toBeNull();
    expect(snapshot.currentLapStartedElapsedMs).toBeNull();
    // The number is kept, so the next successful run follows it.
    expect(snapshot.currentLapNumber).toBe(1);
  });
});

describe('closed circuits are unaffected', () => {
  it('still rolls one lap into the next on a start/finish line', async () => {
    const sf = [gate('sf', 'start_finish', 0, 100)];
    const { started, finished, snapshot } = await runWith(
      sf,
      drive([...pass(600), { x: 0, y: 600 }]),
    );

    expect(started.map((lap) => lap.lapNumber)).toEqual([1, 2]);
    expect(finished).toHaveLength(1);
    expect(finished[0].lapNumber).toBe(1);
    expect(finished[0].lapTimeMs).toBeGreaterThan(0);
    // A closed circuit never idles between laps.
    expect(snapshot.status).toBe('lap_in_progress');
  });
});
