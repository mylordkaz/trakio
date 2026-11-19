import { DEFAULT_DISPLAY_LINE_CONFIG, type DisplayHole, type GeoPoint } from '@/utils/displayLine';
import { toRadians } from '@/utils/geo';

// Display-only reconstruction of the path across a hole in the trusted GPS
// stream. Two measurements keep arriving while the position is lost: the
// OS-fused yaw (imu_samples.rotation_alpha) and the Doppler speed on the
// degraded and quarantined fixes inside the hole. Heading is integrated from
// the yaw, distance from the speed, and the path is closed onto the trusted
// fixes on both sides. A hole stays open when it has no speed inside or any
// guard fails. Timing, storage and the export never see a bridge.
//
// The three clock parameters (yaw sign, yaw offset, speed lag) are measured
// on the session's own trusted fixes; nothing is assumed about the platform.
// Validated on real data with bench/hole-bridge.ts: hidden 31 s windows of
// good GPS reconstruct within 4.3 m mean against the hidden fixes.

export type BridgeFix = {
  recordedAt: string;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  accuracyM: number | null;
};

export type YawSample = {
  recordedAt: number;
  yawRad: number;
};

export type HoleBridge = {
  fromMs: number;
  toMs: number;
  // Distance between the integrated end and the closing fix, before closure.
  closureMissM: number;
  points: { timeMs: number; latitude: number; longitude: number }[];
};

export type ImuTimelineCalibration = {
  yawSign: 1 | -1;
  // Yaw stamped at t + yawOffsetMs describes the fix stamped at t.
  yawOffsetMs: number;
  // Speed stamped at t + speedLagMs describes the fix stamped at t.
  speedLagMs: number;
  chordPairs: number;
  r2: number;
};

export type BridgeLapGroup = {
  lapId: string | null;
  points: GeoPoint[];
};

const METERS_PER_DEG_LAT = 111320;
// Chords between trusted fixes about a second apart measure course and speed
// over ground on the position clock, independent of each fix's own course
// and speed fields.
const CHORD_MIN_DT_MS = 800;
const CHORD_MAX_DT_MS = 1500;
const CHORD_MIN_SPEED_MPS = 8;
const YAW_OFFSET_MIN_MS = -1500;
const YAW_OFFSET_MAX_MS = 500;
const SPEED_LAG_MIN_MS = -500;
const SPEED_LAG_MAX_MS = 1500;
const CALIBRATION_STEP_MS = 50;
const MIN_CHORD_PAIRS = 50;
const MIN_R2 = 0.9;
const MAX_HOLE_MS = 45_000;
const MAX_SPEED_SAMPLE_GAP_MS = 3000;
const MIN_MOVING_SPEED_MPS = 3;
const MAX_YAW_SAMPLE_GAP_MS = 1000;
const ANCHOR_FIX_COUNT = 4;
const ANCHOR_MAX_SPAN_MS = ANCHOR_FIX_COUNT * CHORD_MAX_DT_MS + 500;
const INTEGRATION_STEP_MS = 50;
const OUTPUT_STEP_MS = 250;
const MAX_CLOSURE_MISS_RATIO = 0.1;
const MAX_OUTLINE_DISTANCE_M = 25;

type XY = { x: number; y: number };
type Fix = XY & { timeMs: number; speedMps: number | null };
type Series = { timesMs: number[]; values: number[] };
type Chord = { midMs: number; directionDeg: number; speedMps: number };

type Context = {
  lngScaleM: number;
  trusted: Fix[];
  trustedIndexByTime: Map<number, number>;
  yaw: Series;
  speed: Series;
  outline: XY[];
  calibration: ImuTimelineCalibration;
};

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function wrapDegrees(value: number) {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function directionDeg(from: XY, to: XY) {
  return toDegrees(Math.atan2(to.x - from.x, to.y - from.y));
}

function distanceM(a: XY, b: XY) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

// Index of the last time at or before tMs; -1 when none.
function lastIndexAtOrBefore(timesMs: number[], tMs: number) {
  let low = 0;
  let high = timesMs.length - 1;
  let result = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (timesMs[mid] <= tMs) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

// Linear interpolation; null outside the series or across a gap wider than
// maxGapMs.
function interpolate(series: Series, tMs: number, maxGapMs: number): number | null {
  const i = lastIndexAtOrBefore(series.timesMs, tMs);
  if (i < 0) {
    return null;
  }
  if (series.timesMs[i] === tMs || i === series.timesMs.length - 1) {
    return series.timesMs[i] === tMs ? series.values[i] : null;
  }
  const t0 = series.timesMs[i];
  const t1 = series.timesMs[i + 1];
  if (t1 - t0 > maxGapMs) {
    return null;
  }
  const fraction = (tMs - t0) / (t1 - t0);
  return series.values[i] + (series.values[i + 1] - series.values[i]) * fraction;
}

// Clamped linear interpolation for the speed timeline.
function speedAt(series: Series, tMs: number) {
  const i = lastIndexAtOrBefore(series.timesMs, tMs);
  if (i < 0) {
    return series.values[0];
  }
  if (i === series.timesMs.length - 1) {
    return series.values[i];
  }
  const t0 = series.timesMs[i];
  const t1 = series.timesMs[i + 1];
  const fraction = t1 === t0 ? 0 : (tMs - t0) / (t1 - t0);
  return series.values[i] + (series.values[i + 1] - series.values[i]) * fraction;
}

function unwrapYaw(samples: YawSample[]): Series {
  const timesMs: number[] = [];
  const values: number[] = [];
  let unwrapped = 0;
  for (const sample of samples) {
    const degrees = toDegrees(sample.yawRad);
    unwrapped = timesMs.length === 0 ? degrees : unwrapped + wrapDegrees(degrees - unwrapped);
    timesMs.push(sample.recordedAt);
    values.push(unwrapped);
  }
  return { timesMs, values };
}

function buildChords(trusted: Fix[]): Chord[] {
  const chords: Chord[] = [];
  let i = 0;
  while (i < trusted.length - 1) {
    let j = i + 1;
    while (j < trusted.length && trusted[j].timeMs - trusted[i].timeMs < CHORD_MIN_DT_MS) {
      j++;
    }
    if (j >= trusted.length) {
      break;
    }
    const dtMs = trusted[j].timeMs - trusted[i].timeMs;
    if (dtMs <= CHORD_MAX_DT_MS && (trusted[i].speedMps ?? 0) >= CHORD_MIN_SPEED_MPS) {
      chords.push({
        midMs: (trusted[i].timeMs + trusted[j].timeMs) / 2,
        directionDeg: directionDeg(trusted[i], trusted[j]),
        speedMps: distanceM(trusted[i], trusted[j]) / (dtMs / 1000),
      });
    }
    i = j;
  }
  return chords;
}

function linearFit(xs: number[], ys: number[]) {
  const n = xs.length;
  const meanX = xs.reduce((sum, x) => sum + x, 0) / n;
  const meanY = ys.reduce((sum, y) => sum + y, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - meanX) ** 2;
    sxy += (xs[i] - meanX) * (ys[i] - meanY);
    syy += (ys[i] - meanY) ** 2;
  }
  if (sxx === 0 || syy === 0) {
    return { slope: 0, r2: 0 };
  }
  return { slope: sxy / sxx, r2: (sxy * sxy) / (sxx * syy) };
}

// Reported speed interpolated between trusted fixes only; null across a gap.
function trustedSpeedSeries(trusted: Fix[]): Series {
  const withSpeed = trusted.filter((fix) => fix.speedMps !== null);
  return { timesMs: withSpeed.map((fix) => fix.timeMs), values: withSpeed.map((fix) => fix.speedMps!) };
}

function calibrate(trusted: Fix[], yaw: Series): ImuTimelineCalibration | null {
  const chords = buildChords(trusted);

  let bestYaw: { r2: number; slope: number; offsetMs: number; pairs: number } | null = null;
  for (let offsetMs = YAW_OFFSET_MIN_MS; offsetMs <= YAW_OFFSET_MAX_MS; offsetMs += CALIBRATION_STEP_MS) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i < chords.length; i++) {
      const a = chords[i - 1];
      const b = chords[i];
      if (b.midMs - a.midMs > CHORD_MAX_DT_MS) {
        continue;
      }
      const yawA = interpolate(yaw, a.midMs + offsetMs, MAX_YAW_SAMPLE_GAP_MS);
      const yawB = interpolate(yaw, b.midMs + offsetMs, MAX_YAW_SAMPLE_GAP_MS);
      if (yawA === null || yawB === null) {
        continue;
      }
      xs.push(yawB - yawA);
      ys.push(wrapDegrees(b.directionDeg - a.directionDeg));
    }
    if (xs.length < MIN_CHORD_PAIRS) {
      continue;
    }
    const fit = linearFit(xs, ys);
    if (bestYaw === null || fit.r2 > bestYaw.r2) {
      bestYaw = { ...fit, offsetMs, pairs: xs.length };
    }
  }
  if (bestYaw === null || bestYaw.r2 < MIN_R2) {
    return null;
  }

  const reported = trustedSpeedSeries(trusted);
  let bestLag: { rms: number; lagMs: number } | null = null;
  for (let lagMs = SPEED_LAG_MIN_MS; lagMs <= SPEED_LAG_MAX_MS; lagMs += CALIBRATION_STEP_MS) {
    let sum = 0;
    let count = 0;
    for (const chord of chords) {
      const speed = interpolate(reported, chord.midMs + lagMs, CHORD_MAX_DT_MS);
      if (speed === null) {
        continue;
      }
      sum += (speed - chord.speedMps) ** 2;
      count++;
    }
    if (count < MIN_CHORD_PAIRS) {
      continue;
    }
    const rms = Math.sqrt(sum / count);
    if (bestLag === null || rms < bestLag.rms) {
      bestLag = { rms, lagMs };
    }
  }
  if (bestLag === null) {
    return null;
  }

  return {
    yawSign: bestYaw.slope < 0 ? -1 : 1,
    yawOffsetMs: bestYaw.offsetMs,
    speedLagMs: bestLag.lagMs,
    chordPairs: bestYaw.pairs,
    r2: bestYaw.r2,
  };
}

function buildContext(fixes: BridgeFix[], yawSamples: YawSample[], outline: GeoPoint[]): Context | null {
  const maxAccuracyM = DEFAULT_DISPLAY_LINE_CONFIG.maxAccuracyM;
  const trustedInput = fixes.filter(
    (fix) => fix.accuracyM === null || fix.accuracyM <= maxAccuracyM
  );
  if (trustedInput.length < 2) {
    return null;
  }

  let minLat = trustedInput[0].latitude;
  let maxLat = minLat;
  for (const fix of trustedInput) {
    if (fix.latitude < minLat) minLat = fix.latitude;
    if (fix.latitude > maxLat) maxLat = fix.latitude;
  }
  const lngScaleM = Math.cos(toRadians((minLat + maxLat) / 2)) * METERS_PER_DEG_LAT;

  const project = (fix: BridgeFix): Fix => ({
    timeMs: Date.parse(fix.recordedAt),
    x: fix.longitude * lngScaleM,
    y: fix.latitude * METERS_PER_DEG_LAT,
    speedMps: fix.speedMps !== null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0 ? fix.speedMps : null,
  });
  const byTime = (a: Fix, b: Fix) => a.timeMs - b.timeMs;

  const trusted = trustedInput.map(project).sort(byTime);
  const withSpeed = fixes.map(project).filter((fix) => fix.speedMps !== null).sort(byTime);
  const yaw = unwrapYaw(yawSamples);
  const calibration = calibrate(trusted, yaw);
  if (calibration === null) {
    return null;
  }

  return {
    lngScaleM,
    trusted,
    trustedIndexByTime: new Map(trusted.map((fix, index) => [fix.timeMs, index])),
    yaw,
    speed: { timesMs: withSpeed.map((fix) => fix.timeMs), values: withSpeed.map((fix) => fix.speedMps!) },
    outline: outline.map((point) => ({ x: point.longitude * lngScaleM, y: point.latitude * METERS_PER_DEG_LAT })),
    calibration,
  };
}

// Heading change between two fix-clock instants, from the calibrated yaw.
function yawDeltaDeg(context: Context, tMs: number, referenceMs: number): number | null {
  const { yawOffsetMs, yawSign } = context.calibration;
  const at = interpolate(context.yaw, tMs + yawOffsetMs, MAX_YAW_SAMPLE_GAP_MS);
  const reference = interpolate(context.yaw, referenceMs + yawOffsetMs, MAX_YAW_SAMPLE_GAP_MS);
  return at === null || reference === null ? null : yawSign * (at - reference);
}

type DeadReckoning = { end: XY; path: { timeMs: number; x: number; y: number }[] };

// Integrates heading and speed from the origin; null when yaw is missing
// anywhere on the way.
function deadReckon(
  context: Context,
  fromMs: number,
  toMs: number,
  headingAt: (tMs: number) => number | null
): DeadReckoning | null {
  let x = 0;
  let y = 0;
  const path = [{ timeMs: fromMs, x, y }];
  for (let t = fromMs; t < toMs; ) {
    const next = Math.min(t + INTEGRATION_STEP_MS, toMs);
    const mid = (t + next) / 2;
    const heading = headingAt(mid);
    if (heading === null) {
      return null;
    }
    const speed = speedAt(context.speed, mid + context.calibration.speedLagMs);
    const dt = (next - t) / 1000;
    x += speed * Math.sin(toRadians(heading)) * dt;
    y += speed * Math.cos(toRadians(heading)) * dt;
    t = next;
    path.push({ timeMs: t, x, y });
  }
  return { end: { x, y }, path };
}

// Heading at a trusted fix, chosen so that integrating yaw and speed across
// the neighbouring fixes reproduces their displacement. Null when the
// neighbours are not contiguous or yaw is missing there.
function fitAnchorHeading(context: Context, index: number, side: -1 | 1): number | null {
  const { trusted } = context;
  const first = side < 0 ? Math.max(0, index - ANCHOR_FIX_COUNT) : index;
  const last = side < 0 ? index : Math.min(trusted.length - 1, index + ANCHOR_FIX_COUNT);
  if (last - first < 1) {
    return null;
  }
  const from = trusted[first];
  const to = trusted[last];
  if (to.timeMs - from.timeMs > ANCHOR_MAX_SPAN_MS) {
    return null;
  }
  const anchorMs = trusted[index].timeMs;
  const relative = deadReckon(context, from.timeMs, to.timeMs, (tMs) => yawDeltaDeg(context, tMs, anchorMs));
  if (relative === null || (relative.end.x === 0 && relative.end.y === 0)) {
    return null;
  }
  return wrapDegrees(directionDeg(from, to) - directionDeg({ x: 0, y: 0 }, relative.end));
}

function distanceToOutlineM(point: XY, outline: XY[]) {
  let best = Infinity;
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1];
    const b = outline[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const u = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const d = Math.hypot(point.x - (a.x + u * dx), point.y - (a.y + u * dy));
    if (d < best) best = d;
  }
  return best;
}

function bridgeHole(context: Context, hole: DisplayHole): HoleBridge | null {
  const { trusted, speed } = context;
  const indexA = context.trustedIndexByTime.get(hole.fromMs);
  const indexB = context.trustedIndexByTime.get(hole.toMs);
  if (indexA === undefined || indexB === undefined) {
    return null;
  }
  const A = trusted[indexA];
  const B = trusted[indexB];
  const spanMs = B.timeMs - A.timeMs;
  if (spanMs <= 0 || spanMs > MAX_HOLE_MS || A.speedMps === null || B.speedMps === null) {
    return null;
  }

  // Speed must keep flowing through the hole and the car must keep moving:
  // silence is not bridged.
  let previousMs = A.timeMs;
  let slowest = Math.min(A.speedMps, B.speedMps);
  for (let i = lastIndexAtOrBefore(speed.timesMs, A.timeMs) + 1; i < speed.timesMs.length && speed.timesMs[i] < B.timeMs; i++) {
    if (speed.timesMs[i] - previousMs > MAX_SPEED_SAMPLE_GAP_MS) {
      return null;
    }
    previousMs = speed.timesMs[i];
    slowest = Math.min(slowest, speed.values[i]);
  }
  if (B.timeMs - previousMs > MAX_SPEED_SAMPLE_GAP_MS || slowest < MIN_MOVING_SPEED_MPS) {
    return null;
  }

  const headingA = fitAnchorHeading(context, indexA, -1);
  const headingB = fitAnchorHeading(context, indexB, 1);
  const yawSpan = yawDeltaDeg(context, B.timeMs, A.timeMs);
  if (headingA === null || headingB === null || yawSpan === null) {
    return null;
  }
  const driftDeg = wrapDegrees(headingB - (headingA + yawSpan));
  const reckoned = deadReckon(context, A.timeMs, B.timeMs, (tMs) => {
    const delta = yawDeltaDeg(context, tMs, A.timeMs);
    return delta === null ? null : headingA + delta + (driftDeg * (tMs - A.timeMs)) / spanMs;
  });
  if (reckoned === null) {
    return null;
  }

  const residual = { x: B.x - A.x - reckoned.end.x, y: B.y - A.y - reckoned.end.y };
  const closureMissM = Math.hypot(residual.x, residual.y);
  let lengthM = 0;
  for (let i = 1; i < reckoned.path.length; i++) {
    lengthM += distanceM(reckoned.path[i - 1], reckoned.path[i]);
  }
  if (lengthM === 0 || closureMissM > MAX_CLOSURE_MISS_RATIO * lengthM) {
    return null;
  }

  const closed: { timeMs: number; x: number; y: number }[] = [];
  let nextOutputMs = A.timeMs;
  for (const sample of reckoned.path) {
    if (sample.timeMs < nextOutputMs && sample.timeMs !== B.timeMs) {
      continue;
    }
    const fraction = (sample.timeMs - A.timeMs) / spanMs;
    closed.push({
      timeMs: sample.timeMs,
      x: A.x + sample.x + residual.x * fraction,
      y: A.y + sample.y + residual.y * fraction,
    });
    nextOutputMs = sample.timeMs + OUTPUT_STEP_MS;
  }

  if (
    context.outline.length >= 2 &&
    closed.some((point) => distanceToOutlineM(point, context.outline) > MAX_OUTLINE_DISTANCE_M)
  ) {
    return null;
  }

  return {
    fromMs: hole.fromMs,
    toMs: hole.toMs,
    closureMissM,
    points: closed.map((point) => ({
      timeMs: point.timeMs,
      latitude: point.y / METERS_PER_DEG_LAT,
      longitude: point.x / context.lngScaleM,
    })),
  };
}

export function calibrateImuTimeline(fixes: BridgeFix[], yaw: YawSample[]): ImuTimelineCalibration | null {
  return buildContext(fixes, yaw, [])?.calibration ?? null;
}

export function bridgeDisplayHoles(input: {
  holes: DisplayHole[];
  fixes: BridgeFix[];
  yaw: YawSample[];
  outline?: GeoPoint[] | null;
}): HoleBridge[] {
  if (input.holes.length === 0 || input.yaw.length === 0) {
    return [];
  }
  const context = buildContext(input.fixes, input.yaw, input.outline ?? []);
  if (context === null) {
    return [];
  }
  return input.holes
    .map((hole) => bridgeHole(context, hole))
    .filter((bridge): bridge is HoleBridge => bridge !== null);
}

// Bridges rendered per lap: a point belongs to the lap whose stored interval
// contains its time. Consecutive laps share the boundary point so the line
// stays continuous across it.
export function splitBridgesByLap(
  bridges: HoleBridge[],
  laps: { id: string; startedAt: string; endedAt: string | null }[]
): BridgeLapGroup[] {
  const intervals = laps
    .map((lap) => ({
      id: lap.id,
      startMs: Date.parse(lap.startedAt),
      endMs: lap.endedAt ? Date.parse(lap.endedAt) : Infinity,
    }))
    .sort((a, b) => a.startMs - b.startMs);
  const lapIdAt = (tMs: number) =>
    intervals.find((lap) => tMs >= lap.startMs && tMs < lap.endMs)?.id ?? null;

  const groups: BridgeLapGroup[] = [];
  for (const bridge of bridges) {
    let current: BridgeLapGroup | null = null;
    for (const point of bridge.points) {
      const lapId = lapIdAt(point.timeMs);
      const geo = { latitude: point.latitude, longitude: point.longitude };
      if (current === null || current.lapId !== lapId) {
        current?.points.push(geo);
        current = { lapId, points: [geo] };
        groups.push(current);
      } else {
        current.points.push(geo);
      }
    }
  }
  return groups.filter((group) => group.points.length >= 2);
}
