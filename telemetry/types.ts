export type TelemetrySampleSource = 'gps';

export type TelemetrySample = {
  recordedAt: number;
  elapsedMs: number;
  lat: number;
  lng: number;
  speedMps: number | null;
  accuracyM: number | null;
  headingDeg: number | null;
  altitudeM: number | null;
  source: TelemetrySampleSource;
};

export type LocationPermissionState = 'undetermined' | 'granted' | 'denied';

export type TelemetrySampleRejectionReason =
  | 'invalid_coordinate'
  | 'poor_accuracy'
  | 'impossible_jump';

export type AcceptedTelemetrySample = {
  accepted: true;
  sample: TelemetrySample;
};

export type RejectedTelemetrySample = {
  accepted: false;
  reason: TelemetrySampleRejectionReason;
};

export type TelemetrySampleValidationResult =
  | AcceptedTelemetrySample
  | RejectedTelemetrySample;

export type TelemetryElapsedMsResolver = (recordedAt: number) => number;

export type DetectionEventType = 'start_finish_crossed' | 'sector_crossed';

export type DetectionState = {
  lastTimingLineId: string | null;
  lastCrossingElapsedMs: number | null;
  expectedSectorSeq: number | null;
  currentLapStartedElapsedMs: number | null;
};

export type TelemetryDetectionConfig = {
  debounceMs: number;
  minLapTimeMs: number;
};

export type TelemetryDetectionEvent = {
  type: DetectionEventType;
  timingLineId: string;
  seq: number;
  sampleRecordedAt: number;
  sampleElapsedMs: number;
};

