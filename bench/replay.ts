import * as fs from 'fs';
import type { PositionEstimator } from '@/telemetry/kalman';
import { filterTelemetrySample } from '@/telemetry/filters';
import { createSessionRuntime } from '@/telemetry/session-runtime';
import type { TelemetrySample } from '@/telemetry/types';

// Replays an exported session through the PRODUCTION runtime with Phase 1's
// exact topology: raw samples pass the production validation filter, accepted
// samples flow through the arm's estimator, and detection sees the estimated
// positions. Storage/display are irrelevant here (mock recorder).

export type ExportedLap = {
  id: string;
  lapNumber: number;
  startedAt: string;
  // Present from export v4: crossing position frozen at capture.
  startedLatitude?: number | null;
  startedLongitude?: number | null;
  lapTimeMs: number | null;
  isTimingEstimated?: 0 | 1;
  sectors?: { sectorIndex: number; splitTimeMs: number }[];
};

export type ExportedImuSample = {
  recordedAt: number;
  intervalMs: number | null;
  accel: [number | null, number | null, number | null];
  accelInclGravity: [number | null, number | null, number | null];
  rotation: [number | null, number | null, number | null];
  rotationRate: [number | null, number | null, number | null];
};

export type SessionExport = {
  format?: string;
  version?: number;
  session: { id: string; name: string | null };
  track: { id: string };
  timingLines: unknown[];
  laps: ExportedLap[];
  gpsPoints: {
    recordedAt: string;
    elapsedMs: number | null;
    latitude: number;
    longitude: number;
    speedMps: number | null;
    accuracyM: number | null;
    headingDeg: number | null;
    altitudeM: number | null;
  }[];
  // Present from export v2 when Phase 2a capture ran during the session.
  imuSamples?: ExportedImuSample[];
  // Present from export v3: fixes the capture filter rejected (quarantine).
  rejectedGpsPoints?: {
    recordedAt: string;
    elapsedMs: number | null;
    latitude: number;
    longitude: number;
    speedMps: number | null;
    accuracyM: number | null;
    altitudeM: number | null;
    headingDeg: number | null;
    rejectionReason: string;
  }[];
};

export function loadSessionExport(path: string): SessionExport {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

export function toSamples(data: SessionExport): TelemetrySample[] {
  return data.gpsPoints.map((p) => ({
    recordedAt: Date.parse(p.recordedAt),
    elapsedMs: p.elapsedMs ?? 0,
    lat: p.latitude,
    lng: p.longitude,
    speedMps: p.speedMps,
    accuracyM: p.accuracyM,
    headingDeg: p.headingDeg,
    altitudeM: p.altitudeM,
    source: 'gps' as const,
  }));
}

export type ReplayedLap = {
  lapNumber: number;
  lapTimeMs: number;
  isEstimated: boolean;
  sectorSplitsMs: number[];
};

export type ReplayedCrossing = {
  type: 'start_finish_crossed' | 'sector_crossed';
  elapsedMs: number;
  quality: 'good' | 'degraded';
};

export type ReplayResult = {
  laps: ReplayedLap[];
  crossings: ReplayedCrossing[];
  acceptedCount: number;
  maxAcceptedGapMs: number;
};

function createMockRecorder() {
  const sectorsByLapId = new Map<string, { sectorIndex: number; splitTimeMs: number }[]>();
  const lapIdByNumber = new Map<number, string>();

  const recorder = {
    createSession: async () => {},
    startLap: async (input: { id: string; lapNumber: number }) => {
      lapIdByNumber.set(input.lapNumber, input.id);
    },
    finishLap: async () => {},
    setLapInLap: async () => {},
    insertLapSector: async (input: { lapId: string; sectorIndex: number; splitTimeMs: number }) => {
      const existing = sectorsByLapId.get(input.lapId) ?? [];
      existing.push({ sectorIndex: input.sectorIndex, splitTimeMs: input.splitTimeMs });
      sectorsByLapId.set(input.lapId, existing);
    },
    recordRejectedSample: async () => {},
    appendGpsSample: async () => {},
    flushGpsBuffer: async () => {},
    finalizeSession: async () => {},
    getBufferedPointCount: () => 0,
  };

  return {
    recorder,
    sectorSplitsForLap(lapNumber: number): number[] {
      const lapId = lapIdByNumber.get(lapNumber);
      const sectors = lapId ? (sectorsByLapId.get(lapId) ?? []) : [];
      return [...sectors].sort((a, b) => a.sectorIndex - b.sectorIndex).map((s) => s.splitTimeMs);
    },
  };
}

export async function replaySession(
  data: SessionExport,
  estimator: PositionEstimator | null,
  detectionConfig?: Record<string, unknown>,
  jumpReanchorEnabled?: boolean
): Promise<ReplayResult> {
  const mock = createMockRecorder();
  const runtimeConfig =
    detectionConfig || jumpReanchorEnabled !== undefined
      ? { config: { detectionConfig, jumpReanchorEnabled } as never }
      : {};
  const runtime = createSessionRuntime({
    track: { id: data.track.id } as never,
    timingLines: data.timingLines as never,
    recorder: mock.recorder as never,
    ...runtimeConfig,
  });

  await runtime.start();

  let previousAccepted: TelemetrySample | null = null;
  const crossings: ReplayedCrossing[] = [];
  let acceptedCount = 0;
  let maxAcceptedGapMs = 0;
  let lastAcceptedAtMs: number | null = null;

  for (const raw of toSamples(data)) {
    // The bench pre-filter only decides whether the estimator runs; the
    // runtime remains the authority on acceptance (it can re-anchor a sample
    // this pre-filter rejected), so all stats come from the runtime's result.
    const validation = filterTelemetrySample(previousAccepted, raw);
    let sample = raw;

    if (validation.accepted) {
      previousAccepted = validation.sample;
      const position = estimator ? estimator.step(validation.sample) : null;
      sample = position
        ? { ...validation.sample, lat: position.lat, lng: position.lng }
        : validation.sample;
    }

    const result = await runtime.handleSample(sample);

    if (result.accepted) {
      acceptedCount++;
      if (lastAcceptedAtMs !== null) {
        maxAcceptedGapMs = Math.max(maxAcceptedGapMs, raw.recordedAt - lastAcceptedAtMs);
      }
      lastAcceptedAtMs = raw.recordedAt;
      for (const event of result.events) {
        crossings.push({
          type: event.type,
          elapsedMs: event.sampleElapsedMs,
          quality: event.quality,
        });
      }
    }
  }

  const snapshot = runtime.getSnapshot();
  await runtime.stop();

  return {
    crossings,
    acceptedCount,
    maxAcceptedGapMs,
    laps: snapshot.completedLaps.map((lap) => ({
      lapNumber: lap.lapNumber,
      lapTimeMs: lap.lapTimeMs,
      isEstimated: lap.isEstimated,
      sectorSplitsMs: mock.sectorSplitsForLap(lap.lapNumber),
    })),
  };
}
