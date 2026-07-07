import { createKalmanEstimator } from '@/telemetry/kalman';
import { detectTimingLineCrossings } from '@/telemetry/detection';
import type { TimingLineRow } from '@/db/types';
import type { DetectionState, TelemetrySample } from '@/telemetry/types';

// Controlled reproduction of the failure mode that killed Phase 1
// (docs/kalman/phase-0-offline-bench.md, Outcome): timing gates are FINITE
// segments, and a causal filter's lateral lag through the corner before a
// gate displaces the estimated path sideways. When the true path crosses near
// a gate's edge — as at Tsukuba, fraction ~0.3 of a 35 m gate — the filtered
// path can slip past the end of the gate and the lap is never detected.
//
//   npx tsx bench/synthetic.ts
//
// Keeps the finding reproducible without the (gitignored) personal session
// data, and doubles as the regression check any future estimator (25 Hz
// external GPS, IMU-fused) must pass before touching detection.

const LAT0 = 35;
const LNG0 = 139;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_PER_DEG_LAT;
const T0 = 1_700_000_000_000;

function sampleAt(eastM: number, northM: number, tS: number, headingDeg: number, speedMps: number): TelemetrySample {
  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + northM / M_PER_DEG_LAT,
    lng: LNG0 + eastM / M_PER_DEG_LNG,
    speedMps,
    accuracyM: 4,
    headingDeg,
    altitudeM: 30,
    source: 'gps',
  };
}

// 90° left corner (R = 100 m at 30 m/s ≈ 0.9 g lateral), then a straight
// heading north. 1 Hz — phone GPS cadence.
function buildCornerThenStraight(): TelemetrySample[] {
  const R = 100;
  const speed = 30;
  const omega = speed / R;
  const cornerDurationS = Math.PI / 2 / omega; // ~5.2 s
  const samples: TelemetrySample[] = [];
  let t = 0;

  for (; t <= 20; t++) {
    const remaining = 20 - t;
    samples.push(sampleAt(-remaining * speed, -R, t, 90, speed)); // eastbound approach
  }
  const cornerStart = t;
  for (; t <= cornerStart + cornerDurationS; t++) {
    const angle = omega * (t - cornerStart);
    samples.push(sampleAt(R * Math.sin(angle), -R * Math.cos(angle), t, 90 - (angle * 180) / Math.PI, speed));
  }
  const exitT = t;
  const exitNorth = -R * Math.cos(omega * (exitT - 1 - cornerStart)); // continue from last corner point
  for (; t <= exitT + 15; t++) {
    samples.push(sampleAt(R, exitNorth + (t - exitT + 1) * speed, t, 0, speed)); // northbound straight
  }
  return samples;
}

// Gate perpendicular to the straight, 60 m past corner exit. The true path
// (east = 100 m) crosses it 8 m from its west end — near the edge, like the
// real Tsukuba line.
function buildGate(): TimingLineRow {
  const gateNorth = 60;
  const westEnd = 92;
  const eastEnd = 127;
  return {
    id: 'sf',
    trackId: 't',
    name: 'SF',
    type: 'start_finish',
    seq: 0,
    a: { latitude: LAT0 + gateNorth / M_PER_DEG_LAT, longitude: LNG0 + westEnd / M_PER_DEG_LNG },
    b: { latitude: LAT0 + gateNorth / M_PER_DEG_LAT, longitude: LNG0 + eastEnd / M_PER_DEG_LNG },
    createdAt: '',
    updatedAt: '',
  } as TimingLineRow;
}

function countCrossings(samples: TelemetrySample[], gate: TimingLineRow, estimator: { step: (s: TelemetrySample) => { lat: number; lng: number } } | null) {
  const state: DetectionState = {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };
  let previous: TelemetrySample | null = null;
  let crossings = 0;

  for (const raw of samples) {
    const position = estimator ? estimator.step(raw) : { lat: raw.lat, lng: raw.lng };
    const sample = { ...raw, lat: position.lat, lng: position.lng };
    const events = detectTimingLineCrossings(previous, sample, [gate], state, {});
    for (const event of events) {
      crossings++;
      state.lastTimingLineId = event.timingLineId;
      state.lastCrossingElapsedMs = event.sampleElapsedMs;
      state.currentLapStartedElapsedMs = event.sampleElapsedMs;
    }
    previous = sample;
  }

  return crossings;
}

function main() {
  const samples = buildCornerThenStraight();
  const gate = buildGate();

  const naiveCrossings = countCrossings(samples, gate, null);
  const kalmanCrossings = countCrossings(samples, gate, createKalmanEstimator());

  console.log('gate-edge slip reproduction (corner exit, gate crossed 8 m from its end):');
  console.log(`  naive : ${naiveCrossings} crossing(s)  (expect 1 — the lap is detected)`);
  console.log(`  kalman: ${kalmanCrossings} crossing(s)  (0 reproduces the lap-loss failure mode)`);

  if (naiveCrossings !== 1) {
    console.error('SCENARIO BROKEN: naive must detect exactly one crossing');
    process.exit(1);
  }
  if (kalmanCrossings === 0) {
    console.log('\nreproduced: the filtered path slipped past the gate edge; lap lost.');
  } else {
    console.log('\nnot reproduced at current tuning — if an estimator passes this, it has');
    console.log('cleared the failure mode that killed GPS-only Phase 1 (necessary, not sufficient).');
  }
}

main();
