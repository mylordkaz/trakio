import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import {
  FREE_SESSION_LIMIT,
  calculateSessionQuota,
  countUserSessions,
} from '../session-quota';

describe('session quota', () => {
  it.each([
    [0, true, 3],
    [1, true, 2],
    [2, true, 1],
    [3, false, 0],
    [4, false, 0],
  ])('calculates a free quota for %i saved sessions', (used, canRecord, remaining) => {
    expect(calculateSessionQuota(used, false)).toEqual({
      used,
      limit: FREE_SESSION_LIMIT,
      remaining,
      canRecord,
    });
  });

  it('never limits Pro access', () => {
    expect(calculateSessionQuota(100, true)).toEqual({
      used: 100,
      limit: null,
      remaining: null,
      canRecord: true,
    });
  });

  it('excludes every bundled demo session from the database count', async () => {
    const getFirstAsync = jest.fn().mockResolvedValue({ count: 2 });
    const db = { getFirstAsync } as unknown as SQLiteDatabase;

    await expect(countUserSessions(db)).resolves.toBe(2);
    expect(getFirstAsync).toHaveBeenCalledTimes(1);
    const [query, ...params] = getFirstAsync.mock.calls[0];
    expect(query).toContain('id NOT IN');
    expect(params).toEqual(SESSION_TEST_SEEDS.map((seed) => seed.session.id));
  });
});
