import type { SQLiteDatabase } from 'expo-sqlite';
import { Storage } from 'expo-sqlite/kv-store';
import * as StoreReview from 'expo-store-review';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import type { SessionStatus } from '@/db/types';

const REVIEW_REQUESTED_KEY = 'review_requested';
export const REVIEW_SESSION_THRESHOLD = 3;

const SEEDED_SESSION_IDS = new Set(
  SESSION_TEST_SEEDS.map((seed) => seed.session.id),
);

export type AppReviewClient = {
  hasRequestedReview: () => boolean;
  isAvailable: () => Promise<boolean>;
  markRequestedReview: () => void;
  requestReview: () => Promise<void>;
};

const nativeAppReviewClient: AppReviewClient = {
  hasRequestedReview: () => Boolean(Storage.getItemSync(REVIEW_REQUESTED_KEY)),
  isAvailable: () => StoreReview.isAvailableAsync(),
  markRequestedReview: () => Storage.setItemSync(REVIEW_REQUESTED_KEY, '1'),
  requestReview: () => StoreReview.requestReview(),
};

export async function countCompletedUserRecordings(
  db: SQLiteDatabase,
): Promise<number> {
  const seedIds = [...SEEDED_SESSION_IDS];
  const placeholders = seedIds.map(() => '?').join(', ');
  const seedFilter =
    seedIds.length > 0 ? `AND id NOT IN (${placeholders})` : '';
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count
     FROM sessions
     WHERE status = 'completed'
       ${seedFilter};`,
    ...seedIds,
  );

  return row?.count ?? 0;
}

export async function maybeRequestAppReview(
  db: SQLiteDatabase,
  session: { id: string; status: SessionStatus },
  client: AppReviewClient = nativeAppReviewClient,
): Promise<boolean> {
  try {
    if (
      session.status !== 'completed' ||
      SEEDED_SESSION_IDS.has(session.id) ||
      client.hasRequestedReview()
    ) {
      return false;
    }

    const completedRecordingCount = await countCompletedUserRecordings(db);
    if (completedRecordingCount < REVIEW_SESSION_THRESHOLD) {
      return false;
    }

    if (!(await client.isAvailable())) {
      return false;
    }

    await client.requestReview();
    client.markRequestedReview();
    return true;
  } catch {
    // Review requests are best-effort and must never block post-session.
    return false;
  }
}
