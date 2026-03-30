import i18n from '@/i18n';
import type { SessionDetail } from '@/db';
import type { LapBreakdownItem } from '@/components/LapBreakdown';
import { formatLapTime, formatSectorTime, formatDeltaMs } from '@/utils/format';

export function getSectorCount(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return 0;
  }

  const sectorLineCount = sessionDetail.timingLines.filter((timingLine) => timingLine.type === 'sector').length;
  const hasStartFinish = sessionDetail.timingLines.some((timingLine) => timingLine.type === 'start_finish');

  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (hasStartFinish ? 1 : 0);
}

export function getValidTimedLaps(sessionDetail: SessionDetail | null) {
  return (sessionDetail?.laps ?? []).filter(
    (lap) => lap.lapTimeMs !== null && lap.isInvalid === 0 && lap.isOutLap === 0
  );
}

export function getBestLapMs(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  if (sessionDetail.session.bestLapMs !== null) {
    return sessionDetail.session.bestLapMs;
  }

  const validTimedLaps = getValidTimedLaps(sessionDetail);
  if (validTimedLaps.length === 0) {
    return null;
  }

  return Math.min(...validTimedLaps.map((lap) => lap.lapTimeMs ?? Number.MAX_SAFE_INTEGER));
}

export function getBestLap(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  if (validTimedLaps.length === 0) {
    return null;
  }

  return validTimedLaps.reduce(
    (best, lap) => {
      if (
        !best ||
        (lap.lapTimeMs ?? Number.MAX_SAFE_INTEGER) <
          (best.lapTimeMs ?? Number.MAX_SAFE_INTEGER)
      ) {
        return lap;
      }

      return best;
    },
    null as (typeof validTimedLaps)[number] | null,
  );
}

export function getTopSpeedKph(sessionDetail: SessionDetail | null) {
  if (!sessionDetail) {
    return null;
  }

  const speedCandidates = [
    sessionDetail.session.maxSpeedKph,
    ...sessionDetail.laps.map((lap) => lap.maxSpeedKph),
    ...sessionDetail.gpsPoints.map((point) => (point.speedMps !== null ? point.speedMps * 3.6 : null)),
  ].filter((value): value is number => value !== null);

  if (speedCandidates.length === 0) {
    return null;
  }

  return Math.max(...speedCandidates);
}

export function getTheoreticalBestMs(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  const sectorCount = getSectorCount(sessionDetail);

  if (validTimedLaps.length === 0 || sectorCount === 0) {
    return null;
  }

  const bestSectors = Array.from({ length: sectorCount }, (_, index) => {
    const candidates = validTimedLaps
      .map((lap) => lap.sectors.find((sector) => sector.sectorIndex === index)?.splitTimeMs ?? null)
      .filter((value): value is number => value !== null);

    return candidates.length > 0 ? Math.min(...candidates) : null;
  });

  if (bestSectors.some((value) => value === null)) {
    return null;
  }

  return bestSectors
    .filter((value): value is number => value !== null)
    .reduce((sum, value) => sum + value, 0);
}

export function getConsistencyValue(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length < 2) {
    return 100;
  }

  const lapTimes = validTimedLaps.map((lap) => lap.lapTimeMs ?? 0);
  const average = lapTimes.reduce((sum, value) => sum + value, 0) / lapTimes.length;
  const spread = Math.max(...lapTimes) - Math.min(...lapTimes);
  const score = 100 - (spread / average) * 100;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getLapBreakdownItems(sessionDetail: SessionDetail | null): LapBreakdownItem[] {
  const validTimedLaps = getValidTimedLaps(sessionDetail);
  const bestLapMs = getBestLapMs(sessionDetail);
  const sectorCount = getSectorCount(sessionDetail);

  return validTimedLaps.map((lap) => {
    const sectorMs = Array.from({ length: sectorCount }, (_, index) => {
      const sector = lap.sectors.find((lapSector) => lapSector.sectorIndex === index);
      return sector?.splitTimeMs ?? null;
    });
    const deltaMs =
      bestLapMs !== null && lap.lapTimeMs !== null && lap.lapTimeMs !== bestLapMs
        ? lap.lapTimeMs - bestLapMs
        : null;

    return {
      lap: lap.lapNumber,
      time: formatLapTime(lap.lapTimeMs),
      timeMs: lap.lapTimeMs ?? 0,
      delta: deltaMs === null ? null : formatDeltaMs(deltaMs),
      sectors: sectorMs.map((value) => formatSectorTime(value)),
      sectorMs,
    };
  });
}

export function getAverageLapDeltaLabel(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length < 2) {
    return i18n.t('common.tbd');
  }

  const deltas = validTimedLaps.slice(1).map((lap, index) => {
    const previousLap = validTimedLaps[index];
    return (lap.lapTimeMs ?? 0) - (previousLap.lapTimeMs ?? 0);
  });
  const averageDelta = deltas.reduce((sum, value) => sum + value, 0) / deltas.length;
  const sign = averageDelta >= 0 ? '+' : '−';

  return `${sign}${(Math.abs(averageDelta) / 1000).toFixed(1)}s`;
}

export function getTrendBars(sessionDetail: SessionDetail | null) {
  const validTimedLaps = getValidTimedLaps(sessionDetail);

  if (validTimedLaps.length === 0) {
    return [];
  }

  const lapTimes = validTimedLaps.map((lap) => lap.lapTimeMs ?? 0);
  const fastest = Math.min(...lapTimes);
  const slowest = Math.max(...lapTimes);
  const range = slowest - fastest;

  return validTimedLaps.map((lap) => ({
    lap: lap.lapNumber,
    best: lap.lapTimeMs === fastest,
    height:
      range === 0
        ? 100
        : Math.round(55 + ((slowest - (lap.lapTimeMs ?? slowest)) / range) * 45),
  }));
}
