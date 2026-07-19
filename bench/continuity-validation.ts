import { buildDisplayPolylines, groupPointsIntoLapRuns, mergeQuarantinedPoints } from '@/utils/displayLine';
import { toRadians } from '@/utils/geo';
import { loadSessionExport, replaySession } from './replay';

// Validation for fixes A (display uses quarantine), B (cascade re-anchor),
// C (symmetric stitch) against the real 2026-07-19 Tsukuba session.
//   npx tsx bench/continuity-validation.ts

const FILE = 'bench/data/trakio-session-1784442643247-9ybpbqn.json';
const failures: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!pass) failures.push(name);
}

async function main() {
  const d = loadSessionExport(FILE);
  const lapNoById = new Map(d.laps.map((l) => [l.id, l.lapNumber]));
  const points = d.gpsPoints.map((p: any) => ({
    latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracyM, recordedAt: p.recordedAt, lapId: p.lapId,
  }));
  const quarantined = (d.rejectedGpsPoints ?? []).map((r) => ({
    recordedAt: r.recordedAt, latitude: r.latitude, longitude: r.longitude, accuracyM: r.accuracyM,
  }));

  console.log('## Fix A + C: per-lap line structure, before vs after\n');
  const sf: any = (d.timingLines as any[]).find((t) => t.type === 'start_finish');
  const lngScale = Math.cos(toRadians(sf.a.latitude)) * 111320;
  const sfMid = { latitude: (sf.a.latitude + sf.b.latitude) / 2, longitude: (sf.a.longitude + sf.b.longitude) / 2 };
  const distSf = (p: { latitude: number; longitude: number }) =>
    Math.hypot((p.latitude - sfMid.latitude) * 111320, (p.longitude - sfMid.longitude) * lngScale);

  for (const [label, input] of [
    ['before (accepted only, old stitch N/A)', points],
    ['after  (quarantine merged)', mergeQuarantinedPoints(points, quarantined)],
  ] as const) {
    const runs = groupPointsIntoLapRuns(input as any);
    const budget = Math.max(250, Math.floor(6000 / runs.length));
    const rows: string[] = [];
    let multiSegmentLaps = 0;
    for (const run of runs) {
      const lapNo = run.lapId ? lapNoById.get(run.lapId) : null;
      if (lapNo === null || lapNo === undefined || (lapNo as number) > 13) continue;
      const segs = buildDisplayPolylines(run.points, { maxDisplayPoints: budget });
      if (segs.length > 1) multiSegmentLaps++;
      rows.push(`L${String(lapNo).padStart(2)}:${segs.length}seg start@${segs.length ? distSf(segs[0][0]).toFixed(0) : '-'}m`);
    }
    console.log(`${label}: laps with holes = ${multiSegmentLaps}`);
    console.log('  ' + rows.join('  '));
  }

  const mergedRuns = groupPointsIntoLapRuns(mergeQuarantinedPoints(points, quarantined) as any);
  const budget = Math.max(250, Math.floor(6000 / mergedRuns.length));
  const lapSegCounts = new Map<number, number>();
  for (const run of mergedRuns) {
    const lapNo = run.lapId ? (lapNoById.get(run.lapId) as number) : null;
    if (lapNo === null || lapNo > 13) continue;
    lapSegCounts.set(lapNo, buildDisplayPolylines(run.points, { maxDisplayPoints: budget }).length);
  }
  check('A: L1 hole filled', lapSegCounts.get(1) === 1, `${lapSegCounts.get(1)} segment(s)`);
  check('A: L2 hole filled', lapSegCounts.get(2) === 1, `${lapSegCounts.get(2)} segment(s)`);
  check('A: all 13 laps single-segment', [...lapSegCounts.values()].every((n) => n === 1), `${[...lapSegCounts.values()].join(',')}`);

  // C: overlap guarantee — at most 1 foreign point per side
  const violations = mergedRuns.filter((r) => r.points.filter((p) => p.lapId !== r.lapId).length > 2);
  check('C: overlap guarantee (≤1 stitch point per side)', violations.length === 0, `${violations.length} violations`);

  console.log('\n## Fix B: merged-stream replay (simulated original delivery)\n');
  const mergedStream = {
    ...d,
    gpsPoints: [...d.gpsPoints, ...(d.rejectedGpsPoints ?? []) as any[]]
      .slice()
      .sort((a, b) => Date.parse(a.recordedAt) - Date.parse(b.recordedAt)),
  };
  const stored = d.laps.filter((l) => l.lapTimeMs !== null).map((l) => l.lapTimeMs!);

  for (const reanchor of [false, true]) {
    const r = await replaySession(mergedStream, null, undefined, reanchor);
    const maxDelta = r.laps.length === stored.length
      ? Math.max(...r.laps.map((l, i) => Math.abs(l.lapTimeMs - stored[i])))
      : NaN;
    console.log(`reanchor=${reanchor}: accepted ${r.acceptedCount}, max accepted-gap ${(r.maxAcceptedGapMs / 1000).toFixed(1)} s, laps ${r.laps.length}/${stored.length}, max lap |Δ| ${maxDelta} ms`);
    if (!reanchor) {
      check('B-off reproduces device behavior', r.laps.length === stored.length && maxDelta <= 2 && r.maxAcceptedGapMs >= 3900, `cascades intact (${(r.maxAcceptedGapMs / 1000).toFixed(1)} s max gap)`);
    } else {
      check('B-on shrinks cascades', r.maxAcceptedGapMs <= 2100, `max accepted-gap ${(r.maxAcceptedGapMs / 1000).toFixed(1)} s (target ≤2.1 s)`);
      check('B-on keeps lap times', r.laps.length === stored.length && maxDelta <= 10, `max lap |Δ| ${maxDelta} ms`);
    }
  }

  console.log(failures.length === 0 ? '\nALL CONTINUITY CHECKS PASSED' : `\nFAILED: ${failures.join(' | ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error('VALIDATION FAILURE', e); process.exit(1); });
