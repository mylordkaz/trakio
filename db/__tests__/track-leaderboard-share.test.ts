import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import {
  getTrackLeaderboardShareState,
  recordLeaderboardOffer,
  recordLeaderboardShare,
} from '../tracks';

function createDbMock() {
  const getFirstAsync = jest.fn();
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const db = { getFirstAsync, runAsync } as unknown as SQLiteDatabase;

  return { db, getFirstAsync, runAsync };
}

describe('track leaderboard share state', () => {
  it('excludes demo seed sessions from the shareable best', async () => {
    const { db, getFirstAsync } = createDbMock();
    getFirstAsync
      .mockResolvedValueOnce({ best_ms: 71500 })
      .mockResolvedValueOnce({
        leaderboard_lap_time_ms: null,
        leaderboard_offered_lap_time_ms: null,
      });

    const state = await getTrackLeaderboardShareState(db, 'tsukuba2000');

    expect(state).toEqual({
      userBestLapMs: 71500,
      sharedLapTimeMs: null,
      offeredLapTimeMs: null,
    });

    const [bestQuery, ...bestParams] = getFirstAsync.mock.calls[0];
    expect(bestQuery).toContain('NOT IN');
    expect(bestParams).toEqual([
      'tsukuba2000',
      ...SESSION_TEST_SEEDS.map((seed) => seed.session.id),
    ]);
  });

  it('records a share against both the shared and offered columns', async () => {
    const { db, runAsync } = createDbMock();

    await recordLeaderboardShare(db, 'tsukuba2000', 61800);

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('leaderboard_lap_time_ms'),
      61800,
      61800,
      'tsukuba2000',
    );
  });

  it('records an offer without touching the shared column', async () => {
    const { db, runAsync } = createDbMock();

    await recordLeaderboardOffer(db, 'tsukuba2000', 61800);

    const [query] = runAsync.mock.calls[0];
    expect(query).toContain('leaderboard_offered_lap_time_ms');
    expect(query).not.toContain('leaderboard_lap_time_ms =');
  });
});
