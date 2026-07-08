import type { TelemetrySample } from '@/telemetry/types';
import { toRadians } from '@/utils/geo';
import type { ExportedImuSample } from './replay';

// Phase 2b GPS+IMU fusion estimator — BENCH PROTOTYPE (docs/kalman/
// phase-2-imu-fusion.md §3). Lives in bench/ until it passes the masked-GPS
// acceptance criteria; only then does it graduate to telemetry/ (2c).
//
// Same per-axis 2-state linear filter as telemetry/kalman.ts, with one
// change: measured acceleration drives the predict step (control input) at
// IMU rate, so the estimate keeps curving and accelerating with the car —
// including through GPS silence. This removes the constant-velocity lag that
// killed the GPS-only filter (gate-edge lap loss) at its source.
//
// Orientation: DeviceMotion attitude (alpha yaw / beta pitch / gamma roll,
// W3C convention R = Rz(alpha)·Rx(beta)·Ry(gamma), device→attitude-world)
// resolves everything except the yaw reference, which is arbitrary. The yaw
// offset to ENU is estimated online by comparing the direction of the
// IMU-integrated velocity change against the GPS Doppler velocity change
// while the car maneuvers. Until that alignment converges, the filter runs
// in plain CV mode (no control input) — honest cold start, no guessed frame.

export type FusionConfig = {
  // 1σ of world-frame acceleration error while using IMU control (sensor
  // noise + residual bias + attitude error). The CV-mode fallback uses
  // cvAccelNoiseMps2 (same meaning as Phase 0's σa).
  imuAccelNoiseMps2: number;
  cvAccelNoiseMps2: number;
  accuracyTrustScale: number;
  fallbackSpeedNoiseMps: number;
  innovationGateSigma: number;
  minSpeedForVelocityUpdateMps: number;
  // Yaw alignment: minimum |Δv| between consecutive GPS fixes to attempt an
  // alignment observation, and the low-pass blend per observation.
  yawAlignMinDvMps: number;
  yawAlignBlend: number;
  yawAlignConvergedAfter: number;
  // A GPS silence longer than this with no IMU either resets the filter.
  resetGapS: number;
};

export const DEFAULT_FUSION_CONFIG: FusionConfig = {
  imuAccelNoiseMps2: 0.35,
  cvAccelNoiseMps2: 3,
  accuracyTrustScale: 1,
  fallbackSpeedNoiseMps: 0.7,
  innovationGateSigma: 5,
  minSpeedForVelocityUpdateMps: 1.5,
  yawAlignMinDvMps: 1.5,
  yawAlignBlend: 0.25,
  yawAlignConvergedAfter: 3,
  resetGapS: 20,
};

const METERS_PER_DEG_LAT = 111320;
const MIN_ACCURACY_M = 3;
const MIN_VARIANCE = 1e-4;

type AxisState = { p: number; v: number; Ppp: number; Ppv: number; Pvv: number };

function predictAxis(axis: AxisState, dt: number, accel: number, noiseMps2: number) {
  const q = noiseMps2 * noiseMps2;
  axis.p += axis.v * dt + 0.5 * accel * dt * dt;
  axis.v += accel * dt;
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

function wrapAngle(rad: number) {
  while (rad > Math.PI) rad -= 2 * Math.PI;
  while (rad < -Math.PI) rad += 2 * Math.PI;
  return rad;
}

// Device -> attitude-world rotation of a device-frame vector, W3C Tait-Bryan
// (intrinsic Z-X'-Y''): R = Rz(alpha) · Rx(beta) · Ry(gamma).
export function rotateDeviceToWorld(
  v: [number, number, number],
  alpha: number,
  beta: number,
  gamma: number
): [number, number, number] {
  const [x, y, z] = v;
  const cA = Math.cos(alpha), sA = Math.sin(alpha);
  const cB = Math.cos(beta), sB = Math.sin(beta);
  const cG = Math.cos(gamma), sG = Math.sin(gamma);

  // Rz(alpha) * Rx(beta) * Ry(gamma), rows applied to column vector [x y z].
  const m00 = cA * cG - sA * sB * sG;
  const m01 = -sA * cB;
  const m02 = cA * sG + sA * sB * cG;
  const m10 = sA * cG + cA * sB * sG;
  const m11 = cA * cB;
  const m12 = sA * sG - cA * sB * cG;
  const m20 = -cB * sG;
  const m21 = sB;
  const m22 = cB * cG;

  return [
    m00 * x + m01 * y + m02 * z,
    m10 * x + m11 * y + m12 * z,
    m20 * x + m21 * y + m22 * z,
  ];
}

export type FusionDebugState = {
  yawOffsetRad: number | null;
  yawObservations: number;
  aligned: boolean;
  positionSigmaM: number;
};

export function createFusionEstimator(config: Partial<FusionConfig> = {}) {
  const cfg = { ...DEFAULT_FUSION_CONFIG, ...config };

  let anchorLat = 0;
  let anchorLng = 0;
  let lngScaleM = 0;
  let initialized = false;

  let east: AxisState | null = null;
  let north: AxisState | null = null;
  let lastPredictAtMs: number | null = null;

  // Latest world-frame (attitude frame, pre-yaw) horizontal acceleration.
  let lastAttitudeAccel: [number, number] | null = null;

  // Yaw alignment state.
  let yawOffsetRad: number | null = null;
  let yawObservations = 0;
  let previousGpsVelocity: { vx: number; vy: number; atMs: number } | null = null;
  let attitudeDvE = 0; // integrated attitude-frame accel between GPS fixes
  let attitudeDvN = 0;

  function aligned() {
    return yawOffsetRad !== null && yawObservations >= cfg.yawAlignConvergedAfter;
  }

  function project(lat: number, lng: number) {
    return { x: (lng - anchorLng) * lngScaleM, y: (lat - anchorLat) * METERS_PER_DEG_LAT };
  }

  function initialize(sample: TelemetrySample) {
    if (!initialized) {
      anchorLat = sample.lat;
      anchorLng = sample.lng;
      lngScaleM = Math.cos(toRadians(sample.lat)) * METERS_PER_DEG_LAT;
      initialized = true;
    }

    const { x, y } = project(sample.lat, sample.lng);
    const accuracy = Math.max(sample.accuracyM ?? MIN_ACCURACY_M, MIN_ACCURACY_M);
    const hasVelocity = sample.speedMps !== null && sample.headingDeg !== null;
    const heading = hasVelocity ? toRadians(sample.headingDeg!) : 0;
    const vx = hasVelocity ? sample.speedMps! * Math.sin(heading) : 0;
    const vy = hasVelocity ? sample.speedMps! * Math.cos(heading) : 0;
    const vSigma = hasVelocity ? 5 : 20;

    east = { p: x, v: vx, Ppp: (2 * accuracy) ** 2, Ppv: 0, Pvv: vSigma ** 2 };
    north = { p: y, v: vy, Ppp: (2 * accuracy) ** 2, Ppv: 0, Pvv: vSigma ** 2 };
    lastPredictAtMs = sample.recordedAt;
    previousGpsVelocity = hasVelocity ? { vx, vy, atMs: sample.recordedAt } : null;
    attitudeDvE = 0;
    attitudeDvN = 0;
  }

  function predictTo(timeMs: number) {
    if (!east || !north || lastPredictAtMs === null) return;
    const dt = (timeMs - lastPredictAtMs) / 1000;
    if (dt <= 0) return;

    if (aligned() && lastAttitudeAccel) {
      const cosY = Math.cos(yawOffsetRad!);
      const sinY = Math.sin(yawOffsetRad!);
      const aE = cosY * lastAttitudeAccel[0] - sinY * lastAttitudeAccel[1];
      const aN = sinY * lastAttitudeAccel[0] + cosY * lastAttitudeAccel[1];
      predictAxis(east, dt, aE, cfg.imuAccelNoiseMps2);
      predictAxis(north, dt, aN, cfg.imuAccelNoiseMps2);
    } else {
      predictAxis(east, dt, 0, cfg.cvAccelNoiseMps2);
      predictAxis(north, dt, 0, cfg.cvAccelNoiseMps2);
    }

    lastPredictAtMs = timeMs;
  }

  function ingestImu(sample: ExportedImuSample) {
    if (!east || !north || lastPredictAtMs === null) return;

    const [ax, ay, az] = sample.accel;
    const [alpha, beta, gamma] = sample.rotation;

    if (ax === null || ay === null || az === null || alpha === null || beta === null || gamma === null) {
      predictTo(sample.recordedAt);
      lastAttitudeAccel = null;
      return;
    }

    const world = rotateDeviceToWorld([ax, ay, az], alpha, beta, gamma);
    // Attitude-world horizontal components; attitude X/Y map to attitude-frame
    // "east/north" up to the unknown yaw offset.
    const dtSincePredict = (sample.recordedAt - lastPredictAtMs) / 1000;
    if (dtSincePredict > 0) {
      attitudeDvE += world[0] * dtSincePredict;
      attitudeDvN += world[1] * dtSincePredict;
    }
    lastAttitudeAccel = [world[0], world[1]];
    predictTo(sample.recordedAt);
  }

  function observeYaw(sample: TelemetrySample) {
    if (sample.speedMps === null || sample.headingDeg === null) {
      previousGpsVelocity = null;
      attitudeDvE = 0;
      attitudeDvN = 0;
      return;
    }

    const heading = toRadians(sample.headingDeg);
    const vx = sample.speedMps * Math.sin(heading);
    const vy = sample.speedMps * Math.cos(heading);

    if (previousGpsVelocity) {
      const dvx = vx - previousGpsVelocity.vx;
      const dvy = vy - previousGpsVelocity.vy;
      const gpsDv = Math.hypot(dvx, dvy);
      const imuDv = Math.hypot(attitudeDvE, attitudeDvN);

      if (gpsDv >= cfg.yawAlignMinDvMps && imuDv >= cfg.yawAlignMinDvMps * 0.5) {
        // Standard-convention angles (atan2(N, E)) to match the CCW rotation
        // applied in predictTo; bearing-style atan2(E, N) flips the sign and
        // doubles the final error.
        const gpsAngle = Math.atan2(dvy, dvx);
        const imuAngle = Math.atan2(attitudeDvN, attitudeDvE);
        const observation = wrapAngle(gpsAngle - imuAngle);

        if (yawOffsetRad === null) {
          yawOffsetRad = observation;
        } else {
          yawOffsetRad = wrapAngle(yawOffsetRad + cfg.yawAlignBlend * wrapAngle(observation - yawOffsetRad));
        }
        yawObservations++;
      }
    }

    previousGpsVelocity = { vx, vy, atMs: sample.recordedAt };
    attitudeDvE = 0;
    attitudeDvN = 0;
  }

  function step(sample: TelemetrySample): { lat: number; lng: number } {
    const gapS = lastPredictAtMs === null ? null : (sample.recordedAt - lastPredictAtMs) / 1000;

    if (!east || !north || gapS === null || gapS < 0 || gapS > cfg.resetGapS) {
      initialize(sample);
      return { lat: sample.lat, lng: sample.lng };
    }

    predictTo(sample.recordedAt);
    observeYaw(sample);

    const { x: zx, y: zy } = project(sample.lat, sample.lng);
    const accuracy = Math.max(sample.accuracyM ?? MIN_ACCURACY_M, MIN_ACCURACY_M);
    const Rp = (cfg.accuracyTrustScale * accuracy) ** 2;
    const yx = zx - east!.p;
    const yy = zy - north!.p;
    const nis = (yx * yx) / (east!.Ppp + Rp) + (yy * yy) / (north!.Ppp + Rp);

    if (nis <= cfg.innovationGateSigma ** 2) {
      updateAxisPosition(east!, zx, Rp);
      updateAxisPosition(north!, zy, Rp);
    }

    if (
      sample.speedMps !== null &&
      sample.headingDeg !== null &&
      sample.speedMps >= cfg.minSpeedForVelocityUpdateMps
    ) {
      const Rv = cfg.fallbackSpeedNoiseMps ** 2;
      const heading = toRadians(sample.headingDeg);
      updateAxisVelocity(east!, sample.speedMps * Math.sin(heading), Rv);
      updateAxisVelocity(north!, sample.speedMps * Math.cos(heading), Rv);
    }

    return {
      lat: anchorLat + north!.p / METERS_PER_DEG_LAT,
      lng: anchorLng + east!.p / lngScaleM,
    };
  }

  function currentPosition(): { lat: number; lng: number } | null {
    if (!east || !north) return null;
    return {
      lat: anchorLat + north.p / METERS_PER_DEG_LAT,
      lng: anchorLng + east.p / lngScaleM,
    };
  }

  function getDebugState(): FusionDebugState {
    return {
      yawOffsetRad,
      yawObservations,
      aligned: aligned(),
      positionSigmaM: east ? Math.sqrt(Math.max(east.Ppp, north?.Ppp ?? 0)) : NaN,
    };
  }

  function reset() {
    east = null;
    north = null;
    initialized = false;
    lastPredictAtMs = null;
    lastAttitudeAccel = null;
    yawOffsetRad = null;
    yawObservations = 0;
    previousGpsVelocity = null;
  }

  return { step, ingestImu, currentPosition, getDebugState, reset };
}
