import {
  SIMULATED_QSTARZ_DEVICE,
  simulatedSampleAtTick,
} from '@/telemetry/sources/simulation';
import { classifyDevice } from '@/telemetry/sources/device-classifier';
import { filterTelemetrySample } from '@/telemetry/filters';
import { detectTimingLineCrossings, DEFAULT_DETECTION_CONFIG } from '@/telemetry/detection';
import type { DetectionState, ExtendedTelemetrySample } from '@/telemetry/types';
import type { TimingLineRow } from '@/db/types';
import { TRACK_SEED_DRAFTS } from '@/db/seeds';

const STARTED_AT = 1753500000000;
const resolveElapsedMs = (recordedAt: number) => recordedAt - STARTED_AT;

function sampleAt(tick: number): ExtendedTelemetrySample {
  const sample = simulatedSampleAtTick(tick, STARTED_AT, resolveElapsedMs);
  expect(sample).not.toBeNull();
  return sample!;
}

function tsukubaTimingLines(): TimingLineRow[] {
  const seed = TRACK_SEED_DRAFTS.find((draft) => draft.track.id === 'tsukuba2000')!;
  return seed.timingLines.map(
    (line) =>
      ({
        ...line,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }) as TimingLineRow
  );
}

// Two simulated laps: ~54 s per lap at 10 Hz.
const TWO_LAPS_TICKS = 1200;

it('advertises a device that classifies like real Qstarz hardware', () => {
  expect(classifyDevice(SIMULATED_QSTARZ_DEVICE.name)).toEqual(
    SIMULATED_QSTARZ_DEVICE.classification
  );
});

it('emits samples shaped like parsed Qstarz output', () => {
  const sample = sampleAt(0);

  expect(sample.source).toBe('qstarz');
  expect(sample.recordedAt).toBe(STARTED_AT);
  expect(sample.elapsedMs).toBe(0);
  expect(sample.speedMps).toBe(35);
  expect(sample.accuracyM).toBe(2.4);
  expect(sample.fixType).toBe(3);
  expect(sample.satelliteCount).toBe(12);
  expect(sample.batteryLevel).toBe(88);
  expect(sample.headingDeg).not.toBeNull();
  expect(sample.headingDeg!).toBeGreaterThanOrEqual(0);
  expect(sample.headingDeg!).toBeLessThan(360);
  expect(sample.lat).toBeCloseTo(36.15, 2);
  expect(sample.lng).toBeCloseTo(139.919, 2);
});

it('streams samples the telemetry filters accept end to end', () => {
  expect(filterTelemetrySample(null, sampleAt(0)).accepted).toBe(true);

  for (let tick = 1; tick <= TWO_LAPS_TICKS; tick++) {
    const result = filterTelemetrySample(sampleAt(tick - 1), sampleAt(tick));
    expect(result.accepted).toBe(true);
  }
});

it('crosses the seeded start/finish gate once per lap and never the sectors', () => {
  const timingLines = tsukubaTimingLines();
  const state: DetectionState = {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };

  const crossings: { type: string; elapsedMs: number }[] = [];

  for (let tick = 1; tick <= TWO_LAPS_TICKS; tick++) {
    const events = detectTimingLineCrossings(
      sampleAt(tick - 1),
      sampleAt(tick),
      timingLines,
      state
    );

    for (const event of events) {
      crossings.push({ type: event.type, elapsedMs: event.sampleElapsedMs });
      state.lastTimingLineId = event.timingLineId;
      state.lastCrossingElapsedMs = event.sampleElapsedMs;
      if (event.type === 'start_finish_crossed') {
        state.currentLapStartedElapsedMs = event.sampleElapsedMs;
        state.expectedSectorSeq = 1;
      } else {
        state.expectedSectorSeq = event.seq + 1;
      }
    }
  }

  expect(crossings.every((c) => c.type === 'start_finish_crossed')).toBe(true);
  // 120 s of driving with the first crossing ~5 s in: opening crossing plus
  // two completed laps.
  expect(crossings).toHaveLength(3);

  const lapTimes = [
    crossings[1].elapsedMs - crossings[0].elapsedMs,
    crossings[2].elapsedMs - crossings[1].elapsedMs,
  ];
  for (const lapTimeMs of lapTimes) {
    expect(lapTimeMs).toBeGreaterThanOrEqual(DEFAULT_DETECTION_CONFIG.minLapTimeMs);
    // Circumference / speed = 2π·300 / 35 ≈ 53.9 s.
    expect(lapTimeMs).toBeGreaterThan(53000);
    expect(lapTimeMs).toBeLessThan(55000);
  }
});
