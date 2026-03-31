import { createSessionRecorder } from '@/db/session-recorder';
import type { TimingLineRow, TrackRow } from '@/db/types';
import { detectTimingLineCrossing } from '@/telemetry/detection';
import { filterTelemetrySample, type TelemetryFilterConfig } from '@/telemetry/filters';
import type {
  DetectionState,
  TelemetryDetectionConfig,
  TelemetryDetectionEvent,
  TelemetrySample,
  TelemetrySampleRejectionReason,
} from '@/telemetry/types';

type SessionRecorder = ReturnType<typeof createSessionRecorder>;

type RuntimeStatus = 'idle' | 'recording' | 'armed' | 'lap_in_progress' | 'stopped';

type SessionRuntimeConfig = {
  sessionName?: string | null;
  car?: string | null;
  condition?: string | null;
  temperatureC?: number | null;
  filterConfig?: Partial<TelemetryFilterConfig>;
  detectionConfig?: Partial<TelemetryDetectionConfig>;
};

type SessionRuntimeSnapshot = {
  status: RuntimeStatus;
  sessionId: string | null;
  trackId: string;
  sessionStartedAtMs: number | null;
  sessionEndedAtMs: number | null;
  currentLapId: string | null;
  currentLapNumber: number;
  currentLapStartedElapsedMs: number | null;
  currentSectorStartedElapsedMs: number | null;
  lastCrossedSectorSeq: number | null;
  lastCrossingElapsedMs: number | null;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalLaps: number;
  maxSpeedKph: number | null;
  latestAcceptedSample: TelemetrySample | null;
  latestEvent: TelemetryDetectionEvent | null;
  bufferedPointCount: number;
  currentLapSectorSplitsMs: Record<number, number>;
  completedLaps: {
    lapNumber: number;
    lapTimeMs: number;
    deltaToBestMs: number | null;
    isBest: boolean;
  }[];
};

type HandleSampleResult =
  | {
      accepted: false;
      rejectionReason: TelemetrySampleRejectionReason;
      snapshot: SessionRuntimeSnapshot;
    }
  | {
      accepted: true;
      event: TelemetryDetectionEvent | null;
      snapshot: SessionRuntimeSnapshot;
    };

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getRelevantTimingLines(timingLines: TimingLineRow[]) {
  return timingLines
    .filter((timingLine) => timingLine.type === 'start_finish' || timingLine.type === 'sector')
    .sort((a, b) => a.seq - b.seq);
}

function getSectorLineCount(timingLines: TimingLineRow[]) {
  return timingLines.filter((timingLine) => timingLine.type === 'sector').length;
}

function getSectorCount(timingLines: TimingLineRow[]) {
  const sectorLineCount = getSectorLineCount(timingLines);
  const hasStartFinish = timingLines.some((timingLine) => timingLine.type === 'start_finish');

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (hasStartFinish ? 1 : 0);
}

function toDetectionState(snapshot: SessionRuntimeSnapshot): DetectionState {
  return {
    lastTimingLineId: snapshot.latestEvent?.timingLineId ?? null,
    lastCrossingElapsedMs: snapshot.lastCrossingElapsedMs,
    expectedSectorSeq:
      snapshot.status === 'lap_in_progress'
        ? (snapshot.lastCrossedSectorSeq ?? 0) + 1
        : null,
    currentLapStartedElapsedMs: snapshot.currentLapStartedElapsedMs,
  };
}

export function createSessionRuntime(args: {
  track: TrackRow;
  timingLines: TimingLineRow[];
  recorder: SessionRecorder;
  config?: SessionRuntimeConfig;
}) {
  const { track, recorder, config } = args;
  const timingLines = getRelevantTimingLines(args.timingLines);
  const sectorCount = getSectorCount(timingLines);

  let snapshot: SessionRuntimeSnapshot = {
    status: 'idle',
    sessionId: null,
    trackId: track.id,
    sessionStartedAtMs: null,
    sessionEndedAtMs: null,
    currentLapId: null,
    currentLapNumber: 0,
    currentLapStartedElapsedMs: null,
    currentSectorStartedElapsedMs: null,
    lastCrossedSectorSeq: null,
    lastCrossingElapsedMs: null,
    bestLapMs: null,
    lastLapMs: null,
    totalLaps: 0,
    maxSpeedKph: null,
    latestAcceptedSample: null,
    latestEvent: null,
    bufferedPointCount: 0,
    currentLapSectorSplitsMs: {},
    completedLaps: [],
  };

  async function start() {
    if (snapshot.status !== 'idle' && snapshot.status !== 'stopped') {
      throw new Error('Session runtime can only start from idle or stopped state.');
    }

    const sessionId = generateId();
    const sessionStartedAtMs = Date.now();
    const startedAt = new Date(sessionStartedAtMs).toISOString();

    await recorder.createSession({
      id: sessionId,
      trackId: track.id,
      startedAt,
      name: config?.sessionName ?? null,
      car: config?.car ?? null,
      condition: config?.condition ?? null,
      temperatureC: config?.temperatureC ?? null,
      status: 'recording',
    });

    snapshot = {
      ...snapshot,
      status: 'recording',
      sessionId,
      sessionStartedAtMs,
      sessionEndedAtMs: null,
      currentLapId: null,
      currentLapNumber: 0,
      currentLapStartedElapsedMs: null,
      currentSectorStartedElapsedMs: null,
      lastCrossedSectorSeq: null,
      lastCrossingElapsedMs: null,
      lastLapMs: null,
      latestAcceptedSample: null,
      latestEvent: null,
      bufferedPointCount: recorder.getBufferedPointCount(),
      currentLapSectorSplitsMs: {},
      completedLaps: [],
    };

    return getSnapshot();
  }

  async function handleStartFinishCrossing(event: TelemetryDetectionEvent) {
    if (!snapshot.sessionId) {
      return;
    }

    if (snapshot.status === 'armed') {
      const lapId = generateId();

      await recorder.startLap({
        id: lapId,
        sessionId: snapshot.sessionId,
        lapNumber: 1,
        startedAt: new Date(event.sampleRecordedAt).toISOString(),
      });

      snapshot = {
        ...snapshot,
        status: 'lap_in_progress',
        currentLapId: lapId,
        currentLapNumber: 1,
        currentLapStartedElapsedMs: event.sampleElapsedMs,
        currentSectorStartedElapsedMs: event.sampleElapsedMs,
        lastCrossedSectorSeq: null,
        lastCrossingElapsedMs: event.sampleElapsedMs,
        latestEvent: event,
        currentLapSectorSplitsMs: {},
      };

      return;
    }

    if (snapshot.status !== 'lap_in_progress' || !snapshot.currentLapId || snapshot.currentLapStartedElapsedMs === null) {
      return;
    }

    if (sectorCount > 0 && snapshot.currentSectorStartedElapsedMs !== null) {
      await recorder.insertLapSector({
        id: generateId(),
        lapId: snapshot.currentLapId,
        sectorIndex: sectorCount - 1,
        splitTimeMs: Math.max(0, Math.round(event.sampleElapsedMs - snapshot.currentSectorStartedElapsedMs)),
      });
    }

    const lapTimeMs = Math.max(0, Math.round(event.sampleElapsedMs - snapshot.currentLapStartedElapsedMs));
    const updatedBestLapMs =
      snapshot.bestLapMs === null ? lapTimeMs : Math.min(snapshot.bestLapMs, lapTimeMs);
    const completedLaps = [
      ...snapshot.completedLaps,
      {
        lapNumber: snapshot.currentLapNumber,
        lapTimeMs,
        deltaToBestMs: null,
        isBest: false,
      },
    ].map((lap) => ({
      ...lap,
      deltaToBestMs: lap.lapTimeMs === updatedBestLapMs ? null : lap.lapTimeMs - updatedBestLapMs,
      isBest: lap.lapTimeMs === updatedBestLapMs,
    }));

    await recorder.finishLap({
      lapId: snapshot.currentLapId,
      endedAt: new Date(event.sampleRecordedAt).toISOString(),
      lapTimeMs,
      maxSpeedKph: snapshot.maxSpeedKph,
    });

    const nextLapNumber = snapshot.currentLapNumber + 1;
    const nextLapId = generateId();

    await recorder.startLap({
      id: nextLapId,
      sessionId: snapshot.sessionId,
      lapNumber: nextLapNumber,
      startedAt: new Date(event.sampleRecordedAt).toISOString(),
    });

    snapshot = {
      ...snapshot,
      status: 'lap_in_progress',
      currentLapId: nextLapId,
      currentLapNumber: nextLapNumber,
      currentLapStartedElapsedMs: event.sampleElapsedMs,
      currentSectorStartedElapsedMs: event.sampleElapsedMs,
      lastCrossedSectorSeq: null,
      lastCrossingElapsedMs: event.sampleElapsedMs,
      bestLapMs: updatedBestLapMs,
      lastLapMs: lapTimeMs,
      totalLaps: snapshot.totalLaps + 1,
      latestEvent: event,
      currentLapSectorSplitsMs: {},
      completedLaps,
    };
  }

  async function handleSectorCrossing(event: TelemetryDetectionEvent) {
    if (
      snapshot.status !== 'lap_in_progress' ||
      !snapshot.currentLapId ||
      snapshot.currentSectorStartedElapsedMs === null
    ) {
      return;
    }

    await recorder.insertLapSector({
      id: generateId(),
      lapId: snapshot.currentLapId,
      sectorIndex: event.seq - 1,
      splitTimeMs: Math.max(0, Math.round(event.sampleElapsedMs - snapshot.currentSectorStartedElapsedMs)),
    });

    snapshot = {
      ...snapshot,
      lastCrossedSectorSeq: event.seq,
      lastCrossingElapsedMs: event.sampleElapsedMs,
      currentSectorStartedElapsedMs: event.sampleElapsedMs,
      latestEvent: event,
      currentLapSectorSplitsMs: {
        ...snapshot.currentLapSectorSplitsMs,
        [event.seq - 1]: Math.max(
          0,
          Math.round(event.sampleElapsedMs - snapshot.currentSectorStartedElapsedMs)
        ),
      },
    };
  }

  async function handleAcceptedSample(sample: TelemetrySample) {
    if (snapshot.status === 'recording') {
      snapshot = {
        ...snapshot,
        status: 'armed',
      };
    }

    const detectionState = toDetectionState(snapshot);
    const event = detectTimingLineCrossing(
      snapshot.latestAcceptedSample,
      sample,
      timingLines,
      detectionState,
      config?.detectionConfig
    );

    if (event?.type === 'start_finish_crossed') {
      await handleStartFinishCrossing(event);
    } else if (event?.type === 'sector_crossed') {
      await handleSectorCrossing(event);
    } else {
      snapshot = {
        ...snapshot,
        latestEvent: null,
      };
    }

    await recorder.appendGpsSample({
      id: generateId(),
      sessionId: snapshot.sessionId ?? generateId(),
      lapId: snapshot.currentLapId,
      sample,
      isTimingCrossing: event ? 1 : 0,
    });

    const sampleSpeedKph = sample.speedMps !== null ? sample.speedMps * 3.6 : null;

    snapshot = {
      ...snapshot,
      latestAcceptedSample: sample,
      maxSpeedKph:
        sampleSpeedKph === null
          ? snapshot.maxSpeedKph
          : snapshot.maxSpeedKph === null
            ? sampleSpeedKph
            : Math.max(snapshot.maxSpeedKph, sampleSpeedKph),
      bufferedPointCount: recorder.getBufferedPointCount(),
    };

    return event;
  }

  async function handleSample(sample: TelemetrySample): Promise<HandleSampleResult> {
    if (snapshot.status === 'idle' || snapshot.status === 'stopped' || !snapshot.sessionId) {
      throw new Error('Session runtime must be started before handling samples.');
    }

    const validation = filterTelemetrySample(
      snapshot.latestAcceptedSample,
      sample,
      config?.filterConfig
    );

    if (!validation.accepted) {
      return {
        accepted: false,
        rejectionReason: validation.reason,
        snapshot: getSnapshot(),
      };
    }

    const event = await handleAcceptedSample(validation.sample);

    return {
      accepted: true,
      event,
      snapshot: getSnapshot(),
    };
  }

  async function stop() {
    if (!snapshot.sessionId || (snapshot.status !== 'recording' && snapshot.status !== 'armed' && snapshot.status !== 'lap_in_progress')) {
      throw new Error('Session runtime can only stop an active session.');
    }

    await recorder.finalizeSession({
      sessionId: snapshot.sessionId,
      endedAt: new Date(Date.now()).toISOString(),
      status: 'completed',
      bestLapMs: snapshot.bestLapMs,
      totalLaps: snapshot.totalLaps,
      maxSpeedKph: snapshot.maxSpeedKph,
    });

    const sessionEndedAtMs = Date.now();

    snapshot = {
      ...snapshot,
      status: 'stopped',
      sessionEndedAtMs,
      bufferedPointCount: recorder.getBufferedPointCount(),
    };

    return getSnapshot();
  }

  function getSnapshot(): SessionRuntimeSnapshot {
    return { ...snapshot };
  }

  return {
    start,
    stop,
    handleSample,
    getSnapshot,
  };
}
