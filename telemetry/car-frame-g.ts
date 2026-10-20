import type { TelemetrySample } from '@/telemetry/types';

// Longitudinal / lateral G in the car frame, with no manual calibration.
// Display-only; nothing is stored.
//
// Two sources feed the same core:
// - Phone DeviceMotion: the platform already separates gravity, so
//   accelerationIncludingGravity − acceleration points down in device
//   coordinates (iOS: userAcceleration + gravity; Android: accelerometer −
//   2·gravity). Platform gravity estimation leaves a horizontal residual of
//   about 0.5 m/s² (≈0.05 G).
// - External devices (RaceBox, Qstarz): G arrives with gravity included, in
//   the box's own axes. RaceBox documents the specific-force convention (+1 G
//   on Z at rest); Qstarz documents units only. Gravity is therefore the
//   average of the readings between two GPS fixes, folded in only after GPS
//   confirms the car was stationary or at steady speed in a straight line
//   over that interval, so sustained braking or cornering never leaks into
//   it. A
//   box mounted at any angle, and either axis handedness, is resolved by the
//   alignment below.
//
// Projecting acceleration onto the plane normal to gravity gives a level
// frame that co-rotates with the sensor, and therefore with the car it is
// mounted in. The constant yaw between that frame and the car's axes is
// learned from GPS: between fixes the car's own acceleration is
// (Δspeed/Δt, v·Δheading/Δt) in (forward, right), and the sensor saw the
// same vector rotated by the mount yaw. Comparing the two directions,
// weighted by magnitude, converges after a brake and a corner. Heading rate
// fixes the lateral sign; when the sensor's handedness is not known, both
// hypotheses are scored and the consistent one wins once corners are seen.

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
const MIN_DEVICE_GRAVITY_G = 0.8;
const MAX_DEVICE_GRAVITY_G = 1.2;
const DEVICE_GRAVITY_TAU_MS = 2000;
const STATIONARY_SPEED_MPS = 1;
const PARKED_WINDOW_MS = 500;
const STEADY_ACCEL_MPS2 = 0.5;
const MIN_GPS_SPEED_MPS = 3;
const MIN_OBSERVATION_DT_S = 0.5;
const MAX_OBSERVATION_DT_S = 2;
const MIN_CONSISTENCY = 0.8;
const EVIDENCE_CAP = 50;
const FORWARD_HINTS: Vec3[] = [
  { x: 0, y: 0, z: -1 },
  { x: 0, y: 1, z: 0 },
  { x: 1, y: 0, z: 0 },
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

type Evidence = { x: number; y: number; weight: number };

function addEvidence(evidence: Evidence, angle: number, weight: number) {
  evidence.x += weight * Math.cos(angle);
  evidence.y += weight * Math.sin(angle);
  evidence.weight += weight;
  if (evidence.weight > EVIDENCE_CAP) {
    const shrink = EVIDENCE_CAP / evidence.weight;
    evidence.x *= shrink;
    evidence.y *= shrink;
    evidence.weight = EVIDENCE_CAP;
  }
}

function consistency(evidence: Evidence) {
  return evidence.weight > 0 ? Math.hypot(evidence.x, evidence.y) / evidence.weight : 0;
}

export function createCarFrameG(opts?: {
  smoothingTauMs?: number;
  minGpsAccelMps2?: number;
  minImuAccelMps2?: number;
  minObservations?: number;
  // Phone axes are right-handed by platform contract; external boxes are not
  // documented well enough to assume it.
  handedness?: 'known' | 'unknown';
}) {
  const tauMs = opts?.smoothingTauMs ?? 150;
  const minGpsAccel = opts?.minGpsAccelMps2 ?? 1.5;
  const minImuAccel = opts?.minImuAccelMps2 ?? 0.75;
  const minObservations = opts?.minObservations ?? 3;
  const handednessKnown = (opts?.handedness ?? 'known') === 'known';

  let forwardHint: Vec3 | null = null;
  let meanA1 = 0;
  let meanA2 = 0;
  let meanCount = 0;
  const normal: Evidence = { x: 0, y: 0, weight: 0 };
  const mirrored: Evidence = { x: 0, y: 0, weight: 0 };
  let observations = 0;
  let mountYawRad = 0;
  let isMirrored = false;
  let aligned = false;
  let previousGps: { speedMps: number; headingRad: number; atMs: number } | null = null;
  let parkedWindowStartMs: number | null = null;
  let pendingParked: { mean: Vec3; durationMs: number } | null = null;
  let deviceGravity: Vec3 | null = null;
  let intervalForce: Vec3 = { x: 0, y: 0, z: 0 };
  let intervalCount = 0;
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

  // acceleration in m/s² without gravity; down is a unit vector.
  function process(acceleration: Vec3, down: Vec3, atMs: number): CarFrameG {
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

    const a2Car = isMirrored ? -a2 : a2;
    const cos = Math.cos(mountYawRad);
    const sin = Math.sin(mountYawRad);
    const longitudinal = a1 * cos + a2Car * sin;
    const lateral = -a1 * sin + a2Car * cos;

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

  function ingest(acceleration: Vec3 | null, accelerationIncludingGravity: Vec3 | null, atMs: number): CarFrameG {
    if (!acceleration || !accelerationIncludingGravity) {
      return state;
    }
    const gravity = sub(accelerationIncludingGravity, acceleration);
    const gravityNorm = norm(gravity);
    if (gravityNorm < MIN_GRAVITY_MPS2) {
      return state;
    }
    return process(acceleration, scale(gravity, 1 / gravityNorm), atMs);
  }

  // gForce in G, gravity included, in the device's own axes.
  function ingestDevice(gForce: Vec3, atMs: number): CarFrameG {
    const specificForce = scale(gForce, STANDARD_GRAVITY);
    intervalForce = {
      x: intervalForce.x + specificForce.x,
      y: intervalForce.y + specificForce.y,
      z: intervalForce.z + specificForce.z,
    };
    intervalCount++;
    if (!deviceGravity) {
      return state;
    }
    const gravityNorm = norm(deviceGravity);
    if (gravityNorm < MIN_GRAVITY_MPS2) {
      return state;
    }
    // Specific force reads +1 G upward at rest, so the stored gravity points
    // up; a box with the opposite convention is handled as a mirror.
    return process(sub(specificForce, deviceGravity), scale(deviceGravity, -1 / gravityNorm), atMs);
  }

  function resetMean() {
    meanA1 = 0;
    meanA2 = 0;
    meanCount = 0;
  }

  function takeIntervalMean(): Vec3 | null {
    const mean = intervalCount > 0 ? scale(intervalForce, 1 / intervalCount) : null;
    intervalForce = { x: 0, y: 0, z: 0 };
    intervalCount = 0;
    return mean;
  }

  function commitGravity(mean: Vec3 | null, durationMs: number) {
    if (!mean) {
      return;
    }
    const meanG = norm(mean) / STANDARD_GRAVITY;
    if (meanG < MIN_DEVICE_GRAVITY_G || meanG > MAX_DEVICE_GRAVITY_G) {
      return;
    }
    if (!deviceGravity) {
      deviceGravity = mean;
      return;
    }
    const alpha = 1 - Math.exp(-Math.max(0, durationMs) / DEVICE_GRAVITY_TAU_MS);
    deviceGravity = {
      x: deviceGravity.x + alpha * (mean.x - deviceGravity.x),
      y: deviceGravity.y + alpha * (mean.y - deviceGravity.y),
      z: deviceGravity.z + alpha * (mean.z - deviceGravity.z),
    };
  }

  // Readings while parked are held back one window and committed only once
  // the following window shows the car still parked, so the first instant
  // of pulling away never counts as gravity.
  function observeParked(sample: Pick<TelemetrySample, 'recordedAt' | 'speedMps'>) {
    if (sample.speedMps === null || sample.speedMps >= STATIONARY_SPEED_MPS) {
      takeIntervalMean();
      pendingParked = null;
      parkedWindowStartMs = null;
      return;
    }
    if (parkedWindowStartMs === null) {
      takeIntervalMean();
      parkedWindowStartMs = sample.recordedAt;
      return;
    }
    const durationMs = sample.recordedAt - parkedWindowStartMs;
    if (durationMs < PARKED_WINDOW_MS) {
      return;
    }
    if (pendingParked) {
      commitGravity(pendingParked.mean, pendingParked.durationMs);
    }
    const mean = takeIntervalMean();
    pendingParked = mean ? { mean, durationMs } : null;
    parkedWindowStartMs = sample.recordedAt;
  }

  function observeGps(sample: Pick<TelemetrySample, 'recordedAt' | 'speedMps' | 'headingDeg'>) {
    if (sample.speedMps === null || sample.headingDeg === null || sample.speedMps < MIN_GPS_SPEED_MPS) {
      observeParked(sample);
      previousGps = null;
      resetMean();
      return;
    }
    pendingParked = null;
    parkedWindowStartMs = null;
    const current = {
      speedMps: sample.speedMps,
      headingRad: (sample.headingDeg * Math.PI) / 180,
      atMs: sample.recordedAt,
    };
    if (!previousGps) {
      takeIntervalMean();
      previousGps = current;
      resetMean();
      return;
    }
    const dtS = (current.atMs - previousGps.atMs) / 1000;
    if (dtS < MIN_OBSERVATION_DT_S) {
      return;
    }
    if (dtS > MAX_OBSERVATION_DT_S) {
      takeIntervalMean();
      previousGps = current;
      resetMean();
      return;
    }

    const forwardMps2 = (current.speedMps - previousGps.speedMps) / dtS;
    const rightMps2 =
      ((current.speedMps + previousGps.speedMps) / 2) * (wrapAngle(current.headingRad - previousGps.headingRad) / dtS);
    const gpsMagnitude = Math.hypot(forwardMps2, rightMps2);
    const intervalMean = takeIntervalMean();
    if (gpsMagnitude < STEADY_ACCEL_MPS2) {
      commitGravity(intervalMean, dtS * 1000);
    }
    const imuA1 = meanCount > 0 ? meanA1 / meanCount : 0;
    const imuA2 = meanCount > 0 ? meanA2 / meanCount : 0;
    const imuMagnitude = Math.hypot(imuA1, imuA2);

    if (gpsMagnitude >= minGpsAccel && imuMagnitude >= minImuAccel) {
      const gpsAngle = Math.atan2(rightMps2, forwardMps2);
      addEvidence(normal, wrapAngle(Math.atan2(imuA2, imuA1) - gpsAngle), gpsMagnitude);
      addEvidence(mirrored, wrapAngle(Math.atan2(-imuA2, imuA1) - gpsAngle), gpsMagnitude);
      observations++;
      isMirrored = !handednessKnown && consistency(mirrored) > consistency(normal) + 0.05;
      const chosen = isMirrored ? mirrored : normal;
      mountYawRad = Math.atan2(chosen.y, chosen.x);
      aligned = observations >= minObservations && consistency(chosen) >= MIN_CONSISTENCY;
    }

    previousGps = current;
    resetMean();
  }

  return {
    ingest,
    ingestDevice,
    observeGps,
    getState: () => state,
  };
}
