import Constants from 'expo-constants';
import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureAppMetadataTable } from '@/db/app-metadata';
import { submitFeedback } from '@/services/feedback';
import type { LeaderboardEntry } from '@/services/leaderboard';

const BLOCKED_PUBLISHERS_KEY = 'leaderboard_blocked_publishers_v1';
const MAX_BLOCKED_PUBLISHERS = 250;

export type LeaderboardModerationAction = 'report' | 'removal';

function parseBlockedPublisherIds(value: string | undefined): string[] {
  if (!value) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((publisherId): publisherId is string => typeof publisherId === 'string')
      .map((publisherId) => publisherId.trim())
      .filter(Boolean)
      .slice(0, MAX_BLOCKED_PUBLISHERS);
  } catch {
    return [];
  }
}

export async function getBlockedLeaderboardPublisherIds(
  db: SQLiteDatabase,
): Promise<Set<string>> {
  await ensureAppMetadataTable(db);
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ?;',
    BLOCKED_PUBLISHERS_KEY,
  );

  return new Set(parseBlockedPublisherIds(row?.value));
}

export async function blockLeaderboardPublisher(
  db: SQLiteDatabase,
  publisherId: string,
): Promise<void> {
  const normalizedPublisherId = publisherId.trim();
  if (!normalizedPublisherId) return;

  const blockedPublisherIds = await getBlockedLeaderboardPublisherIds(db);
  blockedPublisherIds.add(normalizedPublisherId);
  const value = JSON.stringify(
    Array.from(blockedPublisherIds).slice(-MAX_BLOCKED_PUBLISHERS),
  );

  await db.runAsync(
    `INSERT INTO app_metadata (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    BLOCKED_PUBLISHERS_KEY,
    value,
  );
}

export function filterBlockedLeaderboardEntries(
  entries: LeaderboardEntry[],
  blockedPublisherIds: ReadonlySet<string>,
): LeaderboardEntry[] {
  return entries.filter(
    (entry) => entry.isCurrentUser || !blockedPublisherIds.has(entry.publisherId),
  );
}

export async function submitLeaderboardModerationRequest({
  action,
  entry,
  trackId,
  reporterPublisherId,
  locale,
}: {
  action: LeaderboardModerationAction;
  entry: LeaderboardEntry;
  trackId: string;
  reporterPublisherId: string;
  locale: string;
}): Promise<void> {
  const message = [
    '[leaderboard-moderation-v1]',
    `action=${action}`,
    `track_id=${trackId}`,
    `reported_publisher_id=${entry.publisherId}`,
    `reported_username=${entry.name}`,
    `lap_time_ms=${entry.lapTimeMs}`,
    `submitted_at=${entry.submittedAt}`,
  ].join('\n');

  await submitFeedback({
    name: action === 'removal' ? 'Leaderboard removal request' : 'Leaderboard report',
    message,
    publisherId: reporterPublisherId,
    appVersion: Constants.expoConfig?.version ?? null,
    locale,
  });
}
