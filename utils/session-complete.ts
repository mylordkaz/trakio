export type SessionOutcome = 'noTimedLap' | 'firstAtTrack' | 'newBest' | 'saved';

export function getSessionOutcome(
  sessionBestLapMs: number | null,
  previousTrackBestLapMs: number | null,
): SessionOutcome {
  if (sessionBestLapMs === null) {
    return 'noTimedLap';
  }
  if (previousTrackBestLapMs === null) {
    return 'firstAtTrack';
  }
  return sessionBestLapMs < previousTrackBestLapMs ? 'newBest' : 'saved';
}
