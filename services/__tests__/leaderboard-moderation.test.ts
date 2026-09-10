import type { SQLiteDatabase } from 'expo-sqlite';
import { submitFeedback } from '../feedback';
import type { LeaderboardEntry } from '../leaderboard';
import {
  blockLeaderboardPublisher,
  filterBlockedLeaderboardEntries,
  getBlockedLeaderboardPublisherIds,
  submitLeaderboardModerationRequest,
} from '../leaderboard-moderation';

jest.mock('../feedback', () => ({
  submitFeedback: jest.fn().mockResolvedValue({ ok: true, feedbackId: 'feedback-1' }),
}));

function createDbMock(storedValue: string | undefined = undefined) {
  const execAsync = jest.fn().mockResolvedValue(undefined);
  const getFirstAsync = jest.fn().mockResolvedValue(
    storedValue === undefined ? null : { value: storedValue },
  );
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const db = { execAsync, getFirstAsync, runAsync } as unknown as SQLiteDatabase;

  return { db, execAsync, getFirstAsync, runAsync };
}

function entry(overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank: 1,
    publisherId: 'driver-1',
    name: 'Driver One',
    firstName: 'Driver',
    countryCode: 'JP',
    car: 'Roadster',
    lapTimeMs: 60000,
    submittedAt: '2026-09-10T00:00:00.000Z',
    isCurrentUser: false,
    ...overrides,
  };
}

describe('leaderboard moderation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads valid blocked publisher ids and tolerates malformed metadata', async () => {
    const stored = createDbMock('["driver-1","driver-2",42,""]');
    await expect(getBlockedLeaderboardPublisherIds(stored.db)).resolves.toEqual(
      new Set(['driver-1', 'driver-2']),
    );

    const malformed = createDbMock('{not-json');
    await expect(getBlockedLeaderboardPublisherIds(malformed.db)).resolves.toEqual(new Set());
  });

  it('persists a newly blocked publisher', async () => {
    const { db, runAsync } = createDbMock('["driver-1"]');

    await blockLeaderboardPublisher(db, 'driver-2');

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT(key) DO UPDATE'),
      'leaderboard_blocked_publishers_v1',
      '["driver-1","driver-2"]',
    );
  });

  it('hides blocked entries but never hides the current user', () => {
    const entries = [
      entry(),
      entry({ publisherId: 'me', name: 'Me', isCurrentUser: true }),
    ];

    expect(
      filterBlockedLeaderboardEntries(entries, new Set(['driver-1', 'me'])),
    ).toEqual([entries[1]]);
  });

  it('sends a structured report through the hosted request service', async () => {
    await submitLeaderboardModerationRequest({
      action: 'report',
      entry: entry(),
      trackId: 'tsukuba',
      reporterPublisherId: 'reporter-1',
      locale: 'en',
    });

    expect(submitFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Leaderboard report',
        publisherId: 'reporter-1',
        locale: 'en',
        message: expect.stringContaining('reported_publisher_id=driver-1'),
      }),
    );
  });
});
