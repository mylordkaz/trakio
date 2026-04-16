const LEADERBOARD_API_BASE_URL = 'https://trakio-d1.mylord.workers.dev';

export const USERNAME_MAX_LENGTH = 24;
export const CAR_MAX_LENGTH = 40;

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/[\u0000-\u001F\u007F\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .slice(0, maxLength);
}

type ApiLeaderboardEntry = {
  track_id: string;
  publisher_id: string;
  username: string;
  country_code: string | null;
  car: string | null;
  lap_time_ms: number;
  submitted_at: string;
};

type LeaderboardResponse = {
  ok: boolean;
  trackId: string;
  entries: ApiLeaderboardEntry[];
};

type ShareResponse = {
  ok: boolean;
  updated: boolean;
};

export type LeaderboardEntry = {
  rank: number;
  publisherId: string;
  name: string;
  firstName: string;
  countryCode: string | null;
  car: string | null;
  lapTimeMs: number;
  submittedAt: string;
  isCurrentUser: boolean;
};

export type ShareLeaderboardPayload = {
  trackId: string;
  publisherId: string;
  username: string;
  countryCode: string | null;
  car: string | null;
  lapTimeMs: number;
  submittedAt: string;
};

function toFirstName(name: string) {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return '';
  }

  return trimmed.split(/\s+/)[0] ?? trimmed;
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function listLeaderboardEntries(
  trackId: string,
  currentPublisherId: string,
): Promise<LeaderboardEntry[]> {
  const response = await fetch(
    `${LEADERBOARD_API_BASE_URL}/leaderboard/${encodeURIComponent(trackId)}`,
  );

  if (!response.ok) {
    throw new Error(`Leaderboard request failed with ${response.status}`);
  }

  const data = await parseJson<LeaderboardResponse>(response);

  return (data.entries ?? []).map((entry, index) => ({
    rank: index + 1,
    publisherId: entry.publisher_id,
    name: entry.username,
    firstName: toFirstName(entry.username),
    countryCode: entry.country_code,
    car: entry.car,
    lapTimeMs: entry.lap_time_ms,
    submittedAt: entry.submitted_at,
    isCurrentUser: entry.publisher_id === currentPublisherId,
  }));
}

export async function shareLeaderboardTime(
  payload: ShareLeaderboardPayload,
): Promise<ShareResponse> {
  const cleanedPayload: ShareLeaderboardPayload = {
    ...payload,
    username: sanitizeText(payload.username, USERNAME_MAX_LENGTH),
    car: payload.car === null ? null : sanitizeText(payload.car, CAR_MAX_LENGTH) || null,
  };

  const response = await fetch(`${LEADERBOARD_API_BASE_URL}/leaderboard/share`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(cleanedPayload),
  });

  if (!response.ok) {
    throw new Error(`Leaderboard share failed with ${response.status}`);
  }

  return parseJson<ShareResponse>(response);
}

export function flagEmoji(cc: string | null): string {
  if (!cc || cc.length !== 2) return '';
  return [...cc.toUpperCase()]
    .map(c => String.fromCodePoint(c.charCodeAt(0) + 0x1F1E6 - 0x41))
    .join('');
}

export function rankLabel(rank: number): string {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return String(rank);
}
