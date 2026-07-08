import { loadSessionExport, replaySession, type ReplayResult, type SessionExport } from './replay';

// Masked-GPS baseline (docs/kalman/phase-2-imu-fusion.md §2b).
//
// Deletes GPS windows centered on each lap-boundary crossing of the clean
// April session and replays naive detection across the artificial hole. The
// hidden points are exact ground truth, so this locks in THE BAR that IMU
// fusion must beat: how wrong naive interpolation is across a dropout of a
// given length, measured on real driving.
//
//   npx tsx bench/mask.ts [bench/data/<export>.json]

const DEFAULT_FILE = 'bench/data/trakio-session-1777178068619-hec6w8m.json';
const MASK_DURATIONS_MS = [3000, 5000, 8000, 11000];
// Where the crossing sits inside the hole changes the spanning chord's
// geometry entirely: July's real dropouts had the crossing near the END of
// the hole (chord along the straight -> detected); a centered hole spans
// corner-exit to braking-zone and the chord can miss the finite gate.
const MASK_PHASES = [
  { label: 'centered', crossingFraction: 0.5 },
  { label: 'late (July-like)', crossingFraction: 0.85 },
];

export function maskGpsWindow(
  data: SessionExport,
  startElapsedMs: number,
  endElapsedMs: number
): SessionExport {
  return {
    ...data,
    gpsPoints: data.gpsPoints.filter(
      (p) => p.elapsedMs === null || p.elapsedMs < startElapsedMs || p.elapsedMs >= endElapsedMs
    ),
  };
}

type BoundaryResult = {
  boundaryIndex: number;
  lapErrorsMs: number[];
  lapCountIntact: boolean;
  adjacentFlagged: boolean;
};

async function main() {
  const path = process.argv[2] ?? DEFAULT_FILE;
  const data = loadSessionExport(path);

  const truth = await replaySession(data, null);
  const truthLapMs = truth.laps.map((l) => l.lapTimeMs);
  const startFinish = truth.crossings.filter((c) => c.type === 'start_finish_crossed');

  console.log(`# Masked-GPS naive baseline — ${data.session.name ?? data.session.id}`);
  console.log(`laps: ${truth.laps.length} | S/F crossings: ${startFinish.length} (first arms lap 1)\n`);

  const rows: { label: string; durationMs: number; meanMs: number; maxMs: number; lapsLost: number; flagsOk: number; boundaries: number }[] = [];

  for (const phase of MASK_PHASES) {
  for (const durationMs of MASK_DURATIONS_MS) {
    const results: BoundaryResult[] = [];

    // Boundary k (event index k in 1..N-1) ends lap k and starts lap k+1.
    for (let k = 1; k < startFinish.length; k++) {
      const center = startFinish[k].elapsedMs;
      const masked = maskGpsWindow(
        data,
        center - durationMs * phase.crossingFraction,
        center + durationMs * (1 - phase.crossingFraction)
      );
      const replay: ReplayResult = await replaySession(masked, null);

      const lapCountIntact = replay.laps.length === truth.laps.length;
      const lapErrorsMs: number[] = [];
      let adjacentFlagged = false;

      if (lapCountIntact) {
        for (const lapNumber of [k, k + 1]) {
          const lap = replay.laps[lapNumber - 1];
          if (lap && truthLapMs[lapNumber - 1] !== undefined) {
            lapErrorsMs.push(Math.abs(lap.lapTimeMs - truthLapMs[lapNumber - 1]));
            if (lap.isEstimated) adjacentFlagged = true;
          }
        }
      }

      results.push({ boundaryIndex: k, lapErrorsMs, lapCountIntact, adjacentFlagged });
    }

    const errors = results.flatMap((r) => r.lapErrorsMs);
    rows.push({
      label: phase.label,
      durationMs,
      meanMs: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : NaN,
      maxMs: errors.length ? Math.max(...errors) : NaN,
      lapsLost: results.filter((r) => !r.lapCountIntact).length,
      flagsOk: results.filter((r) => r.adjacentFlagged).length,
      boundaries: results.length,
    });
  }
  }

  console.log('| mask | phase | boundary-lap mean |err| | max |err| | boundaries losing laps | flagged ≈ |');
  console.log('| --- | --- | --- | --- | --- | --- |');
  for (const row of rows) {
    console.log(
      `| ${row.durationMs / 1000} s | ${row.label} | ${(row.meanMs / 1000).toFixed(3)} s | ${(row.maxMs / 1000).toFixed(3)} s | ${row.lapsLost}/${row.boundaries} | ${row.flagsOk}/${row.boundaries} |`
    );
  }
  console.log('\nThis table is the bar: Phase 2b fusion must land materially below these');
  console.log('errors at 5-11 s (target ≤0.15 s at 5 s, ≤0.3 s at 11 s) with zero lost laps.');
}

main().catch((error) => {
  console.error('MASK BENCH FAILURE', error);
  process.exit(1);
});
