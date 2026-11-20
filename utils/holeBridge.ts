import { DEFAULT_DISPLAY_LINE_CONFIG, type DisplayHole, type GeoPoint } from '@/utils/displayLine';
import { toRadians } from '@/utils/geo';
import { DEFAULT_TRACK_WIDTH_METERS } from '@/utils/trackRibbon';

// Display-only reconstruction of the path across a hole in the trusted GPS
// stream. Measurements keep arriving while the position is lost: the phone's
// yaw, measured two ways (the OS-fused attitude yaw and the raw gyro), and
// the Doppler speed on the degraded and quarantined fixes inside the hole.
// Heading is integrated from the yaw, distance from the speed, and the path
// is closed onto the trusted fixes on both sides. Quarantined fixes
// contribute speed only; their positions are never trusted here, whatever
// accuracy they report. A hole stays open when it has no speed inside or any
// guard fails. Timing, storage and the export never see a bridge.
//
// The fused yaw is magnetometer-referenced and is pulled by steel structures
// (the very places that cause holes); the raw gyro has the right scale but
// picks up cradle vibration. Each hole keeps the source whose integrated
// heading closes better on the two anchors. The track ribbon is a hard
// bound: the car was on the asphalt, so a point reconstructed beyond the
// ribbon edge is moved onto it.
//
// Clock parameters (yaw sign and offset per source, speed lag) are measured
// on the session's own trusted fixes; nothing is assumed about the platform.
// Validated on real data with bench/hole-bridge.ts: hidden 31 s windows of
// good GPS reconstruct within 3.9 m mean against the hidden fixes.
//
// Holes are found per lap run, with the stored crossing clips in place, so a
// bridge never spans a lap boundary and never overlaps a line the clips
// already make continuous; the caller keeps each hole's lap.

export type BridgeFix = {
  recordedAt: string;
  latitude: number;
  longitude: number;
  speedMps: number | null;
  accuracyM: number | null;
};

export type ImuSample = {
  recordedAt: number;
  yawRad: number;
  // As delivered by expo-sensors: [alpha, beta, gamma] in deg/s.
  rotationRate: [number, number, number];
  // Gravity estimate in device axes, m/s².
  gravity: [number, number, number];
};

export type TrackOutline = {
  path: GeoPoint[];
  widthMeters: number | null;
};

export type HeadingSource = 'fusedYaw' | 'gyro';

export type HeadingCalibration = {
  sign: 1 | -1;
  // Heading stamped at t + offsetMs describes the fix stamped at t.
  offsetMs: number;
  chordPairs: number;
  r2: number;
};

export type ImuTimelineCalibration = {
  // Speed stamped at t + speedLagMs describes the fix stamped at t.
  speedLagMs: number;
  fusedYaw: HeadingCalibration | null;
  gyro: HeadingCalibration | null;
};

export type HoleBridge = {
  fromMs: number;
  toMs: number;
  headingSource: HeadingSource;
  // Distance between the integrated end and the closing fix, before closure.
  closureMissM: number;
  // Share of points moved onto the ribbon edge.
  boundedShare: number;
  points: { timeMs: number; latitude: number; longitude: number }[];
};

const METERS_PER_DEG_LAT = 111320;
// Chords between trusted fixes about a second apart measure course and speed
// over ground on the position clock, independent of each fix's own course
// and speed fields.
const CHORD_MIN_DT_MS = 800;
const CHORD_MAX_DT_MS = 1500;
const CHORD_MIN_SPEED_MPS = 8;
const HEADING_OFFSET_MIN_MS = -1500;
const HEADING_OFFSET_MAX_MS = 500;
const SPEED_LAG_MIN_MS = -500;
const SPEED_LAG_MAX_MS = 1500;
const CALIBRATION_STEP_MS = 50;
const MIN_CHORD_PAIRS = 50;
const MIN_R2 = 0.9;
const MAX_HOLE_MS = 45_000;
const MAX_SPEED_SAMPLE_GAP_MS = 3000;
const MIN_MOVING_SPEED_MPS = 3;
const MAX_IMU_SAMPLE_GAP_MS = 1000;
// Gyro integration step cap: a stamp gap wider than this is a capture gap,
// not a long sample.
const MAX_GYRO_STEP_S = 0.04;
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
  heading: Record<HeadingSource, Series>;
  speed: Series;
  outline: XY[];
  halfWidthM: number;
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

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[sorted.length >> 1];
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

function fusedYawSeries(samples: ImuSample[]): Series {
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

// Rotation rate about the vertical, integrated. The vertical is the median
// gravity direction over the session: the phone sits in a cradle, and the
// per-sample gravity estimate tilts under cornering and braking. The rate
// vector arrives as [alpha, beta, gamma] = device [z, y, x].
function gyroSeries(samples: ImuSample[]): Series {
  const unit = samples.map((sample) => {
    const [x, y, z] = sample.gravity;
    const norm = Math.hypot(x, y, z) || 1;
    return [x / norm, y / norm, z / norm];
  });
  const vertical = [0, 1, 2].map((axis) => median(unit.map((g) => g[axis])));

  const timesMs: number[] = [];
  const values: number[] = [];
  let integrated = 0;
  let previousRate = 0;
  for (let i = 0; i < samples.length; i++) {
    const [alpha, beta, gamma] = samples[i].rotationRate;
    const rate = gamma * vertical[0] + beta * vertical[1] + alpha * vertical[2];
    if (i > 0) {
      const dt = Math.min(MAX_GYRO_STEP_S, (samples[i].recordedAt - samples[i - 1].recordedAt) / 1000);
      if (dt > 0) {
        integrated += ((rate + previousRate) / 2) * dt;
      }
    }
    previousRate = rate;
    timesMs.push(samples[i].recordedAt);
    values.push(integrated);
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

// Sign and clock offset of a heading series against the course change
// between consecutive chords.
function calibrateHeading(chords: Chord[], heading: Series): HeadingCalibration | null {
  let best: { r2: number; slope: number; offsetMs: number; pairs: number } | null = null;
  for (let offsetMs = HEADING_OFFSET_MIN_MS; offsetMs <= HEADING_OFFSET_MAX_MS; offsetMs += CALIBRATION_STEP_MS) {
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 1; i < chords.length; i++) {
      const a = chords[i - 1];
      const b = chords[i];
      if (b.midMs - a.midMs > CHORD_MAX_DT_MS) {
        continue;
      }
      const headingA = interpolate(heading, a.midMs + offsetMs, MAX_IMU_SAMPLE_GAP_MS);
      const headingB = interpolate(heading, b.midMs + offsetMs, MAX_IMU_SAMPLE_GAP_MS);
      if (headingA === null || headingB === null) {
        continue;
      }
      xs.push(headingB - headingA);
      ys.push(wrapDegrees(b.directionDeg - a.directionDeg));
    }
    if (xs.length < MIN_CHORD_PAIRS) {
      continue;
    }
    const fit = linearFit(xs, ys);
    if (best === null || fit.r2 > best.r2) {
      best = { ...fit, offsetMs, pairs: xs.length };
    }
  }
  if (best === null || best.r2 < MIN_R2) {
    return null;
  }
  return { sign: best.slope < 0 ? -1 : 1, offsetMs: best.offsetMs, chordPairs: best.pairs, r2: best.r2 };
}

// Reported speed interpolated between trusted fixes only; null across a gap.
function trustedSpeedSeries(trusted: Fix[]): Series {
  const withSpeed = trusted.filter((fix) => fix.speedMps !== null);
  return { timesMs: withSpeed.map((fix) => fix.timeMs), values: withSpeed.map((fix) => fix.speedMps!) };
}

function calibrateSpeedLag(chords: Chord[], trusted: Fix[]): number | null {
  const reported = trustedSpeedSeries(trusted);
  let best: { rms: number; lagMs: number } | null = null;
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
    if (best === null || rms < best.rms) {
      best = { rms, lagMs };
    }
  }
  return best?.lagMs ?? null;
}

function buildContext(
  fixes: BridgeFix[],
  quarantined: BridgeFix[],
  samples: ImuSample[],
  outline: TrackOutline | null
): Context | null {
  const maxAccuracyM = DEFAULT_DISPLAY_LINE_CONFIG.maxAccuracyM;
  const trustedInput = fixes.filter(
    (fix) => fix.accuracyM === null || fix.accuracyM <= maxAccuracyM
  );
  if (trustedInput.length < 2 || samples.length === 0) {
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
  const withSpeed = [...fixes, ...quarantined]
    .map(project)
    .filter((fix) => fix.speedMps !== null)
    .sort(byTime);
  const chords = buildChords(trusted);
  const heading = { fusedYaw: fusedYawSeries(samples), gyro: gyroSeries(samples) };
  const calibration: ImuTimelineCalibration = {
    speedLagMs: calibrateSpeedLag(chords, trusted) ?? NaN,
    fusedYaw: calibrateHeading(chords, heading.fusedYaw),
    gyro: calibrateHeading(chords, heading.gyro),
  };
  if (!Number.isFinite(calibration.speedLagMs) || (calibration.fusedYaw === null && calibration.gyro === null)) {
    return null;
  }

  return {
    lngScaleM,
    trusted,
    trustedIndexByTime: new Map(trusted.map((fix, index) => [fix.timeMs, index])),
    heading,
    speed: { timesMs: withSpeed.map((fix) => fix.timeMs), values: withSpeed.map((fix) => fix.speedMps!) },
    outline: (outline?.path ?? []).map((point) => ({
      x: point.longitude * lngScaleM,
      y: point.latitude * METERS_PER_DEG_LAT,
    })),
    halfWidthM: (outline?.widthMeters ?? DEFAULT_TRACK_WIDTH_METERS) / 2,
    calibration,
  };
}

// Heading change between two fix-clock instants from one source.
function headingDeltaDeg(context: Context, source: HeadingSource, tMs: number, referenceMs: number): number | null {
  const calibration = context.calibration[source];
  if (calibration === null) {
    return null;
  }
  const series = context.heading[source];
  const at = interpolate(series, tMs + calibration.offsetMs, MAX_IMU_SAMPLE_GAP_MS);
  const reference = interpolate(series, referenceMs + calibration.offsetMs, MAX_IMU_SAMPLE_GAP_MS);
  return at === null || reference === null ? null : calibration.sign * (at - reference);
}

type DeadReckoning = { end: XY; path: { timeMs: number; x: number; y: number }[] };

// Integrates heading and speed from the origin; null when heading is missing
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

// Heading at a trusted fix, chosen so that integrating heading and speed
// across the neighbouring fixes reproduces their displacement. Null when the
// neighbours are not contiguous or the heading source is missing there.
function fitAnchorHeading(context: Context, source: HeadingSource, index: number, side: -1 | 1): number | null {
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
  const relative = deadReckon(context, from.timeMs, to.timeMs, (tMs) =>
    headingDeltaDeg(context, source, tMs, anchorMs)
  );
  if (relative === null || (relative.end.x === 0 && relative.end.y === 0)) {
    return null;
  }
  return wrapDegrees(directionDeg(from, to) - directionDeg({ x: 0, y: 0 }, relative.end));
}

type NearestOutline = { distanceM: number; x: number; y: number };

function nearestOutlinePoint(point: XY, outline: XY[]): NearestOutline {
  let best: NearestOutline = { distanceM: Infinity, x: point.x, y: point.y };
  for (let i = 1; i < outline.length; i++) {
    const a = outline[i - 1];
    const b = outline[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSq = dx * dx + dy * dy;
    const u = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq));
    const x = a.x + u * dx;
    const y = a.y + u * dy;
    const d = Math.hypot(point.x - x, point.y - y);
    if (d < best.distanceM) {
      best = { distanceM: d, x, y };
    }
  }
  return best;
}

type Candidate = { source: HeadingSource; reckoned: DeadReckoning; driftDeg: number };

// One source's integration across the hole, with the heading drift that
// closes it onto the far anchor spread linearly.
function reckonHole(context: Context, source: HeadingSource, indexA: number, indexB: number): Candidate | null {
  const A = context.trusted[indexA];
  const B = context.trusted[indexB];
  const spanMs = B.timeMs - A.timeMs;
  const headingA = fitAnchorHeading(context, source, indexA, -1);
  const headingB = fitAnchorHeading(context, source, indexB, 1);
  const headingSpan = headingDeltaDeg(context, source, B.timeMs, A.timeMs);
  if (headingA === null || headingB === null || headingSpan === null) {
    return null;
  }
  const driftDeg = wrapDegrees(headingB - (headingA + headingSpan));
  const reckoned = deadReckon(context, A.timeMs, B.timeMs, (tMs) => {
    const delta = headingDeltaDeg(context, source, tMs, A.timeMs);
    return delta === null ? null : headingA + delta + (driftDeg * (tMs - A.timeMs)) / spanMs;
  });
  return reckoned === null ? null : { source, reckoned, driftDeg };
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

  // The source whose heading closes better on the anchors wins the hole.
  const candidates = (['fusedYaw', 'gyro'] as const)
    .map((source) => reckonHole(context, source, indexA, indexB))
    .filter((candidate): candidate is Candidate => candidate !== null)
    .sort((a, b) => Math.abs(a.driftDeg) - Math.abs(b.driftDeg));
  const chosen = candidates[0];
  if (!chosen) {
    return null;
  }
  const { reckoned } = chosen;

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

  // The two ends are the measured anchors and stay where they were measured.
  let bounded = 0;
  if (context.outline.length >= 2) {
    for (const [index, point] of closed.entries()) {
      const nearest = nearestOutlinePoint(point, context.outline);
      if (nearest.distanceM > MAX_OUTLINE_DISTANCE_M) {
        return null;
      }
      if (index > 0 && index < closed.length - 1 && nearest.distanceM > context.halfWidthM) {
        const scale = context.halfWidthM / nearest.distanceM;
        point.x = nearest.x + (point.x - nearest.x) * scale;
        point.y = nearest.y + (point.y - nearest.y) * scale;
        bounded++;
      }
    }
  }

  return {
    fromMs: hole.fromMs,
    toMs: hole.toMs,
    headingSource: chosen.source,
    closureMissM,
    boundedShare: bounded / closed.length,
    points: closed.map((point) => ({
      timeMs: point.timeMs,
      latitude: point.y / METERS_PER_DEG_LAT,
      longitude: point.x / context.lngScaleM,
    })),
  };
}

export function calibrateImuTimeline(fixes: BridgeFix[], samples: ImuSample[]): ImuTimelineCalibration | null {
  return buildContext(fixes, [], samples, null)?.calibration ?? null;
}

// `fixes` are the accepted points; `quarantined` fixes add speed only. Holes
// whose anchors are not accepted fixes (a lap-boundary clip, for instance)
// stay open.
export function bridgeDisplayHoles(input: {
  holes: DisplayHole[];
  fixes: BridgeFix[];
  quarantined?: BridgeFix[];
  samples: ImuSample[];
  outline?: TrackOutline | null;
}): HoleBridge[] {
  if (input.holes.length === 0 || input.samples.length === 0) {
    return [];
  }
  const context = buildContext(input.fixes, input.quarantined ?? [], input.samples, input.outline ?? null);
  if (context === null) {
    return [];
  }
  return input.holes
    .map((hole) => bridgeHole(context, hole))
    .filter((bridge): bridge is HoleBridge => bridge !== null);
}
