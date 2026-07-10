import * as fs from 'fs';
import { detectTimingLineCrossings } from '@/telemetry/detection';
import type { TimingLineRow } from '@/db/types';
import type { DetectionState, TelemetrySample } from '@/telemetry/types';
import { maskGpsWindow } from './mask';
import { loadSessionExport, replaySession, type SessionExport } from './replay';

// Acceptance table for the crossing-recovery change (design approved
// 2026-07-10). Run before the track build:
//   npx tsx bench/recovery-acceptance.ts

const SESSION_FILES = [
  'bench/data/trakio-session-1777178068619-hec6w8m.json', // April, 14 laps
  'bench/data/trakio-session-1783145467725-su66dcp.json', // July, 13 laps
  'bench/data/trakio-session-1783554887261-emntokq.json', // street 1
  'bench/data/trakio-session-1783597694711-5jll6hk.json', // street 2
];
const REPLAY_TOLERANCE_MS = 2;

const failures: string[] = [];
function check(name: string, pass: boolean, detail: string) {
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name} — ${detail}`);
  if (!pass) failures.push(name);
}

async function testExistingSessionsUnchanged() {
  console.log('#1/#2 existing sessions byte-stable, flag ON and OFF:');

  for (const file of SESSION_FILES) {
    if (!fs.existsSync(file)) {
      console.log(`  [skip] ${file} not present`);
      continue;
    }
    const data = loadSessionExport(file);
    const stored = data.laps
      .filter((l) => l.lapTimeMs !== null)
      .sort((a, b) => a.lapNumber - b.lapNumber)
      .map((l) => l.lapTimeMs!);

    for (const recoveryEnabled of [true, false]) {
      const replay = await replaySession(data, null, { recoveryEnabled });
      const countOk = replay.laps.length === stored.length;
      let maxDelta = 0;
      if (countOk) {
        for (let i = 0; i < stored.length; i++) {
          maxDelta = Math.max(maxDelta, Math.abs(replay.laps[i].lapTimeMs - stored[i]));
        }
      }
      check(
        `${data.session.name ?? file} flag=${recoveryEnabled ? 'ON ' : 'OFF'}`,
        countOk && maxDelta <= REPLAY_TOLERANCE_MS,
        `laps ${replay.laps.length}/${stored.length}, max |Δ| ${maxDelta} ms`
      );
    }
  }
}

async function testMaskedRecovery() {
  console.log('\n#3/#4 masked boundaries recover (April, 8 s and 11 s, both phases):');
  const data = loadSessionExport(SESSION_FILES[0]);
  const truth = await replaySession(data, null, { recoveryEnabled: false });
  const truthLapMs = truth.laps.map((l) => l.lapTimeMs);
  const boundaries = truth.crossings.filter((c) => c.type === 'start_finish_crossed');

  for (const durationMs of [8000, 11000]) {
    for (const phase of [
      { label: 'centered', fraction: 0.5 },
      { label: 'late', fraction: 0.85 },
    ]) {
      let lost = 0;
      let flagged = 0;
      const errors: number[] = [];

      for (let k = 1; k < boundaries.length; k++) {
        const center = boundaries[k].elapsedMs;
        const masked = maskGpsWindow(
          data,
          center - durationMs * phase.fraction,
          center + durationMs * (1 - phase.fraction)
        );
        const replay = await replaySession(masked, null, { recoveryEnabled: true });

        if (replay.laps.length !== truth.laps.length) {
          lost++;
          continue;
        }
        for (const lapNumber of [k, k + 1]) {
          const lap = replay.laps[lapNumber - 1];
          if (lap && truthLapMs[lapNumber - 1] !== undefined) {
            errors.push(Math.abs(lap.lapTimeMs - truthLapMs[lapNumber - 1]));
            if (lap.isEstimated) flagged++;
          }
        }
      }

      const meanErr = errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : NaN;
      const maxErr = errors.length ? Math.max(...errors) : NaN;
      check(
        `${durationMs / 1000} s ${phase.label}`,
        lost === 0,
        `boundaries losing laps: ${lost}/${boundaries.length - 1} (was up to 14/14), ` +
          `flagged laps ${flagged}, err mean ${(meanErr / 1000).toFixed(3)} s max ${(maxErr / 1000).toFixed(3)} s`
      );
    }
  }
}

// Synthetic geometry checks (#5-#7): pit-lane exclusion, gate-edge recovery,
// parked jitter.
const LAT0 = 35;
const LNG0 = 139;
const M_LAT = 111320;
const M_LNG = Math.cos((LAT0 * Math.PI) / 180) * M_LAT;
const T0 = 1_700_000_000_000;

function sampleXY(xM: number, yM: number, tS: number, speedMps: number): TelemetrySample {
  return {
    recordedAt: T0 + tS * 1000,
    elapsedMs: tS * 1000,
    lat: LAT0 + yM / M_LAT,
    lng: LNG0 + xM / M_LNG,
    speedMps,
    accuracyM: 4,
    headingDeg: 0,
    altitudeM: 30,
    source: 'gps',
  };
}

const GATE: TimingLineRow = {
  id: 'sf',
  trackId: 't',
  name: 'SF',
  type: 'start_finish',
  seq: 0,
  a: { latitude: LAT0 + 60 / M_LAT, longitude: LNG0 + 92 / M_LNG },
  b: { latitude: LAT0 + 60 / M_LAT, longitude: LNG0 + 127 / M_LNG },
  createdAt: '',
  updatedAt: '',
} as TimingLineRow;

function detectSegment(a: TelemetrySample, b: TelemetrySample) {
  const state: DetectionState = {
    lastTimingLineId: null,
    lastCrossingElapsedMs: null,
    expectedSectorSeq: null,
    currentLapStartedElapsedMs: null,
  };
  return detectTimingLineCrossings(a, b, [GATE], state, { recoveryEnabled: true });
}

function testSynthetics() {
  console.log('\n#5 pit-lane exclusion / #6 gate-edge recovery / #7 parked jitter:');

  // #5: 8 s hole, path at the MEASURED nearest real-traffic band (~2.7
  // gate-lengths — actual Tsukuba pit/section offset from both sessions).
  const pit = detectSegment(sampleXY(150, -180, 0, 30), sampleXY(220, 120, 8, 15));
  check('#5 pit-lane path excluded', pit.length === 0, `${pit.length} crossings (chord meets line ~2.7 gate-lengths past the end)`);

  // #5b: just outside the accepted band (2.4 gate-lengths) — must stay excluded.
  const bandEdge = detectSegment(sampleXY(140, -180, 0, 30), sampleXY(190, 120, 8, 15));
  check('#5b band edge respected', bandEdge.length === 0, `${bandEdge.length} crossings at ~2.4 gate-lengths`);

  // #6: 8 s hole, chord crosses at fraction ~ -0.37 (just off the west end).
  const edge = detectSegment(sampleXY(75, -180, 0, 30), sampleXY(80, 120, 8, 30));
  check('#6 gate-edge chord recovered', edge.length === 1, `${edge.length} crossing(s) at extension fraction ~ -0.37`);

  // #6b: same geometry but a normal 1 s segment -> no recovery (gap gate).
  const shortSeg = detectSegment(sampleXY(75, 30, 0, 30), sampleXY(80, 90, 1, 30));
  check('#6b short segment never recovers', shortSeg.length === 0, `${shortSeg.length} crossings at dt=1 s`);

  // #7: parked jitter across the extension, 8 s apart, speed ~0.
  const parked = detectSegment(sampleXY(85, 59, 0, 0.2), sampleXY(86, 61, 8, 0.2));
  check('#7 parked jitter blocked by speed gate', parked.length === 0, `${parked.length} crossings`);
}

async function main() {
  await testExistingSessionsUnchanged();
  await testMaskedRecovery();
  testSynthetics();
  console.log(failures.length === 0 ? '\nALL ACCEPTANCE CHECKS PASSED' : `\nFAILED: ${failures.join(' | ')}`);
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('ACCEPTANCE FAILURE', error);
  process.exit(1);
});
