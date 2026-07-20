import { buildDisplayPolylines, groupPointsIntoLapRuns, type LapRunPoint, type QuarantinedDisplayPoint } from '@/utils/displayLine';

// Lap runs are clipped at the STORED crossing times (laps.startedAt): the
// clip point is the recorded path's position at the moment timing froze.
// Consecutive laps share that exact point, quarantined fixes are bucketed by
// the same times, and clip points are structural (accuracyM null) so the
// display accuracy filter can never delete a lap's endpoint.

const LAT0 = 35;
const LNG0 = 139;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;

function point(xM: number, yM: number, tS: number, lapId: string | null, accuracyM = 4): LapRunPoint {
  return {
    latitude: LAT0 + yM / M_LAT,
    longitude: LNG0 + xM / M_LNG,
    accuracyM,
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

const yOf = (p: { latitude: number }) => (p.latitude - LAT0) * M_LAT;
const xOf = (p: { longitude: number }) => (p.longitude - LNG0) * M_LNG;
const startedAt = (tS: number) => new Date(T0 + tS * 1000).toISOString();

// Northbound along x=0. The (conceptual) start/finish line sits at y=100;
// timing recorded the crossings at t=2.5 s and t=6.5 s — exactly where the
// path passes y=100.
const POINTS: LapRunPoint[] = [
  point(0, 0, 0, null),
  point(0, 25, 1, null),
  point(0, 50, 2, null), // out-lap ends below the line
  point(0, 150, 3, 'L1'), // crossing at t=2.5, y=100
  point(0, 200, 4, 'L1'),
  point(0, 150, 5, 'L1'),
  point(0, 50, 6, 'L1'), // L1 returns below the line
  point(0, 150, 7, 'L2'), // crossing at t=6.5, y=100
  point(0, 200, 8, 'L2'),
];
const LAPS = [
  { id: 'L1', startedAt: startedAt(2.5) },
  { id: 'L2', startedAt: startedAt(6.5) },
];

describe('groupPointsIntoLapRuns time-based clipping', () => {
  it('clips every lap to the path position at its stored crossing times', () => {
    const runs = groupPointsIntoLapRuns(POINTS, LAPS);
    expect(runs.map((r) => r.lapId)).toEqual([null, 'L1', 'L2']);

    const l1 = runs[1];
    expect(yOf(l1.points[0])).toBeCloseTo(100, 6);
    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
  });

  it('makes consecutive runs share the exact clip point', () => {
    const runs = groupPointsIntoLapRuns(POINTS, LAPS);
    const [outLap, l1, l2] = runs;
    const outEnd = outLap.points[outLap.points.length - 1];
    const l1End = l1.points[l1.points.length - 1];
    expect(l1.points[0].latitude).toBe(outEnd.latitude);
    expect(l1.points[0].longitude).toBe(outEnd.longitude);
    expect(l2.points[0].latitude).toBe(l1End.latitude);
    expect(l2.points[0].longitude).toBe(l1End.longitude);
  });

  it('adds no clip without lap start times', () => {
    const runs = groupPointsIntoLapRuns(POINTS);
    expect(runs[1].points).toHaveLength(4); // L1's own points only
  });

  it('buckets a crossing-second quarantined fix into the following lap without displacing clips', () => {
    // Rejected fix 0.3 s after the L1->L2 crossing, already past the line.
    const pastLine = quarantinedAt(0, 130, 6.8);
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [pastLine]);
    const [, l1, l2] = runs;

    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
    expect(yOf(l2.points[0])).toBeCloseTo(100, 6);

    expect(l1.points.some((p) => p.recordedAt === pastLine.recordedAt)).toBe(false);
    expect(l2.points[1].recordedAt).toBe(pastLine.recordedAt);
    expect(l2.points[1].lapId).toBe('L2');
  });

  it('merges mid-lap quarantined fixes into the run in time order', () => {
    const midLap = quarantinedAt(0, 175, 4.5);
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [midLap]);
    const l1 = runs[1];
    const index = l1.points.findIndex((p) => p.recordedAt === midLap.recordedAt);
    expect(index).toBe(3); // clip, t3, t4, then the merged fix
    expect(l1.points[index].lapId).toBe('L1');
  });

  it('clips a re-anchored boundary on the chain the detector timed', () => {
    // Displaced anchor (12, 110) accepted into L1; the true fixes r1 (t=5,
    // quarantined) and r2 (t=6, re-anchored into L2) carried the real path.
    // Timing put the crossing at t=5.5 on the chain r1->r2 — the clip must
    // land there (50, 165), not on the accepted anchor->r2 chord.
    const accepted: LapRunPoint[] = [
      point(50, 60, 2, 'L1'),
      point(50, 90, 3, 'L1'),
      point(12, 110, 4, 'L1'),
      point(50, 180, 6, 'L2'),
      point(50, 210, 7, 'L2'),
    ];
    const rejectedChain = [quarantinedAt(50, 150, 5)];
    const laps = [{ id: 'L2', startedAt: startedAt(5.5) }];

    const runs = groupPointsIntoLapRuns(accepted, laps, rejectedChain);
    const boundary = runs[0].points[runs[0].points.length - 1];
    expect(xOf(boundary)).toBeCloseTo(50, 6);
    expect(yOf(boundary)).toBeCloseTo(165, 6);
    expect(runs[1].points[0].latitude).toBe(boundary.latitude);
  });

  it('never lets an undrawable quarantined outlier steer a clip', () => {
    // A poor-accuracy rejected fix near the crossing time would drag the
    // interpolated clip far off the path — and the clip (accuracyM null) is
    // unfilterable. Quarantined points must pass the display accuracy gate
    // before they can influence structural geometry.
    const outlier = { ...quarantinedAt(400, 900, 6.4), accuracyM: 500 };
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [outlier]);
    const [, l1, l2] = runs;

    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
    expect(xOf(l1.points[l1.points.length - 1])).toBeCloseTo(0, 6);
    expect(yOf(l2.points[0])).toBeCloseTo(100, 6);
  });

  it('keeps clips renderable when a boundary fix has degraded accuracy', () => {
    // Capture accepts up to 40 m; display drops fixes above 15 m. A 20 m
    // boundary fix must not delete the laps' shared structural endpoint.
    const degraded = POINTS.map((p, i) => (i === 7 ? { ...p, accuracyM: 20 } : p));
    const runs = groupPointsIntoLapRuns(degraded, LAPS);
    const [, l1, l2] = runs;

    expect(l1.points[l1.points.length - 1].accuracyM).toBeNull();

    const l1Rendered = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 });
    const l1LastSeg = l1Rendered[l1Rendered.length - 1];
    expect(yOf(l1LastSeg[l1LastSeg.length - 1])).toBeCloseTo(100, 5);

    const l2Rendered = buildDisplayPolylines(l2.points, { maxDisplayPoints: 500 });
    expect(yOf(l2Rendered[0][0])).toBeCloseTo(100, 5);
  });
});
