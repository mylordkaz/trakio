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

// These run during render, so they must not reach for the mutable global
// locale: the caller passes the text for an absent value, which keeps the
// result keyed on the language React can see.
export function formatGapSeconds(deltaMs: number | null, tbd: string) {
  if (deltaMs === null) {
    return tbd;
  }

  return (Math.abs(deltaMs) / 1000).toFixed(3);
}

export function formatDateTime(value: string | null, locale: string, tbd: string) {
  if (!value) {
    return tbd;
  }

  return new Date(value).toLocaleString(locale === 'ja' ? 'ja-JP' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDuration(startedAt: string, endedAt: string | null, tbd: string) {
  if (!endedAt) {
    return tbd;
  }

  const diffMs = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) {
    return tbd;
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

export function formatDistanceKm(meters: number) {
  const km = meters / 1000;

  return km >= 100 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}

export function formatSpeed(maxSpeedKph: number | null, tbd: string) {
  if (maxSpeedKph === null) {
    return tbd;
  }

  return `${Math.round(maxSpeedKph)} km/h`;
}
