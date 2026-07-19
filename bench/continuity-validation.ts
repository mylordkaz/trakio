import * as fs from 'fs';
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
  // Perpendicular distance to the start/finish line in the local metric plane
  // — "starts at the line" means this is ~0 for every lap's first/last point.
  const makeDistToLine = (line: any) => {
    const scale = Math.cos(toRadians(line.a.latitude)) * 111320;
    const ax = line.a.longitude * scale;
    const ay = line.a.latitude * 111320;
    const bx = line.b.longitude * scale;
    const by = line.b.latitude * 111320;
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    return (p: { latitude: number; longitude: number }) =>
      Math.abs(dy * (p.longitude * scale) - dx * (p.latitude * 111320) + bx * ay - by * ax) / length;
  };
  const distSf = makeDistToLine(sf);

  for (const [label, input] of [
    ['before (accepted only)', points],
    ['after  (quarantine merged)', mergeQuarantinedPoints(points, quarantined)],
  ] as const) {
    const runs = groupPointsIntoLapRuns(input as any, sf);
    const budget = Math.max(250, Math.floor(6000 / runs.length));
    const rows: string[] = [];
    let multiSegmentLaps = 0;
    for (const run of runs) {
      const lapNo = run.lapId ? lapNoById.get(run.lapId) : null;
      if (lapNo === null || lapNo === undefined || (lapNo as number) > 13) continue;
      const segs = buildDisplayPolylines(run.points, { maxDisplayPoints: budget });
      if (segs.length > 1) multiSegmentLaps++;
      rows.push(`L${String(lapNo).padStart(2)}:${segs.length}seg start@${segs.length ? distSf(segs[0][0]).toFixed(1) : '-'}m`);
    }
    console.log(`${label}: laps with holes = ${multiSegmentLaps}`);
    console.log('  ' + rows.join('  '));
  }

  const mergedRuns = groupPointsIntoLapRuns(mergeQuarantinedPoints(points, quarantined) as any, sf);
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

  // C: every lap's rendered line starts AND ends on the start/finish line
  // (the requirement), and consecutive laps share the exact clip point (the
  // no-overlap proof). Checked on both real Tsukuba sessions.
  const endpointStats = (
    runs: ReturnType<typeof groupPointsIntoLapRuns>,
    dist: (p: { latitude: number; longitude: number }) => number,
    lapNos: Map<string, number>,
    maxLapNo: number,
    runBudget: number
  ) => {
    let maxD = 0;
    let offLine = 0;
    let lapsChecked = 0;
    for (const run of runs) {
      const lapNo = run.lapId ? lapNos.get(run.lapId) : null;
      if (lapNo === null || lapNo === undefined || lapNo > maxLapNo) continue;
      const segs = buildDisplayPolylines(run.points, { maxDisplayPoints: runBudget });
      if (segs.length === 0) continue;
      const first = segs[0][0];
      const lastSeg = segs[segs.length - 1];
      const last = lastSeg[lastSeg.length - 1];
      for (const p of [first, last]) {
        const dd = dist(p);
        maxD = Math.max(maxD, dd);
        if (dd > 2) offLine++;
      }
      lapsChecked++;
    }
    return { maxD, offLine, lapsChecked };
  };

  const july = endpointStats(mergedRuns, distSf, lapNoById as Map<string, number>, 13, budget);
  check(
    'C: all 13 lap lines start/end on the S/F line (July)',
    july.offLine === 0 && july.lapsChecked === 13,
    `${july.lapsChecked} laps, worst endpoint ${july.maxD.toFixed(2)} m from the line`
  );

  let sharedViolations = 0;
  let sharedChecked = 0;
  for (let i = 0; i < mergedRuns.length - 1; i++) {
    const a = mergedRuns[i];
    const b = mergedRuns[i + 1];
    if (!a.lapId || !b.lapId) continue;
    const pa = a.points[a.points.length - 1];
    const pb = b.points[0];
    sharedChecked++;
    if (pa.latitude !== pb.latitude || pa.longitude !== pb.longitude) sharedViolations++;
  }
  check(
    'C: consecutive laps share the exact clip point',
    sharedViolations === 0 && sharedChecked >= 12,
    `${sharedChecked} boundaries, ${sharedViolations} mismatches`
  );

  const APRIL_FILE = 'bench/data/trakio-session-1777178068619-hec6w8m.json';
  if (fs.existsSync(APRIL_FILE)) {
    const april = loadSessionExport(APRIL_FILE);
    const aprilSf: any = (april.timingLines as any[]).find((t) => t.type === 'start_finish');
    const aprilLapNos = new Map(april.laps.map((l) => [l.id, l.lapNumber]));
    const aprilPoints = april.gpsPoints.map((p: any) => ({
      latitude: p.latitude, longitude: p.longitude, accuracyM: p.accuracyM, recordedAt: p.recordedAt, lapId: p.lapId,
    }));
    const aprilRuns = groupPointsIntoLapRuns(aprilPoints as any, aprilSf);
    const aprilBudget = Math.max(250, Math.floor(6000 / aprilRuns.length));
    const stats = endpointStats(aprilRuns, makeDistToLine(aprilSf), aprilLapNos as Map<string, number>, 14, aprilBudget);
    check(
      'C: all 14 lap lines start/end on the S/F line (April)',
      stats.offLine === 0 && stats.lapsChecked === 14,
      `${stats.lapsChecked} laps, worst endpoint ${stats.maxD.toFixed(2)} m from the line`
    );
  } else {
    console.log('  [skip] April session not present');
  }

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
