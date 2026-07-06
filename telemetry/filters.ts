import type {
  TelemetrySample,
  TelemetrySampleValidationResult,
} from '@/telemetry/types';
import { haversineDistanceMeters } from '@/utils/geo';

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

// How far a fix may land from where the reported speed says the car can be
// before the fix is treated as a multipath teleport. Deliberately generous:
// rejecting a real point hurts more than keeping a mildly noisy one.
const JUMP_ACCURACY_SLACK_FACTOR = 2;
const JUMP_BASE_SLACK_M = 5;

type Movement = {
  distanceMeters: number;
  elapsedSeconds: number;
  speedMps: number;
};

function isHeadingValid(value: number | null, maxHeadingDeg: number) {
  return value !== null && value >= 0 && value <= maxHeadingDeg;
}

function computeMovement(
  previousSample: TelemetrySample,
  sample: TelemetrySample
): Movement | null {
  const elapsedSeconds = (sample.recordedAt - previousSample.recordedAt) / 1000;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return null;
  }

  const distanceMeters = haversineDistanceMeters(
    previousSample.lat,
    previousSample.lng,
    sample.lat,
    sample.lng
  );

  return {
    distanceMeters,
    elapsedSeconds,
    speedMps: distanceMeters / elapsedSeconds,
  };
}

function isImpossibleJump(
  previousSample: TelemetrySample,
  sample: TelemetrySample,
  movement: Movement,
  config: TelemetryFilterConfig
) {
  if (movement.speedMps > config.maxSpeedMps) {
    return true;
  }

  const hasReportedSpeed = previousSample.speedMps !== null || sample.speedMps !== null;
  if (!hasReportedSpeed) {
    return false;
  }

  const referenceSpeedMps = Math.max(previousSample.speedMps ?? 0, sample.speedMps ?? 0);
  const slackM =
    JUMP_ACCURACY_SLACK_FACTOR *
      ((previousSample.accuracyM ?? config.maxAccuracyM) +
        (sample.accuracyM ?? config.maxAccuracyM)) +
    JUMP_BASE_SLACK_M;

  return movement.distanceMeters > referenceSpeedMps * movement.elapsedSeconds + slackM;
}

export function filterTelemetrySample(
  previousSample: TelemetrySample | null,
  sample: TelemetrySample,
  config: Partial<TelemetryFilterConfig> = {}
): TelemetrySampleValidationResult {
  const mergedConfig = { ...DEFAULT_FILTER_CONFIG, ...config };

  if (previousSample && sample.recordedAt <= previousSample.recordedAt) {
    return {
      accepted: false,
      reason: 'out_of_order',
    };
  }

  if (sample.accuracyM !== null && sample.accuracyM > mergedConfig.maxAccuracyM) {
    return {
      accepted: false,
      reason: 'poor_accuracy',
    };
  }

  if (sample.speedMps !== null && sample.speedMps > mergedConfig.maxSpeedMps) {
    return {
      accepted: false,
      reason: 'impossible_jump',
    };
  }

  const movement = previousSample ? computeMovement(previousSample, sample) : null;

  if (previousSample && movement && isImpossibleJump(previousSample, sample, movement, mergedConfig)) {
    return {
      accepted: false,
      reason: 'impossible_jump',
    };
  }

  const sanitizedHeading = isHeadingValid(sample.headingDeg, mergedConfig.maxHeadingDeg)
    ? sample.headingDeg
    : null;

  return {
    accepted: true,
    sample: {
      ...sample,
      speedMps: sample.speedMps ?? movement?.speedMps ?? null,
      headingDeg: sanitizedHeading,
    },
  };
}
