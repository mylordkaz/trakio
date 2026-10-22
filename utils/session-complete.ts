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

// Every first or new best is offered, unless that time or a faster one is
// already on the board.
export function shouldOfferShareOnCompletion(
  outcome: SessionOutcome,
  bestLapMs: number | null,
  sharedLapTimeMs: number | null,
): boolean {
  if (bestLapMs === null || (outcome !== 'firstAtTrack' && outcome !== 'newBest')) {
    return false;
  }
  return sharedLapTimeMs === null || bestLapMs < sharedLapTimeMs;
}
