import type { TimingLineRow } from '@/db/types';
import { segmentTimingLineFraction } from '@/telemetry/detection';
import { toRadians } from '@/utils/geo';

// Display-only rendering of stored GPS traces. Raw telemetry is never
// modified, and the line never guesses: only recorded, accurate points are
// drawn, and where data is missing the line shows an honest gap.
//
// Pipeline: accuracy filter -> split at holes -> spike rejection -> smoothing
// -> simplification -> densification.

export type GeoPoint = { latitude: number; longitude: number };

export type DisplayLinePoint = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

export type DisplayLineConfig = {
  maxAccuracyM: number;
  maxGapMs: number;
  maxGapM: number;
  smoothingPasses: number;
  simplifyToleranceM: number;
  densifySubdivisions: number;
  maxDisplayPoints: number;
  microSegmentMinLengthM: number;
};

const DEFAULT_DISPLAY_LINE_CONFIG: DisplayLineConfig = {
  maxAccuracyM: 15,
  maxGapMs: 3000,
  maxGapM: 120,
  smoothingPasses: 2,
  simplifyToleranceM: 1.2,
  densifySubdivisions: 4,
  maxDisplayPoints: 4000,
  microSegmentMinLengthM: 25,
};

const METERS_PER_DEG_LAT = 111320;
const DUPLICATE_DISTANCE_M = 0.01;

type XY = {
  x: number;
  y: number;
};

function distanceM(a: XY, b: XY) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function segmentLengthM(points: XY[]) {
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += distanceM(points[i - 1], points[i]);
  }
  return length;
}

function lerp(a: XY, b: XY, t: number): XY {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

// Consecutive points become one segment; a hole in time or distance starts a
// new one, so missing data renders as a gap instead of a drawn guess.
function splitIntoSegments(
  points: DisplayLinePoint[],
  lngScaleM: number,
  config: DisplayLineConfig
): XY[][] {
  const segments: XY[][] = [];
  let current: XY[] = [];
  let previous: (XY & { timeMs: number }) | null = null;

  for (const point of points) {
    const timeMs = Date.parse(point.recordedAt);
    const projected: XY = {
      x: point.longitude * lngScaleM,
      y: point.latitude * METERS_PER_DEG_LAT,
    };

    if (previous) {
      const gapM = distanceM(previous, projected);

      if (gapM < DUPLICATE_DISTANCE_M) {
        continue;
      }

      if (timeMs - previous.timeMs > config.maxGapMs || gapM > config.maxGapM) {
        if (current.length >= 2) {
          segments.push(current);
        }
        current = [];
      }
    }

    current.push(projected);
    previous = { ...projected, timeMs };
  }

  if (current.length >= 2) {
    segments.push(current);
  }

  return segments;
}

// An isolated spike leaves the path and comes straight back: both hops are
// long while the surrounding points sit close together. Real cornering never
// looks like that, so such points can be dropped even in data recorded before
// the capture-time jump filter existed.
const SPIKE_MIN_HOP_M = 15;
const SPIKE_RETURN_RATIO = 0.5;

function rejectSpikes(points: XY[]): XY[] {
  if (points.length < 3) {
    return points;
  }

  const result: XY[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const previous = result[result.length - 1];
    const point = points[i];
    const next = points[i + 1];

    const hopIn = distanceM(previous, point);
    const hopOut = distanceM(point, next);
    const span = distanceM(previous, next);

    const isSpike =
      hopIn > SPIKE_MIN_HOP_M &&
      hopOut > SPIKE_MIN_HOP_M &&
      span < SPIKE_RETURN_RATIO * Math.min(hopIn, hopOut);

    if (!isSpike) {
      result.push(point);
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

// Endpoint-preserving [1, 2, 1] weighted average to damp per-fix jitter.
function smoothSegment(points: XY[], passes: number): XY[] {
  let result = points;

  for (let pass = 0; pass < passes; pass++) {
    if (result.length <= 2) {
      break;
    }

    result = result.map((point, index, all) => {
      if (index === 0 || index === all.length - 1) {
        return point;
      }

      const prev = all[index - 1];
      const next = all[index + 1];

      return {
        x: (prev.x + 2 * point.x + next.x) / 4,
        y: (prev.y + 2 * point.y + next.y) / 4,
      };
    });
  }

  return result;
}

function perpendicularDistanceM(point: XY, lineStart: XY, lineEnd: XY) {
  const dx = lineEnd.x - lineStart.x;
  const dy = lineEnd.y - lineStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return distanceM(point, lineStart);
  }

  return (
    Math.abs(dy * point.x - dx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) /
    Math.sqrt(lengthSq)
  );
}

// Douglas-Peucker, iterative so deep segments cannot overflow the stack.
function simplifySegment(points: XY[], toleranceM: number): XY[] {
  if (points.length <= 2 || toleranceM <= 0) {
    return points;
  }

  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;

  const ranges: [number, number][] = [[0, points.length - 1]];

  while (ranges.length > 0) {
    const [startIndex, endIndex] = ranges.pop()!;
    let maxDistance = 0;
    let maxIndex = -1;

    for (let i = startIndex + 1; i < endIndex; i++) {
      const distance = perpendicularDistanceM(points[i], points[startIndex], points[endIndex]);
      if (distance > maxDistance) {
        maxDistance = distance;
        maxIndex = i;
      }
    }

    if (maxIndex !== -1 && maxDistance > toleranceM) {
      keep[maxIndex] = true;
      ranges.push([startIndex, maxIndex], [maxIndex, endIndex]);
    }
  }

  return points.filter((_, index) => keep[index]);
}

// Centripetal Catmull-Rom (Barry-Goldman form). Interpolates through every
// point without the overshoot a uniform spline shows on unevenly spaced GPS
// fixes.
function catmullRomPoint(
  p0: XY,
  p1: XY,
  p2: XY,
  p3: XY,
  t0: number,
  t1: number,
  t2: number,
  t3: number,
  t: number
): XY {
  const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
  const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
  const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
  const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
  const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));

  return lerp(b1, b2, (t - t1) / (t2 - t1));
}

function reflect(center: XY, point: XY): XY {
  return {
    x: 2 * center.x - point.x,
    y: 2 * center.y - point.y,
  };
}

function densifySegment(points: XY[], subdivisions: number): XY[] {
  if (points.length < 3 || subdivisions <= 1) {
    return points;
  }

  const result: XY[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    // Virtual endpoints by reflection keep the spline defined at the ends.
    const p0 = i === 0 ? reflect(p1, p2) : points[i - 1];
    const p3 = i === points.length - 2 ? reflect(p2, p1) : points[i + 2];

    const t0 = 0;
    const t1 = t0 + Math.sqrt(distanceM(p0, p1));
    const t2 = t1 + Math.sqrt(distanceM(p1, p2));
    const t3 = t2 + Math.sqrt(distanceM(p2, p3));

    if (t1 === t2) {
      continue;
    }

    for (let step = 1; step < subdivisions; step++) {
      const t = t1 + ((t2 - t1) * step) / subdivisions;
      result.push(catmullRomPoint(p0, p1, p2, p3, t0, t1, t2, t3, t));
    }

    result.push(p2);
  }

  return result;
}

export function buildDisplayPolylines(
  points: DisplayLinePoint[],
  config: Partial<DisplayLineConfig> = {}
): GeoPoint[][] {
  const mergedConfig = { ...DEFAULT_DISPLAY_LINE_CONFIG, ...config };

  const usablePoints = points.filter(
    (point) => point.accuracyM === null || point.accuracyM <= mergedConfig.maxAccuracyM
  );

  if (usablePoints.length < 2) {
    return [];
  }

  let minLat = usablePoints[0].latitude;
  let maxLat = minLat;
  for (const point of usablePoints) {
    if (point.latitude < minLat) minLat = point.latitude;
    if (point.latitude > maxLat) maxLat = point.latitude;
  }
  const lngScaleM = Math.cos(toRadians((minLat + maxLat) / 2)) * METERS_PER_DEG_LAT;

  const segments = splitIntoSegments(usablePoints, lngScaleM, mergedConfig)
    .map((segment) =>
      simplifySegment(
        smoothSegment(rejectSpikes(segment), mergedConfig.smoothingPasses),
        mergedConfig.simplifyToleranceM
      )
    )
    // Isolated slivers this short read as debris around GPS dropouts.
    .filter((segment) => segmentLengthM(segment) >= mergedConfig.microSegmentMinLengthM);

  const totalPoints = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalPoints === 0) {
    return [];
  }

  // Densify only as far as the display budget allows; very long sessions fall
  // back to the simplified line instead of flooding the map view.
  const subdivisions = Math.max(
    1,
    Math.min(
      mergedConfig.densifySubdivisions,
      Math.floor(mergedConfig.maxDisplayPoints / totalPoints)
    )
  );

  return segments.map((segment) =>
    densifySegment(segment, subdivisions).map((point) => ({
      latitude: point.y / METERS_PER_DEG_LAT,
      longitude: point.x / lngScaleM,
    }))
  );
}

export type LapRunPoint = DisplayLinePoint & { lapId: string | null };

export type QuarantinedDisplayPoint = {
  recordedAt: string;
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

// Fix A (capture-everything payoff): fixes the capture filter rejected are
// merged back into the line's input, time-ordered, inheriting the lap of the
// preceding accepted fix. The display pipeline's own guards (accuracy cutoff,
// spike rejection, smoothing) decide what actually gets drawn — a hole only
// fills where genuinely clean data exists. Timing never sees these points.
export function mergeQuarantinedPoints(
  points: LapRunPoint[],
  quarantined: QuarantinedDisplayPoint[]
): LapRunPoint[] {
  if (quarantined.length === 0) {
    return points;
  }

  const merged: LapRunPoint[] = [];
  let lastLapId: string | null = null;
  let quarantineIndex = 0;
  const sortedQuarantine = [...quarantined].sort(
    (a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)
  );

  for (const point of points) {
    const pointTime = Date.parse(point.recordedAt);

    while (
      quarantineIndex < sortedQuarantine.length &&
      Date.parse(sortedQuarantine[quarantineIndex].recordedAt) < pointTime
    ) {
      const q = sortedQuarantine[quarantineIndex];
      merged.push({
        recordedAt: q.recordedAt,
        latitude: q.latitude,
        longitude: q.longitude,
        accuracyM: q.accuracyM,
        lapId: lastLapId,
      });
      quarantineIndex++;
    }

    merged.push(point);
    lastLapId = point.lapId;
  }

  // Trailing quarantined fixes (after the last accepted point).
  for (; quarantineIndex < sortedQuarantine.length; quarantineIndex++) {
    const q = sortedQuarantine[quarantineIndex];
    merged.push({
      recordedAt: q.recordedAt,
      latitude: q.latitude,
      longitude: q.longitude,
      accuracyM: q.accuracyM,
      lapId: lastLapId,
    });
  }

  return merged;
}

export type LapRun = {
  key: string;
  lapId: string | null;
  points: LapRunPoint[];
};

// The point where the boundary segment between two neighboring fixes crosses
// the start/finish line — a lap's true visual start and end. Interpolated on
// the real segment, so it is always on the recorded path.
function crossingClipPoint(
  from: LapRunPoint,
  to: LapRunPoint,
  startFinishLine: TimingLineRow
): Omit<LapRunPoint, 'lapId'> | null {
  const fraction = segmentTimingLineFraction(from, to, startFinishLine);

  if (fraction === null) {
    return null;
  }

  const fromMs = Date.parse(from.recordedAt);
  const toMs = Date.parse(to.recordedAt);

  return {
    latitude: from.latitude + (to.latitude - from.latitude) * fraction,
    longitude: from.longitude + (to.longitude - from.longitude) * fraction,
    accuracyM:
      from.accuracyM === null && to.accuracyM === null
        ? null
        : Math.max(from.accuracyM ?? 0, to.accuracyM ?? 0),
    recordedAt: new Date(fromMs + (toMs - fromMs) * fraction).toISOString(),
  };
}

// Consecutive points sharing a lap id form a run. Each run is clipped at the
// start/finish line: the stitch point on each side is the interpolated
// crossing of the boundary segment with the line, so every lap starts and
// ends exactly at its own crossing, and consecutive laps share that point —
// meeting without gap and without ever extending past the line. Where the
// boundary segment does not cross the line (pit entry/exit, degenerate data)
// the side gets no stitch: a gap, never an overlap.
export function groupPointsIntoLapRuns(
  points: LapRunPoint[],
  startFinishLine?: TimingLineRow | null
): LapRun[] {
  const runs: { lapId: string | null; points: LapRunPoint[] }[] = [];

  for (const point of points) {
    const currentRun = runs[runs.length - 1];

    if (!currentRun || currentRun.lapId !== point.lapId) {
      runs.push({ lapId: point.lapId, points: [point] });
      continue;
    }

    currentRun.points.push(point);
  }

  const boundaryClips = runs.slice(0, -1).map((run, index) =>
    startFinishLine
      ? crossingClipPoint(
          run.points[run.points.length - 1],
          runs[index + 1].points[0],
          startFinishLine
        )
      : null
  );

  return runs.map((run, index) => {
    const startClip = index > 0 ? boundaryClips[index - 1] : null;
    const endClip = index < runs.length - 1 ? boundaryClips[index] : null;

    return {
      lapId: run.lapId,
      points: [
        ...(startClip ? [{ ...startClip, lapId: run.lapId }] : []),
        ...run.points,
        ...(endClip ? [{ ...endClip, lapId: run.lapId }] : []),
      ],
      key: `${run.lapId ?? 'unassigned'}-${index}`,
    };
  });
}
