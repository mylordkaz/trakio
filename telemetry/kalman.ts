import type { ExtendedTelemetrySample, TelemetrySample } from '@/telemetry/types';
import { toRadians } from '@/utils/geo';

// Per-axis constant-velocity Kalman filter over GPS position and Doppler
// velocity (docs/kalman/phase-0-offline-bench.md §4). The east and north axes
// decouple exactly (isotropic model, circular GPS accuracy), so the filter is
// two identical scalar-arithmetic trackers — no matrices anywhere.
//
// Phase 0: pure module, only the offline bench imports it.
// Phase 1 (if the bench passes): detection consumes step()'s output; raw
// stored telemetry is never touched.

export type EstimatedPosition = {
  lat: number;
  lng: number;
};

export type PositionEstimator = {
  step: (sample: TelemetrySample) => EstimatedPosition;
  reset: () => void;
};

export type KalmanConfig = {
  // Acceleration the constant-velocity model absorbs as process noise (σa).
  accelNoiseMps2: number;
  // Scale on reported GPS accuracy when forming position measurement noise.
  accuracyTrustScale: number;
  // Doppler speed 1σ when the source reports no per-sample speed accuracy.
  fallbackSpeedNoiseMps: number;
  // Joint innovation gate, in sigmas; implausible fixes are skipped.
  innovationGateSigma: number;
  // A silence longer than this re-initializes at the next fix.
  resetGapS: number;
  // Below this speed the Doppler course is too noisy to use as velocity.
  minSpeedForVelocityUpdateMps: number;
  // Below this speed a zero-velocity pseudo-measurement pins the parked car
  // (0 disables).
  zeroVelocityBelowMps: number;
};

export const DEFAULT_KALMAN_CONFIG: KalmanConfig = {
  accelNoiseMps2: 3,
  accuracyTrustScale: 1,
  fallbackSpeedNoiseMps: 0.7,
  innovationGateSigma: 5,
  resetGapS: 10,
  minSpeedForVelocityUpdateMps: 1.5,
  zeroVelocityBelowMps: 0.5,
};

export type AlphaBetaConfig = {
  // Fixed position-innovation gains: p += alpha*y, v += (beta/dt)*y.
  alpha: number;
  beta: number;
  // Fixed blend toward the Doppler velocity measurement (0 disables).
  velocityGain: number;
  resetGapS: number;
  minSpeedForVelocityUpdateMps: number;
};

export const DEFAULT_ALPHA_BETA_CONFIG: AlphaBetaConfig = {
  alpha: 0.5,
  beta: 0.5 * 0.5 / (2 - 0.5),
  velocityGain: 0.3,
  resetGapS: 10,
  minSpeedForVelocityUpdateMps: 1.5,
};

const METERS_PER_DEG_LAT = 111320;
const MIN_ACCURACY_M = 3;
const MIN_VARIANCE = 1e-4;

type AxisState = {
  p: number;
  v: number;
  Ppp: number;
  Ppv: number;
  Pvv: number;
};

// Doppler course is degrees clockwise from north: x is the east component.
function velocityFromDoppler(speedMps: number, headingDeg: number) {
  const headingRad = toRadians(headingDeg);
  return {
    vx: speedMps * Math.sin(headingRad),
    vy: speedMps * Math.cos(headingRad),
  };
}

function predictAxis(axis: AxisState, dt: number, accelNoiseMps2: number) {
  const q = accelNoiseMps2 * accelNoiseMps2;

  axis.p += axis.v * dt;
  axis.Ppp += 2 * axis.Ppv * dt + axis.Pvv * dt * dt + (q * dt * dt * dt * dt) / 4;
  axis.Ppv += axis.Pvv * dt + (q * dt * dt * dt) / 2;
  axis.Pvv += q * dt * dt;
}

function updateAxisPosition(axis: AxisState, z: number, R: number) {
  const y = z - axis.p;
  const S = axis.Ppp + R;
  const Kp = axis.Ppp / S;
  const Kv = axis.Ppv / S;
  const PpvOld = axis.Ppv;

  axis.p += Kp * y;
  axis.v += Kv * y;
  axis.Ppp = Math.max((1 - Kp) * axis.Ppp, MIN_VARIANCE);
  axis.Ppv = (1 - Kp) * axis.Ppv;
  axis.Pvv = Math.max(axis.Pvv - Kv * PpvOld, MIN_VARIANCE);
}

function updateAxisVelocity(axis: AxisState, z: number, R: number) {
  const y = z - axis.v;
  const S = axis.Pvv + R;
  const Kp = axis.Ppv / S;
  const Kv = axis.Pvv / S;
  const PpvOld = axis.Ppv;

  axis.p += Kp * y;
  axis.v += Kv * y;
  axis.Ppp = Math.max(axis.Ppp - Kp * PpvOld, MIN_VARIANCE);
  axis.Ppv = (1 - Kv) * axis.Ppv;
  axis.Pvv = Math.max((1 - Kv) * axis.Pvv, MIN_VARIANCE);
}

export function createKalmanEstimator(config: Partial<KalmanConfig> = {}): PositionEstimator {
  const cfg = { ...DEFAULT_KALMAN_CONFIG, ...config };

  let anchorLat = 0;
  let anchorLng = 0;
  let lngScaleM = 0;
  let lastUpdateAtMs: number | null = null;
  let east: AxisState | null = null;
  let north: AxisState | null = null;

  function project(sample: TelemetrySample) {
    return {
      x: (sample.lng - anchorLng) * lngScaleM,
      y: (sample.lat - anchorLat) * METERS_PER_DEG_LAT,
    };
  }

  function unproject(x: number, y: number): EstimatedPosition {
    return {
      lat: anchorLat + y / METERS_PER_DEG_LAT,
      lng: anchorLng + x / lngScaleM,
    };
  }

  function initialize(sample: TelemetrySample): void {
    if (lastUpdateAtMs === null) {
      anchorLat = sample.lat;
      anchorLng = sample.lng;
      lngScaleM = Math.cos(toRadians(sample.lat)) * METERS_PER_DEG_LAT;
    }

    const { x, y } = project(sample);
    const accuracy = Math.max(sample.accuracyM ?? MIN_ACCURACY_M, MIN_ACCURACY_M);
    const hasVelocity = sample.speedMps !== null && sample.headingDeg !== null;
    const velocity = hasVelocity
      ? velocityFromDoppler(sample.speedMps!, sample.headingDeg!)
      : { vx: 0, vy: 0 };
    const velocitySigma = hasVelocity ? 5 : 20;

    east = { p: x, v: velocity.vx, Ppp: (2 * accuracy) ** 2, Ppv: 0, Pvv: velocitySigma ** 2 };
    north = { p: y, v: velocity.vy, Ppp: (2 * accuracy) ** 2, Ppv: 0, Pvv: velocitySigma ** 2 };
    lastUpdateAtMs = sample.recordedAt;
  }

  function step(sample: TelemetrySample): EstimatedPosition {
    const dtS = lastUpdateAtMs === null ? null : (sample.recordedAt - lastUpdateAtMs) / 1000;

    if (east === null || north === null || dtS === null || dtS <= 0 || dtS > cfg.resetGapS) {
      initialize(sample);
      return { lat: sample.lat, lng: sample.lng };
    }

    predictAxis(east, dtS, cfg.accelNoiseMps2);
    predictAxis(north, dtS, cfg.accelNoiseMps2);

    const { x: zx, y: zy } = project(sample);
    const accuracy = Math.max(sample.accuracyM ?? MIN_ACCURACY_M, MIN_ACCURACY_M);
    const Rp = (cfg.accuracyTrustScale * accuracy) ** 2;

    // Joint gate over both axes: a displaced fix moves the whole position, so
    // the axes are accepted or skipped together. The summed normalized
    // innovation is compared against G² — far out on a chi-square with 2
    // degrees of freedom, so clean data practically never gates.
    const yx = zx - east.p;
    const yy = zy - north.p;
    const normalizedInnovation = (yx * yx) / (east.Ppp + Rp) + (yy * yy) / (north.Ppp + Rp);

    if (normalizedInnovation <= cfg.innovationGateSigma ** 2) {
      updateAxisPosition(east, zx, Rp);
      updateAxisPosition(north, zy, Rp);
    }

    const speed = sample.speedMps;
    if (speed !== null && sample.headingDeg !== null && speed >= cfg.minSpeedForVelocityUpdateMps) {
      const reportedSpeedSigma = (sample as ExtendedTelemetrySample).speedAccuracyMps;
      const Rv = (reportedSpeedSigma && reportedSpeedSigma > 0
        ? reportedSpeedSigma
        : cfg.fallbackSpeedNoiseMps) ** 2;
      const { vx, vy } = velocityFromDoppler(speed, sample.headingDeg);
      updateAxisVelocity(east, vx, Rv);
      updateAxisVelocity(north, vy, Rv);
    } else if (
      cfg.zeroVelocityBelowMps > 0 &&
      speed !== null &&
      speed < cfg.zeroVelocityBelowMps
    ) {
      const Rv = cfg.fallbackSpeedNoiseMps ** 2;
      updateAxisVelocity(east, 0, Rv);
      updateAxisVelocity(north, 0, Rv);
    }

    lastUpdateAtMs = sample.recordedAt;
    return unproject(east.p, north.p);
  }

  function reset() {
    east = null;
    north = null;
    lastUpdateAtMs = null;
  }

  return { step, reset };
}

// Fixed-gain tracker (an alpha-beta filter — equivalently a constant-gain
// steady-state Kalman / complementary filter). Exists as the bench control
// arm answering "is adaptive gain worth its extra code".
export function createAlphaBetaEstimator(config: Partial<AlphaBetaConfig> = {}): PositionEstimator {
  const cfg = { ...DEFAULT_ALPHA_BETA_CONFIG, ...config };

  let anchorLat = 0;
  let anchorLng = 0;
  let lngScaleM = 0;
  let lastUpdateAtMs: number | null = null;
  let px = 0;
  let py = 0;
  let vx = 0;
  let vy = 0;
  let initialized = false;

  function step(sample: TelemetrySample): EstimatedPosition {
    const dtS = lastUpdateAtMs === null ? null : (sample.recordedAt - lastUpdateAtMs) / 1000;

    if (!initialized || dtS === null || dtS <= 0 || dtS > cfg.resetGapS) {
      if (!initialized) {
        anchorLat = sample.lat;
        anchorLng = sample.lng;
        lngScaleM = Math.cos(toRadians(sample.lat)) * METERS_PER_DEG_LAT;
        initialized = true;
      }

      px = (sample.lng - anchorLng) * lngScaleM;
      py = (sample.lat - anchorLat) * METERS_PER_DEG_LAT;
      const hasVelocity = sample.speedMps !== null && sample.headingDeg !== null;
      const velocity = hasVelocity
        ? velocityFromDoppler(sample.speedMps!, sample.headingDeg!)
        : { vx: 0, vy: 0 };
      vx = velocity.vx;
      vy = velocity.vy;
      lastUpdateAtMs = sample.recordedAt;
      return { lat: sample.lat, lng: sample.lng };
    }

    px += vx * dtS;
    py += vy * dtS;

    const zx = (sample.lng - anchorLng) * lngScaleM;
    const zy = (sample.lat - anchorLat) * METERS_PER_DEG_LAT;
    const yx = zx - px;
    const yy = zy - py;

    px += cfg.alpha * yx;
    py += cfg.alpha * yy;
    vx += (cfg.beta / dtS) * yx;
    vy += (cfg.beta / dtS) * yy;

    if (
      cfg.velocityGain > 0 &&
      sample.speedMps !== null &&
      sample.headingDeg !== null &&
      sample.speedMps >= cfg.minSpeedForVelocityUpdateMps
    ) {
      const doppler = velocityFromDoppler(sample.speedMps, sample.headingDeg);
      vx += cfg.velocityGain * (doppler.vx - vx);
      vy += cfg.velocityGain * (doppler.vy - vy);
    }

    lastUpdateAtMs = sample.recordedAt;
    return {
      lat: anchorLat + py / METERS_PER_DEG_LAT,
      lng: anchorLng + px / lngScaleM,
    };
  }

  function reset() {
    initialized = false;
    lastUpdateAtMs = null;
  }

  return { step, reset };
}
