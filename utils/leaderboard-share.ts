import type { TrackLeaderboardShareState } from '@/db';

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
