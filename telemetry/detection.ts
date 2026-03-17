import type { TimingLineRow } from '@/db/types';
import type {
  DetectionState,
  TelemetryDetectionConfig,
  TelemetryDetectionEvent,
  TelemetrySample,
} from '@/telemetry/types';

const DEFAULT_DETECTION_CONFIG: TelemetryDetectionConfig = {
  debounceMs: 1500,
  minLapTimeMs: 15000,
};

type Point = {
  x: number;
  y: number;
};

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

  if (Math.abs(value) < 1e-10) {
    return 0;
  }

  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }

  if (o1 === 0 && onSegment(a1, b1, a2)) {
    return true;
  }

  if (o2 === 0 && onSegment(a1, b2, a2)) {
    return true;
  }

  if (o3 === 0 && onSegment(b1, a1, b2)) {
    return true;
  }

  if (o4 === 0 && onSegment(b1, a2, b2)) {
    return true;
  }

  return false;
}

function sampleToPoint(sample: TelemetrySample): Point {
  return {
    x: sample.lng,
    y: sample.lat,
  };
}

function timingLineStartPoint(timingLine: TimingLineRow): Point {
  return {
    x: timingLine.a.longitude,
    y: timingLine.a.latitude,
  };
}

function timingLineEndPoint(timingLine: TimingLineRow): Point {
  return {
    x: timingLine.b.longitude,
    y: timingLine.b.latitude,
  };
}

function isDebounced(
  state: DetectionState,
  sample: TelemetrySample,
  timingLineId: string,
  config: TelemetryDetectionConfig
) {
  if (state.lastTimingLineId !== timingLineId || state.lastCrossingElapsedMs === null) {
    return false;
  }

  return sample.elapsedMs - state.lastCrossingElapsedMs < config.debounceMs;
}

function isSectorOrderValid(state: DetectionState, timingLine: TimingLineRow) {
  if (timingLine.type !== 'sector') {
    return true;
  }

  if (state.expectedSectorSeq === null) {
    return timingLine.seq === 1;
  }

  return timingLine.seq === state.expectedSectorSeq;
}

function satisfiesMinLapTime(
  state: DetectionState,
  sample: TelemetrySample,
  timingLine: TimingLineRow,
  config: TelemetryDetectionConfig
) {
  if (timingLine.type !== 'start_finish' || state.currentLapStartedElapsedMs === null) {
    return true;
  }

  return sample.elapsedMs - state.currentLapStartedElapsedMs >= config.minLapTimeMs;
}

function toDetectionEvent(
  timingLine: TimingLineRow,
  sample: TelemetrySample
): TelemetryDetectionEvent {
  return {
    type: timingLine.type === 'start_finish' ? 'start_finish_crossed' : 'sector_crossed',
    timingLineId: timingLine.id,
    seq: timingLine.seq,
    sampleRecordedAt: sample.recordedAt,
    sampleElapsedMs: sample.elapsedMs,
  };
}

export function detectTimingLineCrossing(
  previousSample: TelemetrySample | null,
  currentSample: TelemetrySample,
  timingLines: TimingLineRow[],
  state: DetectionState,
  config: Partial<TelemetryDetectionConfig> = {}
): TelemetryDetectionEvent | null {
  if (!previousSample) {
    return null;
  }

  const mergedConfig = { ...DEFAULT_DETECTION_CONFIG, ...config };
  const movementStart = sampleToPoint(previousSample);
  const movementEnd = sampleToPoint(currentSample);

  const sortedTimingLines = [...timingLines].sort((a, b) => a.seq - b.seq);

  for (const timingLine of sortedTimingLines) {
    if (!segmentsIntersect(
      movementStart,
      movementEnd,
      timingLineStartPoint(timingLine),
      timingLineEndPoint(timingLine)
    )) {
      continue;
    }

    if (isDebounced(state, currentSample, timingLine.id, mergedConfig)) {
      continue;
    }

    if (!isSectorOrderValid(state, timingLine)) {
      continue;
    }

    if (!satisfiesMinLapTime(state, currentSample, timingLine, mergedConfig)) {
      continue;
    }

    return toDetectionEvent(timingLine, currentSample);
  }

  return null;
}

