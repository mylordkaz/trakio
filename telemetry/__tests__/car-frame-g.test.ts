import { createCarFrameG } from '@/telemetry/car-frame-g';
import type { Vec3 } from '@/telemetry/car-frame-g';

// World frame: x east, y north, z up. The car drives along its heading
// (clockwise from north). The phone sits in a cradle rotated by yaw, pitch
// and roll relative to the car; device readings are the world vectors
// expressed in that device frame, following the platform convention that
// accelerationIncludingGravity − acceleration points down.

const G = 9.80665;
const IMU_DT_MS = 20;

type Mount = { yawDeg: number; pitchDeg: number; rollDeg: number };

function rotationRows(mount: Mount): Vec3[] {
  const y = (mount.yawDeg * Math.PI) / 180;
  const p = (mount.pitchDeg * Math.PI) / 180;
  const r = (mount.rollDeg * Math.PI) / 180;
  const cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p), cr = Math.cos(r), sr = Math.sin(r);
  // Device-from-world rotation (rows are device axes in world coordinates).
  return [
    { x: cy * cp, y: sy * cp, z: -sp },
    { x: cy * sp * sr - sy * cr, y: sy * sp * sr + cy * cr, z: cp * sr },
    { x: cy * sp * cr + sy * sr, y: sy * sp * cr - cy * sr, z: cp * cr },
  ];
}

function toDevice(rows: Vec3[], v: Vec3): Vec3 {
  const d = (row: Vec3) => row.x * v.x + row.y * v.y + row.z * v.z;
  return { x: d(rows[0]), y: d(rows[1]), z: d(rows[2]) };
}

function carToWorld(headingRad: number, forwardMps2: number, rightMps2: number): Vec3 {
  const forward = { x: Math.sin(headingRad), y: Math.cos(headingRad), z: 0 };
  const right = { x: Math.cos(headingRad), y: -Math.sin(headingRad), z: 0 };
  return {
    x: forward.x * forwardMps2 + right.x * rightMps2,
    y: forward.y * forwardMps2 + right.y * rightMps2,
    z: 0,
  };
}

/**
 * Simulates one second of driving: the IMU sees the car's acceleration in
 * the device frame at 50 Hz while the phone turns with the car, then a GPS
 * fix arrives with the resulting speed and heading.
 */
function driveSecond(
  g: ReturnType<typeof createCarFrameG>,
  mount: Mount,
  clock: { tMs: number; speedMps: number; headingRad: number },
  forwardMps2: number,
  yawRateRadS: number,
) {
  const rightMps2 = clock.speedMps * yawRateRadS;
  const gravityDown = { x: 0, y: 0, z: -G };
  for (let i = 0; i < 1000 / IMU_DT_MS; i++) {
    const headingNow = clock.headingRad + yawRateRadS * ((i * IMU_DT_MS) / 1000);
    // The cradle turns with the car. Heading is clockwise from north while
    // the rotation helper's yaw is counterclockwise, hence the subtraction.
    const rows = rotationRows({ ...mount, yawDeg: mount.yawDeg - (headingNow * 180) / Math.PI });
    const world = carToWorld(headingNow, forwardMps2, rightMps2);
    const accel = toDevice(rows, world);
    const gravity = toDevice(rows, gravityDown);
    g.ingest(accel, { x: accel.x + gravity.x, y: accel.y + gravity.y, z: accel.z + gravity.z }, clock.tMs + i * IMU_DT_MS);
  }
  clock.tMs += 1000;
  clock.speedMps += forwardMps2;
  clock.headingRad += yawRateRadS;
  g.observeGps({ recordedAt: clock.tMs, speedMps: clock.speedMps, headingDeg: (clock.headingRad * 180) / Math.PI });
}

const TILTED: Mount = { yawDeg: 70, pitchDeg: 30, rollDeg: 60 };

describe('createCarFrameG', () => {
  it('learns the mount yaw from a speed ramp on a tilted phone and reports forward G', () => {
    const g = createCarFrameG();
    const clock = { tMs: 0, speedMps: 10, headingRad: 0 };

    driveSecond(g, TILTED, clock, 0, 0);
    expect(g.getState().aligned).toBe(false);
    for (let i = 0; i < 4; i++) {
      driveSecond(g, TILTED, clock, 3, 0);
    }
    const state = g.getState();
    expect(state.aligned).toBe(true);
    expect(state.longitudinalG).toBeCloseTo(3 / G, 1);
    expect(Math.abs(state.lateralG)).toBeLessThan(0.03);
  });

  it('reports positive lateral G through a right-hand corner', () => {
    const g = createCarFrameG();
    const clock = { tMs: 0, speedMps: 20, headingRad: 0 };

    driveSecond(g, TILTED, clock, 0, 0);
    for (let i = 0; i < 4; i++) {
      driveSecond(g, TILTED, clock, 0, 0.15); // 20 m/s · 0.15 rad/s = 3 m/s² to the right
    }
    const state = g.getState();
    expect(state.aligned).toBe(true);
    expect(state.lateralG).toBeGreaterThan(0.25);
    expect(Math.abs(state.longitudinalG)).toBeLessThan(0.03);
  });

  it('resolves axes consistently when braking and cornering are mixed', () => {
    const g = createCarFrameG();
    const mount: Mount = { yawDeg: -85, pitchDeg: 10, rollDeg: -20 };
    const clock = { tMs: 0, speedMps: 30, headingRad: 1 };

    driveSecond(g, mount, clock, 0, 0);
    driveSecond(g, mount, clock, -4, 0.05);
    driveSecond(g, mount, clock, -3, 0.1);
    driveSecond(g, mount, clock, 0, 0.15);
    driveSecond(g, mount, clock, 2, -0.1); // left-hander on the throttle
    const state = g.getState();
    expect(state.aligned).toBe(true);
    expect(state.longitudinalG).toBeGreaterThan(0.15);
    expect(state.lateralG).toBeLessThan(-0.15);
  });

  it('exposes only the magnitude until aligned', () => {
    const g = createCarFrameG();
    const clock = { tMs: 0, speedMps: 10, headingRad: 0 };

    driveSecond(g, TILTED, clock, 3, 0);
    const state = g.getState();
    expect(state.aligned).toBe(false);
    expect(state.longitudinalG).toBe(0);
    expect(state.lateralG).toBe(0);
    expect(state.magnitudeG).toBeCloseTo(3 / G, 1);
  });

  it('smooths with a time constant of 150 ms', () => {
    const g = createCarFrameG();
    const still: Vec3 = { x: 0, y: 0, z: 0 };
    const gravity: Vec3 = { x: 0, y: 0, z: -G };
    g.ingest(still, gravity, 0);
    const step: Vec3 = { x: 0, y: 4, z: 0 };
    let state = g.getState();
    for (let t = IMU_DT_MS; t <= 150; t += IMU_DT_MS) {
      state = g.ingest(step, { x: step.x, y: step.y, z: step.z - G }, t);
    }
    // Starts from the resting sample, so after one time constant ≈ 63 %.
    expect(state.magnitudeG / (4 / G)).toBeGreaterThan(0.55);
    expect(state.magnitudeG / (4 / G)).toBeLessThan(0.7);
  });

  it('ignores samples without a usable gravity vector', () => {
    const g = createCarFrameG();
    const state = g.ingest({ x: 1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 0);
    expect(state).toEqual({ longitudinalG: 0, lateralG: 0, magnitudeG: 0, aligned: false });
  });
});

// External devices deliver specific force in G with gravity included
// (+1 G up at rest for RaceBox), in the box's own axes, with each GPS fix.
const DEVICE_DT_MS = 40; // 25 Hz

function driveDevice(
  g: ReturnType<typeof createCarFrameG>,
  mount: Mount,
  clock: { tMs: number; speedMps: number; headingRad: number },
  seconds: number,
  forwardMps2: number,
  yawRateRadS: number,
  transform: (v: Vec3) => Vec3 = (v) => v,
) {
  for (let i = 0; i < (seconds * 1000) / DEVICE_DT_MS; i++) {
    const dtS = DEVICE_DT_MS / 1000;
    clock.tMs += DEVICE_DT_MS;
    clock.speedMps = Math.max(0, clock.speedMps + forwardMps2 * dtS);
    clock.headingRad += yawRateRadS * dtS;
    const rows = rotationRows({ ...mount, yawDeg: mount.yawDeg - (clock.headingRad * 180) / Math.PI });
    const world = carToWorld(clock.headingRad, forwardMps2, clock.speedMps * yawRateRadS);
    const specificForce = toDevice(rows, { x: world.x, y: world.y, z: world.z + G });
    g.observeGps({ recordedAt: clock.tMs, speedMps: clock.speedMps, headingDeg: (clock.headingRad * 180) / Math.PI });
    g.ingestDevice(transform({ x: specificForce.x / G, y: specificForce.y / G, z: specificForce.z / G }), clock.tMs);
  }
}

const BOX: Mount = { yawDeg: 140, pitchDeg: 8, rollDeg: -5 };

function lapStart(g: ReturnType<typeof createCarFrameG>, mount: Mount, transform?: (v: Vec3) => Vec3) {
  const clock = { tMs: 0, speedMps: 0, headingRad: 0.4 };
  driveDevice(g, mount, clock, 2, 0, 0, transform); // parked: gravity learned here
  driveDevice(g, mount, clock, 6, 4, 0, transform); // launch
  driveDevice(g, mount, clock, 2, 0, 0, transform); // steady straight
  driveDevice(g, mount, clock, 2, -6, 0, transform); // brake
  driveDevice(g, mount, clock, 3, 0, 0.25, transform); // right-hander, 3 m/s² at 12 m/s
  driveDevice(g, mount, clock, 3, 0, -0.25, transform); // left-hander
  return clock;
}

describe('createCarFrameG with an external device', () => {
  it('shows nothing until it has seen the car at rest or steady', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const clock = { tMs: 0, speedMps: 20, headingRad: 0 };
    driveDevice(g, BOX, clock, 1, 3, 0);
    expect(g.getState()).toEqual({ longitudinalG: 0, lateralG: 0, magnitudeG: 0, aligned: false });
  });

  it('aligns a box mounted at an arbitrary angle and reads braking and cornering', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const clock = lapStart(g, BOX);
    expect(g.getState().aligned).toBe(true);

    driveDevice(g, BOX, clock, 1.5, -7, 0);
    expect(g.getState().longitudinalG).toBeCloseTo(-7 / G, 1);
    expect(Math.abs(g.getState().lateralG)).toBeLessThan(0.05);

    clock.speedMps = 20;
    driveDevice(g, BOX, clock, 2, 0, 0.2); // 4 m/s² to the right
    expect(g.getState().lateralG).toBeCloseTo(4 / G, 1);
    expect(Math.abs(g.getState().longitudinalG)).toBeLessThan(0.05);
  });

  it('learns gravity from a steady straight when recording starts on the move', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const clock = { tMs: 0, speedMps: 30, headingRad: 2 };
    driveDevice(g, BOX, clock, 3, 0, 0); // steady straight, no stop at all
    driveDevice(g, BOX, clock, 2, -6, 0);
    driveDevice(g, BOX, clock, 3, 0, 0.15);
    driveDevice(g, BOX, clock, 2, 3, -0.1);
    expect(g.getState().aligned).toBe(true);
    clock.speedMps = 25;
    driveDevice(g, BOX, clock, 2, 0, -0.2); // 5 m/s² to the left
    expect(g.getState().lateralG).toBeCloseTo(-5 / G, 1);
  });

  it('does not align on braking alone while handedness is unknown', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const clock = { tMs: 0, speedMps: 0, headingRad: 0.4 };
    driveDevice(g, BOX, clock, 2, 0, 0);
    driveDevice(g, BOX, clock, 6, 4, 0);
    driveDevice(g, BOX, clock, 2, 0, 0);
    driveDevice(g, BOX, clock, 3, -6, 0);
    expect(g.getState().aligned).toBe(false);

    clock.speedMps = 20;
    driveDevice(g, BOX, clock, 3, 0, 0.2);
    expect(g.getState().aligned).toBe(true);
    expect(g.getState().lateralG).toBeCloseTo(4 / G, 1);
  });

  it('keeps gravity stable through a long sustained corner', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const clock = lapStart(g, BOX);
    clock.speedMps = 25;
    driveDevice(g, BOX, clock, 10, 0, 0.3); // 7.5 m/s² for ten seconds
    const state = g.getState();
    expect(state.lateralG).toBeCloseTo(7.5 / G, 1);
    expect(Math.abs(state.longitudinalG)).toBeLessThan(0.05);
  });

  it('resolves a mirrored axis convention after the first corners', () => {
    const g = createCarFrameG({ handedness: 'unknown' });
    const mirror = (v: Vec3) => ({ x: -v.x, y: -v.y, z: -v.z });
    const clock = lapStart(g, BOX, mirror);
    expect(g.getState().aligned).toBe(true);

    clock.speedMps = 20;
    driveDevice(g, BOX, clock, 2, 0, 0.2, mirror);
    expect(g.getState().lateralG).toBeCloseTo(4 / G, 1);
    driveDevice(g, BOX, clock, 1.5, -7, 0, mirror);
    expect(g.getState().longitudinalG).toBeCloseTo(-7 / G, 1);
  });
});
