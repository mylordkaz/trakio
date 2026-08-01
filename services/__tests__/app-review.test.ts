import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import {
  countCompletedUserRecordings,
  maybeRequestAppReview,
  type AppReviewClient,
} from '../app-review';

function createDb(count: number) {
  const getFirstAsync = jest.fn().mockResolvedValue({ count });
  const db = { getFirstAsync } as unknown as SQLiteDatabase;
  return { db, getFirstAsync };
}

function createReviewClient({
  alreadyRequested = false,
  available = true,
}: {
  alreadyRequested?: boolean;
  available?: boolean;
} = {}) {
  const client: AppReviewClient = {
    hasRequestedReview: jest.fn(() => alreadyRequested),
    isAvailable: jest.fn(async () => available),
    markRequestedReview: jest.fn(),
    requestReview: jest.fn(async () => undefined),
  };

  return client;
}

describe('app review prompt', () => {
  it('counts only completed user recordings and excludes bundled demos', async () => {
    const { db, getFirstAsync } = createDb(3);

    await expect(countCompletedUserRecordings(db)).resolves.toBe(3);
    const [query, ...params] = getFirstAsync.mock.calls[0];
    expect(query).toContain("status = 'completed'");
    expect(query).toContain('id NOT IN');
    expect(params).toEqual(SESSION_TEST_SEEDS.map((seed) => seed.session.id));
  });

  it('requests once after the third completed user recording', async () => {
    const { db } = createDb(3);
    const client = createReviewClient();

    await expect(maybeRequestAppReview(
      db,
      { id: 'user-session-3', status: 'completed' },
      client,
    )).resolves.toBe(true);

    expect(client.requestReview).toHaveBeenCalledTimes(1);
    expect(client.markRequestedReview).toHaveBeenCalledTimes(1);
  });

  it('does not request before the third recording or after an earlier request', async () => {
    const { db } = createDb(2);
    const belowThresholdClient = createReviewClient();
    const alreadyRequestedClient = createReviewClient({ alreadyRequested: true });

    await expect(maybeRequestAppReview(
      db,
      { id: 'user-session-2', status: 'completed' },
      belowThresholdClient,
    )).resolves.toBe(false);
    await expect(maybeRequestAppReview(
      db,
      { id: 'user-session-3', status: 'completed' },
      alreadyRequestedClient,
    )).resolves.toBe(false);

    expect(belowThresholdClient.requestReview).not.toHaveBeenCalled();
    expect(alreadyRequestedClient.requestReview).not.toHaveBeenCalled();
  });

  it('ignores demo sessions, aborted recordings, and unavailable review flows', async () => {
    const { db } = createDb(3);
    const demoClient = createReviewClient();
    const abortedClient = createReviewClient();
    const unavailableClient = createReviewClient({ available: false });

    await expect(maybeRequestAppReview(
      db,
      {
        id: SESSION_TEST_SEEDS[0].session.id,
        status: 'completed',
      },
      demoClient,
    )).resolves.toBe(false);
    await expect(maybeRequestAppReview(
      db,
      { id: 'aborted-session', status: 'aborted' },
      abortedClient,
    )).resolves.toBe(false);
    await expect(maybeRequestAppReview(
      db,
      { id: 'user-session-3', status: 'completed' },
      unavailableClient,
    )).resolves.toBe(false);

    expect(demoClient.requestReview).not.toHaveBeenCalled();
    expect(abortedClient.requestReview).not.toHaveBeenCalled();
    expect(unavailableClient.requestReview).not.toHaveBeenCalled();
  });
});
