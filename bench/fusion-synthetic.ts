import { detectTimingLineCrossings } from '@/telemetry/detection';
import type { TimingLineRow } from '@/db/types';
import type { DetectionState, TelemetrySample } from '@/telemetry/types';
import { createFusionEstimator, type FusionConfig } from './fusion';
import type { ExportedImuSample } from './replay';

// Mechanics validation for the Phase 2b fusion prototype with exact analytic
// ground truth. Per the Phase 0 lesson these synthetics gate DEVELOPMENT, not
// shipping: passing here earns the estimator a run against real captured
// data, nothing more.
//
//   npx tsx bench/fusion-synthetic.ts

const LAT0 = 35;
const LNG0 = 139;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;

const failures: string[] = [];

function check(name: string, pass: boolean, detail: string) {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!pass) failures.push(name);
}

function noise(i: number, amplitude: number) {
  return Math.sin(i * 7919.77) * amplitude;
}

// A trajectory provides world truth at any time; generators derive GPS and
// IMU streams from it.
type Trajectory = {
  pos: (tS: number) => { x: number; y: number };
  vel: (tS: number) => { vx: number; vy: number };
  accel: (tS: number) => { ax: number; ay: number };
};

function gpsSample(traj: Trajectory, tS: number, noisy = true): TelemetrySample {
  const { x, y } = traj.pos(tS);
  const { vx, vy } = traj.vel(tS);
  const speed = Math.hypot(vx, vy);
  const heading = ((Math.atan2(vx, vy) * 180) / Math.PI + 360) % 360;
  const nx = noisy ? noise(Math.round(tS), 2) : 0;
  const ny = noisy ? noise(Math.round(tS) * 3, 2) : 0;

  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + (y + ny) / M_LAT,
    lng: LNG0 + (x + nx) / M_LNG,
    speedMps: speed,
    accuracyM: 4,
    headingDeg: speed > 0.5 ? heading : null,
    altitudeM: 30,
    source: 'gps',
  };
}

// IMU at 50 Hz. The attitude-world frame is ENU rotated by yawRefRad (the
// unknown the estimator must discover). Device attitude is identity, so
// device frame == attitude-world frame and accel_device = R(-yawRef)·a_ENU.
function imuSample(
  traj: Trajectory,
  tS: number,
  yawRefRad: number,
  biasDevice: [number, number],
  index: number
): ExportedImuSample {
  const { ax, ay } = traj.accel(tS);
  const cos = Math.cos(-yawRefRad);
  const sin = Math.sin(-yawRefRad);
  const deviceX = cos * ax - sin * ay + biasDevice[0] + noise(index, 0.05);
  const deviceY = sin * ax + cos * ay + biasDevice[1] + noise(index * 7, 0.05);

  return {
    recordedAt: Math.round(T0 + tS * 1000),
    intervalMs: 20,
    accel: [deviceX, deviceY, 0],
    accelInclGravity: [deviceX, deviceY, 9.81],
    rotation: [0, 0, 0],
    rotationRate: [null, null, null],
  };
}

type RunResult = {
  crossingsElapsedMs: number[];
  yawErrorDeg: number | null;
};

// Feeds merged GPS+IMU streams through the estimator and production
// detection. During GPS holes >= 2 s, measurement-backed bridge samples are
// emitted at 1 Hz from the fused state (the intended 2c behavior).
function runFusion(
  traj: Trajectory,
  durationS: number,
  gate: TimingLineRow,
  options: {
    maskS?: [number, number];
    yawRefRad?: number;
    biasDevice?: [number, number];
    config?: Partial<FusionConfig>;
    useImu?: boolean;
  }
): RunResult {
  const yawRef = options.yawRefRad ?? 0;
  const bias = options.biasDevice ?? [0, 0];
  const estimator = createFusionEstimator(options.config);
  const state: DetectionState = {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };

  const crossings: number[] = [];
  let previousDetectionSample: TelemetrySample | null = null;
  let lastGpsFeedS: number | null = null;

  function feedDetection(sample: TelemetrySample) {
    const events = detectTimingLineCrossings(previousDetectionSample, sample, [gate], state, {});
    for (const event of events) {
      if (event.type === 'start_finish_crossed') {
        crossings.push(event.sampleElapsedMs);
        state.lastTimingLineId = event.timingLineId;
        state.lastCrossingElapsedMs = event.sampleElapsedMs;
        state.currentLapStartedElapsedMs = event.sampleElapsedMs;
      }
    }
    previousDetectionSample = sample;
  }

  const imuHz = 50;
  for (let tick = 0; tick <= durationS * imuHz; tick++) {
    const tS = tick / imuHz;

    if (options.useImu !== false) {
      estimator.ingestImu(imuSample(traj, tS, yawRef, bias, tick));
    }

    const onGpsSecond = tick % imuHz === 0;
    if (!onGpsSecond) continue;

    const masked = options.maskS && tS >= options.maskS[0] && tS < options.maskS[1];

    if (!masked) {
      const gps = gpsSample(traj, tS);
      const fused = estimator.step(gps);
      feedDetection({ ...gps, lat: fused.lat, lng: fused.lng });
      lastGpsFeedS = tS;
    } else if (lastGpsFeedS !== null && tS - lastGpsFeedS >= 2) {
      // Bridge sample: fused state only, no measurement this second.
      const position = estimator.currentPosition();
      if (position) {
        feedDetection({
          recordedAt: T0 + tS * 1000,
          elapsedMs: tS * 1000,
          lat: position.lat,
          lng: position.lng,
          speedMps: null,
          accuracyM: null,
          headingDeg: null,
          altitudeM: null,
          source: 'gps',
        });
      }
    }
  }

  const debug = estimator.getDebugState();
  const yawErrorDeg =
    debug.yawOffsetRad === null
      ? null
      : Math.abs((((debug.yawOffsetRad - yawRef) * 180) / Math.PI + 540) % 360 - 180);

  return { crossingsElapsedMs: crossings, yawErrorDeg };
}

function runNaive(
  traj: Trajectory,
  durationS: number,
  gate: TimingLineRow,
  maskS?: [number, number]
): number[] {
  const state: DetectionState = {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };
  const crossings: number[] = [];
  let previous: TelemetrySample | null = null;

  for (let tS = 0; tS <= durationS; tS++) {
    if (maskS && tS >= maskS[0] && tS < maskS[1]) continue;
    const sample = gpsSample(traj, tS);
    const events = detectTimingLineCrossings(previous, sample, [gate], state, {});
    for (const event of events) {
      if (event.type === 'start_finish_crossed') {
        crossings.push(event.sampleElapsedMs);
        state.lastTimingLineId = event.timingLineId;
        state.lastCrossingElapsedMs = event.sampleElapsedMs;
        state.currentLapStartedElapsedMs = event.sampleElapsedMs;
      }
    }
    previous = sample;
  }

  return crossings;
}

function gateAt(yM: number, xFromM: number, xToM: number): TimingLineRow {
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

// Scenario 1 + 4 + bias sweep: warm-up maneuvers (for yaw alignment), then a
// hard-accelerating straight crossing a gate mid-mask — the re-timer killer.
// Northbound; accel phases give alignment observations.
function acceleratingStraight(): { traj: Trajectory; truthCrossS: number; gate: TimingLineRow; durationS: number; maskS: [number, number] } {
  // Piecewise: 0-10 s accelerate 10->25 m/s (a=1.5), 10-20 s brake to 15 (a=-1),
  // 20-30 s cruise 15, 30-45 s accelerate 15->37.5 (a=1.5). Gate crossed ~t=38.
  const phases = [
    { t0: 0, v0: 10, a: 1.5 },
    { t0: 10, v0: 25, a: -1 },
    { t0: 20, v0: 15, a: 0 },
    { t0: 30, v0: 15, a: 1.5 },
  ];

  function stateAt(tS: number) {
    let y = 0;
    for (let i = 0; i < phases.length; i++) {
      const phase = phases[i];
      const tEnd = i + 1 < phases.length ? phases[i + 1].t0 : Infinity;
      const dt = Math.min(tS, tEnd) - phase.t0;
      if (dt < 0) break;
      if (tS <= tEnd) {
        return { y: y + phase.v0 * dt + 0.5 * phase.a * dt * dt, vy: phase.v0 + phase.a * dt, ay: phase.a };
      }
      y += phase.v0 * (tEnd - phase.t0) + 0.5 * phase.a * (tEnd - phase.t0) ** 2;
    }
    return { y, vy: 0, ay: 0 };
  }

  const traj: Trajectory = {
    pos: (t) => ({ x: 0, y: stateAt(t).y }),
    vel: (t) => ({ vx: 0, vy: stateAt(t).vy }),
    accel: (t) => ({ ax: 0, ay: stateAt(t).ay }),
  };

  // Gate at the y the car reaches at t=38 exactly (inside the 33-44 s mask).
  const gateY = stateAt(38).y;
  return {
    traj,
    truthCrossS: 38,
    gate: gateAt(gateY, -50, 50),
    durationS: 50,
    maskS: [33, 44],
  };
}

// Scenario 2 + 3: braking approach (gives yaw alignment its observations,
// like any real corner entry), then a 90-degree corner (R=100 m, ~0.9 g at
// 30 m/s), then a straight; gate crossed 8 m from its west end — the Phase 0
// gate-edge scene.
function cornerThenStraight(): { traj: Trajectory; gate: TimingLineRow; durationS: number; truthCrossS: number; cornerEntryS: number } {
  const R = 100;
  const speed = 30;
  const approachS = 20;
  const brakeStartS = 14;
  const brakeEndS = 19;
  const vFast = 40;
  const brakeA = (speed - vFast) / (brakeEndS - brakeStartS); // -2 m/s²
  const omega = speed / R;
  const cornerS = Math.PI / 2 / omega;

  // Eastbound approach ending at (0, -R) at t = approachS with speed 30.
  function approachState(t: number) {
    // Integrate backwards from the entry point.
    function distanceToEntry(fromT: number) {
      let d = 0;
      // fast segment
      const fastEnd = Math.min(brakeStartS, approachS);
      if (fromT < fastEnd) d += vFast * (fastEnd - Math.max(fromT, 0));
      // braking segment
      const bFrom = Math.max(fromT, brakeStartS);
      if (bFrom < brakeEndS) {
        const t0 = bFrom - brakeStartS;
        const t1 = brakeEndS - brakeStartS;
        d += vFast * (t1 - t0) + 0.5 * brakeA * (t1 * t1 - t0 * t0);
      }
      // settled segment
      if (Math.max(fromT, brakeEndS) < approachS) d += speed * (approachS - Math.max(fromT, brakeEndS));
      return d;
    }
    const v = t < brakeStartS ? vFast : t < brakeEndS ? vFast + brakeA * (t - brakeStartS) : speed;
    const a = t >= brakeStartS && t < brakeEndS ? brakeA : 0;
    return { x: -distanceToEntry(t), v, a };
  }

  const traj: Trajectory = {
    pos: (t) => {
      if (t <= approachS) return { x: approachState(t).x, y: -R };
      if (t <= approachS + cornerS) {
        const a = omega * (t - approachS);
        return { x: R * Math.sin(a), y: -R * Math.cos(a) };
      }
      return { x: R, y: (t - approachS - cornerS) * speed };
    },
    vel: (t) => {
      if (t <= approachS) return { vx: approachState(t).v, vy: 0 };
      if (t <= approachS + cornerS) {
        const a = omega * (t - approachS);
        return { vx: speed * Math.cos(a), vy: speed * Math.sin(a) };
      }
      return { vx: 0, vy: speed };
    },
    accel: (t) => {
      if (t <= approachS) return { ax: approachState(t).a, ay: 0 };
      if (t <= approachS + cornerS) {
        const a = omega * (t - approachS);
        return { ax: -speed * omega * Math.sin(a), ay: speed * omega * Math.cos(a) };
      }
      return { ax: 0, ay: 0 };
    },
  };

  const gateYM = 60;
  const truthCrossS = approachS + cornerS + gateYM / speed;
  return {
    traj,
    gate: {
      ...gateAt(0, 0, 0),
      a: { latitude: LAT0 + gateYM / M_LAT, longitude: LNG0 + 92 / M_LNG },
      b: { latitude: LAT0 + gateYM / M_LAT, longitude: LNG0 + 127 / M_LNG },
    } as TimingLineRow,
    durationS: Math.ceil(approachS + cornerS + 15),
    truthCrossS,
    cornerEntryS: approachS,
  };
}

function main() {
  console.log('# Fusion mechanics validation (synthetic, exact truth)\n');

  {
    console.log('1) 11 s mask over an accelerating crossing (the re-timer killer):');
    const s = acceleratingStraight();
    const naive = runNaive(s.traj, s.durationS, s.gate, s.maskS);
    const fused = runFusion(s.traj, s.durationS, s.gate, { maskS: s.maskS });
    const naiveErr = naive.length === 1 ? Math.abs(naive[0] - s.truthCrossS * 1000) : NaN;
    const fusedErr = fused.crossingsElapsedMs.length === 1 ? Math.abs(fused.crossingsElapsedMs[0] - s.truthCrossS * 1000) : NaN;
    check('fusion finds the crossing', fused.crossingsElapsedMs.length === 1, `${fused.crossingsElapsedMs.length} crossing(s)`);
    const beatsNaive = fusedErr < 150 && (!Number.isFinite(naiveErr) || fusedErr < naiveErr);
    check('fusion beats naive', beatsNaive, `fused ${fusedErr.toFixed(0)} ms vs naive ${Number.isFinite(naiveErr) ? naiveErr.toFixed(0) : 'LOST'} ms (truth window 11 s)`);
  }

  {
    console.log('\n2) Gate-edge scene, clean GPS (the Phase 0 lap-killer):');
    const s = cornerThenStraight();
    const fused = runFusion(s.traj, s.durationS, s.gate, {});
    const err = fused.crossingsElapsedMs.length === 1 ? Math.abs(fused.crossingsElapsedMs[0] - s.truthCrossS * 1000) : NaN;
    check('no lap loss with IMU predict', fused.crossingsElapsedMs.length === 1, `${fused.crossingsElapsedMs.length} crossing(s), err ${Number.isFinite(err) ? err.toFixed(0) : '-'} ms (GPS-only CV filter lost this lap)`);
  }

  {
    console.log('\n3) 8 s mask across the corner + crossing (naive loses the lap here):');
    const s = cornerThenStraight();
    const maskS: [number, number] = [s.truthCrossS - 6, s.truthCrossS + 2];
    const inMask = s.truthCrossS >= maskS[0] && s.truthCrossS < maskS[1];
    const naive = runNaive(s.traj, s.durationS, s.gate, maskS);
    const fused = runFusion(s.traj, s.durationS, s.gate, { maskS });
    const fusedErr = fused.crossingsElapsedMs.length === 1 ? Math.abs(fused.crossingsElapsedMs[0] - s.truthCrossS * 1000) : NaN;
    console.log(`     (crossing inside mask: ${inMask}; naive found ${naive.length})`);
    check('fusion bridges the corner', fused.crossingsElapsedMs.length === 1 && fusedErr < 150, `err ${Number.isFinite(fusedErr) ? fusedErr.toFixed(0) : '-'} ms vs naive ${naive.length === 1 ? Math.abs(naive[0] - s.truthCrossS * 1000).toFixed(0) + ' ms' : 'LAP LOST'}`);
  }

  {
    console.log('\n4) Yaw alignment from a 37° unknown offset:');
    const s = acceleratingStraight();
    const fused = runFusion(s.traj, s.durationS, s.gate, { maskS: s.maskS, yawRefRad: (37 * Math.PI) / 180 });
    const fusedErr = fused.crossingsElapsedMs.length === 1 ? Math.abs(fused.crossingsElapsedMs[0] - s.truthCrossS * 1000) : NaN;
    check('yaw converges', fused.yawErrorDeg !== null && fused.yawErrorDeg < 3, `offset error ${fused.yawErrorDeg?.toFixed(1)}°`);
    check('crossing still bridged', fused.crossingsElapsedMs.length === 1 && fusedErr < 150, `err ${Number.isFinite(fusedErr) ? fusedErr.toFixed(0) : '-'} ms`);
  }

  {
    console.log('\n5) Accelerometer bias budget (11 s mask, crossing error per bias):');
    const s = acceleratingStraight();
    for (const bias of [0, 0.05, 0.1, 0.2, 0.5]) {
      const fused = runFusion(s.traj, s.durationS, s.gate, { maskS: s.maskS, biasDevice: [bias, 0] });
      const err = fused.crossingsElapsedMs.length === 1 ? Math.abs(fused.crossingsElapsedMs[0] - s.truthCrossS * 1000) : NaN;
      console.log(`     bias ${(bias * 1000).toFixed(0).padStart(3)} mm/s² -> ${fused.crossingsElapsedMs.length === 1 ? err.toFixed(0).padStart(4) + ' ms' : 'LAP LOST'}`);
      // The curve MEASURES the real bias budget (the spec's 3 m estimate
      // ignored alignment/velocity coupling); the hard requirement is that a
      // plausibly calibratable phone (<=100 mm/s² residual) stays materially
      // below the ~0.9 s naive dropout error and never loses the lap.
      if (bias === 0.1) check('bias 100 mm/s² stays useful', fused.crossingsElapsedMs.length === 1 && err < 450, `${err.toFixed(0)} ms (naive July reference 874 ms)`);
    }
  }

  console.log(failures.length === 0 ? '\nall mechanics checks passed' : `\nFAILED: ${failures.join(', ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main();
