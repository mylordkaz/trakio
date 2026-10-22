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
//
// A phone in a fixed cradle sits at the same tilt every session. The mount
// learned in one session is reused in the next when the tilt measured over
// the first second matches the saved tilt, so the meter aligns before the
// car moves. GPS evidence keeps running: it takes over once it aligns on its
// own, and evidence pointing more than 45° away from the saved mount
// discards it.

export type Vec3 = { x: number; y: number; z: number };

export type PhoneMount = {
  // Unit gravity direction in device axes, averaged over the first second.
  down: Vec3;
  forwardHint: Vec3;
  mountYawRad: number;
};

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
const MIN_HANDEDNESS_MARGIN = 0.1;
// GPS and sensor must agree on the size of an acceleration within this
// factor for its direction to count: a GPS speed glitch has no counterpart in
// the sensor and would otherwise outweigh every genuine observation.
const MAX_MAGNITUDE_RATIO = 2;
const EVIDENCE_CAP = 50;
const MOUNT_TILT_WINDOW_MS = 1000;
const MAX_MOUNT_TILT_DIFF_RAD = (3 * Math.PI) / 180;
const MAX_MOUNT_CONTRADICTION_RAD = Math.PI / 4;
// The level basis needs an axis well away from vertical.
const MAX_SAVED_HINT_DOT = 0.9;
// GPS fixes reach this module up to a few seconds after they were measured;
// level-frame readings are kept this long so each fix is compared with the
// readings from its own measurement window.
const LEVEL_HISTORY_MS = 5000;
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
  // Phone only: the mount learned in an earlier session.
  savedMount?: PhoneMount | null;
}) {
  const tauMs = opts?.smoothingTauMs ?? 150;
  const minGpsAccel = opts?.minGpsAccelMps2 ?? 1.5;
  const minImuAccel = opts?.minImuAccelMps2 ?? 0.75;
  const minObservations = opts?.minObservations ?? 3;
  const handednessKnown = (opts?.handedness ?? 'known') === 'known';

  let forwardHint: Vec3 | null = null;
  const levelHistory: { a1: number; a2: number; atMs: number }[] = [];
  const normal: Evidence = { x: 0, y: 0, weight: 0 };
  const mirrored: Evidence = { x: 0, y: 0, weight: 0 };
  let observations = 0;
  let mountYawRad = 0;
  let isMirrored = false;
  let handednessResolved = handednessKnown;
  let aligned = false;
  const savedMount = handednessKnown ? opts?.savedMount ?? null : null;
  let isSavedMountActive = false;
  let isSavedMountRejected = false;
  let tiltStartMs: number | null = null;
  let tiltSum: Vec3 = { x: 0, y: 0, z: 0 };
  let sessionDown: Vec3 | null = null;
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
      // A saved mount's yaw is only meaningful in the basis it was learned
      // in, so that axis is kept whenever it is usable; a fresh choice can
      // flip between two equally horizontal axes on a tiny tilt change.
      forwardHint =
        savedMount && Math.abs(dot(savedMount.forwardHint, down)) < MAX_SAVED_HINT_DOT
          ? savedMount.forwardHint
          : FORWARD_HINTS.reduce((best, hint) =>
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

  function measureTilt(down: Vec3, atMs: number) {
    if (sessionDown) {
      return;
    }
    tiltStartMs ??= atMs;
    tiltSum = { x: tiltSum.x + down.x, y: tiltSum.y + down.y, z: tiltSum.z + down.z };
    if (atMs - tiltStartMs < MOUNT_TILT_WINDOW_MS) {
      return;
    }
    sessionDown = scale(tiltSum, 1 / norm(tiltSum));
    if (
      savedMount &&
      !aligned &&
      forwardHint &&
      dot(forwardHint, savedMount.forwardHint) === 1 &&
      Math.acos(Math.min(1, dot(sessionDown, savedMount.down))) <= MAX_MOUNT_TILT_DIFF_RAD
    ) {
      mountYawRad = savedMount.mountYawRad;
      isSavedMountActive = true;
      aligned = true;
    }
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
    levelHistory.push({ a1, a2, atMs });
    while (levelHistory.length > 0 && levelHistory[0].atMs < atMs - LEVEL_HISTORY_MS) {
      levelHistory.shift();
    }

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
    const down = scale(gravity, 1 / gravityNorm);
    const reading = process(acceleration, down, atMs);
    measureTilt(down, atMs);
    return reading;
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

  // Mean level-frame acceleration over [fromMs, toMs): a device reading
  // stamped with a fix is ingested after that fix is observed, so it belongs
  // to the window the fix opens.
  function levelMean(fromMs: number, toMs: number) {
    let a1 = 0;
    let a2 = 0;
    let count = 0;
    for (const reading of levelHistory) {
      if (reading.atMs >= fromMs && reading.atMs < toMs) {
        a1 += reading.a1;
        a2 += reading.a2;
        count++;
      }
    }
    return count > 0 ? { a1: a1 / count, a2: a2 / count } : { a1: 0, a2: 0 };
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
      return;
    }
    const dtS = (current.atMs - previousGps.atMs) / 1000;
    if (dtS < MIN_OBSERVATION_DT_S) {
      return;
    }
    if (dtS > MAX_OBSERVATION_DT_S) {
      takeIntervalMean();
      previousGps = current;
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
    const { a1: imuA1, a2: imuA2 } = levelMean(previousGps.atMs, current.atMs);
    const imuMagnitude = Math.hypot(imuA1, imuA2);

    const magnitudesAgree =
      imuMagnitude * MAX_MAGNITUDE_RATIO >= gpsMagnitude && gpsMagnitude * MAX_MAGNITUDE_RATIO >= imuMagnitude;
    if (gpsMagnitude >= minGpsAccel && imuMagnitude >= minImuAccel && magnitudesAgree) {
      const gpsAngle = Math.atan2(rightMps2, forwardMps2);
      addEvidence(normal, wrapAngle(Math.atan2(imuA2, imuA1) - gpsAngle), gpsMagnitude);
      addEvidence(mirrored, wrapAngle(Math.atan2(-imuA2, imuA1) - gpsAngle), gpsMagnitude);
      observations++;
      // Handedness is a fixed property of the sensor, so it is decided once.
      // Braking alone fits both hypotheses; a corner tells them apart. Only
      // the mount yaw keeps adapting afterwards (decaying evidence lets a
      // nudged mount re-converge, and would otherwise let one long corner
      // make the wrong hypothesis look consistent again).
      if (!handednessResolved && observations >= minObservations) {
        const margin = consistency(normal) - consistency(mirrored);
        if (Math.abs(margin) >= MIN_HANDEDNESS_MARGIN) {
          isMirrored = margin < 0;
          handednessResolved = true;
        }
      }
      const chosen = isMirrored ? mirrored : normal;
      const learnedYawRad = Math.atan2(chosen.y, chosen.x);
      const learnedAligned =
        handednessResolved && observations >= minObservations && consistency(chosen) >= MIN_CONSISTENCY;
      if (isSavedMountActive && !learnedAligned) {
        if (Math.abs(wrapAngle(learnedYawRad - mountYawRad)) > MAX_MOUNT_CONTRADICTION_RAD) {
          isSavedMountActive = false;
          isSavedMountRejected = true;
          mountYawRad = learnedYawRad;
          aligned = false;
        }
      } else {
        isSavedMountActive = false;
        mountYawRad = learnedYawRad;
        aligned = learnedAligned;
      }
      if (!aligned && state.aligned) {
        state = { ...state, longitudinalG: 0, lateralG: 0, aligned: false };
      }
    }

    previousGps = current;
  }

  return {
    ingest,
    ingestDevice,
    observeGps,
    getState: () => state,
    // The mount to save for the next session, once the meter is aligned.
    getMount: (): PhoneMount | null =>
      handednessKnown && aligned && sessionDown && forwardHint
        ? { down: sessionDown, forwardHint, mountYawRad }
        : null,
    // True once driving contradicted the saved mount, which must then not be
    // offered to the next session.
    isSavedMountRejected: () => isSavedMountRejected,
  };
}
