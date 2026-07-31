import type { TrackLeaderboardShareState } from '@/db';

export function shouldOfferLeaderboardShare(
  state: TrackLeaderboardShareState,
): boolean {
  if (state.userBestLapMs === null) {
    return false;
  }

  return (
    state.offeredLapTimeMs === null ||
    state.userBestLapMs < state.offeredLapTimeMs
  );
}

export function shouldShowSessionShareButton(
  state: TrackLeaderboardShareState,
  sessionBestLapMs: number | null,
): boolean {
  if (state.userBestLapMs === null) {
    return false;
  }

  if (state.sharedLapTimeMs === null) {
    return true;
  }

  return (
    sessionBestLapMs !== null &&
    sessionBestLapMs === state.userBestLapMs &&
    state.userBestLapMs < state.sharedLapTimeMs
  );
}
