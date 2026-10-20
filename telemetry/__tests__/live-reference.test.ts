import { createLiveReference, deriveSectorCards, deriveSectorStatuses } from '@/telemetry/live-reference';
import type { LiveDeltaState, LiveReferenceInput } from '@/telemetry/live-reference';
import type { TelemetryDetectionEvent, TelemetrySample } from '@/telemetry/types';

// A 1600 m square circuit driven at constant speed. The start/finish line
// sits at distance 0 on the perimeter, sector lines at 500 m and 1000 m.

const LAT0 = 36.15;
const LNG0 = 139.92;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const SIDE_M = 400;
const PERIMETER_M = 4 * SIDE_M;
const SECTOR_LINES_M = [500, 1000];

function perimeterXY(sM: number): { x: number; y: number } {
  const s = ((sM % PERIMETER_M) + PERIMETER_M) % PERIMETER_M;
  const side = Math.floor(s / SIDE_M);
  const along = s - side * SIDE_M;
  switch (side) {
    case 0: return { x: along, y: 0 };
    case 1: return { x: SIDE_M, y: along };
    case 2: return { x: SIDE_M - along, y: SIDE_M };
    default: return { x: 0, y: SIDE_M - along };
  }
}

function toLatLng(xy: { x: number; y: number }) {
  return { lat: LAT0 + xy.y / M_LAT, lng: LNG0 + xy.x / M_LNG };
}

function sampleAt(sM: number, tMs: number, offsetM = 0): TelemetrySample {
  const xy = perimeterXY(sM);
  const { lat, lng } = toLatLng({ x: xy.x, y: xy.y + offsetM });
  return {
    recordedAt: 1_700_000_000_000 + tMs,
    elapsedMs: tMs,
    lat,
    lng,
    speedMps: 20,
    accuracyM: 4,
    headingDeg: 90,
    altitudeM: 0,
    source: 'gps',
  };
}

function eventAt(type: TelemetryDetectionEvent['type'], seq: number, sM: number, tMs: number): TelemetryDetectionEvent {
  const { lat, lng } = toLatLng(perimeterXY(sM));
  return {
    type,
    timingLineId: `${type}-${seq}`,
    seq,
    sampleRecordedAt: 1_700_000_000_000 + tMs,
    sampleElapsedMs: tMs,
    sampleLat: lat,
    sampleLng: lng,
    quality: 'good',
  };
}

type Lap = { lapNumber: number; lapTimeMs: number; isBest: boolean; isExcluded: boolean };

/**
 * Drives one lap at `speedMps` from the start/finish crossing at `startMs`,
 * emitting sector and start/finish events exactly where the lines are, and
 * feeding `completedLaps` as the runtime would after the closing crossing.
 * Returns the state after every sample so tests can inspect the delta trace.
 */
function driveLap(
  ref: ReturnType<typeof createLiveReference>,
  laps: Lap[],
  args: { lapNumber: number; speedMps: number; startMs: number; excluded?: boolean; skipSectorSeq?: number; opening?: boolean },
): { states: LiveDeltaState[]; endMs: number } {
  const states: LiveDeltaState[] = [];
  const lapTimeMs = Math.round((PERIMETER_M / args.speedMps) * 1000);
  const endMs = args.startMs + lapTimeMs;
  const bestSoFar = laps.filter((lap) => !lap.isExcluded).reduce<number | null>((best, lap) => (best === null ? lap.lapTimeMs : Math.min(best, lap.lapTimeMs)), null);

  let pendingEvents: TelemetryDetectionEvent[] = args.opening ? [eventAt('start_finish_crossed', 0, 0, args.startMs)] : [];
  let completed: Lap[] = laps.slice();

  for (let tMs = args.startMs + 1000; ; tMs += 1000) {
    const sM = ((tMs - args.startMs) / 1000) * args.speedMps;
    const prevSM = sM - args.speedMps;
    for (const [index, lineM] of SECTOR_LINES_M.entries()) {
      const seq = index + 1;
      if (prevSM < lineM && sM >= lineM && seq !== args.skipSectorSeq) {
        pendingEvents.push(eventAt('sector_crossed', seq, lineM, args.startMs + (lineM / args.speedMps) * 1000));
      }
    }
    if (sM >= PERIMETER_M) {
      const isBest = !args.excluded && (bestSoFar === null || lapTimeMs < bestSoFar);
      const closed: Lap = { lapNumber: args.lapNumber, lapTimeMs, isBest, isExcluded: Boolean(args.excluded) };
      completed = [...laps.map((lap) => ({ ...lap, isBest: !lap.isExcluded && !isBest && lap.lapTimeMs === bestSoFar })), closed];
      pendingEvents.push(eventAt('start_finish_crossed', 0, 0, endMs));
      states.push(ref.onAccepted({ sample: sampleAt(sM, tMs), events: pendingEvents, completedLaps: completed }));
      laps.splice(0, laps.length, ...completed);
      return { states, endMs };
    }
    states.push(ref.onAccepted({ sample: sampleAt(sM, tMs), events: pendingEvents, completedLaps: completed }));
    pendingEvents = [];
  }
}

function input(sample: TelemetrySample, events: TelemetryDetectionEvent[] = [], completedLaps: Lap[] = []): LiveReferenceInput {
  return { sample, events, completedLaps };
}

describe('createLiveReference', () => {
  it('promotes the first completed best lap and captures its sector splits', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true });
    const state = lap1.states[lap1.states.length - 1];

    expect(lap1.states.slice(0, -1).every((s) => s.deltaMs === null)).toBe(true);
    expect(state.referenceLapNumber).toBe(1);
    expect(state.referenceLapTimeMs).toBe(80_000);
    expect(state.referenceSectorSplitsMs).toEqual([25_000, 25_000, 30_000]);
  });

  it('tracks a faster lap with a negative, monotonically decreasing delta that lands on the lap-time difference', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true });
    const lap2 = driveLap(ref, laps, { lapNumber: 2, speedMps: 22, startMs: lap1.endMs });
    const deltas = lap2.states.slice(0, -1).map((s) => s.deltaMs);

    expect(deltas.every((d) => d !== null && d < 0)).toBe(true);
    for (let i = 1; i < deltas.length; i++) {
      expect(deltas[i]!).toBeLessThanOrEqual(deltas[i - 1]! + 1);
    }
    const expectedAtLine = Math.round((PERIMETER_M / 22) * 1000) - 80_000;
    expect(Math.abs(deltas[deltas.length - 1]! - expectedAtLine)).toBeLessThan(200);
    expect(lap2.states.every((s) => !s.stale)).toBe(true);
    // Lap 2 is the new best, so it becomes the reference at the line.
    expect(lap2.states[lap2.states.length - 1].referenceLapNumber).toBe(2);
  });

  it('never promotes an excluded lap, even when it is the fastest', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true, excluded: true });
    expect(lap1.states[lap1.states.length - 1].referenceLapNumber).toBeNull();

    const lap2 = driveLap(ref, laps, { lapNumber: 2, speedMps: 18, startMs: lap1.endMs });
    expect(lap2.states.slice(0, -1).every((s) => s.deltaMs === null)).toBe(true);
    expect(lap2.states[lap2.states.length - 1].referenceLapNumber).toBe(2);
  });

  it('keeps the reference when a slower lap completes', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true });
    const lap2 = driveLap(ref, laps, { lapNumber: 2, speedMps: 18, startMs: lap1.endMs });
    const last = lap2.states[lap2.states.length - 1];
    expect(last.referenceLapNumber).toBe(1);
    expect(lap2.states.slice(0, -1).every((s) => s.deltaMs !== null && s.deltaMs > 0)).toBe(true);
  });

  it('leaves a skipped sector split null and still times the closing sector', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true, skipSectorSeq: 1 });
    expect(lap1.states[lap1.states.length - 1].referenceSectorSplitsMs).toEqual([null, null, 30_000]);
  });

  it('marks an off-line sample stale and holds the last delta', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true });
    const t0 = lap1.endMs;
    const onLine = ref.onAccepted(input(sampleAt(20, t0 + 1000)));
    const offLine = ref.onAccepted(input(sampleAt(40, t0 + 2000, 40)));
    const backOn = ref.onAccepted(input(sampleAt(60, t0 + 3000)));

    expect(onLine.stale).toBe(false);
    expect(offLine.stale).toBe(true);
    expect(offLine.deltaMs).toBe(onLine.deltaMs);
    expect(backOn.stale).toBe(false);
  });

  it('recovers after a long GPS gap by searching the whole reference', () => {
    const ref = createLiveReference({ sectorLineCount: 2 });
    const laps: Lap[] = [];
    const lap1 = driveLap(ref, laps, { lapNumber: 1, speedMps: 20, startMs: 0, opening: true });
    const t0 = lap1.endMs;
    ref.onAccepted(input(sampleAt(20, t0 + 1000)));
    // 30 s hole at 20 m/s: 600 m further along, well past the 300 m window.
    const afterGap = ref.onAccepted(input(sampleAt(620, t0 + 31_000)));
    expect(afterGap.stale).toBe(false);
    expect(afterGap.deltaMs).toBeCloseTo(0, -2);
  });

  it('discards an abandoned point-to-point run and promotes on finish', () => {
    const ref = createLiveReference({ sectorLineCount: 0 });
    const laps: Lap[] = [];
    ref.onAccepted(input(sampleAt(0, 0), [eventAt('start_crossed', 0, 0, 0)]));
    ref.onAccepted(input(sampleAt(20, 1000)));
    // Second start without a finish: the first run is gone, a new one opens.
    const restarted = ref.onAccepted(input(sampleAt(40, 2000), [eventAt('start_crossed', 0, 40, 2000)]));
    expect(restarted.deltaMs).toBeNull();

    laps.push({ lapNumber: 2, lapTimeMs: 48_000, isBest: true, isExcluded: false });
    const finished = ref.onAccepted(input(sampleAt(1000, 50_000), [eventAt('finish_crossed', 0, 1000, 50_000)], laps));
    expect(finished.referenceLapNumber).toBe(2);
    expect(finished.referenceSectorSplitsMs).toEqual([]);
    // Armed between runs: no buffer, no delta.
    expect(ref.onAccepted(input(sampleAt(1020, 51_000))).deltaMs).toBeNull();
  });
});

describe('deriveSectorStatuses', () => {
  it('returns nothing for a track without sector lines', () => {
    expect(deriveSectorStatuses({ sectorCount: 0, isLapInProgress: true, lastCrossedSectorSeq: null, currentLapSectorSplitsMs: {}, referenceSectorSplitsMs: [] })).toEqual([]);
  });

  it('colours completed sectors against the reference and highlights the active one', () => {
    expect(deriveSectorStatuses({
      sectorCount: 3,
      isLapInProgress: true,
      lastCrossedSectorSeq: 2,
      currentLapSectorSplitsMs: { 0: 24_000, 1: 26_000 },
      referenceSectorSplitsMs: [25_000, 25_000, 30_000],
    })).toEqual(['faster', 'slower', 'active']);
  });

  it('shows neutral without a reference and pending outside a lap', () => {
    expect(deriveSectorStatuses({
      sectorCount: 3,
      isLapInProgress: true,
      lastCrossedSectorSeq: 1,
      currentLapSectorSplitsMs: { 0: 24_000 },
      referenceSectorSplitsMs: [null, null, null],
    })).toEqual(['neutral', 'active', 'pending']);
    expect(deriveSectorStatuses({
      sectorCount: 2,
      isLapInProgress: false,
      lastCrossedSectorSeq: null,
      currentLapSectorSplitsMs: {},
      referenceSectorSplitsMs: [],
    })).toEqual(['pending', 'pending']);
  });
});

describe('deriveSectorCards', () => {
  it('shows completed sectors as deltas and the active one as the delta gained inside it', () => {
    const cards = deriveSectorCards({
      statuses: ['faster', 'active', 'pending'],
      currentLapSectorSplitsMs: { 0: 24_688 },
      referenceSectorSplitsMs: [25_000, 20_000, 30_000],
      activeSectorElapsedMs: 10_000,
      liveDeltaMs: -200,
    });
    expect(cards[0]).toEqual({ status: 'faster', valueMs: -312, isDelta: true, progress: 1 });
    expect(cards[1]).toEqual({ status: 'active', valueMs: 112, isDelta: true, progress: 0.5 });
    expect(cards[2]).toEqual({ status: 'pending', valueMs: null, isDelta: false, progress: 0 });
  });

  it('falls back to times without a reference', () => {
    const cards = deriveSectorCards({
      statuses: ['neutral', 'active'],
      currentLapSectorSplitsMs: { 0: 24_000 },
      referenceSectorSplitsMs: [null, null],
      activeSectorElapsedMs: 3_000,
      liveDeltaMs: null,
    });
    expect(cards[0]).toEqual({ status: 'neutral', valueMs: 24_000, isDelta: false, progress: 1 });
    expect(cards[1]).toEqual({ status: 'active', valueMs: 3_000, isDelta: false, progress: 0 });
  });

  it('shows the running time when an earlier sector has no reference split', () => {
    const cards = deriveSectorCards({
      statuses: ['neutral', 'active'],
      currentLapSectorSplitsMs: { 0: 24_000 },
      referenceSectorSplitsMs: [null, 20_000],
      activeSectorElapsedMs: 5_000,
      liveDeltaMs: 300,
    });
    expect(cards[1]).toEqual({ status: 'active', valueMs: 5_000, isDelta: false, progress: 0.25 });
  });
});
