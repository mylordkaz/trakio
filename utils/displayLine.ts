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

type TimedXY = XY & { timeMs: number };

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
// Singleton components are kept here — hole bridging may reconnect them; the
// micro-segment filter removes whatever stays isolated.
function splitIntoSegments(
  points: DisplayLinePoint[],
  lngScaleM: number,
  config: DisplayLineConfig
): TimedXY[][] {
  const segments: TimedXY[][] = [];
  let current: TimedXY[] = [];
  let previous: TimedXY | null = null;

  for (const point of points) {
    const projected: TimedXY = {
      x: point.longitude * lngScaleM,
      y: point.latitude * METERS_PER_DEG_LAT,
      timeMs: Date.parse(point.recordedAt),
    };

    if (previous) {
      const gapM = distanceM(previous, projected);

      if (gapM < DUPLICATE_DISTANCE_M) {
        continue;
      }

      if (projected.timeMs - previous.timeMs > config.maxGapMs || gapM > config.maxGapM) {
        if (current.length >= 1) {
          segments.push(current);
        }
        current = [];
      }
    }

    current.push(projected);
    previous = projected;
  }

  if (current.length >= 1) {
    segments.push(current);
  }

  return segments;
}

// Quarantined fixes participate in rendering ONLY here: the trusted stream's
// segmentation above is immutable, and a hole in it is closed exactly when a
// complete chain of quarantined fixes connects the hole's edges with every
// hop inside the same time/distance guards. A quarantined point can turn a
// gap into a bridge and can do nothing else — it cannot displace, detach, or
// split anything the trusted stream renders on its own.
function bridgeHoles(
  segments: TimedXY[][],
  fillers: TimedXY[],
  config: DisplayLineConfig
): TimedXY[][] {
  if (segments.length < 2 || fillers.length === 0) {
    return segments;
  }

  const sorted = [...fillers].sort((a, b) => a.timeMs - b.timeMs);
  const result: TimedXY[][] = [segments[0].slice()];

  for (let i = 1; i < segments.length; i++) {
    const previous = result[result.length - 1];
    const next = segments[i];
    const holeStart = previous[previous.length - 1];
    const holeEnd = next[0];
    const candidates = sorted.filter(
      (f) => f.timeMs > holeStart.timeMs && f.timeMs < holeEnd.timeMs
    );

    const chain = [holeStart, ...candidates, holeEnd];
    let connects = candidates.length > 0;
    for (let k = 1; k < chain.length && connects; k++) {
      if (
        chain[k].timeMs - chain[k - 1].timeMs > config.maxGapMs ||
        distanceM(chain[k - 1], chain[k]) > config.maxGapM
      ) {
        connects = false;
      }
    }

    if (connects) {
      previous.push(...candidates, ...next);
    } else {
      result.push(next.slice());
    }
  }

  return result;
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
  config: Partial<DisplayLineConfig> = {},
  holeFillers: DisplayLinePoint[] = []
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

  const usableFillers: TimedXY[] = holeFillers
    .filter((point) => point.accuracyM === null || point.accuracyM <= mergedConfig.maxAccuracyM)
    .map((point) => ({
      x: point.longitude * lngScaleM,
      y: point.latitude * METERS_PER_DEG_LAT,
      timeMs: Date.parse(point.recordedAt),
    }));

  const segments = bridgeHoles(
    splitIntoSegments(usablePoints, lngScaleM, mergedConfig),
    usableFillers,
    mergedConfig
  )
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

export type LapRun = {
  key: string;
  lapId: string | null;
  points: LapRunPoint[];
  // Quarantined fixes bucketed to this run — consulted by the renderer only
  // to bridge holes in the trusted points above.
  fillers: QuarantinedDisplayPoint[];
};

// The recorded path's position at a given moment: interpolated between the
// two time-adjacent points around it. Returns null outside the timeline.
function pathPointAtTime(
  timeline: { latitude: number; longitude: number; timeMs: number }[],
  tMs: number
): { latitude: number; longitude: number } | null {
  for (let i = 0; i < timeline.length - 1; i++) {
    const a = timeline[i];
    const b = timeline[i + 1];
    if (tMs < a.timeMs || tMs > b.timeMs) {
      continue;
    }
    const dt = b.timeMs - a.timeMs;
    const fraction = dt <= 0 ? 0 : (tMs - a.timeMs) / dt;
    return {
      latitude: a.latitude + (b.latitude - a.latitude) * fraction,
      longitude: a.longitude + (b.longitude - a.longitude) * fraction,
    };
  }
  return null;
}

// Consecutive accepted points sharing a lap id form a run, and each run is
// clipped at its lap boundaries' STORED crossing: laps.startedLatitude/
// startedLongitude is the interpolated crossing position frozen at capture
// on the exact segment detection timed. Display consumes timing's record —
// it never re-derives crossing geometry — so the line changes laps exactly
// where the lap time says it did, including boundaries timed on a
// re-anchored chain or a recovered hole-spanning chord. Laps recorded
// before the position existed (pre-v16) fall back to interpolating the
// ACCEPTED path at laps.startedAt; their boundaries were timed on accepted
// segments, so the fallback walks the same geometry. Consecutive laps share
// the clip point (no gap, no overshoot, overlap impossible); a boundary
// without a lap start (pit entry/exit, unfinished data) gets no clip: a
// gap, never an overlap.
//
// Clip points are structural, not measured fixes — accuracyM is null so the
// display accuracy filter can never delete them (an accepted 20 m boundary
// fix must not strip both laps' shared endpoint).
//
// Quarantined fixes (capture-everything payoff) are bucketed to runs by the
// stored crossing times and returned as each run's hole FILLERS: the
// renderer consults them exclusively to bridge holes in the trusted stream
// (see bridgeHoles) — they participate in neither clip geometry nor the
// trusted segmentation. Timing never sees any of this.
export function groupPointsIntoLapRuns(
  points: LapRunPoint[],
  lapStarts: {
    id: string;
    startedAt: string;
    startedLatitude?: number | null;
    startedLongitude?: number | null;
  }[] = [],
  quarantined: QuarantinedDisplayPoint[] = []
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

  if (runs.length === 0) {
    return [];
  }

  const lapStartById = new Map(lapStarts.map((lap) => [lap.id, lap]));

  // Legacy fallback timeline: accepted points only.
  const timeline = points
    .map((p) => ({ latitude: p.latitude, longitude: p.longitude, timeMs: Date.parse(p.recordedAt) }))
    .sort((a, b) => a.timeMs - b.timeMs);

  // Boundary i sits between runs[i] and runs[i+1]; its crossing time is the
  // following lap's stored start.
  const boundaryTimesMs = runs.slice(0, -1).map((run, index) => {
    const nextLapId = runs[index + 1].lapId;
    const startedAt = nextLapId ? lapStartById.get(nextLapId)?.startedAt : undefined;
    if (startedAt !== undefined) {
      return Date.parse(startedAt);
    }
    const fromMs = Date.parse(run.points[run.points.length - 1].recordedAt);
    const toMs = Date.parse(runs[index + 1].points[0].recordedAt);
    return (fromMs + toMs) / 2;
  });

  const boundaryClips = runs.slice(0, -1).map((run, index) => {
    const nextLapId = runs[index + 1].lapId;
    const lapStart = nextLapId ? lapStartById.get(nextLapId) : undefined;
    if (!lapStart) {
      return null;
    }

    const tMs = boundaryTimesMs[index];
    // The stored pair is atomic: use it only when both halves are finite.
    const stored =
      Number.isFinite(lapStart.startedLatitude ?? NaN) &&
      Number.isFinite(lapStart.startedLongitude ?? NaN)
        ? { latitude: lapStart.startedLatitude!, longitude: lapStart.startedLongitude! }
        : pathPointAtTime(timeline, tMs);
    if (stored === null) {
      return null;
    }

    return {
      latitude: stored.latitude,
      longitude: stored.longitude,
      accuracyM: null,
      recordedAt: new Date(tMs).toISOString(),
    };
  });

  const bucketed: QuarantinedDisplayPoint[][] = runs.map(() => []);
  for (const q of quarantined) {
    const t = Date.parse(q.recordedAt);
    let index = 0;
    while (index < boundaryTimesMs.length && t >= boundaryTimesMs[index]) {
      index++;
    }
    bucketed[index].push(q);
  }

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
      fillers: bucketed[index],
      key: `${run.lapId ?? 'unassigned'}-${index}`,
    };
  });
}
