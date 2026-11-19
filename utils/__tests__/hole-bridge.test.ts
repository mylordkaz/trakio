import { findDisplayHoles } from '@/utils/displayLine';
import {
  bridgeDisplayHoles,
  calibrateImuTimeline,
  splitBridgesByLap,
  type BridgeFix,
  type HoleBridge,
  type YawSample,
} from '@/utils/holeBridge';

// A synthetic drive with the clock structure of a real phone capture: fixes
// stamped 1 s after the instant they describe, reported speed describing the
// instant 0.8 s before its fix, yaw stamped 0.9 s after its instant with the
// W3C sign (counterclockwise positive) and an arbitrary zero.

const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const LAT0 = 36.5;
const LNG0 = 140.2;
const M_LAT = 111320;
const M_LNG = M_LAT * Math.cos((LAT0 * Math.PI) / 180);
const GPS_LATENCY_MS = 1000;
const YAW_LATENCY_MS = 900;
const SPEED_LAG_MS = 800;
const DURATION_S = 130;

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

function fixAt(tauS: number, accuracyM: number): BridgeFix & { tauS: number } {
  const point = truthAt(tauS);
  return {
    tauS,
    recordedAt: new Date(T0 + tauS * 1000 + GPS_LATENCY_MS).toISOString(),
    latitude: LAT0 + point.y / M_LAT,
    longitude: LNG0 + point.x / M_LNG,
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

function buildYaw(sign: 1 | -1, keep: (tauS: number) => boolean = () => true): YawSample[] {
  const samples: YawSample[] = [];
  for (let step = 0; step <= DURATION_S * 50; step++) {
    const tauS = step / 50;
    if (!keep(tauS)) {
      continue;
    }
    const raw = (sign * truthAt(tauS).headingDeg * Math.PI) / 180 + 1.3;
    samples.push({
      recordedAt: T0 + tauS * 1000 + YAW_LATENCY_MS,
      yawRad: Math.atan2(Math.sin(raw), Math.cos(raw)),
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
  it('measures yaw sign, yaw clock offset and speed lag from the trusted fixes', () => {
    const fixes = buildFixes(() => false);

    const calibration = calibrateImuTimeline(fixes, buildYaw(-1));

    expect(calibration).not.toBeNull();
    expect(calibration!.yawSign).toBe(-1);
    expect(Math.abs(calibration!.yawOffsetMs - (YAW_LATENCY_MS - GPS_LATENCY_MS))).toBeLessThanOrEqual(50);
    expect(Math.abs(calibration!.speedLagMs - SPEED_LAG_MS)).toBeLessThanOrEqual(50);
    expect(calibration!.r2).toBeGreaterThan(0.99);
    expect(calibrateImuTimeline(fixes, buildYaw(1))!.yawSign).toBe(1);
  });

  it('refuses a yaw stream that does not follow the course', () => {
    const fixes = buildFixes(() => false);
    const noise = buildYaw(-1).map((sample, index) => ({ ...sample, yawRad: Math.sin(index * 7.1) }));

    expect(calibrateImuTimeline(fixes, noise)).toBeNull();
  });
});

describe('bridgeDisplayHoles', () => {
  it('reconstructs a 22 s hole onto the hidden path within a few metres', () => {
    const fixes = buildFixes(inHole);
    const yaw = buildYaw(-1);

    const bridges = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw });

    expect(bridges).toHaveLength(1);
    const errors = fixes.filter((fix) => inHole(fix.tauS)).map((fix) => bridgeErrorM(bridges[0], fix));
    expect(Math.max(...errors)).toBeLessThan(3);
    expect(bridges[0].closureMissM).toBeLessThan(8);
    expect(bridges[0].points[0].timeMs).toBe(Date.parse(fixAt(59, 5).recordedAt));
    expect(bridges[0].points[bridges[0].points.length - 1].timeMs).toBe(Date.parse(fixAt(81, 5).recordedAt));
  });

  it('leaves a silent hole open', () => {
    const fixes = buildFixes(inHole).filter((fix) => !inHole(fix.tauS));

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1) })).toEqual([]);
  });

  it('leaves a hole longer than 45 s open', () => {
    const fixes = buildFixes((tauS) => tauS >= 40 && tauS <= 100);

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1) })).toEqual([]);
  });

  it('leaves a hole open when the car stops inside it', () => {
    const fixes = buildFixes(inHole).map((fix) =>
      fix.tauS === 70 ? { ...fix, speedMps: 1 } : fix
    );

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1) })).toEqual([]);
  });

  it('leaves a hole open when yaw is missing inside it', () => {
    const fixes = buildFixes(inHole);
    const yaw = buildYaw(-1, (tauS) => tauS < 65 || tauS > 70);

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw })).toEqual([]);
  });

  it('leaves a hole open when the bridge strays from the track outline', () => {
    const fixes = buildFixes(inHole);
    const outline = fixes.map((fix) => ({ latitude: fix.latitude + 300 / M_LAT, longitude: fix.longitude }));

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1), outline })).toEqual([]);
  });

  it('keeps the bridge when it stays on the track outline', () => {
    const fixes = buildFixes(inHole);
    const outline = fixes.map((fix) => ({ latitude: fix.latitude, longitude: fix.longitude }));

    expect(bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1), outline })).toHaveLength(1);
  });
});

describe('splitBridgesByLap', () => {
  it('splits a bridge at the stored lap boundary and shares the boundary point', () => {
    const fixes = buildFixes(inHole);
    const [bridge] = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1) });
    const boundaryAt = fixAt(70, 5).recordedAt;

    const groups = splitBridgesByLap(
      [bridge],
      [
        { id: 'lap-1', startedAt: fixAt(0, 5).recordedAt, endedAt: boundaryAt },
        { id: 'lap-2', startedAt: boundaryAt, endedAt: null },
      ]
    );

    expect(groups.map((group) => group.lapId)).toEqual(['lap-1', 'lap-2']);
    expect(groups[0].points[groups[0].points.length - 1]).toEqual(groups[1].points[0]);
    expect(groups[0].points.length + groups[1].points.length).toBe(bridge.points.length + 1);
  });

  it('assigns points outside every lap to no lap', () => {
    const fixes = buildFixes(inHole);
    const [bridge] = bridgeDisplayHoles({ holes: findDisplayHoles(fixes), fixes, yaw: buildYaw(-1) });

    const groups = splitBridgesByLap([bridge], [{ id: 'lap-1', startedAt: fixAt(100, 5).recordedAt, endedAt: null }]);

    expect(groups).toEqual([{ lapId: null, points: bridge.points.map(({ latitude, longitude }) => ({ latitude, longitude })) }]);
  });
});
