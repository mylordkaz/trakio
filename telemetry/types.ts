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

