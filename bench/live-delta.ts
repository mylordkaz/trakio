import { createLiveReference, type LiveDeltaState } from '@/telemetry/live-reference';
import { createSessionRuntime } from '@/telemetry/session-runtime';
import { createMockRecorder, loadSessionExport, toSamples } from './replay';

// Replays an exported session through the production runtime and the live
// reference, then checks the delta shown just before each closing crossing
// against the stored lap-time difference. The runtime's import chain reaches
// react-native, so this runs under jest rather than tsx:
//   npx jest --testMatch '**/bench/live-delta.bench.ts'

const DEFAULT_FILES = [
  'bench/data/trakio-session-1783145467725-su66dcp.json',
  'bench/data/trakio-session-1777178068619-hec6w8m.json',
];

export const DEFAULT_LIVE_DELTA_FILES = DEFAULT_FILES;

export async function replayLiveDelta(file: string) {
  const data = loadSessionExport(file);
  const mock = createMockRecorder();
  const runtime = createSessionRuntime({
    track: { id: data.track.id } as never,
    timingLines: data.timingLines as never,
    recorder: mock.recorder as never,
  });
  await runtime.start();

  const sectorLineCount = (data.timingLines as { type: string }[]).filter((line) => line.type === 'sector').length;
  const live = createLiveReference({ sectorLineCount });
  const samples = toSamples(data);
  const intervals = samples.slice(1).map((s, i) => s.recordedAt - samples[i].recordedAt).sort((a, b) => a - b);
  const medianIntervalMs = intervals[Math.floor(intervals.length / 2)] ?? 1000;

  let knownLaps = 0;
  let staleCount = 0;
  let matchedCount = 0;
  const rows: { lap: number; refLap: number; deltaAtLineMs: number; expectedMs: number; errMs: number }[] = [];

  for (const sample of samples) {
    const result = await runtime.handleSample(sample);
    if (!result.accepted || !result.snapshot.latestAcceptedSample) {
      continue;
    }
    const before: LiveDeltaState = live.getState();
    const state = live.onAccepted({
      sample: result.snapshot.latestAcceptedSample,
      events: result.events,
      completedLaps: result.snapshot.completedLaps,
    });
    if (state.referenceLapNumber !== null && state.deltaMs !== null) {
      matchedCount++;
      if (state.stale) staleCount++;
    }
    const closed = result.snapshot.completedLaps.length > knownLaps ? result.snapshot.completedLaps[result.snapshot.completedLaps.length - 1] : null;
    knownLaps = result.snapshot.completedLaps.length;
    if (closed && before.referenceLapNumber !== null && before.referenceLapTimeMs !== null && before.deltaMs !== null) {
      const expectedMs = closed.lapTimeMs - before.referenceLapTimeMs;
      rows.push({
        lap: closed.lapNumber,
        refLap: before.referenceLapNumber,
        deltaAtLineMs: before.deltaMs,
        expectedMs,
        errMs: before.deltaMs - expectedMs,
      });
    }
  }
  await runtime.stop();

  console.log(`\n${file}`);
  console.log(`  samples ${samples.length}, median interval ${medianIntervalMs} ms, sector lines ${sectorLineCount}`);
  console.log(`  delta samples ${matchedCount}, stale ${staleCount}`);
  console.log('  lap  ref  delta@line  expected   err');
  for (const row of rows) {
    console.log(
      `  ${String(row.lap).padStart(3)}  ${String(row.refLap).padStart(3)}  ${fmt(row.deltaAtLineMs).padStart(10)}  ${fmt(row.expectedMs).padStart(8)}  ${fmt(row.errMs).padStart(6)}`
    );
  }
  const maxErr = rows.reduce((max, row) => Math.max(max, Math.abs(row.errMs)), 0);
  const pass = maxErr <= medianIntervalMs;
  console.log(`  max |err| ${fmt(maxErr)} s (limit one sample interval ${fmt(medianIntervalMs)} s): ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

function fmt(ms: number) {
  return (ms / 1000).toFixed(3);
}
