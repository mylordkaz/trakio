import { toRadians } from '@/utils/geo';
import { createFusionEstimator } from './fusion';
import { loadSessionExport, toSamples, type SessionExport } from './replay';

// Masked-GPS reconstruction on REAL captures (docs/kalman/phase-2-imu-fusion.md
// §2b, validation class 1): hide windows of real GPS, bridge with the real IMU
// stream, and compare the fused trajectory against the hidden fixes — exact
// ground truth (to GPS noise, ~2-4 m) for precisely the dropout failure.
//
//   npx tsx bench/reconstruct.ts bench/data/<v2-export>.json
//
// Reports, per mask duration: fused position error at the hidden fixes vs the
// straight-chord assumption naive detection effectively makes, plus yaw
// alignment behavior over the drive.

const MASK_DURATIONS_S = [5, 8, 11];
const MIN_SPEED_MPS = 5;
const WINDOWS_PER_DURATION = 8;

const M_LAT = 111320;

function distanceM(aLat: number, aLng: number, bLat: number, bLng: number, lngScale: number) {
  return Math.hypot((bLng - aLng) * lngScale, (bLat - aLat) * M_LAT);
}

type MaskWindow = { startMs: number; endMs: number };

// Windows where the car is moving the whole time, spread across the drive.
function pickWindows(data: SessionExport, durationS: number): MaskWindow[] {
  const gps = toSamples(data);
  const candidates: MaskWindow[] = [];

  for (let i = 0; i < gps.length; i++) {
    const startMs = gps[i].recordedAt;
    const endMs = startMs + durationS * 1000;
    let j = i;
    let moving = true;
    let contiguous = true;

    while (j < gps.length && gps[j].recordedAt <= endMs + 2000) {
      if ((gps[j].speedMps ?? 0) < MIN_SPEED_MPS) moving = false;
      if (j > i && gps[j].recordedAt - gps[j - 1].recordedAt > 1500) contiguous = false;
      j++;
    }

    // Require lead-in for alignment and a moving, gap-free window.
    if (moving && contiguous && j < gps.length && startMs - gps[0].recordedAt > 90_000) {
      candidates.push({ startMs, endMs });
      i = j; // no overlapping windows
    }
  }

  if (candidates.length <= WINDOWS_PER_DURATION) return candidates;
  const step = candidates.length / WINDOWS_PER_DURATION;
  return Array.from({ length: WINDOWS_PER_DURATION }, (_, k) => candidates[Math.floor(k * step)]);
}

type WindowResult = {
  fusedErrorsM: number[];
  chordErrorsM: number[];
  fusedEndErrorM: number;
  chordEndErrorM: number;
};

function runWindow(data: SessionExport, window: MaskWindow): WindowResult | null {
  const gps = toSamples(data);
  const imu = data.imuSamples ?? [];
  const lngScale = Math.cos(toRadians(gps[0].lat)) * M_LAT;

  const estimator = createFusionEstimator();

  const hidden = gps.filter((s) => s.recordedAt >= window.startMs && s.recordedAt < window.endMs);
  if (hidden.length < 3) return null;
  const before = gps.filter((s) => s.recordedAt < window.startMs).at(-1)!;
  const after = gps.find((s) => s.recordedAt >= window.endMs)!;

  const fusedErrorsM: number[] = [];
  const chordErrorsM: number[] = [];

  let imuIndex = 0;
  for (const sample of gps) {
    // Feed all IMU up to this GPS timestamp.
    while (imuIndex < imu.length && imu[imuIndex].recordedAt <= sample.recordedAt) {
      estimator.ingestImu(imu[imuIndex]);
      imuIndex++;
    }

    const inMask = sample.recordedAt >= window.startMs && sample.recordedAt < window.endMs;
    if (!inMask) {
      estimator.step(sample);
      continue;
    }

    // Hidden fix: query the fused bridge, never update.
    const fused = estimator.currentPosition();
    if (fused) {
      fusedErrorsM.push(distanceM(fused.lat, fused.lng, sample.lat, sample.lng, lngScale));
    }

    // The straight chord between the fixes bracketing the hole, evaluated at
    // this hidden fix's time — what naive interpolation assumes.
    const f = (sample.recordedAt - before.recordedAt) / (after.recordedAt - before.recordedAt);
    const chordLat = before.lat + (after.lat - before.lat) * f;
    const chordLng = before.lng + (after.lng - before.lng) * f;
    chordErrorsM.push(distanceM(chordLat, chordLng, sample.lat, sample.lng, lngScale));
  }

  if (fusedErrorsM.length === 0) return null;
  return {
    fusedErrorsM,
    chordErrorsM,
    fusedEndErrorM: fusedErrorsM[fusedErrorsM.length - 1],
    chordEndErrorM: chordErrorsM[chordErrorsM.length - 1],
  };
}

function stats(values: number[]) {
  if (values.length === 0) return { mean: NaN, max: NaN };
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    max: Math.max(...values),
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npx tsx bench/reconstruct.ts <v2-export.json>');
    process.exit(1);
  }

  const data = loadSessionExport(path);
  if (!data.imuSamples || data.imuSamples.length === 0) {
    console.error('export has no imuSamples (need a v2 capture)');
    process.exit(1);
  }

  console.log(`# Masked-GPS reconstruction — ${data.session.name ?? data.session.id}\n`);

  // Yaw alignment behavior over the full drive (no masks).
  {
    const estimator = createFusionEstimator();
    const gps = toSamples(data);
    const imu = data.imuSamples;
    const offsets: number[] = [];
    let imuIndex = 0;
    let firstAlignedS: number | null = null;

    for (const sample of gps) {
      while (imuIndex < imu.length && imu[imuIndex].recordedAt <= sample.recordedAt) {
        estimator.ingestImu(imu[imuIndex]);
        imuIndex++;
      }
      estimator.step(sample);
      const debug = estimator.getDebugState();
      if (debug.aligned) {
        if (firstAlignedS === null) firstAlignedS = (sample.recordedAt - gps[0].recordedAt) / 1000;
        offsets.push((debug.yawOffsetRad! * 180) / Math.PI);
      }
    }

    if (offsets.length === 0) {
      console.log('yaw alignment: NEVER CONVERGED — attitude convention or maneuvers insufficient\n');
    } else {
      const settled = offsets.slice(Math.floor(offsets.length / 2));
      const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
      const std = Math.sqrt(settled.reduce((a, b) => a + (b - mean) ** 2, 0) / settled.length);
      console.log(
        `yaw alignment: converged at t=${firstAlignedS?.toFixed(0)} s | settled offset ${mean.toFixed(1)}° | stability σ ${std.toFixed(1)}° (want < ~5°)\n`
      );
    }
  }

  console.log('| mask | windows | fused mean/max err | fused end err (mean) | chord mean/max err | chord end err (mean) |');
  console.log('| --- | --- | --- | --- | --- | --- |');

  for (const durationS of MASK_DURATIONS_S) {
    const windows = pickWindows(data, durationS);
    const results = windows.map((w) => runWindow(data, w)).filter((r): r is WindowResult => r !== null);
    if (results.length === 0) {
      console.log(`| ${durationS} s | 0 | - | - | - | - |`);
      continue;
    }

    const fusedAll = stats(results.flatMap((r) => r.fusedErrorsM));
    const chordAll = stats(results.flatMap((r) => r.chordErrorsM));
    const fusedEnd = stats(results.map((r) => r.fusedEndErrorM));
    const chordEnd = stats(results.map((r) => r.chordEndErrorM));

    console.log(
      `| ${durationS} s | ${results.length} | ${fusedAll.mean.toFixed(1)} / ${fusedAll.max.toFixed(1)} m | ${fusedEnd.mean.toFixed(1)} m | ${chordAll.mean.toFixed(1)} / ${chordAll.max.toFixed(1)} m | ${chordEnd.mean.toFixed(1)} m |`
    );
  }

  console.log('\nGround truth is hidden real GPS (noise floor ~2-4 m). The chord columns are');
  console.log("what naive detection assumes across a hole; fused must be materially below them.");
}

main();
