import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';

export const FREE_SESSION_LIMIT = 3;

export type SessionQuota = {
  used: number;
  limit: number | null;
  remaining: number | null;
  canRecord: boolean;
};

export function calculateSessionQuota(used: number, hasProAccess: boolean): SessionQuota {
  if (hasProAccess) {
    return { used, limit: null, remaining: null, canRecord: true };
  }

  const remaining = Math.max(0, FREE_SESSION_LIMIT - used);
  return {
    used,
    limit: FREE_SESSION_LIMIT,
    remaining,
    canRecord: used < FREE_SESSION_LIMIT,
  };
}

export async function countUserSessions(db: SQLiteDatabase): Promise<number> {
  const seedIds = SESSION_TEST_SEEDS.map((seed) => seed.session.id);
  const placeholders = seedIds.map(() => '?').join(', ');
  const where = seedIds.length > 0 ? `WHERE id NOT IN (${placeholders})` : '';
  const row = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM sessions ${where};`,
    ...seedIds,
  );

  return row?.count ?? 0;
}

export async function getSessionQuota(
  db: SQLiteDatabase,
  hasProAccess: boolean,
): Promise<SessionQuota> {
  return calculateSessionQuota(await countUserSessions(db), hasProAccess);
}
