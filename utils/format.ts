import i18n from '@/i18n';

export function formatLapTime(lapTimeMs: number | null) {
  if (lapTimeMs === null) {
    return '--:--.---';
  }

  const totalSeconds = lapTimeMs / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;

  return `${minutes}:${seconds.toFixed(3).padStart(6, '0')}`;
}

export function formatSectorTime(splitTimeMs: number | null) {
  if (splitTimeMs === null) {
    return '---.---';
  }

  return (splitTimeMs / 1000).toFixed(3);
}

export function formatDeltaMs(deltaMs: number | null) {
  if (deltaMs === null) {
    return null;
  }

  const sign = deltaMs >= 0 ? '+' : '−';
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}`;
}

export function formatGapSeconds(deltaMs: number | null) {
  if (deltaMs === null) {
    return i18n.t('common.tbd');
  }

  return (Math.abs(deltaMs) / 1000).toFixed(3);
}

export function formatDateTime(value: string | null) {
  if (!value) {
    return i18n.t('common.tbd');
  }

  return new Date(value).toLocaleString(i18n.locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(startedAt: string, endedAt: string | null) {
  if (!endedAt) {
    return i18n.t('common.tbd');
  }

  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return i18n.t('common.tbd');
  }

  const totalSeconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatDurationMs(elapsedMs: number | null) {
  if (elapsedMs === null) {
    return '0:00';
  }

  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function formatSpeed(maxSpeedKph: number | null) {
  if (maxSpeedKph === null) {
    return i18n.t('common.tbd');
  }

  return `${Math.round(maxSpeedKph)} km/h`;
}
