import { findDisplayHoles } from '@/utils/displayLine';
import {
  bridgeDisplayHoles,
  calibrateImuTimeline,
  type BridgeFix,
  type HoleBridge,
  type ImuSample,
  type TrackOutline,
} from '@/utils/holeBridge';

// A synthetic drive with the clock structure of a real phone capture: fixes
// stamped 1 s after the instant they describe, reported speed describing the
// instant 0.8 s before its fix, IMU samples stamped 0.9 s after their
// instant. The fused yaw follows the W3C sign (counterclockwise positive)
// with an arbitrary zero; the gyro rate is expressed in device axes for a
// phone tilted 45° in its cradle, in expo-sensors order [alpha, beta,
// gamma] = device [z, y, x].

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const LAT0 = 36.5;
const LNG0 = 140.2;
const M_LAT = 111320;
const M_LNG = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
const GPS_LATENCY_MS = 1000;
const IMU_LATENCY_MS = 900;
const SPEED_LAG_MS = 800;
const DURATION_S = 130;
const GRAVITY_DEVICE: [number, number, number] = [-0.706 * 9.81, 0, -0.708 * 9.81];

function speedAt(tauS: number) {
  return 30 + 10 * Math.sin((2 * Math.PI * tauS) / 20);
}

function yawRateAt(tauS: number) {
  return 15 * Math.sin((2 * Math.PI * tauS) / 30);
}

type Truth = { tauS: number; x: number; y: number; headingDeg: number };

function buildTruth(): Truth[] {
  const truth: Truth[] = [];
  let x = 0;
  let y = 0;
  let heading = 20;
  const dt = 0.01;
  for (let step = 0; step <= DURATION_S / dt; step++) {
    const tauS = step * dt;
    truth.push({ tauS, x, y, headingDeg: heading });
    const mid = heading + (yawRateAt(tauS) * dt) / 2;
    x += speedAt(tauS) * Math.sin((mid * Math.PI) / 180) * dt;
    y += speedAt(tauS) * Math.cos((mid * Math.PI) / 180) * dt;
    heading += yawRateAt(tauS) * dt;
  }
  return truth;
}

const TRUTH = buildTruth();

function truthAt(tauS: number): Truth {
  return TRUTH[Math.round(tauS * 100)];
}

function toGeo(x: number, y: number) {
  return { latitude: LAT0 + y / M_LAT, longitude: LNG0 + x / M_LNG };
}

function fixAt(tauS: number, accuracyM: number): BridgeFix & { tauS: number } {
  const point = truthAt(tauS);
  return {
    tauS,
    recordedAt: new Date(T0 + tauS * 1000 + GPS_LATENCY_MS).toISOString(),
    ...toGeo(point.x, point.y),
    speedMps: speedAt(Math.max(0, tauS - SPEED_LAG_MS / 1000)),
    accuracyM,
  };
}

function buildFixes(degraded: (tauS: number) => boolean) {
  const fixes: (BridgeFix & { tauS: number })[] = [];
  for (let tauS = 0; tauS <= DURATION_S; tauS++) {
    fixes.push(fixAt(tauS, degraded(tauS) ? 50 : 5));
  }
  return fixes;
}

type SampleOptions = {
  keep?: (tauS: number) => boolean;
  // Extra heading (degrees) added to the fused yaw at an instant.
  fusedError?: (tauS: number) => number;
  // Extra rate (deg/s) added to the gyro at an instant.
  gyroError?: (tauS: number) => number;
};

function buildSamples(options: SampleOptions = {}): ImuSample[] {
  const samples: ImuSample[] = [];
  const norm = Math.hypot(...GRAVITY_DEVICE);
  const up = GRAVITY_DEVICE.map((c) => -c / norm);
  for (let step = 0; step <= DURATION_S * 50; step++) {
    const tauS = step / 50;
    if (options.keep && !options.keep(tauS)) {
      continue;
    }
    const heading = truthAt(tauS).headingDeg + (options.fusedError?.(tauS) ?? 0);
    const raw = (-heading * Math.PI) / 180 + 1.3;
    // Clockwise heading change is a negative rotation about the up axis.
    const rate = -(yawRateAt(tauS) + (options.gyroError?.(tauS) ?? 0));
    const omega = up.map((c) => c * rate);
    samples.push({
      recordedAt: T0 + tauS * 1000 + IMU_LATENCY_MS,
      yawRad: Math.atan2(Math.sin(raw), Math.cos(raw)),
      rotationRate: [omega[2], omega[1], omega[0]],
      gravity: GRAVITY_DEVICE,
    });
  }
  return samples;
}

function bridgeErrorM(bridge: HoleBridge, fix: BridgeFix & { tauS: number }) {
  const tMs = Date.parse(fix.recordedAt);
  const after = bridge.points.findIndex((point) => point.timeMs >= tMs);
  const b = bridge.points[after];
  const a = bridge.points[Math.max(0, after - 1)];
  const fraction = b.timeMs === a.timeMs ? 0 : (tMs - a.timeMs) / (b.timeMs - a.timeMs);
  const latitude = a.latitude + (b.latitude - a.latitude) * fraction;
  const longitude = a.longitude + (b.longitude - a.longitude) * fraction;
  return Math.hypot((longitude - fix.longitude) * M_LNG, (latitude - fix.latitude) * M_LAT);
}

const inHole = (tauS: number) => tauS >= 60 && tauS <= 80;

// The true path, offset laterally by metres (positive = to the right of
// travel), as a track outline.
function shiftedOutline(offsetM: number, widthMeters: number | null = null): TrackOutline {
  const path = [];
  for (let tauS = 0; tauS <= DURATION_S; tauS += 0.5) {
    const point = truthAt(tauS);
    const rightX = Math.cos((point.headingDeg * Math.PI) / 180);
    const rightY = -Math.sin((point.headingDeg * Math.PI) / 180);
    path.push(toGeo(point.x + rightX * offsetM, point.y + rightY * offsetM));
  }
  return { path, widthMeters };
}

function distanceToPathM(point: { latitude: number; longitude: number }, outline: TrackOutline) {
  const px = point.longitude * M_LNG;
  const py = point.latitude * M_LAT;
  let best = Infinity;
  for (let i = 1; i < outline.path.length; i++) {
    const ax = outline.path[i - 1].longitude * M_LNG;
    const ay = outline.path[i - 1].latitude * M_LAT;
    const dx = outline.path[i].longitude * M_LNG - ax;
    const dy = outline.path[i].latitude * M_LAT - ay;
    const u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(px - (ax + u * dx), py - (ay + u * dy)));
  }
  return best;
}

describe('findDisplayHoles', () => {
  it('reports the trusted fixes on either side of a gap the line leaves open', () => {
    const fixes = buildFixes(inHole);
    const holes = findDisplayHoles(fixes);

    expect(holes).toEqual([
      { fromMs: Date.parse(fixAt(59, 5).recordedAt), toMs: Date.parse(fixAt(81, 5).recordedAt) },
    ]);
  });

  it('reports nothing where quarantined fixes chain across the gap', () => {
    const fixes = buildFixes(inHole);
    const fillers = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => ({ ...fix, accuracyM: 6 }));

    expect(findDisplayHoles(fixes, {}, fillers)).toEqual([]);
  });
});

describe('calibrateImuTimeline', () => {
  it('measures sign and clock offset of both heading sources and the speed lag', () => {
    const fixes = buildFixes(() => false);

    const calibration = calibrateImuTimeline(fixes, buildSamples());

    expect(calibration).not.toBeNull();
    expect(Math.abs(calibration!.speedLagMs - SPEED_LAG_MS)).toBeLessThanOrEqual(50);
    for (const source of [calibration!.fusedYaw, calibration!.gyro]) {
      expect(source).not.toBeNull();
      expect(Math.abs(source!.offsetMs - (IMU_LATENCY_MS - GPS_LATENCY_MS))).toBeLessThanOrEqual(50);
      expect(source!.r2).toBeGreaterThan(0.99);
    }
    expect(calibration!.fusedYaw!.sign).toBe(-1);
    expect(calibration!.gyro!.sign).toBe(1);
  });

  it('drops a heading source that does not follow the course and refuses when both fail', () => {
    const fixes = buildFixes(() => false);
    const noisyYaw = buildSamples().map((sample, index) => ({ ...sample, yawRad: Math.sin(index * 7.1) }));
    const noisyBoth = noisyYaw.map((sample, index) => ({
      ...sample,
      rotationRate: [Math.sin(index * 3.3) * 20, 0, 0] as [number, number, number],
    }));

    const calibration = calibrateImuTimeline(fixes, noisyYaw);
    expect(calibration!.fusedYaw).toBeNull();
    expect(calibration!.gyro).not.toBeNull();
    expect(calibrateImuTimeline(fixes, noisyBoth)).toBeNull();
  });
});

describe('bridgeDisplayHoles', () => {
  it('reconstructs a 22 s hole onto the hidden path within a few metres', () => {
    const fixes = buildFixes(inHole);

    const bridges = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples: buildSamples() });

    expect(bridges).toHaveLength(1);
    const errors = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => bridgeErrorM(bridges[0], fix));
    expect(Math.max(...errors)).toBeLessThan(3);
    expect(bridges[0].closureMissM).toBeLessThan(8);
    expect(bridges[0].boundedShare).toBe(0);
    expect(bridges[0].points[0].timeMs).toBe(Date.parse(fixAt(59, 5).recordedAt));
    expect(bridges[0].points[bridges[0].points.length - 1].timeMs).toBe(Date.parse(fixAt(81, 5).recordedAt));
  });

  it('keeps the gyro when the fused yaw is pulled inside the hole', () => {
    const fixes = buildFixes(inHole);
    // A pull that builds up through the hole and stays, as a structure's
    // magnetic field does to the fused yaw.
    const samples = buildSamples({ fusedError: (tauS) => Math.min(1, Math.max(0, (tauS - 60) / 20)) * 12 });

    const [bridge] = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples });

    expect(bridge.headingSource).toBe('gyro');
    const errors = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => bridgeErrorM(bridge, fix));
    expect(Math.max(...errors)).toBeLessThan(3);
  });

  it('keeps the fused yaw when the gyro drifts inside the hole', () => {
    const fixes = buildFixes(inHole);
    const samples = buildSamples({ gyroError: (tauS) => (inHole(tauS) ? 0.6 : 0) });

    const [bridge] = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples });

    expect(bridge.headingSource).toBe('fusedYaw');
    const errors = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => bridgeErrorM(bridge, fix));
    expect(Math.max(...errors)).toBeLessThan(3);
  });

  it('leaves a silent hole open', () => {
    const fixes = buildFixes(inHole).filter((fix) => !inHole(fix.tauS));

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples: buildSamples() })).toEqual([]);
  });

  it('leaves a hole longer than 45 s open', () => {
    const fixes = buildFixes((tauS) => tauS >= 40 && tauS <= 100);

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples: buildSamples() })).toEqual([]);
  });

  it('leaves a hole open when the car stops inside it', () => {
    const fixes = buildFixes(inHole).map((fix) => (fix.tauS === 70 ? { ...fix, speedMps: 1 } : fix));

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples: buildSamples() })).toEqual([]);
  });

  it('leaves a hole open when IMU samples are missing inside it', () => {
    const fixes = buildFixes(inHole);
    const samples = buildSamples({ keep: (tauS) => tauS < 65 || tauS > 70 });

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples })).toEqual([]);
  });

  it('leaves a hole open when the bridge strays far from the track outline', () => {
    const fixes = buildFixes(inHole);

    expect(
      bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, samples: buildSamples(), outline: shiftedOutline(300) })
    ).toEqual([]);
  });

  it('moves interior points beyond the ribbon edge onto it, keeps the anchors, and leaves points inside alone', () => {
    const fixes = buildFixes(inHole);
    const holes = findDisplayHoles(fixes);
    const outline = shiftedOutline(8);

    const [narrow] = bridgeDisplayHoles({ holes, fixes, samples: buildSamples(), outline });
    const [wide] = bridgeDisplayHoles({ holes, fixes, samples: buildSamples(), outline: { ...outline, widthMeters: 20 } });

    expect(narrow.boundedShare).toBeGreaterThan(0.9);
    const [first, last] = [narrow.points[0], narrow.points[narrow.points.length - 1]];
    const [anchorA, anchorB] = [fixAt(59, 5), fixAt(81, 5)];
    expect(Math.hypot((first.longitude - anchorA.longitude) * M_LNG, (first.latitude - anchorA.latitude) * M_LAT)).toBeLessThan(0.01);
    expect(Math.hypot((last.longitude - anchorB.longitude) * M_LNG, (last.latitude - anchorB.latitude) * M_LAT)).toBeLessThan(0.01);
    for (const point of narrow.points.slice(1, -1)) {
      expect(distanceToPathM(point, outline)).toBeLessThanOrEqual(6.2);
    }
    expect(wide.boundedShare).toBe(0);
  });

  it('uses quarantined fixes for speed only, whatever accuracy they report', () => {
    const fixes = buildFixes(inHole);
    // Displaced fixes with a confident accuracy, as a rejected jump has, next
    // to both anchors and every second inside the hole: the only speed the
    // hole has, and positions that would wreck the anchors if trusted.
    const quarantined = [55, 56, 57, 58, ...Array.from({ length: 21 }, (_, i) => 60 + i), 82, 83, 84, 85].map(
      (tauS) => ({ ...fixAt(tauS, 5), latitude: fixAt(tauS, 5).latitude + 500 / M_LAT })
    );

    const withSpeedOnly = fixes.filter((fix) => !inHole(fix.tauS));
    const [bridge] = bridgeDisplayHoles({
      holes: findDisplayHoles(withSpeedOnly),
      fixes: withSpeedOnly,
      quarantined,
      samples: buildSamples(),
    });

    expect(bridge).toBeDefined();
    const errors = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => bridgeErrorM(bridge, fix));
    expect(Math.max(...errors)).toBeLessThan(3);
  });

  it('leaves a hole open when an anchor is not an accepted fix', () => {
    const fixes = buildFixes(inHole);
    const [hole] = findDisplayHoles(fixes);

    expect(bridgeDisplayHoles({ holes: [{ ...hole, fromMs: hole.fromMs + 500 }], fixes, samples: buildSamples() })).toEqual([]);
  });
});
