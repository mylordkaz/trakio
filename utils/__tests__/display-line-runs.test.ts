import { groupPointsIntoLapRuns, type LapRunPoint, type QuarantinedDisplayPoint } from '@/utils/displayLine';
import type { TimingLineRow } from '@/db/types';

// Lap runs are clipped at the start/finish line: every lap starts and ends
// at its own interpolated crossing, consecutive laps share that exact point,
// and quarantined fixes are bucketed by the crossing time — a fix rejected
// during the crossing second lands in the following lap and can never
// displace a clip.

const LAT0 = 35;
const LNG0 = 139;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;

function point(xM: number, yM: number, tS: number, lapId: string | null): LapRunPoint {
  return {
    latitude: LAT0 + yM / M_LAT,
    longitude: LNG0 + xM / M_LNG,
    accuracyM: 4,
    recordedAt: new Date(T0 + tS * 1000).toISOString(),
    lapId,
  };
}

function quarantinedAt(xM: number, yM: number, tS: number): QuarantinedDisplayPoint {
  return {
    latitude: LAT0 + yM / M_LAT,
    longitude: LNG0 + xM / M_LNG,
    accuracyM: 5,
    recordedAt: new Date(T0 + tS * 1000).toISOString(),
  };
}

function yOf(p: { latitude: number }) {
  return (p.latitude - LAT0) * M_LAT;
}

// Gate: horizontal at y=100, x in [-50, 50].
const GATE: TimingLineRow = {
  id: 'sf',
  trackId: 't',
  name: 'SF',
  type: 'start_finish',
  seq: 0,
  a: { latitude: LAT0 + 100 / M_LAT, longitude: LNG0 - 50 / M_LNG },
  b: { latitude: LAT0 + 100 / M_LAT, longitude: LNG0 + 50 / M_LNG },
  createdAt: '',
  updatedAt: '',
} as TimingLineRow;

// Northbound along x=0, crossing the gate at each lap boundary:
// out-lap below the line, L1 goes past it and returns, L2 goes past again.
const POINTS: LapRunPoint[] = [
  point(0, 0, 0, null),
  point(0, 30, 1, null),
  point(0, 60, 2, null), // out-lap ends below the line
  point(0, 120, 3, 'L1'), // boundary segment t2->t3 crosses y=100 at t≈2.67
  point(0, 150, 4, 'L1'),
  point(0, 120, 5, 'L1'),
  point(0, 60, 6, 'L1'), // L1 ends below the line
  point(0, 120, 7, 'L2'), // boundary segment t6->t7 crosses y=100 at t≈6.67
  point(0, 150, 8, 'L2'),
];

describe('groupPointsIntoLapRuns clipping', () => {
  it('clips every lap to start and end exactly on the line', () => {
    const runs = groupPointsIntoLapRuns(POINTS, GATE);
    expect(runs.map((r) => r.lapId)).toEqual([null, 'L1', 'L2']);

    const l1 = runs[1];
    expect(yOf(l1.points[0])).toBeCloseTo(100, 6);
    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
  });

  it('makes consecutive runs share the exact clip point', () => {
    const runs = groupPointsIntoLapRuns(POINTS, GATE);
    const [outLap, l1, l2] = runs;
    const outEnd = outLap.points[outLap.points.length - 1];
    const l1End = l1.points[l1.points.length - 1];
    expect(l1.points[0].latitude).toBe(outEnd.latitude);
    expect(l1.points[0].longitude).toBe(outEnd.longitude);
    expect(l2.points[0].latitude).toBe(l1End.latitude);
    expect(l2.points[0].longitude).toBe(l1End.longitude);
  });

  it('adds no stitch at all without a start/finish line', () => {
    const runs = groupPointsIntoLapRuns(POINTS);
    expect(runs[1].points).toHaveLength(4); // L1's own points only
  });

  it('buckets a crossing-second quarantined fix into the following lap without displacing clips', () => {
    // Rejected fix 0.13 s after the L1->L2 crossing (t≈6.67), already past
    // the line — the finding-2 scenario.
    const pastLine = quarantinedAt(0, 108, 6.8);
    const runs = groupPointsIntoLapRuns(POINTS, GATE, [pastLine]);
    const [, l1, l2] = runs;

    // Clips unchanged: L1 still ends on the line, L2 still starts there.
    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
    expect(yOf(l2.points[0])).toBeCloseTo(100, 6);

    // The fix belongs to L2, between the clip and L2's first accepted point.
    expect(l1.points.some((p) => p.recordedAt === pastLine.recordedAt)).toBe(false);
    expect(l2.points[1].recordedAt).toBe(pastLine.recordedAt);
    expect(l2.points[1].lapId).toBe('L2');
  });

  it('merges mid-lap quarantined fixes into the run in time order', () => {
    const midLap = quarantinedAt(0, 135, 4.5);
    const runs = groupPointsIntoLapRuns(POINTS, GATE, [midLap]);
    const l1 = runs[1];
    const index = l1.points.findIndex((p) => p.recordedAt === midLap.recordedAt);
    expect(index).toBe(3); // clip, t3, t4, then the merged fix
    expect(l1.points[index].lapId).toBe('L1');
  });
});
