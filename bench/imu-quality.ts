import { loadSessionExport, toSamples, type ExportedImuSample } from './replay';

// Stream-quality report for Phase 2a captures (docs/kalman/phase-2-imu-fusion.md).
//   npx tsx bench/imu-quality.ts bench/data/<export>.json
//
// Answers, from any capture (a street drive is enough): what rate the phone
// actually delivers, how jittery it is, which fields are populated, and —
// from stationary windows — the accelerometer bias, the make-or-break number
// for phone-path fusion.

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function fmt(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : 'n/a';
}

function coverage(samples: ExportedImuSample[], pick: (s: ExportedImuSample) => (number | null)[]) {
  let filled = 0;
  for (const sample of samples) {
    if (pick(sample).every((v) => v !== null)) filled++;
  }
  return ((100 * filled) / samples.length).toFixed(1) + '%';
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npx tsx bench/imu-quality.ts <export.json>');
    process.exit(1);
  }

  const data = loadSessionExport(path);
  const gps = toSamples(data);
  const gpsDts = gps.slice(1).map((s, i) => s.recordedAt - gps[i].recordedAt).sort((a, b) => a - b);

  console.log(`# IMU stream quality — ${data.session.name ?? data.session.id}`);
  console.log(`format ${data.format ?? '?'} v${data.version ?? 1}\n`);
  console.log('## GPS');
  console.log(`points: ${gps.length} | duration: ${((gps.at(-1)!.recordedAt - gps[0].recordedAt) / 60000).toFixed(1)} min`);
  console.log(`dt median ${fmt(percentile(gpsDts, 50), 0)} ms | p95 ${fmt(percentile(gpsDts, 95), 0)} ms | gaps >1.5s: ${gpsDts.filter((d) => d > 1500).length}`);

  const imu = data.imuSamples ?? [];
  console.log('\n## IMU');
  if (imu.length === 0) {
    console.log('no imuSamples in this export (v1 file, or IMU_CAPTURE_ENABLED was off / unavailable).');
    return;
  }

  const dts = imu.slice(1).map((s, i) => s.recordedAt - imu[i].recordedAt).sort((a, b) => a - b);
  const durationMin = (imu[imu.length - 1].recordedAt - imu[0].recordedAt) / 60000;
  const gaps = dts.filter((d) => d > 100);

  console.log(`samples: ${imu.length} | duration: ${durationMin.toFixed(1)} min | mean rate: ${fmt(imu.length / (durationMin * 60))} Hz`);
  console.log(`dt median ${fmt(percentile(dts, 50), 0)} ms | p95 ${fmt(percentile(dts, 95), 0)} ms | max ${fmt(percentile(dts, 100), 0)} ms | gaps >100ms: ${gaps.length}`);
  console.log(`reported interval field median: ${fmt(percentile(imu.map((s) => s.intervalMs ?? NaN).filter(Number.isFinite).sort((a, b) => a - b), 50), 1)} ms`);
  console.log('\nfield coverage (all three axes non-null):');
  console.log(`  acceleration (user):        ${coverage(imu, (s) => s.accel)}`);
  console.log(`  accelerationInclGravity:    ${coverage(imu, (s) => s.accelInclGravity)}`);
  console.log(`  rotation (attitude):        ${coverage(imu, (s) => s.rotation)}`);
  console.log(`  rotationRate:               ${coverage(imu, (s) => s.rotationRate)}`);

  const gpsStartOffset = imu[0].recordedAt - gps[0].recordedAt;
  console.log(`\nclock: IMU stream starts ${fmt(gpsStartOffset / 1000)} s after first GPS fix (same Date.now domain expected)`);

  // Stationary windows (GPS speed < 0.5 m/s for >= 5 s) expose accelerometer
  // bias: user-acceleration should average zero when parked.
  const windows: { startMs: number; endMs: number }[] = [];
  let windowStart: number | null = null;
  for (let i = 0; i < gps.length; i++) {
    const stationary = (gps[i].speedMps ?? 0) < 0.5;
    if (stationary && windowStart === null) windowStart = gps[i].recordedAt;
    if ((!stationary || i === gps.length - 1) && windowStart !== null) {
      const end = gps[i].recordedAt;
      if (end - windowStart >= 5000) windows.push({ startMs: windowStart, endMs: end });
      windowStart = null;
    }
  }

  console.log(`\nstationary windows (>=5 s): ${windows.length}`);
  if (windows.length > 0) {
    const axes: [string, number][] = [['x', 0], ['y', 1], ['z', 2]];
    for (const [name, axis] of axes) {
      const values: number[] = [];
      for (const w of windows) {
        for (const s of imu) {
          if (s.recordedAt >= w.startMs && s.recordedAt <= w.endMs && s.accel[axis] !== null) {
            values.push(s.accel[axis]!);
          }
        }
      }
      if (values.length > 0) {
        const meanV = values.reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(values.reduce((a, b) => a + (b - meanV) ** 2, 0) / values.length);
        console.log(`  accel ${name}: bias ${(meanV * 1000).toFixed(1)} mm/s² | noise σ ${(std * 1000).toFixed(1)} mm/s² (n=${values.length})`);
      }
    }
    console.log('  (bias budget from the spec: 50 mm/s² ≈ 3 m over 11 s — acceptable; 500 ≈ 30 m — not)');
  }
}

main();
