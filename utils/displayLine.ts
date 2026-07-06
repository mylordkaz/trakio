import { haversineDistanceMeters, toRadians } from '@/utils/geo';

export type GeoPoint = { latitude: number; longitude: number };

export type DisplayLinePoint = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  recordedAt: string;
};

export type DisplayLineConfig = {
  maxAccuracyM: number;
  bridgeAccuracyM: number;
  maxGapMs: number;
  maxGapM: number;
  shortJoinGapM: number;
  maxJoinGapM: number;
  maxJoinGapMs: number;
  smoothingPasses: number;
  simplifyToleranceM: number;
  densifySubdivisions: number;
  maxDisplayPoints: number;
  microSegmentMinLengthM: number;
  dropDanglingEdgeFragments: boolean;
};

// A drawn join is a guess; a wrong line is worse than an honest gap. Joins are
// therefore anchored only on trusted points, kept short by default, and only
// stretch further when the geometry is provably straight-through.
const DEFAULT_DISPLAY_LINE_CONFIG: DisplayLineConfig = {
  maxAccuracyM: 15,
  bridgeAccuracyM: 25,
  maxGapMs: 3000,
  maxGapM: 120,
  shortJoinGapM: 80,
  maxJoinGapM: 220,
  maxJoinGapMs: 8000,
  smoothingPasses: 2,
  simplifyToleranceM: 1.2,
  densifySubdivisions: 4,
  maxDisplayPoints: 4000,
  microSegmentMinLengthM: 25,
  dropDanglingEdgeFragments: false,
};

const METERS_PER_DEG_LAT = 111320;
const DUPLICATE_DISTANCE_M = 0.01;

type XY = {
  x: number;
  y: number;
  accuracyM?: number | null;
  timeMs?: number;
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

// Two-tier accuracy selection. Clean sections keep only strict-tier points;
// where dropping degraded points would tear a hole in the line (a GPS shadow
// under a gantry or beside pit buildings recurs at the same spot every lap),
// the best of the degraded points are re-admitted to bridge the shadow. They
// carry their accuracy so smoothing can conform them harder.
function selectDisplayPoints(
  points: DisplayLinePoint[],
  config: DisplayLineConfig
): DisplayLinePoint[] {
  const selected: DisplayLinePoint[] = [];
  let lastStrictIndex = -1;

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const isStrict = point.accuracyM === null || point.accuracyM <= config.maxAccuracyM;

    if (!isStrict) {
      continue;
    }

    if (lastStrictIndex !== -1 && i > lastStrictIndex + 1) {
      const previousStrict = points[lastStrictIndex];
      const gapMs = Date.parse(point.recordedAt) - Date.parse(previousStrict.recordedAt);
      const gapM = haversineDistanceMeters(
        previousStrict.latitude,
        previousStrict.longitude,
        point.latitude,
        point.longitude
      );

      if (gapMs > config.maxGapMs || gapM > config.maxGapM) {
        for (let j = lastStrictIndex + 1; j < i; j++) {
          const candidate = points[j];
          if (candidate.accuracyM !== null && candidate.accuracyM <= config.bridgeAccuracyM) {
            selected.push(candidate);
          }
        }
      }
    }

    selected.push(point);
    lastStrictIndex = i;
  }

  return selected;
}

// Splits the usable points into continuous runs: wherever the accuracy filter
// or a GPS dropout leaves a hole, the line breaks instead of bridging the gap
// with a straight chord.
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
      accuracyM: point.accuracyM,
      timeMs,
    };

    if (previous) {
      const gapM = distanceM(previous, projected);

      if (gapM < DUPLICATE_DISTANCE_M) {
        continue;
      }

      const gapMs = timeMs - previous.timeMs;
      if (gapMs > config.maxGapMs || gapM > config.maxGapM) {
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
// looks like that (consecutive fixes keep moving forward), so such points can
// be dropped even in data recorded before the capture-time jump filter.
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

// Endpoint-preserving smoothing where each point is pulled toward its
// neighbors' midpoint in proportion to its reported accuracy: trustworthy
// fixes barely move (keeping apexes crisp) while degraded bridge points are
// strongly conformed to the path around them.
const MIN_SMOOTHING_PULL = 0.3;
const MAX_SMOOTHING_PULL = 0.85;
const UNKNOWN_ACCURACY_PULL = 0.5;
const BEST_EXPECTED_ACCURACY_M = 5;

function smoothingPull(accuracyM: number | null | undefined, config: DisplayLineConfig) {
  if (accuracyM === null || accuracyM === undefined) {
    return UNKNOWN_ACCURACY_PULL;
  }

  const span = Math.max(1, config.bridgeAccuracyM - BEST_EXPECTED_ACCURACY_M);
  const normalized = (accuracyM - BEST_EXPECTED_ACCURACY_M) / span;

  return Math.max(
    MIN_SMOOTHING_PULL,
    Math.min(
      MAX_SMOOTHING_PULL,
      MIN_SMOOTHING_PULL + (MAX_SMOOTHING_PULL - MIN_SMOOTHING_PULL) * normalized
    )
  );
}

function smoothSegment(points: XY[], passes: number, config: DisplayLineConfig): XY[] {
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
      const pull = smoothingPull(point.accuracyM, config);
      const midX = (prev.x + next.x) / 2;
      const midY = (prev.y + next.y) / 2;

      return {
        x: point.x + (midX - point.x) * pull,
        y: point.y + (midY - point.y) * pull,
        accuracyM: point.accuracyM,
        timeMs: point.timeMs,
      };
    });
  }

  return result;
}

// A hole with real data on both sides (GPS shadow under a gantry) is filled
// with a spline span anchored on the surrounding measured points: the car
// cannot teleport, and on near-straight track this is physically near-exact.
// Long or slow holes (pit stops) are never joined.
const JOIN_POINT_SPACING_M = 15;
const MAX_JOIN_POINTS = 16;
// Degraded points may not anchor a join — a displaced anchor paints the whole
// guessed span offset from the real track.
const MAX_ANCHOR_TRIM_POINTS = 5;
// Long joins are only drawn when both trusted tangents agree with the chord:
// straight-through blackouts qualify, anything ambiguous stays an honest gap.
const LONG_JOIN_ALIGNMENT_COS = Math.cos(toRadians(20));

type JoinableSegment = {
  points: XY[];
  wasJoined: boolean;
};

function isTrustedPoint(point: XY, config: DisplayLineConfig) {
  return point.accuracyM === null || point.accuracyM === undefined || point.accuracyM <= config.maxAccuracyM;
}

// Returns the segment with degraded edge points removed on the given side, so
// the join anchors on a trusted fix; null when no trusted anchor sits close
// enough to the edge.
function trimToTrustedAnchor(
  points: XY[],
  side: 'head' | 'tail',
  config: DisplayLineConfig
): XY[] | null {
  for (let offset = 0; offset < MAX_ANCHOR_TRIM_POINTS; offset++) {
    const index = side === 'tail' ? points.length - 1 - offset : offset;
    if (index < 0 || index >= points.length) {
      return null;
    }

    if (isTrustedPoint(points[index], config)) {
      const trimmed = side === 'tail' ? points.slice(0, index + 1) : points.slice(index);
      return trimmed.length >= 2 ? trimmed : null;
    }
  }

  return null;
}

// Degraded points are only safe in a segment's interior, where smoothing can
// conform them; at the edges they are exempt from smoothing and draw at full
// displacement. Segments therefore always start and end on trusted fixes, and
// a segment with no trusted core at all is dropped.
function trimDegradedEdges(points: XY[], config: DisplayLineConfig): XY[] | null {
  const tailTrimmed = trimToTrustedAnchor(points, 'tail', config);
  if (!tailTrimmed) {
    return null;
  }

  return trimToTrustedAnchor(tailTrimmed, 'head', config);
}

function unitVector(from: XY, to: XY): XY | null {
  const length = distanceM(from, to);
  if (length < DUPLICATE_DISTANCE_M) {
    return null;
  }
  return { x: (to.x - from.x) / length, y: (to.y - from.y) / length };
}

function isStraightThroughGap(before: XY[], after: XY[]): boolean {
  const tangentIn = unitVector(before[before.length - 2], before[before.length - 1]);
  const tangentOut = unitVector(after[0], after[1]);
  const chord = unitVector(before[before.length - 1], after[0]);

  if (!tangentIn || !tangentOut || !chord) {
    return false;
  }

  return (
    tangentIn.x * chord.x + tangentIn.y * chord.y >= LONG_JOIN_ALIGNMENT_COS &&
    tangentOut.x * chord.x + tangentOut.y * chord.y >= LONG_JOIN_ALIGNMENT_COS
  );
}

function buildJoinSpan(before: XY[], after: XY[]): XY[] {
  const p1 = before[before.length - 1];
  const p2 = after[0];
  const gapM = distanceM(p1, p2);

  if (gapM < 1) {
    return [];
  }

  const p0 = before.length >= 2 ? before[before.length - 2] : reflect(p1, p2);
  const p3 = after.length >= 2 ? after[1] : reflect(p2, p1);

  const t0 = 0;
  const t1 = t0 + Math.sqrt(distanceM(p0, p1));
  const t2 = t1 + Math.sqrt(gapM);
  const t3 = t2 + Math.sqrt(distanceM(p2, p3));

  if (t1 === t2 || t0 === t1 || t2 === t3) {
    return [];
  }

  const steps = Math.max(2, Math.min(MAX_JOIN_POINTS, Math.round(gapM / JOIN_POINT_SPACING_M)));
  const span: XY[] = [];

  for (let step = 1; step < steps; step++) {
    const t = t1 + ((t2 - t1) * step) / steps;
    span.push(catmullRomPoint(p0, p1, p2, p3, t0, t1, t2, t3, t));
  }

  return span;
}

function joinSegmentsAcrossGaps(segments: XY[][], config: DisplayLineConfig): JoinableSegment[] {
  const joined: JoinableSegment[] = [];

  for (const segment of segments) {
    const previous = joined[joined.length - 1];

    if (previous && previous.points.length >= 2 && segment.length >= 2) {
      const trimmedTail = trimToTrustedAnchor(previous.points, 'tail', config);
      const trimmedHead = trimToTrustedAnchor(segment, 'head', config);

      if (trimmedTail && trimmedHead) {
        const tailAnchor = trimmedTail[trimmedTail.length - 1];
        const headAnchor = trimmedHead[0];
        const gapM = distanceM(tailAnchor, headAnchor);
        const gapMs =
          tailAnchor.timeMs !== undefined && headAnchor.timeMs !== undefined
            ? headAnchor.timeMs - tailAnchor.timeMs
            : null;

        const withinTime = gapMs !== null && gapMs <= config.maxJoinGapMs;
        const shortJoin = gapM <= config.shortJoinGapM;
        const alignedLongJoin =
          gapM <= config.maxJoinGapM && isStraightThroughGap(trimmedTail, trimmedHead);

        if (withinTime && (shortJoin || alignedLongJoin)) {
          previous.points = [
            ...trimmedTail,
            ...buildJoinSpan(trimmedTail, trimmedHead),
            ...trimmedHead,
          ];
          previous.wasJoined = true;
          continue;
        }
      }
    }

    joined.push({ points: [...segment], wasJoined: false });
  }

  return joined;
}

// Borrowed lap-boundary points that failed to join anything are display
// debris: a short floating dash beside the start/finish area.
function dropDanglingEdgeFragments(segments: JoinableSegment[]): JoinableSegment[] {
  const result = [...segments];

  while (result.length > 1) {
    const first = result[0];
    if (!first.wasJoined && first.points.length <= MAX_ANCHOR_TRIM_POINTS) {
      result.shift();
      continue;
    }
    break;
  }

  while (result.length > 1) {
    const last = result[result.length - 1];
    if (!last.wasJoined && last.points.length <= MAX_ANCHOR_TRIM_POINTS) {
      result.pop();
      continue;
    }
    break;
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

export type LapRunPoint = DisplayLinePoint & { lapId: string | null };

export type LapRun = {
  key: string;
  lapId: string | null;
  points: LapRunPoint[];
};

// Consecutive points sharing a lap id form a run; each run borrows a few
// boundary points from its neighbors so the drawn line stays continuous
// through the start/finish area — including when a GPS shadow there leaves a
// hole that the spline join has to close from both sides.
const BOUNDARY_BORROW_POINTS = 3;

export function groupPointsIntoLapRuns(points: LapRunPoint[]): LapRun[] {
  const runs: { lapId: string | null; points: LapRunPoint[] }[] = [];

  for (const point of points) {
    const currentRun = runs[runs.length - 1];

    if (!currentRun || currentRun.lapId !== point.lapId) {
      runs.push({ lapId: point.lapId, points: [point] });
      continue;
    }

    currentRun.points.push(point);
  }

  return runs.map((run, index) => {
    const previousTail =
      index > 0 ? runs[index - 1].points.slice(-BOUNDARY_BORROW_POINTS) : [];
    const nextHead =
      index < runs.length - 1 ? runs[index + 1].points.slice(0, BOUNDARY_BORROW_POINTS) : [];

    return {
      lapId: run.lapId,
      points: [...previousTail, ...run.points, ...nextHead],
      key: `${run.lapId ?? 'unassigned'}-${index}`,
    };
  });
}

// Display-only pipeline for drawing a recorded trace on the map. Raw stored
// telemetry is never modified: accuracy-filter -> split at gaps -> smooth ->
// simplify -> densify, returning one coordinate array per continuous run.
export function buildDisplayPolylines(
  points: DisplayLinePoint[],
  config: Partial<DisplayLineConfig> = {}
): GeoPoint[][] {
  const mergedConfig = { ...DEFAULT_DISPLAY_LINE_CONFIG, ...config };

  const usablePoints = selectDisplayPoints(points, mergedConfig);

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
    .map((segment) => trimDegradedEdges(segment, mergedConfig))
    .filter((segment): segment is XY[] => segment !== null);

  const simplified = segments
    .map((segment) =>
      simplifySegment(
        smoothSegment(rejectSpikes(segment), mergedConfig.smoothingPasses, mergedConfig),
        mergedConfig.simplifyToleranceM
      )
    )
    // Isolated slivers shorter than this read as debris around GPS shadows.
    .filter((segment) => segmentLengthM(segment) >= mergedConfig.microSegmentMinLengthM);

  let joined = joinSegmentsAcrossGaps(simplified, mergedConfig);
  if (mergedConfig.dropDanglingEdgeFragments) {
    joined = dropDanglingEdgeFragments(joined);
  }

  const totalPoints = joined.reduce((sum, segment) => sum + segment.points.length, 0);
  if (totalPoints === 0) {
    return [];
  }

  // Densify only as far as the display budget allows; very long sessions
  // fall back to the simplified line instead of flooding the map view.
  const subdivisions = Math.max(
    1,
    Math.min(
      mergedConfig.densifySubdivisions,
      Math.floor(mergedConfig.maxDisplayPoints / totalPoints)
    )
  );

  return joined.map((segment) =>
    densifySegment(segment.points, subdivisions).map((point) => ({
      latitude: point.y / METERS_PER_DEG_LAT,
      longitude: point.x / lngScaleM,
    }))
  );
}
