import { findDisplayHoles, type DisplayHole } from '@/utils/displayLine';
import {
  bridgeDisplayHoles,
  calibrateImuTimeline,
  type BridgeFix,
  type HoleBridge,
  type ImuSample,
  type TrackOutline,
} from '@/utils/holeBridge';
import * as fs from 'fs';

// Masked-GPS validation of the display hole bridge on a real capture
// (docs/line-continuity.md, "Hole bridging from the phone IMU"): windows of
// good GPS are degraded to speed-only fixes, bridged from the real IMU and
// speed streams with the track outline available as in the app, and compared
// against the hidden fixes — exact ground truth to GPS noise. Then every real
// hole of the session is bridged.
//
//   npx tsx bench/hole-bridge.ts bench/data/<v3-export>.json

// The export fields this bench reads; replay.ts is not imported because it
// pulls React Native in through the runtime.
type Vec3 = [number | null, number | null, number | null];

type SessionExport = {
  session: { id: string; name: string | null };
  track: { path?: unknown; pathWidthMeters?: number | null };
  laps: { startedAt: string }[];
  gpsPoints: BridgeFix[];
  rejectedGpsPoints?: BridgeFix[];
  imuSamples?: { recordedAt: number; rotation: Vec3; rotationRate: Vec3; accel: Vec3; accelInclGravity: Vec3 }[];
};

function loadSessionExport(path: string): SessionExport {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

const MASK_DURATIONS_S = [10, 20, 31, 45];
const WINDOW_STRIDE_MS = 15_000;
const TRUSTED_ACCURACY_M = 15;
const MIN_MOVING_SPEED_MPS = 5;
const M_LAT = 111320;

type Fix = BridgeFix & { timeMs: number };

function toFixes(data: SessionExport): Fix[] {
  const accepted: Fix[] = data.gpsPoints.map((p) => ({
    recordedAt: p.recordedAt,
    latitude: p.latitude,
    longitude: p.longitude,
    speedMps: p.speedMps,
    accuracyM: p.accuracyM,
    timeMs: Date.parse(p.recordedAt),
  }));
  const rejected: Fix[] = (data.rejectedGpsPoints ?? []).map((p) => ({
    recordedAt: p.recordedAt,
    latitude: p.latitude,
    longitude: p.longitude,
    speedMps: p.speedMps,
    accuracyM: p.accuracyM,
    timeMs: Date.parse(p.recordedAt),
  }));
  return [...accepted, ...rejected].sort((a, b) => a.timeMs - b.timeMs);
}

function complete(v: Vec3): v is [number, number, number] {
  return v.every((c) => c !== null);
}

function toSamples(data: SessionExport): ImuSample[] {
  return (data.imuSamples ?? [])
    .filter((s) => s.rotation[0] !== null && complete(s.rotationRate) && complete(s.accel) && complete(s.accelInclGravity))
    .map((s) => ({
      recordedAt: s.recordedAt,
      yawRad: s.rotation[0]!,
      rotationRate: s.rotationRate as [number, number, number],
      gravity: [0, 1, 2].map((k) => s.accelInclGravity[k]! - s.accel[k]!) as [number, number, number],
    }))
    .sort((a, b) => a.recordedAt - b.recordedAt);
}

function toOutline(data: SessionExport): TrackOutline | null {
  const path = data.track.path;
  if (!Array.isArray(path) || path.length < 2) return null;
  return {
    path: path.map((p: unknown) =>
      Array.isArray(p)
        ? { latitude: Number(p[0]), longitude: Number(p[1]) }
        : (p as { latitude: number; longitude: number })
    ),
    widthMeters: data.track.pathWidthMeters ?? null,
  };
}

function isTrusted(fix: BridgeFix) {
  return fix.accuracyM === null || fix.accuracyM <= TRUSTED_ACCURACY_M;
}

function pointAt(bridge: HoleBridge, tMs: number) {
  const after = bridge.points.findIndex((p) => p.timeMs >= tMs);
  if (after < 0) return bridge.points[bridge.points.length - 1];
  const b = bridge.points[after];
  const a = bridge.points[Math.max(0, after - 1)];
  const f = b.timeMs === a.timeMs ? 0 : (tMs - a.timeMs) / (b.timeMs - a.timeMs);
  return { latitude: a.latitude + (b.latitude - a.latitude) * f, longitude: a.longitude + (b.longitude - a.longitude) * f };
}

function distanceM(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }, lngScale: number) {
  return Math.hypot((b.longitude - a.longitude) * lngScale, (b.latitude - a.latitude) * M_LAT);
}

function distanceToOutlineM(point: { latitude: number; longitude: number }, outline: TrackOutline, lngScale: number) {
  let best = Infinity;
  for (let i = 1; i < outline.path.length; i++) {
    const ax = outline.path[i - 1].longitude * lngScale, ay = outline.path[i - 1].latitude * M_LAT;
    const bx = outline.path[i].longitude * lngScale, by = outline.path[i].latitude * M_LAT;
    const px = point.longitude * lngScale, py = point.latitude * M_LAT;
    const dx = bx - ax, dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const u = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(px - (ax + u * dx), py - (ay + u * dy)));
  }
  return best;
}

type WindowResult = { meanErrorM: number; maxErrorM: number; chordMeanM: number; closureMissM: number; source: string; boundedShare: number };

function runWindow(fixes: Fix[], trusted: Fix[], samples: ImuSample[], outline: TrackOutline | null, startMs: number, durationS: number, lngScale: number): WindowResult | null {
  const endMs = startMs + durationS * 1000;
  const hiddenIndices: number[] = [];
  for (let i = 0; i < trusted.length; i++) {
    if (trusted[i].timeMs >= startMs && trusted[i].timeMs <= endMs) hiddenIndices.push(i);
  }
  if (hiddenIndices.length < durationS * 0.9) return null;
  const first = hiddenIndices[0];
  const last = hiddenIndices[hiddenIndices.length - 1];
  if (first < 5 || last + 5 >= trusted.length) return null;
  for (let i = first; i < last; i++) {
    if (trusted[i + 1].timeMs - trusted[i].timeMs > 1500) return null;
    if ((trusted[i].speedMps ?? 0) <= MIN_MOVING_SPEED_MPS) return null;
  }
  const anchorA = trusted[first - 1];
  const anchorB = trusted[last + 1];
  if (anchorB.timeMs - anchorA.timeMs > (durationS + 3) * 1000) return null;

  const hidden = new Set(hiddenIndices.map((i) => trusted[i].timeMs));
  const masked = fixes.map((fix) => (isTrusted(fix) && hidden.has(fix.timeMs) ? { ...fix, accuracyM: 50 } : fix));
  const hole: DisplayHole | undefined = findDisplayHoles(masked).find((h) => h.fromMs === anchorA.timeMs);
  if (!hole || hole.toMs !== anchorB.timeMs) return null;

  const [bridge] = bridgeDisplayHoles({ holes: [hole], fixes: masked, samples, outline });
  if (!bridge) return null;

  const errors: number[] = [];
  const chordErrors: number[] = [];
  for (const i of hiddenIndices) {
    const fix = trusted[i];
    errors.push(distanceM(pointAt(bridge, fix.timeMs), fix, lngScale));
    const f = (fix.timeMs - anchorA.timeMs) / (anchorB.timeMs - anchorA.timeMs);
    chordErrors.push(
      distanceM(
        { latitude: anchorA.latitude + (anchorB.latitude - anchorA.latitude) * f, longitude: anchorA.longitude + (anchorB.longitude - anchorA.longitude) * f },
        fix,
        lngScale
      )
    );
  }
  return {
    meanErrorM: errors.reduce((a, b) => a + b, 0) / errors.length,
    maxErrorM: Math.max(...errors),
    chordMeanM: chordErrors.reduce((a, b) => a + b, 0) / chordErrors.length,
    closureMissM: bridge.closureMissM,
    source: bridge.headingSource,
    boundedShare: bridge.boundedShare,
  };
}

function main() {
  const path = process.argv[2];
  if (!path) {
    console.error('usage: npx tsx bench/hole-bridge.ts <v3-export.json>');
    process.exit(1);
  }
  const data = loadSessionExport(path);
  const fixes = toFixes(data);
  const samples = toSamples(data);
  const outline = toOutline(data);
  const trusted = fixes.filter(isTrusted);
  if (trusted.length < 2 || samples.length === 0) {
    console.error('export needs trusted fixes and imuSamples (v2+ capture)');
    process.exit(1);
  }
  const lngScale = M_LAT * Math.cos((trusted[0].latitude * Math.PI) / 180);

  console.log(`# Hole bridge validation — ${data.session.name ?? data.session.id}\n`);
  const calibration = calibrateImuTimeline(fixes, samples);
  if (!calibration) {
    console.log('calibration: FAILED (no bridges would be drawn for this session)');
    process.exit(0);
  }
  const describe = (name: string, c: { sign: number; offsetMs: number; chordPairs: number; r2: number } | null) =>
    c ? `${name}: sign ${c.sign}, offset ${c.offsetMs} ms, ${c.chordPairs} chord pairs, r² ${c.r2.toFixed(3)}` : `${name}: unusable`;
  console.log(`calibration: speed lag ${calibration.speedLagMs} ms | ${describe('fused yaw', calibration.fusedYaw)} | ${describe('gyro', calibration.gyro)}`);
  console.log(`track ribbon half width: ${outline ? ((outline.widthMeters ?? 12) / 2).toFixed(1) : '-'} m\n`);

  console.log('| hole | windows | bridge mean err | 9 of 10 windows under | worst | chord mean err | closure miss mean | gyro picked | points bounded |');
  console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  const firstLapMs = data.laps.length > 0 ? Date.parse(data.laps[0].startedAt) : trusted[0].timeMs;
  for (const durationS of MASK_DURATIONS_S) {
    const results: WindowResult[] = [];
    for (let startMs = firstLapMs; startMs < trusted[trusted.length - 1].timeMs - durationS * 1000; startMs += WINDOW_STRIDE_MS) {
      const result = runWindow(fixes, trusted, samples, outline, startMs, durationS, lngScale);
      if (result) results.push(result);
    }
    if (results.length === 0) {
      console.log(`| ${durationS} s | 0 | - | - | - | - | - | - | - |`);
      continue;
    }
    const means = results.map((r) => r.meanErrorM).sort((a, b) => a - b);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    console.log(
      `| ${durationS} s | ${results.length} | ${mean(means).toFixed(1)} m | ${means[Math.floor(0.9 * means.length)].toFixed(1)} m | ${Math.max(...results.map((r) => r.maxErrorM)).toFixed(1)} m | ${mean(results.map((r) => r.chordMeanM)).toFixed(1)} m | ${mean(results.map((r) => r.closureMissM)).toFixed(1)} m | ${results.filter((r) => r.source === 'gyro').length} | ${(100 * mean(results.map((r) => r.boundedShare))).toFixed(0)} % |`
    );
  }

  const holes = findDisplayHoles(
    data.gpsPoints,
    {},
    data.rejectedGpsPoints ?? []
  );
  const bridges = bridgeDisplayHoles({ holes, fixes, samples, outline });
  console.log(`\nreal holes: ${holes.length} | bridged: ${bridges.length}`);
  console.log('| hole | length | bridged | source | closure miss | points bounded | max outline distance |');
  console.log('| --- | --- | --- | --- | --- | --- | --- |');
  holes.forEach((hole, index) => {
    const bridge = bridges.find((b) => b.fromMs === hole.fromMs);
    const outlineMax =
      bridge && outline
        ? Math.max(...bridge.points.map((p) => distanceToOutlineM(p, outline, lngScale))).toFixed(1) + ' m'
        : '-';
    console.log(
      `| ${index + 1} | ${((hole.toMs - hole.fromMs) / 1000).toFixed(0)} s | ${bridge ? 'yes' : 'no'} | ${bridge?.headingSource ?? '-'} | ${bridge ? bridge.closureMissM.toFixed(1) + ' m' : '-'} | ${bridge ? (100 * bridge.boundedShare).toFixed(0) + ' %' : '-'} | ${outlineMax} |`
    );
  });
}

main();
