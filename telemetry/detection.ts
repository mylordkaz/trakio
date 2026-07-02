import type { TimingLineRow } from '@/db/types';
import type {
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

function getMovementFraction(
  movementStart: Point,
  movementEnd: Point,
  timingLineStart: Point,
  timingLineEnd: Point
): number | null {
  const movement = subtract(movementEnd, movementStart);
  const timingLine = subtract(timingLineEnd, timingLineStart);
  const denominator = cross(movement, timingLine);

  if (Math.abs(denominator) < 1e-12) {
    return null;
  }

  const originDelta = subtract(timingLineStart, movementStart);
  const movementFraction = cross(originDelta, timingLine) / denominator;
  const timingLineFraction = cross(originDelta, movement) / denominator;

  if (
    movementFraction < 0 ||
    movementFraction > 1 ||
    timingLineFraction < 0 ||
    timingLineFraction > 1
  ) {
    return null;
  }

  return movementFraction;
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

function toDetectionEvent(
  timingLine: TimingLineRow,
  previousSample: TelemetrySample,
  currentSample: TelemetrySample,
  movementFraction: number
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

  for (const timingLine of timingLines) {
    const movementFraction = getMovementFraction(
      movementStart,
      movementEnd,
      projectPoint(timingLine.a.latitude, timingLine.a.longitude, lngScale),
      projectPoint(timingLine.b.latitude, timingLine.b.longitude, lngScale)
    );

    if (movementFraction !== null) {
      candidates.push({ timingLine, movementFraction });
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  if (!hasSufficientCrossingSpeed(previousSample, currentSample, mergedConfig)) {
    return [];
  }

  candidates.sort((a, b) => a.movementFraction - b.movementFraction);

  const localState: DetectionState = { ...state };
  const events: TelemetryDetectionEvent[] = [];

  for (const candidate of candidates) {
    const event = toDetectionEvent(
      candidate.timingLine,
      previousSample,
      currentSample,
      candidate.movementFraction
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
