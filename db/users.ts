import type { SQLiteDatabase } from 'expo-sqlite';
import type { ISODateString, UserRow } from '@/db/types';

const LOCAL_USER_PROFILE_ID = 'local-user';
const DEFAULT_USERNAME = 'Driver';

type DbUserRow = {
  id: string;
  username: string;
  car: string | null;
  country_code: string | null;
  avatar_uri: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

export type UpsertUserProfileInput = {
  username: string;
  car?: string | null;
  countryCode?: string | null;
  avatarUri?: string | null;
};

function mapUserRow(row: DbUserRow): UserRow {
  return {
    id: row.id,
    username: row.username,
    car: row.car,
    countryCode: row.country_code,
    avatarUri: row.avatar_uri,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getUserProfile(db: SQLiteDatabase): Promise<UserRow | null> {
  const row = await db.getFirstAsync<DbUserRow>(
    `SELECT *
     FROM users
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1;`
  );

  return row ? mapUserRow(row) : null;
}

export async function getUserProfileById(
  db: SQLiteDatabase,
  userId: string
): Promise<UserRow | null> {
  const row = await db.getFirstAsync<DbUserRow>(
    `SELECT *
     FROM users
     WHERE id = ?
     LIMIT 1;`,
    userId
  );

  return row ? mapUserRow(row) : null;
}

export async function getOrCreateDefaultUserProfile(db: SQLiteDatabase): Promise<UserRow> {
  await db.runAsync(
    `INSERT INTO users (
      id,
      username,
      car,
      country_code,
      avatar_uri
    ) VALUES (?, ?, NULL, NULL, NULL)
    ON CONFLICT(id) DO NOTHING;`,
    LOCAL_USER_PROFILE_ID,
    DEFAULT_USERNAME
  );

  const user = await getUserProfileById(db, LOCAL_USER_PROFILE_ID);

  if (!user) {
    throw new Error('Failed to create default user profile.');
  }

  return user;
}

export async function upsertUserProfile(
  db: SQLiteDatabase,
  input: UpsertUserProfileInput
): Promise<UserRow> {
  const existing = await getUserProfile(db);
  const id = existing?.id ?? LOCAL_USER_PROFILE_ID;

  await db.runAsync(
    `INSERT INTO users (
      id,
      username,
      car,
      country_code,
      avatar_uri
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      username = excluded.username,
      car = excluded.car,
      country_code = excluded.country_code,
      avatar_uri = excluded.avatar_uri,
      updated_at = CURRENT_TIMESTAMP;`,
    id,
    input.username,
    input.car ?? null,
    input.countryCode ?? null,
    input.avatarUri ?? null
  );

  const user = await getUserProfileById(db, id);

  if (!user) {
    throw new Error('Failed to load saved user profile.');
  }

  return user;
}
