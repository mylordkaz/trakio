import { createSessionRecorder } from '@/db/session-recorder';
import type { TimingLineRow, TrackRow } from '@/db/types';
import { DEFAULT_DETECTION_CONFIG, detectTimingLineCrossings } from '@/telemetry/detection';
import { filterTelemetrySample, type TelemetryFilterConfig } from '@/telemetry/filters';
import type {
  DetectionState,
  TelemetryDetectionConfig,
  TelemetryDetectionEvent,
  TelemetrySample,
  TelemetrySampleRejectionReason,
} from '@/telemetry/types';
import { CROSSING_RECOVERY_ENABLED, JUMP_REANCHOR_ENABLED } from '@/constants/featureFlags';
import { getSectorCount, getSectorLineCount } from '@/utils/timing';

type SessionRecorder = ReturnType<typeof createSessionRecorder>;

type RuntimeStatus = 'idle' | 'recording' | 'armed' | 'lap_in_progress' | 'stopped';

type SessionRuntimeConfig = {
  sessionName?: string | null;
  car?: string | null;
  condition?: string | null;
  temperatureC?: number | null;
  filterConfig?: Partial<TelemetryFilterConfig>;
  detectionConfig?: Partial<TelemetryDetectionConfig>;
  // Bench override; the app uses the feature flag.
  jumpReanchorEnabled?: boolean;
};

// A pause in accepted samples longer than this is surfaced as a recording
// interruption (backgrounded app, GPS dropout, phone call).
const SAMPLE_GAP_THRESHOLD_MS = 3000;

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
  // Wall-clock (Date.now) instants of the current lap/sector start, used only to
  // tick the live timers smoothly. Stored lap/sector times use elapsedMs deltas.
  currentLapStartedWallClockMs: number | null;
  currentSectorStartedWallClockMs: number | null;
  lastCrossedSectorSeq: number | null;
  lastCrossedTimingLineId: string | null;
  lastCrossingElapsedMs: number | null;
  bestLapMs: number | null;
  lastLapMs: number | null;
  totalLaps: number;
  maxSpeedKph: number | null;
  currentLapMaxSpeedKph: number | null;
  pitInMarked: boolean;
  latestAcceptedSample: TelemetrySample | null;
  latestEvent: TelemetryDetectionEvent | null;
  bufferedPointCount: number;
  consecutiveRejectedCount: number;
  lastRejectionReason: TelemetrySampleRejectionReason | null;
  sampleGapCount: number;
  lastSampleGapMs: number | null;
  currentLapSectorSplitsMs: Record<number, number>;
  completedLaps: {
    lapNumber: number;
    lapTimeMs: number;
    deltaToBestMs: number | null;
    isBest: boolean;
    isExcluded: boolean;
    isEstimated: boolean;
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
      events: TelemetryDetectionEvent[];
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

export function createSessionRuntime(args: {
  track: TrackRow;
  timingLines: TimingLineRow[];
  recorder: SessionRecorder;
  config?: SessionRuntimeConfig;
}) {
  const { track, recorder, config } = args;
  const timingLines = getRelevantTimingLines(args.timingLines);
  const sectorCount = getSectorCount(timingLines);
  const sectorLineCount = getSectorLineCount(timingLines);

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
    currentLapStartedWallClockMs: null,
    currentSectorStartedWallClockMs: null,
    lastCrossedSectorSeq: null,
    lastCrossedTimingLineId: null,
    lastCrossingElapsedMs: null,
    bestLapMs: null,
    lastLapMs: null,
    totalLaps: 0,
    maxSpeedKph: null,
    currentLapMaxSpeedKph: null,
    pitInMarked: false,
    latestAcceptedSample: null,
    latestEvent: null,
    bufferedPointCount: 0,
    consecutiveRejectedCount: 0,
    lastRejectionReason: null,
    sampleGapCount: 0,
    lastSampleGapMs: null,
    currentLapSectorSplitsMs: {},
    completedLaps: [],
  };

  // Samples arrive from an async callback while previous samples may still be
  // awaiting DB writes; processing them concurrently would race on the
  // snapshot and double-detect crossings, so everything funnels through here.
  let processingQueue: Promise<unknown> = Promise.resolve();

  // Set by markPitIn; consumed when the next lap starts.
  let pendingOutLap = false;
  // Pit-flagged laps stay visible in the lap list but are excluded from
  // best-lap and delta stats, matching how the saved queries treat them.
  let currentLapIsInLap = false;
  let currentLapIsOutLap = false;
  // Whether the crossing that started the current lap was an estimate.
  let currentLapStartIsEstimated = false;
  // Cascade re-anchor state: the most recent rejected sample, so a following
  // jump-rejection can be validated against the rejected CHAIN instead of the
  // stale anchor; and the start of the current uninterrupted rejection
  // streak, which bounds the liveness fallback.
  let lastRejectedSample: TelemetrySample | null = null;
  let rejectionStreakStartMs: number | null = null;
  const jumpReanchorEnabled = config?.jumpReanchorEnabled ?? JUMP_REANCHOR_ENABLED;

  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const run = processingQueue.then(work);
    processingQueue = run.catch(() => undefined);
    return run;
  }

  function toDetectionState(): DetectionState {
    return {
      lastTimingLineId: snapshot.lastCrossedTimingLineId,
      lastCrossingElapsedMs: snapshot.lastCrossingElapsedMs,
      expectedSectorSeq:
        snapshot.status === 'lap_in_progress'
          ? (snapshot.lastCrossedSectorSeq ?? 0) + 1
          : null,
      currentLapStartedElapsedMs: snapshot.currentLapStartedElapsedMs,
    };
  }

  async function start() {
    return enqueue(async () => {
      if (snapshot.status !== 'idle' && snapshot.status !== 'stopped') {
        throw new Error('Session runtime can only start from idle or stopped state.');
      }

      pendingOutLap = false;
      currentLapIsInLap = false;
      currentLapIsOutLap = false;
      currentLapStartIsEstimated = false;
      lastRejectedSample = null;
      rejectionStreakStartMs = null;

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
        currentLapStartedWallClockMs: null,
        currentSectorStartedWallClockMs: null,
        lastCrossedSectorSeq: null,
        lastCrossedTimingLineId: null,
        lastCrossingElapsedMs: null,
        lastLapMs: null,
        currentLapMaxSpeedKph: null,
        pitInMarked: false,
        latestAcceptedSample: null,
        latestEvent: null,
        bufferedPointCount: recorder.getBufferedPointCount(),
        consecutiveRejectedCount: 0,
        lastRejectionReason: null,
        sampleGapCount: 0,
        lastSampleGapMs: null,
        currentLapSectorSplitsMs: {},
        completedLaps: [],
      };

      return getSnapshot();
    });
  }

  async function handleStartFinishCrossing(event: TelemetryDetectionEvent) {
    if (!snapshot.sessionId) {
      return;
    }

    const crossedAtWallClockMs = Date.now();

    if (snapshot.status === 'armed') {
      const lapId = generateId();

      await recorder.startLap({
        id: lapId,
        sessionId: snapshot.sessionId,
        lapNumber: 1,
        startedAt: new Date(event.sampleRecordedAt).toISOString(),
        startedLatitude: event.sampleLat,
        startedLongitude: event.sampleLng,
        isOutLap: pendingOutLap ? 1 : 0,
      });
      currentLapIsOutLap = pendingOutLap;
      currentLapIsInLap = false;
      pendingOutLap = false;
      currentLapStartIsEstimated = event.quality === 'degraded';

      snapshot = {
        ...snapshot,
        status: 'lap_in_progress',
        currentLapId: lapId,
        currentLapNumber: 1,
        currentLapStartedElapsedMs: event.sampleElapsedMs,
        currentSectorStartedElapsedMs: event.sampleElapsedMs,
        currentLapStartedWallClockMs: crossedAtWallClockMs,
        currentSectorStartedWallClockMs: crossedAtWallClockMs,
        lastCrossedSectorSeq: null,
        lastCrossedTimingLineId: event.timingLineId,
        lastCrossingElapsedMs: event.sampleElapsedMs,
        currentLapMaxSpeedKph: null,
        pitInMarked: false,
        latestEvent: event,
        currentLapSectorSplitsMs: {},
      };

      return;
    }

    if (snapshot.status !== 'lap_in_progress' || !snapshot.currentLapId || snapshot.currentLapStartedElapsedMs === null) {
      return;
    }

    // The closing split is only trustworthy when every sector line of the lap
    // was actually crossed; otherwise it would silently span skipped sectors.
    if (
      sectorCount > 0 &&
      snapshot.currentSectorStartedElapsedMs !== null &&
      snapshot.lastCrossedSectorSeq === sectorLineCount
    ) {
      await recorder.insertLapSector({
        id: generateId(),
        lapId: snapshot.currentLapId,
        sectorIndex: sectorCount - 1,
        splitTimeMs: Math.max(0, Math.round(event.sampleElapsedMs - snapshot.currentSectorStartedElapsedMs)),
      });
    }

    const lapTimeMs = Math.max(0, Math.round(event.sampleElapsedMs - snapshot.currentLapStartedElapsedMs));
    const isExcludedLap = currentLapIsInLap || currentLapIsOutLap;
    const isEstimatedLap = currentLapStartIsEstimated || event.quality === 'degraded';
    const updatedBestLapMs = isExcludedLap
      ? snapshot.bestLapMs
      : snapshot.bestLapMs === null
        ? lapTimeMs
        : Math.min(snapshot.bestLapMs, lapTimeMs);
    const completedLaps = [
      ...snapshot.completedLaps,
      {
        lapNumber: snapshot.currentLapNumber,
        lapTimeMs,
        deltaToBestMs: null as number | null,
        isBest: false,
        isExcluded: isExcludedLap,
        isEstimated: isEstimatedLap,
      },
    ].map((lap) => ({
      ...lap,
      deltaToBestMs:
        lap.isExcluded || updatedBestLapMs === null || lap.lapTimeMs === updatedBestLapMs
          ? null
          : lap.lapTimeMs - updatedBestLapMs,
      isBest: !lap.isExcluded && lap.lapTimeMs === updatedBestLapMs,
    }));

    await recorder.finishLap({
      lapId: snapshot.currentLapId,
      endedAt: new Date(event.sampleRecordedAt).toISOString(),
      lapTimeMs,
      maxSpeedKph: snapshot.currentLapMaxSpeedKph,
      isTimingEstimated: isEstimatedLap ? 1 : 0,
    });

    const nextLapNumber = snapshot.currentLapNumber + 1;
    const nextLapId = generateId();

    await recorder.startLap({
      id: nextLapId,
      sessionId: snapshot.sessionId,
      lapNumber: nextLapNumber,
      startedAt: new Date(event.sampleRecordedAt).toISOString(),
      startedLatitude: event.sampleLat,
      startedLongitude: event.sampleLng,
      isOutLap: pendingOutLap ? 1 : 0,
    });
    currentLapIsOutLap = pendingOutLap;
    currentLapIsInLap = false;
    pendingOutLap = false;
    currentLapStartIsEstimated = event.quality === 'degraded';

    snapshot = {
      ...snapshot,
      status: 'lap_in_progress',
      currentLapId: nextLapId,
      currentLapNumber: nextLapNumber,
      currentLapStartedElapsedMs: event.sampleElapsedMs,
      currentSectorStartedElapsedMs: event.sampleElapsedMs,
      currentLapStartedWallClockMs: crossedAtWallClockMs,
      currentSectorStartedWallClockMs: crossedAtWallClockMs,
      lastCrossedSectorSeq: null,
      lastCrossedTimingLineId: event.timingLineId,
      lastCrossingElapsedMs: event.sampleElapsedMs,
      bestLapMs: updatedBestLapMs,
      lastLapMs: lapTimeMs,
      totalLaps: snapshot.totalLaps + 1,
      currentLapMaxSpeedKph: null,
      pitInMarked: false,
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

    const crossedAtWallClockMs = Date.now();

    const expectedSectorSeq = (snapshot.lastCrossedSectorSeq ?? 0) + 1;
    const splitTimeMs = Math.max(
      0,
      Math.round(event.sampleElapsedMs - snapshot.currentSectorStartedElapsedMs)
    );

    // A crossing beyond the expected line means at least one line was missed
    // (GPS gap); timing continues but the spanned split is not recorded.
    const isExpectedSector = event.seq === expectedSectorSeq;

    if (isExpectedSector) {
      await recorder.insertLapSector({
        id: generateId(),
        lapId: snapshot.currentLapId,
        sectorIndex: event.seq - 1,
        splitTimeMs,
      });
    }

    snapshot = {
      ...snapshot,
      lastCrossedSectorSeq: event.seq,
      lastCrossedTimingLineId: event.timingLineId,
      lastCrossingElapsedMs: event.sampleElapsedMs,
      currentSectorStartedElapsedMs: event.sampleElapsedMs,
      currentSectorStartedWallClockMs: crossedAtWallClockMs,
      latestEvent: event,
      currentLapSectorSplitsMs: isExpectedSector
        ? {
            ...snapshot.currentLapSectorSplitsMs,
            [event.seq - 1]: splitTimeMs,
          }
        : snapshot.currentLapSectorSplitsMs,
    };
  }

  // detectionPrevious overrides the segment detection sees. The re-anchor
  // path passes the validated rejected chain (timing must never run on the
  // displaced-anchor chord that was just proven impossible); the liveness
  // fallback passes null to suppress detection entirely for its correction
  // step (nothing across the ambiguous span may be timed). undefined means
  // the normal segment from the latest accepted sample.
  async function handleAcceptedSample(
    sample: TelemetrySample,
    detectionPrevious?: TelemetrySample | null
  ) {
    const sessionId = snapshot.sessionId;
    if (!sessionId) {
      throw new Error('Session runtime received a sample without an active session.');
    }

    if (snapshot.status === 'recording') {
      snapshot = {
        ...snapshot,
        status: 'armed',
      };
    }

    const previousAcceptedSample = snapshot.latestAcceptedSample;
    const gapMs = previousAcceptedSample
      ? sample.recordedAt - previousAcceptedSample.recordedAt
      : null;
    const hasGap = gapMs !== null && gapMs > SAMPLE_GAP_THRESHOLD_MS;

    const events = detectTimingLineCrossings(
      detectionPrevious === undefined ? previousAcceptedSample : detectionPrevious,
      sample,
      timingLines,
      toDetectionState(),
      { recoveryEnabled: CROSSING_RECOVERY_ENABLED, ...config?.detectionConfig }
    );

    for (const event of events) {
      if (event.type === 'start_finish_crossed') {
        await handleStartFinishCrossing(event);
      } else {
        await handleSectorCrossing(event);
      }
    }

    if (events.length === 0) {
      snapshot = {
        ...snapshot,
        latestEvent: null,
      };
    }

    await recorder.appendGpsSample({
      id: generateId(),
      sessionId,
      lapId: snapshot.currentLapId,
      sample,
      isTimingCrossing: events.length > 0 ? 1 : 0,
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
      currentLapMaxSpeedKph:
        sampleSpeedKph === null
          ? snapshot.currentLapMaxSpeedKph
          : snapshot.currentLapMaxSpeedKph === null
            ? sampleSpeedKph
            : Math.max(snapshot.currentLapMaxSpeedKph, sampleSpeedKph),
      bufferedPointCount: recorder.getBufferedPointCount(),
      consecutiveRejectedCount: 0,
      lastRejectionReason: null,
      sampleGapCount: hasGap ? snapshot.sampleGapCount + 1 : snapshot.sampleGapCount,
      lastSampleGapMs: hasGap ? gapMs : snapshot.lastSampleGapMs,
    };

    return events;
  }

  async function processSample(sample: TelemetrySample): Promise<HandleSampleResult> {
    if (snapshot.status === 'idle' || snapshot.status === 'stopped' || !snapshot.sessionId) {
      throw new Error('Session runtime must be started before handling samples.');
    }

    const validation = filterTelemetrySample(
      snapshot.latestAcceptedSample,
      sample,
      config?.filterConfig
    );

    if (!validation.accepted) {
      // Cascade re-anchor, scoped to short cascades. A second consecutive
      // impossible_jump consistent with the previously REJECTED sample
      // proves the accepted anchor was displaced, so detection runs on the
      // validated chain — the anchor chord is never timed. Across a
      // hole-spanning gap this proof does not hold (the rejection may be an
      // honest allowance shortfall) and the chain would be entirely
      // post-hole, so long-gap rejections fall through: the allowance grows
      // until a sample is CONSISTENT with the anchor and crossing recovery
      // times that uncontradicted chord, flagged. The extra rejected fixes
      // stay in quarantine, which the display merges anyway.
      const anchorGapMs = snapshot.latestAcceptedSample
        ? sample.recordedAt - snapshot.latestAcceptedSample.recordedAt
        : Infinity;
      const recoveryMinGapMs =
        config?.detectionConfig?.recoveryMinGapMs ?? DEFAULT_DETECTION_CONFIG.recoveryMinGapMs;

      // Chain continuity for this sample vs the previous rejection, computed
      // once: it drives the re-anchor, the liveness fallback, and the
      // streak bookkeeping below.
      const chainPrevious =
        validation.reason === 'impossible_jump' &&
        snapshot.lastRejectionReason === 'impossible_jump' &&
        lastRejectedSample !== null
          ? lastRejectedSample
          : null;
      const chainValidation = chainPrevious
        ? filterTelemetrySample(chainPrevious, sample, config?.filterConfig)
        : null;
      const chainConsistent = chainValidation !== null && chainValidation.accepted;

      if (jumpReanchorEnabled && chainConsistent && anchorGapMs <= recoveryMinGapMs) {
        lastRejectedSample = null;
        rejectionStreakStartMs = null;
        const events = await handleAcceptedSample(chainValidation.sample, chainPrevious!);

        return {
          accepted: true,
          events,
          snapshot: getSnapshot(),
        };
      }

      // Liveness fallback: with a long-gap anchor, the direct allowance is
      // not guaranteed to catch up (it grows with reported speed while
      // displacement integrates actual speed) — without an escape, one
      // stale anchor could reject every remaining sample of the session.
      // Once the CONTINUOUSLY CHAIN-VALID jump streak has lasted longer
      // than recoveryMinGapMs while the anchor kept rejecting, re-anchor to
      // restore capture — but suppress detection for this step: nothing
      // across the ambiguous span is timed. An in-span crossing is honestly
      // missed, never guessed. The anchor-consistent chord path (crossing
      // recovery, flagged) always wins first when it can: real hole
      // re-entries become consistent within a couple of samples, so this
      // fires only when that path is unreachable.
      if (
        jumpReanchorEnabled &&
        chainConsistent &&
        anchorGapMs > recoveryMinGapMs &&
        rejectionStreakStartMs !== null &&
        sample.recordedAt - rejectionStreakStartMs > recoveryMinGapMs
      ) {
        lastRejectedSample = null;
        rejectionStreakStartMs = null;
        const events = await handleAcceptedSample(chainValidation.sample, null);

        return {
          accepted: true,
          events,
          snapshot: getSnapshot(),
        };
      }

      lastRejectedSample = sample;

      // The liveness timer tracks only the continuously chain-valid
      // impossible-jump sequence: any other rejection reason clears it, an
      // inconsistent hop restarts it at this sample (which may head a new
      // chain), and a validated hop backdates it to the chain's first
      // sample.
      if (validation.reason !== 'impossible_jump') {
        rejectionStreakStartMs = null;
      } else if (!chainConsistent) {
        rejectionStreakStartMs = sample.recordedAt;
      } else if (rejectionStreakStartMs === null) {
        rejectionStreakStartMs = chainPrevious!.recordedAt;
      }

      if (snapshot.sessionId) {
        await recorder.recordRejectedSample({
          id: generateId(),
          sessionId: snapshot.sessionId,
          sample,
          reason: validation.reason,
        });
      }

      snapshot = {
        ...snapshot,
        consecutiveRejectedCount: snapshot.consecutiveRejectedCount + 1,
        lastRejectionReason: validation.reason,
      };

      return {
        accepted: false,
        rejectionReason: validation.reason,
        snapshot: getSnapshot(),
      };
    }

    lastRejectedSample = null;
    rejectionStreakStartMs = null;
    const events = await handleAcceptedSample(validation.sample);

    return {
      accepted: true,
      events,
      snapshot: getSnapshot(),
    };
  }

  async function handleSample(sample: TelemetrySample): Promise<HandleSampleResult> {
    return enqueue(() => processSample(sample));
  }

  // Marks the lap currently in progress as an in-lap (ends in the pits) and
  // the next lap that starts as an out-lap; both are excluded from stats.
  async function markPitIn() {
    return enqueue(async () => {
      pendingOutLap = true;

      if (snapshot.status === 'lap_in_progress' && snapshot.currentLapId) {
        currentLapIsInLap = true;
        await recorder.setLapInLap({ lapId: snapshot.currentLapId, isInLap: 1 });
      }

      snapshot = {
        ...snapshot,
        pitInMarked: true,
      };

      return getSnapshot();
    });
  }

  async function stop() {
    return enqueue(async () => {
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

      snapshot = {
        ...snapshot,
        status: 'stopped',
        sessionEndedAtMs: Date.now(),
        bufferedPointCount: recorder.getBufferedPointCount(),
      };

      return getSnapshot();
    });
  }

  function getSnapshot(): SessionRuntimeSnapshot {
    return { ...snapshot };
  }

  function resetContinuity(): void {
    snapshot = { ...snapshot, latestAcceptedSample: null };
  }

  return {
    start,
    stop,
    handleSample,
    markPitIn,
    getSnapshot,
    resetContinuity,
  };
}
