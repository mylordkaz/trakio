import * as fs from 'fs';
import { makeArms, type Arm } from './arms';
import { loadSessionExport, replaySession, type ReplayedLap, type SessionExport } from './replay';

// Phase 0 bench (docs/kalman/phase-0-offline-bench.md §6).
//   npx tsx bench/run.ts            → three-arm report + acceptance checklist
//   npx tsx bench/run.ts --sweep    → parameter grid search (tuned on July-clean
//                                     + April only; dropout laps never selected on)

const JULY_FILE = 'bench/data/trakio-session-1783145467725-su66dcp.json';
const APRIL_FILE = 'bench/data/trakio-session-1777178068619-hec6w8m.json';

// Circuit transponder ground truth, July session, laps 1..13 (ms).
const JULY_OFFICIAL_MS = [
  79195, 78108, 77969, 78821, 78148, 78764, 81114, 90612, 84875, 86531, 84975, 85134, 84017,
];
const JULY_DROPOUT_LAPS = new Set([2, 3, 4, 5, 6]);

const REPLAY_NOISE_FLOOR_MS = 2; // ISO timestamp truncation, established previously
const APRIL_STABILITY_LIMIT_MS = 30;
const CLEAN_LAP_REGRESSION_LIMIT_MS = 20;
const WIN_THRESHOLD_MS = 20;

type JulyEval = {
  rows: { lap: number; officialMs: number; replayMs: number; errMs: number; flagged: boolean }[];
  cleanMeanAbsMs: number;
  cleanMaxAbsMs: number;
  dropoutMeanAbsMs: number;
  flaggedLaps: number[];
  lapCount: number;
};

type AprilEval = {
  maxAbsDeltaMs: number;
  meanAbsDeltaMs: number;
  lapCount: number;
  flaggedLaps: number[];
  maxSectorDeltaMs: number;
};

function mean(values: number[]) {
  return values.length === 0 ? NaN : values.reduce((a, b) => a + b, 0) / values.length;
}

function evalJuly(replayed: ReplayedLap[]): JulyEval {
  if (replayed.length !== 13) {
    return {
      rows: [],
      cleanMeanAbsMs: NaN,
      cleanMaxAbsMs: NaN,
      dropoutMeanAbsMs: NaN,
      flaggedLaps: replayed.filter((l) => l.isEstimated).map((l) => l.lapNumber),
      lapCount: replayed.length,
    };
  }

  const rows = replayed.slice(0, 13).map((lap, i) => ({
    lap: lap.lapNumber,
    officialMs: JULY_OFFICIAL_MS[i],
    replayMs: lap.lapTimeMs,
    errMs: lap.lapTimeMs - JULY_OFFICIAL_MS[i],
    flagged: lap.isEstimated,
  }));
  const clean = rows.filter((r) => !JULY_DROPOUT_LAPS.has(r.lap));
  const dropout = rows.filter((r) => JULY_DROPOUT_LAPS.has(r.lap));

  return {
    rows,
    cleanMeanAbsMs: mean(clean.map((r) => Math.abs(r.errMs))),
    cleanMaxAbsMs: Math.max(...clean.map((r) => Math.abs(r.errMs))),
    dropoutMeanAbsMs: mean(dropout.map((r) => Math.abs(r.errMs))),
    flaggedLaps: rows.filter((r) => r.flagged).map((r) => r.lap),
    lapCount: replayed.length,
  };
}

function evalApril(replayed: ReplayedLap[], data: SessionExport): AprilEval {
  const stored = data.laps
    .filter((l) => l.lapTimeMs !== null)
    .sort((a, b) => a.lapNumber - b.lapNumber);

  const deltas: number[] = [];
  let maxSectorDeltaMs = 0;

  for (let i = 0; i < Math.min(stored.length, replayed.length); i++) {
    deltas.push(Math.abs(replayed[i].lapTimeMs - (stored[i].lapTimeMs ?? 0)));

    const storedSplits = (stored[i].sectors ?? [])
      .slice()
      .sort((a, b) => a.sectorIndex - b.sectorIndex)
      .map((s) => s.splitTimeMs);
    const replaySplits = replayed[i].sectorSplitsMs;
    for (let s = 0; s < Math.min(storedSplits.length, replaySplits.length); s++) {
      maxSectorDeltaMs = Math.max(maxSectorDeltaMs, Math.abs(replaySplits[s] - storedSplits[s]));
    }
  }

  return {
    maxAbsDeltaMs: Math.max(...deltas),
    meanAbsDeltaMs: mean(deltas),
    lapCount: replayed.length,
    flaggedLaps: replayed.filter((l) => l.isEstimated).map((l) => l.lapNumber),
    maxSectorDeltaMs,
  };
}

type ArmResult = {
  arm: Arm;
  july: JulyEval;
  april: AprilEval;
};

async function runArm(arm: Arm, july: SessionExport, april: SessionExport): Promise<ArmResult> {
  const julyReplay = await replaySession(july, arm.createEstimator());
  const aprilReplay = await replaySession(april, arm.createEstimator());
  return { arm, july: evalJuly(julyReplay.laps), april: evalApril(aprilReplay.laps, april) };
}

function formatMs(ms: number) {
  return `${ms >= 0 ? '+' : ''}${(ms / 1000).toFixed(3)}`;
}

function acceptanceChecklist(result: ArmResult, naive: ArmResult): string[] {
  const lines: string[] = [];
  const check = (id: string, pass: boolean, detail: string) =>
    lines.push(`  [${pass ? 'PASS' : 'FAIL'}] #${id} ${detail}`);

  check(
    '0 Lap detection intact',
    result.july.lapCount === 13 && result.april.lapCount === naive.april.lapCount,
    `july ${result.july.lapCount}/13 laps, april ${result.april.lapCount}/${naive.april.lapCount} — losing a lap is disqualifying`
  );
  check(
    '1 April stability',
    result.april.maxAbsDeltaMs <= APRIL_STABILITY_LIMIT_MS &&
      result.april.lapCount === naive.april.lapCount &&
      result.april.flaggedLaps.length === 0,
    `max |Δ| ${result.april.maxAbsDeltaMs.toFixed(0)} ms (limit ${APRIL_STABILITY_LIMIT_MS}), laps ${result.april.lapCount}, flags [${result.april.flaggedLaps}]`
  );
  const worstRegression = result.july.rows.length === 0 ? NaN : Math.max(
    ...result.july.rows
      .filter((r) => !JULY_DROPOUT_LAPS.has(r.lap))
      .map((r, i) => {
        const naiveRow = naive.july.rows.filter((n) => !JULY_DROPOUT_LAPS.has(n.lap))[i];
        return Math.abs(r.errMs) - Math.abs(naiveRow.errMs);
      })
  );
  check(
    '2 July clean laps',
    result.july.cleanMeanAbsMs <= naive.july.cleanMeanAbsMs + REPLAY_NOISE_FLOOR_MS &&
      worstRegression <= CLEAN_LAP_REGRESSION_LIMIT_MS,
    `mean |err| ${result.july.cleanMeanAbsMs.toFixed(0)} ms (naive ${naive.july.cleanMeanAbsMs.toFixed(0)}), worst regression ${worstRegression.toFixed(0)} ms (limit ${CLEAN_LAP_REGRESSION_LIMIT_MS})`
  );
  check(
    '3 July dropout laps',
    result.july.dropoutMeanAbsMs <= naive.july.dropoutMeanAbsMs + REPLAY_NOISE_FLOOR_MS,
    `mean |err| ${(result.july.dropoutMeanAbsMs / 1000).toFixed(3)} s (naive ${(naive.july.dropoutMeanAbsMs / 1000).toFixed(3)} s)`
  );
  check(
    '4 Flags',
    JSON.stringify(result.july.flaggedLaps) === JSON.stringify([2, 3, 4, 5, 6]) &&
      result.april.flaggedLaps.length === 0,
    `july [${result.july.flaggedLaps}] (expect [2,3,4,5,6]), april [${result.april.flaggedLaps}]`
  );
  check(
    '5 Sector sanity',
    result.april.maxSectorDeltaMs <= APRIL_STABILITY_LIMIT_MS,
    `April max sector |Δ| ${result.april.maxSectorDeltaMs.toFixed(0)} ms (limit ${APRIL_STABILITY_LIMIT_MS})`
  );
  const improvementMs = naive.july.cleanMeanAbsMs - result.july.cleanMeanAbsMs;
  check(
    '6 Win condition',
    improvementMs >= WIN_THRESHOLD_MS,
    `clean-lap mean improvement ${improvementMs.toFixed(0)} ms (ship threshold ${WIN_THRESHOLD_MS} ms; synthetic wins count separately)`
  );

  return lines;
}

function report(results: ArmResult[]): string {
  const naive = results[0];
  const out: string[] = [];

  out.push('# Kalman Phase 0 — bench report\n');
  out.push('## July session vs transponder (dropout laps marked *)\n');
  out.push('| lap | official | ' + results.map((r) => r.arm.id).join(' | ') + ' |');
  out.push('| --- | --- | ' + results.map(() => '---').join(' | ') + ' |');
  for (let i = 0; i < 13; i++) {
    const lapNo = naive.july.rows[i].lap;
    const cells = results.map((r) => (r.july.rows[i] ? formatMs(r.july.rows[i].errMs) : 'LAP LOST'));
    out.push(
      `| L${lapNo}${JULY_DROPOUT_LAPS.has(lapNo) ? '*' : ''} | ${(JULY_OFFICIAL_MS[i] / 1000).toFixed(3)} | ${cells.join(' | ')} |`
    );
  }
  out.push('');
  for (const r of results) {
    out.push(
      `- **${r.arm.label}**: clean mean |err| ${r.july.cleanMeanAbsMs.toFixed(0)} ms, ` +
        `clean max ${r.july.cleanMaxAbsMs.toFixed(0)} ms, dropout mean ${(r.july.dropoutMeanAbsMs / 1000).toFixed(3)} s; ` +
        `April max |Δ| ${r.april.maxAbsDeltaMs.toFixed(0)} ms (sectors ${r.april.maxSectorDeltaMs.toFixed(0)} ms)`
    );
  }

  out.push('\n## Acceptance (arms B and C, per spec §6)\n');
  for (const r of results.slice(1)) {
    out.push(`${r.arm.label}:`);
    out.push(...acceptanceChecklist(r, naive));
    out.push('');
  }

  return out.join('\n');
}

async function sweep(july: SessionExport, april: SessionExport) {
  console.log('sweep: kalman grid (selected on July-clean + April only)\n');
  const rows: { label: string; cleanMeanMs: number; aprilMaxMs: number; valid: boolean }[] = [];

  for (const sigma of [1.5, 2, 3, 4.5, 6]) {
    for (const kR of [0.7, 1, 1.5]) {
      for (const gate of [4, 5, 6]) {
        const arm: Arm = {
          id: 'kalman',
          label: `σa=${sigma} kR=${kR} G=${gate}`,
          createEstimator: () =>
            makeArms({ accelNoiseMps2: sigma, accuracyTrustScale: kR, innovationGateSigma: gate })[2].createEstimator(),
        };
        const result = await runArm(arm, july, april);
        rows.push({
          label: arm.label,
          cleanMeanMs: result.july.cleanMeanAbsMs,
          aprilMaxMs: result.april.maxAbsDeltaMs,
          valid:
            result.april.maxAbsDeltaMs <= APRIL_STABILITY_LIMIT_MS &&
            result.july.lapCount === 13 &&
            result.april.lapCount === 14,
        });
      }
    }
  }

  for (const alpha of [0.3, 0.4, 0.5, 0.7]) {
    for (const velocityGain of [0, 0.3, 0.6]) {
      const beta = (alpha * alpha) / (2 - alpha);
      const arm: Arm = {
        id: 'alphabeta',
        label: `α=${alpha} vG=${velocityGain}`,
        createEstimator: () => makeArms({}, { alpha, beta, velocityGain })[1].createEstimator(),
      };
      const result = await runArm(arm, july, april);
      rows.push({
        label: arm.label,
        cleanMeanMs: result.july.cleanMeanAbsMs,
        aprilMaxMs: result.april.maxAbsDeltaMs,
        valid:
          result.april.maxAbsDeltaMs <= APRIL_STABILITY_LIMIT_MS &&
          result.july.lapCount === 13 &&
          result.april.lapCount === 14,
      });
    }
  }

  const key = (r: { valid: boolean; cleanMeanMs: number }) =>
    (r.valid ? 0 : 1e9) + (Number.isFinite(r.cleanMeanMs) ? r.cleanMeanMs : 1e8);
  rows.sort((a, b) => key(a) - key(b));
  const valid = rows.filter((r) => r.valid);
  console.log(`configs: ${rows.length} total, ${valid.length} valid (correct lap counts + April ≤ ${APRIL_STABILITY_LIMIT_MS} ms)\n`);
  console.log('| config | July clean mean |err| ms | April max |Δ| ms | valid |');
  console.log('| --- | --- | --- | --- |');
  for (const row of rows.slice(0, Math.max(15, valid.length))) {
    console.log(
      `| ${row.label} | ${Number.isFinite(row.cleanMeanMs) ? row.cleanMeanMs.toFixed(1) : 'LAP LOST'} | ${row.aprilMaxMs.toFixed(0)} | ${row.valid ? 'yes' : 'NO'} |`
    );
  }
}

async function main() {
  const july = loadSessionExport(JULY_FILE);
  const april = loadSessionExport(APRIL_FILE);

  if (process.argv.includes('--sweep')) {
    await sweep(july, april);
    return;
  }

  const results: ArmResult[] = [];
  for (const arm of makeArms()) {
    results.push(await runArm(arm, july, april));
  }

  const text = report(results);
  console.log(text);
  fs.mkdirSync('bench/out', { recursive: true });
  fs.writeFileSync('bench/out/report.md', text);
  console.log('\nwritten: bench/out/report.md');
}

main().catch((error) => {
  console.error('BENCH FAILURE', error);
  process.exit(1);
});
