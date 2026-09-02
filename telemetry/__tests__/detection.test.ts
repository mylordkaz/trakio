import { detectTimingLineCrossings, DEFAULT_DETECTION_CONFIG } from '@/telemetry/detection';
import type { TelemetrySample, DetectionState } from '@/telemetry/types';
import type { TimingLineRow } from '@/db/types';

// Gate on the meridian at the equator, ~11 m to each side.
const GATE = {
  id: 'gate',
  trackId: 'track',
  name: 'Start/Finish',
  type: 'start_finish',
  seq: 0,
  a: { latitude: 0.0001, longitude: 0 },
  b: { latitude: -0.0001, longitude: 0 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
} as TimingLineRow;

const METERS_PER_DEGREE = 111320;
const lngAtMeters = (meters: number) => meters / METERS_PER_DEGREE;

function freshState(): DetectionState {
  return {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };
}

function sampleAt(lng: number, speedMps: number | null, recordedAt: number): TelemetrySample {
  return {
    recordedAt,
    elapsedMs: recordedAt,
    lat: 0,
    lng,
    speedMps,
    accuracyM: 3,
    headingDeg: 90,
    altitudeM: 0,
    source: 'gps',
  };
}

it('detects crossings at low driving and walking speeds', () => {
  // 5.4, 11, and 14 km/h — the 14 km/h case is the reported field bug.
  for (const speedMps of [1.5, 3.1, 3.9]) {
    const events = detectTimingLineCrossings(
      sampleAt(lngAtMeters(-1), speedMps, 0),
      sampleAt(lngAtMeters(1), speedMps, 1000),
      [GATE],
      freshState()
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('start_finish_crossed');
  }
});

it('ignores a crossing when reported speed says the car is parked, even with a large chord', () => {
  const events = detectTimingLineCrossings(
    sampleAt(lngAtMeters(-2.5), 0.3, 0),
    sampleAt(lngAtMeters(2.5), 0.4, 1000),
    [GATE],
    freshState()
  );

  expect(events).toHaveLength(0);
});

it('falls back to chord speed only when no speed is reported', () => {
  const moving = detectTimingLineCrossings(
    sampleAt(lngAtMeters(-1.1), null, 0),
    sampleAt(lngAtMeters(1.1), null, 1000),
    [GATE],
    freshState()
  );
  expect(moving).toHaveLength(1);

  const jitter = detectTimingLineCrossings(
    sampleAt(lngAtMeters(-0.25), null, 0),
    sampleAt(lngAtMeters(0.25), null, 1000),
    [GATE],
    freshState()
  );
  expect(jitter).toHaveLength(0);
});

it('keeps the crossing-speed floor at walking pace', () => {
  expect(DEFAULT_DETECTION_CONFIG.minCrossingSpeedMps).toBe(1.5);
});
