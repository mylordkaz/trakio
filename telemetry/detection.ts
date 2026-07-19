import type { TimingLineRow } from '@/db/types';
import type {
  CrossingQuality,
  DetectionState,
  TelemetryDetectionConfig,
  TelemetryDetectionEvent,
  TelemetrySample,
} from '@/telemetry/types';
import { haversineDistanceMeters, toRadians } from '@/utils/geo';

const DEFAULT_DETECTION_CONFIG: TelemetryDetectionConfig = {
  debounceMs: 1500,
  minLapTimeMs: 15000,
  minCrossingSpeedMps: 5,
  // Recovery is opt-in (the app opts in via CROSSING_RECOVERY_ENABLED).
  recoveryEnabled: false,
  recoveryMinGapMs: 4000,
  // Measured on real Tsukuba data: hole-spanning corner-cut chords meet the
  // line at up to ~2.1 gate-lengths, while genuine off-gate traffic (pit
  // lane and other track sections crossing the extension) clusters at 2.6+.
  // 1.25 accepts [-1.25, +2.25]: covers every observed recovery with ~0.4
  // gate-lengths of buffer to the nearest real traffic band.
  recoveryMaxLineExtension: 1.25,
};

type Point = {
  x: number;
  y: number;
};

type CandidateCrossing = {
  timingLine: TimingLineRow;
  movementFraction: number;
};

// Longitude degrees shrink by cos(latitude); projecting keeps the intersection
// fraction (and therefore the interpolated crossing time) locally metric.
function projectPoint(latitude: number, longitude: number, lngScale: number): Point {
  return {
    x: longitude * lngScale,
    y: latitude,
  };
}

function cross(a: Point, b: Point) {
  return a.x * b.y - a.y * b.x;
}

function subtract(a: Point, b: Point): Point {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
  };
}

type Intersection = {
  movementFraction: number;
  lineFraction: number;
};

// Intersection of the movement chord with the timing line's infinite
// extension; the caller decides which fraction ranges are acceptable.
function getIntersection(
  movementStart: Point,
  movementEnd: Point,
  timingLineStart: Point,
  timingLineEnd: Point
): Intersection | null {
  const movement = subtract(movementEnd, movementStart);
  const timingLine = subtract(timingLineEnd, timingLineStart);
  const denominator = cross(movement, timingLine);

  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const originDelta = subtract(timingLineStart, movementStart);

  return {
    movementFraction: cross(originDelta, timingLine) / denominator,
    lineFraction: cross(originDelta, movement) / denominator,
  };
}

// Fraction along the segment from->to at which it crosses the timing line's
// plane, or null when it never reaches it. The display line clips each lap at
// the start/finish line with this, sharing the detector's crossing geometry.
export function segmentTimingLineFraction(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
  timingLine: TimingLineRow
): number | null {
  const lngScale = Math.cos(toRadians((from.latitude + to.latitude) / 2));
  const hit = getIntersection(
    projectPoint(from.latitude, from.longitude, lngScale),
    projectPoint(to.latitude, to.longitude, lngScale),
    projectPoint(timingLine.a.latitude, timingLine.a.longitude, lngScale),
    projectPoint(timingLine.b.latitude, timingLine.b.longitude, lngScale)
  );

  if (hit === null || hit.movementFraction < 0 || hit.movementFraction > 1) {
    return null;
  }

  return hit.movementFraction;
}

// A stationary car sitting on a timing line jitters back and forth across it;
// requiring plausible movement speed keeps those phantom crossings out.
function hasSufficientCrossingSpeed(
  previousSample: TelemetrySample,
  currentSample: TelemetrySample,
  config: TelemetryDetectionConfig
) {
  const speedCandidates: number[] = [];

  if (previousSample.speedMps !== null) {
    speedCandidates.push(previousSample.speedMps);
  }

  if (currentSample.speedMps !== null) {
    speedCandidates.push(currentSample.speedMps);
  }

  const elapsedSeconds = (currentSample.recordedAt - previousSample.recordedAt) / 1000;
  if (elapsedSeconds > 0) {
    const distanceMeters = haversineDistanceMeters(
      previousSample.lat,
      previousSample.lng,
      currentSample.lat,
      currentSample.lng
    );
    speedCandidates.push(distanceMeters / elapsedSeconds);
  }

  if (speedCandidates.length === 0) {
    return true;
  }

  return Math.max(...speedCandidates) >= config.minCrossingSpeedMps;
}

function isDebounced(
  state: DetectionState,
  event: TelemetryDetectionEvent,
  timingLineId: string,
  config: TelemetryDetectionConfig
) {
  if (state.lastTimingLineId !== timingLineId || state.lastCrossingElapsedMs === null) {
    return false;
  }

  return event.sampleElapsedMs - state.lastCrossingElapsedMs < config.debounceMs;
}

function isSectorOrderValid(state: DetectionState, timingLine: TimingLineRow) {
  if (timingLine.type !== 'sector') {
    return true;
  }

  if (state.expectedSectorSeq === null) {
    return false;
  }

  return timingLine.seq >= state.expectedSectorSeq;
}

function satisfiesMinLapTime(
  state: DetectionState,
  event: TelemetryDetectionEvent,
  timingLine: TimingLineRow,
  config: TelemetryDetectionConfig
) {
  if (timingLine.type !== 'start_finish' || state.currentLapStartedElapsedMs === null) {
    return true;
  }

  return event.sampleElapsedMs - state.currentLapStartedElapsedMs >= config.minLapTimeMs;
}

// A crossing timestamp is only as good as the movement segment it was
// interpolated on: a long inter-fix gap or a multipath-displaced anchor (the
// chord speed disagreeing with Doppler speed) shifts it by up to a second.
const DEGRADED_SEGMENT_DT_MS = 2500;
const DEGRADED_ANCHOR_ACCURACY_M = 20;
const DEGRADED_SPEED_MISMATCH_RATIO = 0.2;
const SPEED_MISMATCH_MIN_DOPPLER_MPS = 3;

function assessSegmentQuality(
  previousSample: TelemetrySample,
  currentSample: TelemetrySample
): CrossingQuality {
  const segmentDtMs = currentSample.recordedAt - previousSample.recordedAt;
  if (segmentDtMs > DEGRADED_SEGMENT_DT_MS) {
    return 'degraded';
  }

  if (
    (previousSample.accuracyM !== null && previousSample.accuracyM > DEGRADED_ANCHOR_ACCURACY_M) ||
    (currentSample.accuracyM !== null && currentSample.accuracyM > DEGRADED_ANCHOR_ACCURACY_M)
  ) {
    return 'degraded';
  }

  const dopplerSpeeds = [previousSample.speedMps, currentSample.speedMps].filter(
    (speed): speed is number => speed !== null && speed > 0
  );

  if (dopplerSpeeds.length > 0 && segmentDtMs > 0) {
    const meanDopplerMps = dopplerSpeeds.reduce((sum, s) => sum + s, 0) / dopplerSpeeds.length;

    if (meanDopplerMps >= SPEED_MISMATCH_MIN_DOPPLER_MPS) {
      const chordSpeedMps =
        haversineDistanceMeters(
          previousSample.lat,
          previousSample.lng,
          currentSample.lat,
          currentSample.lng
        ) /
        (segmentDtMs / 1000);

      if (Math.abs(chordSpeedMps - meanDopplerMps) / meanDopplerMps > DEGRADED_SPEED_MISMATCH_RATIO) {
        return 'degraded';
      }
    }
  }

  return 'good';
}

function toDetectionEvent(
  timingLine: TimingLineRow,
  previousSample: TelemetrySample,
  currentSample: TelemetrySample,
  movementFraction: number,
  quality: CrossingQuality
): TelemetryDetectionEvent {
  const interpolatedRecordedAt =
    previousSample.recordedAt +
    (currentSample.recordedAt - previousSample.recordedAt) * movementFraction;
  const interpolatedElapsedMs =
    previousSample.elapsedMs +
    (currentSample.elapsedMs - previousSample.elapsedMs) * movementFraction;

  return {
    type: timingLine.type === 'start_finish' ? 'start_finish_crossed' : 'sector_crossed',
    timingLineId: timingLine.id,
    seq: timingLine.seq,
    sampleRecordedAt: Math.round(interpolatedRecordedAt),
    sampleElapsedMs: Math.round(interpolatedElapsedMs),
    quality,
  };
}

// Mirrors how the session runtime advances its state after consuming an event,
// so several crossings inside one movement segment validate consistently.
function applyEventToState(
  state: DetectionState,
  event: TelemetryDetectionEvent,
  timingLine: TimingLineRow
) {
  state.lastTimingLineId = timingLine.id;
  state.lastCrossingElapsedMs = event.sampleElapsedMs;

  if (timingLine.type === 'start_finish') {
    state.currentLapStartedElapsedMs = event.sampleElapsedMs;
    state.expectedSectorSeq = 1;
    return;
  }

  state.expectedSectorSeq = event.seq + 1;
}

export function detectTimingLineCrossings(
  previousSample: TelemetrySample | null,
  currentSample: TelemetrySample,
  timingLines: TimingLineRow[],
  state: DetectionState,
  config: Partial<TelemetryDetectionConfig> = {}
): TelemetryDetectionEvent[] {
  if (!previousSample) {
    return [];
  }

  const mergedConfig = { ...DEFAULT_DETECTION_CONFIG, ...config };
  const lngScale = Math.cos(toRadians((previousSample.lat + currentSample.lat) / 2));
  const movementStart = projectPoint(previousSample.lat, previousSample.lng, lngScale);
  const movementEnd = projectPoint(currentSample.lat, currentSample.lng, lngScale);

  const candidates: CandidateCrossing[] = [];
  const segmentGapMs = currentSample.recordedAt - previousSample.recordedAt;
  const recoveryActive =
    mergedConfig.recoveryEnabled && segmentGapMs > mergedConfig.recoveryMinGapMs;

  for (const timingLine of timingLines) {
    const hit = getIntersection(
      movementStart,
      movementEnd,
      projectPoint(timingLine.a.latitude, timingLine.a.longitude, lngScale),
      projectPoint(timingLine.b.latitude, timingLine.b.longitude, lngScale)
    );

    if (hit === null || hit.movementFraction < 0 || hit.movementFraction > 1) {
      continue;
    }

    const onGate = hit.lineFraction >= 0 && hit.lineFraction <= 1;

    // Recovery: a hole-spanning chord that crosses the line just past the
    // gate's end. The car followed the track through the gate — the chord
    // merely cut the corner — so the crossing physically happened. The
    // extension margin keeps genuinely-offset paths (a pit lane running
    // beside the gate) excluded.
    const recoverable =
      recoveryActive &&
      hit.lineFraction >= -mergedConfig.recoveryMaxLineExtension &&
      hit.lineFraction <= 1 + mergedConfig.recoveryMaxLineExtension;

    if (onGate || recoverable) {
      candidates.push({ timingLine, movementFraction: hit.movementFraction });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  if (!hasSufficientCrossingSpeed(previousSample, currentSample, mergedConfig)) {
    return [];
  }

  candidates.sort((a, b) => a.movementFraction - b.movementFraction);

  const segmentQuality = assessSegmentQuality(previousSample, currentSample);
  const localState: DetectionState = { ...state };
  const events: TelemetryDetectionEvent[] = [];

  for (const candidate of candidates) {
    const event = toDetectionEvent(
      candidate.timingLine,
      previousSample,
      currentSample,
      candidate.movementFraction,
      segmentQuality
    );

    if (isDebounced(localState, event, candidate.timingLine.id, mergedConfig)) {
      continue;
    }

    if (!isSectorOrderValid(localState, candidate.timingLine)) {
      continue;
    }

    if (!satisfiesMinLapTime(localState, event, candidate.timingLine, mergedConfig)) {
      continue;
    }

    events.push(event);
    applyEventToState(localState, event, candidate.timingLine);
  }

  return events;
}
