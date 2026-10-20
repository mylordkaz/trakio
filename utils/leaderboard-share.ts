import type { TrackLeaderboardShareState } from '@/db';

export function shouldOfferLeaderboardShare(
  state: TrackLeaderboardShareState,
  sessionBestLapMs: number | null,
): boolean {
  // Offered only by the session that set the track best, so the time shown
  // in the offer is the time this session just drove.
  if (state.userBestLapMs === null || sessionBestLapMs !== state.userBestLapMs) {
    return false;
  }

  // The best must beat everything already handled: the last offer shown
  // (declines included) and the time known to be on the board.
  return (
    (state.offeredLapTimeMs === null ||
      state.userBestLapMs < state.offeredLapTimeMs) &&
    (state.sharedLapTimeMs === null ||
      state.userBestLapMs < state.sharedLapTimeMs)
  );
}

export function shouldShowSessionShareButton(
  state: TrackLeaderboardShareState,
  sessionBestLapMs: number | null,
): boolean {
  // Only the session holding the track best ever shows the button, so the
  // displayed time is always the time a share uploads.
  if (
    state.userBestLapMs === null ||
    sessionBestLapMs !== state.userBestLapMs
  ) {
    return false;
  }

  return (
    state.sharedLapTimeMs === null ||
    state.userBestLapMs < state.sharedLapTimeMs
  );
}
