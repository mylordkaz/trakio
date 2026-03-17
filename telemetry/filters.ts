import type {
  TelemetrySample,
  TelemetrySampleValidationResult,
} from '@/telemetry/types';

export type TelemetryFilterConfig = {
  maxAccuracyM: number;
  maxSpeedMps: number;
  maxHeadingDeg: number;
};

const DEFAULT_FILTER_CONFIG: TelemetryFilterConfig = {
  maxAccuracyM: 40,
  maxSpeedMps: 120,
  maxHeadingDeg: 359.999,
};

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function calculateDistanceMeters(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
) {
  const earthRadiusM = 6371000;
  const deltaLat = toRadians(endLat - startLat);
  const deltaLng = toRadians(endLng - startLng);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(startLat)) *
      Math.cos(toRadians(endLat)) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusM * c;
}

function isHeadingValid(value: number | null, maxHeadingDeg: number) {
  return value !== null && value >= 0 && value <= maxHeadingDeg;
}

function deriveSpeedMps(previousSample: TelemetrySample | null, sample: TelemetrySample) {
  if (!previousSample) {
    return sample.speedMps;
  }

  const elapsedSeconds = (sample.elapsedMs - previousSample.elapsedMs) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return sample.speedMps;
  }

  const distanceMeters = calculateDistanceMeters(
    previousSample.lat,
    previousSample.lng,
    sample.lat,
    sample.lng
  );

  return distanceMeters / elapsedSeconds;
}

export function filterTelemetrySample(
  previousSample: TelemetrySample | null,
  sample: TelemetrySample,
  config: Partial<TelemetryFilterConfig> = {}
): TelemetrySampleValidationResult {
  const mergedConfig = { ...DEFAULT_FILTER_CONFIG, ...config };

  if (sample.accuracyM !== null && sample.accuracyM > mergedConfig.maxAccuracyM) {
    return {
      accepted: false,
      reason: 'poor_accuracy',
    };
  }

  const sanitizedHeading = isHeadingValid(sample.headingDeg, mergedConfig.maxHeadingDeg)
    ? sample.headingDeg
    : null;

  const speedMps = sample.speedMps ?? deriveSpeedMps(previousSample, sample);

  if (speedMps !== null && speedMps > mergedConfig.maxSpeedMps) {
    return {
      accepted: false,
      reason: 'impossible_jump',
    };
  }

  return {
    accepted: true,
    sample: {
      ...sample,
      speedMps,
      headingDeg: sanitizedHeading,
    },
  };
}

