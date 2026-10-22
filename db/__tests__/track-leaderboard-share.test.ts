import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import {
  getTrackBestLapMsExcludingSession,
  getTrackLeaderboardShareState,
  recordLeaderboardShare,
  setSharedLeaderboardTime,
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
    expect(bestQuery).toContain('l.is_in_lap = 0');
    expect(bestParams).toEqual([
      'tsukuba2000',
      ...SESSION_TEST_SEEDS.map((seed) => seed.session.id),
    ]);
  });

  it('reads the track best from every other session, seeds excluded', async () => {
    const { db, getFirstAsync } = createDbMock();
    getFirstAsync.mockResolvedValueOnce({ best_ms: 72100 });

    await expect(
      getTrackBestLapMsExcludingSession(db, 'tsukuba2000', 'session-1'),
    ).resolves.toBe(72100);

    const [query, ...params] = getFirstAsync.mock.calls[0];
    expect(query).toContain('s.id <> ?');
    expect(query).toContain('NOT IN');
    expect(params).toEqual([
      'tsukuba2000',
      'session-1',
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
      61800,
    );
  });

  it('adopts a server time without touching the offered watermark', async () => {
    const { db, runAsync } = createDbMock();

    await setSharedLeaderboardTime(db, 'tsukuba2000', 76820);

    const [query] = runAsync.mock.calls[0];
    expect(query).toContain('leaderboard_lap_time_ms =');
    expect(query).not.toContain('leaderboard_offered_lap_time_ms');
  });
});

describe('leaderboard reconciliation with SQLite', () => {
  let sqlite: DatabaseSync;
  let db: SQLiteDatabase;

  beforeEach(() => {
    sqlite = new DatabaseSync(':memory:');
    sqlite.exec(`CREATE TABLE tracks (
      id TEXT PRIMARY KEY,
      leaderboard_lap_time_ms INTEGER,
      leaderboard_offered_lap_time_ms INTEGER,
      updated_at TEXT
    );
    INSERT INTO tracks (id) VALUES ('tsukuba2000');`);
    db = {
      runAsync: async (query: string, ...params: (string | number | null)[]) =>
        sqlite.prepare(query).run(...params),
    } as unknown as SQLiteDatabase;
  });

  afterEach(() => {
    sqlite.close();
  });

  function readTimes() {
    return sqlite.prepare(`SELECT leaderboard_lap_time_ms AS shared,
      leaderboard_offered_lap_time_ms AS offered FROM tracks
      WHERE id = 'tsukuba2000';`).get();
  }

  it('adopts the first server time and subsequent improvements', async () => {
    await setSharedLeaderboardTime(db, 'tsukuba2000', 62000);
    expect(readTimes()).toEqual({ shared: 62000, offered: null });

    await setSharedLeaderboardTime(db, 'tsukuba2000', 61800);
    expect(readTimes()).toEqual({ shared: 61800, offered: null });
  });

  it('preserves a successful share when an older leaderboard response arrives later', async () => {
    await setSharedLeaderboardTime(db, 'tsukuba2000', 62000);
    let resolveResponse!: (lapTimeMs: number) => void;
    const response = new Promise<number>((resolve) => { resolveResponse = resolve; });
    const reconciliation = response.then((lapTimeMs) =>
      setSharedLeaderboardTime(db, 'tsukuba2000', lapTimeMs));

    await recordLeaderboardShare(db, 'tsukuba2000', 61800);
    resolveResponse(62000);
    await reconciliation;

    expect(readTimes()).toEqual({ shared: 61800, offered: 61800 });
  });

  it('keeps the fastest server time when responses arrive out of order', async () => {
    await setSharedLeaderboardTime(db, 'tsukuba2000', 61800);
    await setSharedLeaderboardTime(db, 'tsukuba2000', 62000);
    expect(readTimes()).toEqual({ shared: 61800, offered: null });

    await setSharedLeaderboardTime(db, 'tsukuba2000', 61800);

    expect(readTimes()).toEqual({ shared: 61800, offered: null });
  });

  it('preserves a faster server time when an older share finishes later', async () => {
    await setSharedLeaderboardTime(db, 'tsukuba2000', 61800);
    await recordLeaderboardShare(db, 'tsukuba2000', 62000);

    expect(readTimes()?.shared).toBe(61800);
  });
});
