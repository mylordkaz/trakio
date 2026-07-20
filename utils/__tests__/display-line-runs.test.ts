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

    expect(l1.fillers).toHaveLength(0);
    expect(l2.fillers.some((p) => p.recordedAt === pastLine.recordedAt)).toBe(true);

    // Rendered: both laps still start/end on the line.
    const l1Rendered = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 }, l1.fillers);
    const l1Last = l1Rendered[l1Rendered.length - 1];
    expect(yOf(l1Last[l1Last.length - 1])).toBeCloseTo(100, 5);
    const l2Rendered = buildDisplayPolylines(l2.points, { maxDisplayPoints: 500 }, l2.fillers);
    expect(yOf(l2Rendered[0][0])).toBeCloseTo(100, 5);
  });

  it('fillers in continuous regions never alter the rendered line', () => {
    const midLap = quarantinedAt(0, 175, 4.5);
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [midLap]);
    const l1 = runs[1];
    expect(l1.fillers.some((p) => p.recordedAt === midLap.recordedAt)).toBe(true);

    // The trusted stream has no hole here, so the filler is never consulted:
    // the rendered polylines are identical with and without it.
    const withFiller = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 }, l1.fillers);
    const without = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 });
    expect(withFiller).toEqual(without);
  });

  it('an isolated jump cannot detach a clip from the rendered line', () => {
    // The round-5 repro: a good-accuracy quarantined jump between the last
    // trusted fix and the end clip. Merged-stream rendering split around it
    // and dropped the then-singleton clip; with trusted-stream segmentation
    // the jump is never consulted (no hole exists) and both rendered
    // endpoints stay on the line.
    const isolated = { ...quarantinedAt(300, 60, 6.2), accuracyM: 4 };
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [isolated]);
    const l1 = runs[1];

    const rendered = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 }, l1.fillers);
    expect(rendered).toHaveLength(1);
    expect(yOf(rendered[0][0])).toBeCloseTo(100, 5);
    expect(yOf(rendered[0][rendered[0].length - 1])).toBeCloseTo(100, 5);
  });

  it('bridges a trusted hole only with a fully connected quarantined chain', () => {
    // Trusted stream with a real hole (6 s, 180 m): a complete 1 Hz chain of
    // quarantined fixes closes it; a chain broken by one garbage fix leaves
    // the honest gap and renders nothing from quarantine.
    const trusted = [
      point(0, 0, 0, 'L1'),
      point(0, 30, 1, 'L1'),
      point(0, 60, 2, 'L1'),
      point(0, 240, 8, 'L1'),
      point(0, 270, 9, 'L1'),
    ];
    const chain = [3, 4, 5, 6, 7].map((t) => quarantinedAt(0, 30 * t, t));

    expect(buildDisplayPolylines(trusted, {}, [])).toHaveLength(2);
    expect(buildDisplayPolylines(trusted, {}, chain)).toHaveLength(1);

    const broken = chain.map((q, i) => (i === 2 ? quarantinedAt(400, 150, 5) : q));
    expect(buildDisplayPolylines(trusted, {}, broken)).toHaveLength(2);
  });

  it('clips a re-anchored boundary at the STORED crossing position', () => {
    // Displaced anchor (12, 110) accepted into L1; the true fixes r1 (t=5,
    // quarantined) and r2 (t=6, re-anchored into L2) carried the real path.
    // Timing crossed on the chain r1->r2 at (50, 165) and froze that
    // position into the lap row — the clip is that stored point, not the
    // accepted anchor->r2 chord's interpolation (which would give ~(40.5,
    // 162.5)).
    const accepted: LapRunPoint[] = [
      point(50, 60, 2, 'L1'),
      point(50, 90, 3, 'L1'),
      point(12, 110, 4, 'L1'),
      point(50, 180, 6, 'L2'),
      point(50, 210, 7, 'L2'),
    ];
    const rejectedChain = [quarantinedAt(50, 150, 5)];
    const laps = [{
      id: 'L2',
      startedAt: startedAt(5.5),
      startedLatitude: LAT0 + 165 / M_LAT,
      startedLongitude: LNG0 + 50 / M_LNG,
    }];

    const runs = groupPointsIntoLapRuns(accepted, laps, rejectedChain);
    const boundary = runs[0].points[runs[0].points.length - 1];
    expect(xOf(boundary)).toBeCloseTo(50, 6);
    expect(yOf(boundary)).toBeCloseTo(165, 6);
    expect(runs[1].points[0].latitude).toBe(boundary.latitude);
  });

  it('interpolates the accepted path at startedAt for legacy laps without a stored position', () => {
    const runs = groupPointsIntoLapRuns(POINTS, LAPS); // LAPS carry no positions
    const l1 = runs[1];
    expect(yOf(l1.points[0])).toBeCloseTo(100, 6);
    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
  });

  it('never lets a good-accuracy isolated jump steer a clip — grouped or rendered', () => {
    // A 4 m-accuracy quarantined fix with a garbage position near the
    // crossing time: accuracy is no credential — quarantine participates in
    // neither clip geometry nor the trusted segmentation.
    const isolatedJump = { ...quarantinedAt(400, 835, 6.4), accuracyM: 4 };
    const runs = groupPointsIntoLapRuns(POINTS, LAPS, [isolatedJump]);
    const [, l1, l2] = runs;

    expect(yOf(l1.points[l1.points.length - 1])).toBeCloseTo(100, 6);
    expect(xOf(l1.points[l1.points.length - 1])).toBeCloseTo(0, 6);
    expect(yOf(l2.points[0])).toBeCloseTo(100, 6);

    const l1Rendered = buildDisplayPolylines(l1.points, { maxDisplayPoints: 500 }, l1.fillers);
    const l1Last = l1Rendered[l1Rendered.length - 1];
    expect(l1Rendered).toHaveLength(1);
    expect(yOf(l1Last[l1Last.length - 1])).toBeCloseTo(100, 5);
    const l2Rendered = buildDisplayPolylines(l2.points, { maxDisplayPoints: 500 }, l2.fillers);
    expect(yOf(l2Rendered[0][0])).toBeCloseTo(100, 5);
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
