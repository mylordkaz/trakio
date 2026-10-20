import type { TelemetrySample } from '@/telemetry/types';

// Longitudinal / lateral G in the car frame from the phone's DeviceMotion
// stream, with no manual calibration. Display-only; nothing is stored.
//
// Levelling uses the gravity vector the platform already separates:
// accelerationIncludingGravity − acceleration points down in device
// coordinates on both iOS (userAcceleration + gravity) and Android
// (accelerometer − 2·gravity). Projecting the user acceleration onto the
// plane normal to it gives horizontal acceleration in a level frame that
// co-rotates with the device, and therefore with the car it is mounted in.
// Platform gravity estimation leaves a horizontal residual of about
// 0.5 m/s² (≈0.05 G); values below that are noise.
//
// The constant mount yaw between that frame and the car's axes is learned
// from GPS: between consecutive fixes the car's own acceleration is
// (Δspeed/Δt, v·Δheading/Δt) in (forward, right), and the IMU saw the same
// vector rotated by the mount yaw. Comparing the two directions, weighted by
// magnitude, converges after a brake and a corner. Heading rate fixes the
// lateral sign; a longitudinal-only rule would be biased by trail-braking
// on a one-direction circuit.

export type Vec3 = { x: number; y: number; z: number };

export type CarFrameG = {
  // Positive = accelerating.
  longitudinalG: number;
  // Positive = acceleration toward the car's right (right-hand turn).
  lateralG: number;
  magnitudeG: number;
  aligned: boolean;
};

const STANDARD_GRAVITY = 9.80665;
const MIN_GRAVITY_MPS2 = 5;
const MIN_GPS_SPEED_MPS = 3;
const MIN_OBSERVATION_DT_S = 0.5;
const MAX_OBSERVATION_DT_S = 2;
const MIN_CONSISTENCY = 0.8;
const EVIDENCE_CAP = 50;
const FORWARD_HINTS: Vec3[] = [
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 1, z: 0 },
];

function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function scale(a: Vec3, k: number): Vec3 {
  return { x: a.x * k, y: a.y * k, z: a.z * k };
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function norm(a: Vec3) {
  return Math.hypot(a.x, a.y, a.z);
}

function wrapAngle(rad: number) {
  while (rad > Math.PI) rad -= 2 * Math.PI;
  while (rad < -Math.PI) rad += 2 * Math.PI;
  return rad;
}

export function createCarFrameG(opts?: {
  smoothingTauMs?: number;
  minGpsAccelMps2?: number;
  minImuAccelMps2?: number;
  minObservations?: number;
}) {
  const tauMs = opts?.smoothingTauMs ?? 150;
  const minGpsAccel = opts?.minGpsAccelMps2 ?? 1.5;
  const minImuAccel = opts?.minImuAccelMps2 ?? 0.75;
  const minObservations = opts?.minObservations ?? 3;

  let forwardHint: Vec3 | null = null;
  let meanA1 = 0;
  let meanA2 = 0;
  let meanCount = 0;
  let evidenceX = 0;
  let evidenceY = 0;
  let evidenceWeight = 0;
  let observations = 0;
  let mountYawRad = 0;
  let aligned = false;
  let previousGps: { speedMps: number; headingRad: number; atMs: number } | null = null;
  let lastAtMs: number | null = null;
  let longEma = 0;
  let latEma = 0;
  let magEma = 0;
  let state: CarFrameG = { longitudinalG: 0, lateralG: 0, magnitudeG: 0, aligned: false };

  function levelBasis(down: Vec3): { e1: Vec3; e2: Vec3 } | null {
    if (!forwardHint) {
      forwardHint = FORWARD_HINTS.reduce((best, hint) =>
        Math.abs(dot(hint, down)) < Math.abs(dot(best, down)) ? hint : best
      );
    }
    const projected = sub(forwardHint, scale(down, dot(forwardHint, down)));
    const length = norm(projected);
    if (length < 0.1) {
      return null;
    }
    const e1 = scale(projected, 1 / length);
    return { e1, e2: cross(down, e1) };
  }

  function ingest(acceleration: Vec3 | null, accelerationIncludingGravity: Vec3 | null, atMs: number): CarFrameG {
    if (!acceleration || !accelerationIncludingGravity) {
      return state;
    }
    const gravity = sub(accelerationIncludingGravity, acceleration);
    const gravityNorm = norm(gravity);
    if (gravityNorm < MIN_GRAVITY_MPS2) {
      return state;
    }
    const down = scale(gravity, 1 / gravityNorm);
    const basis = levelBasis(down);
    if (!basis) {
      return state;
    }

    const horizontal = sub(acceleration, scale(down, dot(acceleration, down)));
    const a1 = dot(horizontal, basis.e1);
    const a2 = dot(horizontal, basis.e2);
    meanA1 += a1;
    meanA2 += a2;
    meanCount++;

    const cos = Math.cos(mountYawRad);
    const sin = Math.sin(mountYawRad);
    const longitudinal = a1 * cos + a2 * sin;
    const lateral = -a1 * sin + a2 * cos;

    const dtMs = lastAtMs === null ? tauMs : Math.min(500, Math.max(1, atMs - lastAtMs));
    lastAtMs = atMs;
    const alpha = 1 - Math.exp(-dtMs / tauMs);
    longEma += alpha * (longitudinal - longEma);
    latEma += alpha * (lateral - latEma);
    magEma += alpha * (norm(horizontal) - magEma);

    state = {
      longitudinalG: aligned ? longEma / STANDARD_GRAVITY : 0,
      lateralG: aligned ? latEma / STANDARD_GRAVITY : 0,
      magnitudeG: magEma / STANDARD_GRAVITY,
      aligned,
    };
    return state;
  }

  function resetMean() {
    meanA1 = 0;
    meanA2 = 0;
    meanCount = 0;
  }

  function observeGps(sample: Pick<TelemetrySample, 'recordedAt' | 'speedMps' | 'headingDeg'>) {
    if (sample.speedMps === null || sample.headingDeg === null || sample.speedMps < MIN_GPS_SPEED_MPS) {
      previousGps = null;
      resetMean();
      return;
    }
    const current = {
      speedMps: sample.speedMps,
      headingRad: (sample.headingDeg * Math.PI) / 180,
      atMs: sample.recordedAt,
    };
    if (!previousGps) {
      previousGps = current;
      resetMean();
      return;
    }
    const dtS = (current.atMs - previousGps.atMs) / 1000;
    if (dtS < MIN_OBSERVATION_DT_S) {
      return;
    }
    if (dtS > MAX_OBSERVATION_DT_S) {
      previousGps = current;
      resetMean();
      return;
    }

    const forwardMps2 = (current.speedMps - previousGps.speedMps) / dtS;
    const rightMps2 =
      ((current.speedMps + previousGps.speedMps) / 2) * (wrapAngle(current.headingRad - previousGps.headingRad) / dtS);
    const gpsMagnitude = Math.hypot(forwardMps2, rightMps2);
    const imuA1 = meanCount > 0 ? meanA1 / meanCount : 0;
    const imuA2 = meanCount > 0 ? meanA2 / meanCount : 0;
    const imuMagnitude = Math.hypot(imuA1, imuA2);

    if (gpsMagnitude >= minGpsAccel && imuMagnitude >= minImuAccel) {
      const observed = wrapAngle(Math.atan2(imuA2, imuA1) - Math.atan2(rightMps2, forwardMps2));
      evidenceX += gpsMagnitude * Math.cos(observed);
      evidenceY += gpsMagnitude * Math.sin(observed);
      evidenceWeight += gpsMagnitude;
      observations++;
      if (evidenceWeight > EVIDENCE_CAP) {
        const shrink = EVIDENCE_CAP / evidenceWeight;
        evidenceX *= shrink;
        evidenceY *= shrink;
        evidenceWeight = EVIDENCE_CAP;
      }
      mountYawRad = Math.atan2(evidenceY, evidenceX);
      aligned =
        observations >= minObservations &&
        Math.hypot(evidenceX, evidenceY) / evidenceWeight >= MIN_CONSISTENCY;
    }

    previousGps = current;
    resetMean();
  }

  return {
    ingest,
    observeGps,
    getState: () => state,
  };
}
