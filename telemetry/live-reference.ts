import type { TelemetryDetectionEvent, TelemetrySample } from '@/telemetry/types';

// Live delta against the session's best lap, by track position. Display-only:
// this module is fed after the timing runtime has returned and never feeds
// anything back. It copies what it needs out of the inputs and holds no
// shared references, so nothing here can touch lap timing.
//
// Lap and sector start times come from the event stream, never from the
// snapshot: one accepted segment can carry a sector line and the finish line
// together, and by then the snapshot already describes the next lap.

export type LiveReferenceInput = {
  sample: TelemetrySample;
  events: TelemetryDetectionEvent[];
  completedLaps: ReadonlyArray<{
    lapNumber: number;
    lapTimeMs: number;
    isBest: boolean;
    isExcluded: boolean;
  }>;
};

export type LiveDeltaState = {
  // Positive = slower than the reference at this track position.
  deltaMs: number | null;
  // The last sample could not be placed on the reference; deltaMs is held.
  stale: boolean;
  referenceLapNumber: number | null;
  referenceLapTimeMs: number | null;
  // Per sector index, the reference lap's split; null where it was not timed.
  referenceSectorSplitsMs: (number | null)[];
};

export type SectorStatus = 'pending' | 'active' | 'faster' | 'slower' | 'neutral';

type TracePoint = { x: number; y: number; distM: number; lapElapsedMs: number };

const METERS_PER_DEG_LAT = 111320;
const MAX_REGRESS_M = 50;
// Metres of lateral offset one second of delta jump is worth when choosing
// between candidate placements. Low enough that the nearest point on the
// car's own leg always wins locally (a metre along track is tens of ms), high
// enough that a leg implying a jump of seconds loses to any leg within reach.
const JUMP_WEIGHT_M_PER_MS = 0.005;

export function createLiveReference(opts: {
  sectorLineCount: number;
  maxOffsetM?: number;
  decimationM?: number;
}) {
  const sectorLineCount = Math.max(0, opts.sectorLineCount);
  const sectorCount = sectorLineCount > 0 ? sectorLineCount + 1 : 0;
  const maxOffsetM = opts.maxOffsetM ?? 30;
  const decimationM = opts.decimationM ?? 5;

  let origin: { lat: number; lng: number; metersPerDegLng: number } | null = null;
  let buffer: TracePoint[] | null = null;
  let lapStartElapsedMs = 0;
  let sectorStartElapsedMs = 0;
  let lastSectorSeq = 0;
  let splits: (number | null)[] = emptySplits();
  let reference: TracePoint[] | null = null;
  let lastProgressM = 0;
  let knownCompletedCount = 0;
  let state: LiveDeltaState = {
    deltaMs: null,
    stale: false,
    referenceLapNumber: null,
    referenceLapTimeMs: null,
    referenceSectorSplitsMs: emptySplits(),
  };

  function emptySplits(): (number | null)[] {
    return Array.from({ length: sectorCount }, () => null);
  }

  function project(lat: number, lng: number): { x: number; y: number } {
    if (!origin) {
      origin = {
        lat,
        lng,
        metersPerDegLng: METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180),
      };
    }
    return {
      x: (lng - origin.lng) * origin.metersPerDegLng,
      y: (lat - origin.lat) * METERS_PER_DEG_LAT,
    };
  }

  function append(points: TracePoint[], lat: number, lng: number, lapElapsedMs: number) {
    const { x, y } = project(lat, lng);
    const previous = points[points.length - 1];
    const distM = previous ? previous.distM + Math.hypot(x - previous.x, y - previous.y) : 0;
    points.push({ x, y, distM, lapElapsedMs });
  }

  function decimate(points: TracePoint[]): TracePoint[] {
    const kept: TracePoint[] = [];
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const last = kept[kept.length - 1];
      const isLast = i === points.length - 1;
      if (!last || isLast || Math.hypot(point.x - last.x, point.y - last.y) >= decimationM) {
        const distM = last ? last.distM + Math.hypot(point.x - last.x, point.y - last.y) : 0;
        kept.push({ ...point, distM });
      }
    }
    return kept;
  }

  function openLap(event: TelemetryDetectionEvent) {
    buffer = [];
    lapStartElapsedMs = event.sampleElapsedMs;
    sectorStartElapsedMs = event.sampleElapsedMs;
    lastSectorSeq = 0;
    splits = emptySplits();
    append(buffer, event.sampleLat, event.sampleLng, 0);
    lastProgressM = 0;
    state = { ...state, deltaMs: reference ? 0 : null, stale: false };
  }

  function closeLap(event: TelemetryDetectionEvent, completedLaps: LiveReferenceInput['completedLaps']) {
    const grew = completedLaps.length > knownCompletedCount;
    knownCompletedCount = completedLaps.length;

    if (!buffer) {
      return;
    }

    const lapTimeMs = event.sampleElapsedMs - lapStartElapsedMs;
    append(buffer, event.sampleLat, event.sampleLng, lapTimeMs);
    if (sectorCount > 0 && lastSectorSeq === sectorLineCount) {
      splits[sectorCount - 1] = event.sampleElapsedMs - sectorStartElapsedMs;
    }

    const closed = completedLaps[completedLaps.length - 1];
    if (grew && closed && closed.isBest && !closed.isExcluded) {
      reference = decimate(buffer);
      state = {
        ...state,
        referenceLapNumber: closed.lapNumber,
        referenceLapTimeMs: closed.lapTimeMs,
        referenceSectorSplitsMs: splits.slice(),
      };
    }

    buffer = null;
    state = { ...state, deltaMs: null, stale: false };
  }

  function recordSector(event: TelemetryDetectionEvent) {
    if (!buffer) {
      return;
    }
    if (event.seq === lastSectorSeq + 1 && event.seq - 1 < sectorCount) {
      splits[event.seq - 1] = event.sampleElapsedMs - sectorStartElapsedMs;
    }
    lastSectorSeq = event.seq;
    sectorStartElapsedMs = event.sampleElapsedMs;
  }

  // Places a fix on the reference. Every segment within maxOffsetM is a
  // candidate, so a return straight or the far side of a hairpin can be as
  // close as the car's own leg. Candidates are scored by offset plus the delta
  // jump they imply: the true delta drifts by tenths between fixes while a
  // wrong leg implies a jump of seconds.
  function match(lat: number, lng: number, lapElapsedMs: number) {
    if (!reference || reference.length < 2) {
      return;
    }
    const { x, y } = project(lat, lng);
    const previousDeltaMs = state.deltaMs ?? 0;
    let best: { deltaMs: number; progressM: number; score: number } | null = null;

    for (let i = 0; i < reference.length - 1; i++) {
      const a = reference[i];
      const b = reference[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lengthSq = dx * dx + dy * dy;
      const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / lengthSq));
      const offsetM = Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
      if (offsetM > maxOffsetM) {
        continue;
      }
      const progressM = a.distM + t * (b.distM - a.distM);
      if (progressM < lastProgressM - MAX_REGRESS_M) {
        continue;
      }
      const deltaMs = lapElapsedMs - (a.lapElapsedMs + t * (b.lapElapsedMs - a.lapElapsedMs));
      const score = offsetM + JUMP_WEIGHT_M_PER_MS * Math.abs(deltaMs - previousDeltaMs);
      if (!best || score < best.score) {
        best = { deltaMs, progressM, score };
      }
    }

    if (!best) {
      state = { ...state, stale: true };
      return;
    }
    lastProgressM = best.progressM;
    state = { ...state, deltaMs: best.deltaMs, stale: false };
  }

  function onAccepted(input: LiveReferenceInput): LiveDeltaState {
    for (const event of input.events) {
      switch (event.type) {
        case 'sector_crossed':
          recordSector(event);
          break;
        case 'start_finish_crossed':
          closeLap(event, input.completedLaps);
          openLap(event);
          break;
        case 'finish_crossed':
          closeLap(event, input.completedLaps);
          break;
        case 'start_crossed':
          buffer = null;
          openLap(event);
          break;
      }
    }

    if (buffer) {
      const lapElapsedMs = input.sample.elapsedMs - lapStartElapsedMs;
      append(buffer, input.sample.lat, input.sample.lng, lapElapsedMs);
      match(input.sample.lat, input.sample.lng, lapElapsedMs);
    }

    return state;
  }

  return {
    onAccepted,
    getState: () => state,
  };
}

export function deriveSectorStatuses(args: {
  sectorCount: number;
  isLapInProgress: boolean;
  lastCrossedSectorSeq: number | null;
  currentLapSectorSplitsMs: Record<number, number>;
  referenceSectorSplitsMs: (number | null)[];
}): SectorStatus[] {
  const activeIndex = args.isLapInProgress ? args.lastCrossedSectorSeq ?? 0 : -1;
  return Array.from({ length: Math.max(0, args.sectorCount) }, (_, index) => {
    const current = args.currentLapSectorSplitsMs[index];
    if (current !== undefined) {
      const ref = args.referenceSectorSplitsMs[index] ?? null;
      if (ref === null) {
        return 'neutral';
      }
      return current <= ref ? 'faster' : 'slower';
    }
    return index === activeIndex ? 'active' : 'pending';
  });
}

export type SectorCard = {
  status: SectorStatus;
  // Milliseconds to show; `isDelta` says whether it is a gain/loss against
  // the reference or a plain sector time. Null renders as dashes.
  valueMs: number | null;
  isDelta: boolean;
  // 0..1 share of the reference sector covered; 1 once completed.
  progress: number;
};

// Portrait sector cards. A completed sector shows its gain or loss against
// the reference sector, or its time when there is no reference. The active
// sector shows the delta gained or lost inside it so far (live delta minus
// what the completed sectors already account for) when every earlier sector
// has a split and a reference, otherwise its running time. Pass a null
// liveDeltaMs whenever the live delta is not current (GPS lost, stale match,
// pit-in) so a held value is never shown as live feedback.
export function deriveSectorCards(args: {
  statuses: SectorStatus[];
  currentLapSectorSplitsMs: Record<number, number>;
  referenceSectorSplitsMs: (number | null)[];
  activeSectorElapsedMs: number | null;
  liveDeltaMs: number | null;
}): SectorCard[] {
  let completedDeltaMs: number | null = 0;
  return args.statuses.map((status, index) => {
    const split = args.currentLapSectorSplitsMs[index];
    const ref = args.referenceSectorSplitsMs[index] ?? null;

    if (split !== undefined) {
      if (ref === null) {
        completedDeltaMs = null;
        return { status, valueMs: split, isDelta: false, progress: 1 };
      }
      if (completedDeltaMs !== null) {
        completedDeltaMs += split - ref;
      }
      return { status, valueMs: split - ref, isDelta: true, progress: 1 };
    }

    if (status !== 'active') {
      // An earlier sector without a split leaves the delta it carried unknown.
      completedDeltaMs = null;
      return { status, valueMs: null, isDelta: false, progress: 0 };
    }

    {
      const elapsed = args.activeSectorElapsedMs;
      const progress = elapsed !== null && ref !== null && ref > 0 ? Math.min(1, elapsed / ref) : 0;
      if (args.liveDeltaMs !== null && completedDeltaMs !== null && ref !== null) {
        return { status, valueMs: args.liveDeltaMs - completedDeltaMs, isDelta: true, progress };
      }
      return { status, valueMs: elapsed, isDelta: false, progress };
    }
  });
}
