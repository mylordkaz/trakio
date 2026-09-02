import type { SQLiteDatabase } from 'expo-sqlite';
import { TRACK_SEED_DRAFTS } from '@/db/seeds';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import type {
  Coordinate,
  ISODateString,
  PersonalBest,
  TrackNoteRow,
  TimingLineRow,
  TimingLineType,
  TrackDirection,
  TrackRow,
} from '@/db/types';

type DbTrackRow = {
  id: string;
  slug: string;
  name: string;
  country: string | null;
  location: string | null;
  layout_name: string | null;
  length_m: number | null;
  corners: number | null;
  direction: TrackDirection | null;
  center_lat: number | null;
  center_lng: number | null;
  path: string | null;
  path_width_m: number | null;
  created_at: ISODateString;
  updated_at: ISODateString;
};

type DbTrackListRow = DbTrackRow & {
  sector_line_count: number;
  start_finish_count: number;
};

type DbTimingLineRow = {
  id: string;
  track_id: string;
  name: string;
  type: TimingLineType;
  seq: number;
  a_lat: number;
  a_lng: number;
  b_lat: number;
  b_lng: number;
  created_at: ISODateString;
  updated_at: ISODateString;
};

type DbTrackNoteRow = {
  id: string;
  track_id: string;
  note: string;
  seq: number;
  created_at: ISODateString;
  updated_at: ISODateString;
};

export type TrackListItem = TrackRow & {
  sectorCount: number;
};

export type TrackDetail = TrackRow & {
  sectorCount: number;
  timingLines: TimingLineRow[];
  notes: TrackNoteRow[];
  personalBest: PersonalBest | null;
};

function toCoordinate(latitude: number, longitude: number): Coordinate {
  return { latitude, longitude };
}

export function parseTrackPath(raw: string | null): Coordinate[] | null {
  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!Array.isArray(parsed)) {
    return null;
  }

  const path: Coordinate[] = [];

  for (const entry of parsed) {
    if (!Array.isArray(entry) || entry.length < 2) {
      return null;
    }

    const [latitude, longitude] = entry;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }

    path.push({ latitude, longitude });
  }

  return path.length >= 2 ? path : null;
}

function mapTrackRow(row: DbTrackRow): TrackRow {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    country: row.country,
    location: row.location,
    layoutName: row.layout_name,
    lengthMeters: row.length_m,
    corners: row.corners,
    direction: row.direction,
    centerLatitude: row.center_lat,
    centerLongitude: row.center_lng,
    path: parseTrackPath(row.path),
    pathWidthMeters: row.path_width_m,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTimingLineRow(row: DbTimingLineRow): TimingLineRow {
  return {
    id: row.id,
    trackId: row.track_id,
    name: row.name,
    type: row.type,
    seq: row.seq,
    a: toCoordinate(row.a_lat, row.a_lng),
    b: toCoordinate(row.b_lat, row.b_lng),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackNoteRow(row: DbTrackNoteRow): TrackNoteRow {
  return {
    id: row.id,
    trackId: row.track_id,
    note: row.note,
    seq: row.seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSectorCount(sectorLineCount: number, startFinishCount: number) {
  if (sectorLineCount === 0) {
    return 0;
  }

  return sectorLineCount + (startFinishCount > 0 ? 1 : 0);
}

function hasCompleteTrackSeed(trackId: string, slug: string, name: string) {
  return trackId.trim().length > 0 && slug.trim().length > 0 && name.trim().length > 0;
}

function hasCompleteCoordinatePair(point: { latitude: number | null; longitude: number | null }) {
  return point.latitude !== null && point.longitude !== null;
}

export async function syncTrackSeeds(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const seed of TRACK_SEED_DRAFTS) {
      const { track, timingLines } = seed;

      if (!hasCompleteTrackSeed(track.id, track.slug, track.name)) {
        continue;
      }

      await txn.runAsync(
        `INSERT INTO tracks (
          id,
          slug,
          name,
          country,
          location,
          layout_name,
          length_m,
          corners,
          direction,
          center_lat,
          center_lng,
          path,
          path_width_m
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          country = excluded.country,
          location = excluded.location,
          layout_name = excluded.layout_name,
          length_m = excluded.length_m,
          corners = excluded.corners,
          direction = excluded.direction,
          center_lat = excluded.center_lat,
          center_lng = excluded.center_lng,
          path = excluded.path,
          path_width_m = excluded.path_width_m,
          updated_at = CURRENT_TIMESTAMP;`,
        track.id,
        track.slug,
        track.name,
        track.country,
        track.location,
        track.layoutName,
        track.lengthMeters,
        track.corners,
        track.direction,
        track.centerLatitude,
        track.centerLongitude,
        track.path && track.path.length >= 2 ? JSON.stringify(track.path) : null,
        track.pathWidthMeters ?? null
      );

      const validTimingLines = timingLines.filter(
        (timingLine) =>
          timingLine.trackId === track.id &&
          timingLine.id.trim().length > 0 &&
          hasCompleteCoordinatePair(timingLine.a) &&
          hasCompleteCoordinatePair(timingLine.b)
      );

      if (validTimingLines.length > 0) {
        const placeholders = validTimingLines.map(() => '?').join(', ');

        await txn.runAsync(
          `DELETE FROM timing_lines
           WHERE track_id = ?
             AND id NOT IN (${placeholders});`,
          track.id,
          ...validTimingLines.map((timingLine) => timingLine.id)
        );
      } else {
        await txn.runAsync('DELETE FROM timing_lines WHERE track_id = ?;', track.id);
      }

      for (const timingLine of validTimingLines) {
        await txn.runAsync(
          `INSERT INTO timing_lines (
            id,
            track_id,
            name,
            type,
            seq,
            a_lat,
            a_lng,
            b_lat,
            b_lng
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            track_id = excluded.track_id,
            name = excluded.name,
            type = excluded.type,
            seq = excluded.seq,
            a_lat = excluded.a_lat,
            a_lng = excluded.a_lng,
            b_lat = excluded.b_lat,
            b_lng = excluded.b_lng,
            updated_at = CURRENT_TIMESTAMP;`,
          timingLine.id,
          timingLine.trackId,
          timingLine.name,
          timingLine.type,
          timingLine.seq,
          timingLine.a.latitude,
          timingLine.a.longitude,
          timingLine.b.latitude,
          timingLine.b.longitude
        );
      }
    }
  });
}

export async function listTracks(db: SQLiteDatabase): Promise<TrackListItem[]> {
  const rows = await db.getAllAsync<DbTrackListRow>(
    `SELECT
      t.*,
      SUM(CASE WHEN tl.type = 'sector' THEN 1 ELSE 0 END) AS sector_line_count,
      SUM(CASE WHEN tl.type = 'start_finish' THEN 1 ELSE 0 END) AS start_finish_count
    FROM tracks t
    LEFT JOIN timing_lines tl
      ON tl.track_id = t.id
    GROUP BY t.id
    ORDER BY t.name ASC;`
  );

  return rows.map((row) => ({
    ...mapTrackRow(row),
    sectorCount: getSectorCount(row.sector_line_count ?? 0, row.start_finish_count ?? 0),
  }));
}

export async function listRecentTracks(db: SQLiteDatabase): Promise<TrackListItem[]> {
  const rows = await db.getAllAsync<DbTrackListRow>(
    `SELECT
      t.*,
      SUM(CASE WHEN tl.type = 'sector' THEN 1 ELSE 0 END) AS sector_line_count,
      SUM(CASE WHEN tl.type = 'start_finish' THEN 1 ELSE 0 END) AS start_finish_count
    FROM tracks t
    INNER JOIN sessions s
      ON s.track_id = t.id
    LEFT JOIN timing_lines tl
      ON tl.track_id = t.id
    GROUP BY t.id
    ORDER BY MAX(s.started_at) DESC;`
  );

  return rows.map((row) => ({
    ...mapTrackRow(row),
    sectorCount: getSectorCount(row.sector_line_count ?? 0, row.start_finish_count ?? 0),
  }));
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function addTrackNote(
  db: SQLiteDatabase,
  trackId: string,
  note: string
): Promise<TrackNoteRow> {
  const id = generateId();
  const result = await db.getFirstAsync<{ max_seq: number | null }>(
    'SELECT MAX(seq) AS max_seq FROM track_notes WHERE track_id = ?;',
    trackId
  );
  const seq = (result?.max_seq ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO track_notes (id, track_id, note, seq)
     VALUES (?, ?, ?, ?);`,
    id,
    trackId,
    note,
    seq
  );

  return { id, trackId, note, seq, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export async function updateTrackNote(
  db: SQLiteDatabase,
  noteId: string,
  note: string
): Promise<void> {
  await db.runAsync(
    `UPDATE track_notes SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;`,
    note,
    noteId
  );
}

export async function deleteTrackNote(
  db: SQLiteDatabase,
  noteId: string
): Promise<void> {
  await db.runAsync('DELETE FROM track_notes WHERE id = ?;', noteId);
}

async function getPersonalBest(db: SQLiteDatabase, trackId: string, sectorCount: number): Promise<PersonalBest | null> {
  const bestLap = await db.getFirstAsync<{
    lap_time_ms: number;
    started_at: string;
    lap_id: string;
  }>(
    `SELECT l.lap_time_ms, l.started_at, l.id AS lap_id
     FROM laps l
     INNER JOIN sessions s ON s.id = l.session_id
     WHERE s.track_id = ?
       AND l.lap_time_ms IS NOT NULL
       AND l.is_invalid = 0
       AND l.is_out_lap = 0
       AND l.is_in_lap = 0
       ${USER_SESSION_FILTER}
     ORDER BY l.lap_time_ms ASC
     LIMIT 1;`,
    trackId,
    ...SEEDED_SESSION_IDS
  );

  if (!bestLap) return null;

  const sectorRows = await db.getAllAsync<{ sector_index: number; split_time_ms: number }>(
    `SELECT sector_index, split_time_ms
     FROM lap_sectors
     WHERE lap_id = ?
     ORDER BY sector_index ASC;`,
    bestLap.lap_id
  );

  const sectors: (number | null)[] = Array.from({ length: sectorCount }, (_, i) => {
    const row = sectorRows.find((r) => r.sector_index === i);
    return row?.split_time_ms ?? null;
  });

  return {
    lapTimeMs: bestLap.lap_time_ms,
    setOn: bestLap.started_at,
    sectors,
  };
}

const SEEDED_SESSION_IDS = SESSION_TEST_SEEDS.map((seed) => seed.session.id);

// Demo seed laps must never count as the user's own time.
const USER_SESSION_FILTER =
  SEEDED_SESSION_IDS.length > 0
    ? `AND s.id NOT IN (${SEEDED_SESSION_IDS.map(() => '?').join(', ')})`
    : '';

export type TrackLeaderboardShareState = {
  // Best valid lap the user actually drove — demo seed sessions excluded,
  // because this value is what a leaderboard share submits.
  userBestLapMs: number | null;
  sharedLapTimeMs: number | null;
  offeredLapTimeMs: number | null;
};

export async function getTrackLeaderboardShareState(
  db: SQLiteDatabase,
  trackId: string
): Promise<TrackLeaderboardShareState> {
  const bestRow = await db.getFirstAsync<{ best_ms: number | null }>(
    `SELECT MIN(l.lap_time_ms) AS best_ms
     FROM laps l
     INNER JOIN sessions s ON s.id = l.session_id
     WHERE s.track_id = ?
       AND l.lap_time_ms IS NOT NULL
       AND l.is_invalid = 0
       AND l.is_out_lap = 0
       AND l.is_in_lap = 0
       ${USER_SESSION_FILTER};`,
    trackId,
    ...SEEDED_SESSION_IDS
  );

  const trackRow = await db.getFirstAsync<{
    leaderboard_lap_time_ms: number | null;
    leaderboard_offered_lap_time_ms: number | null;
  }>(
    `SELECT leaderboard_lap_time_ms, leaderboard_offered_lap_time_ms
     FROM tracks
     WHERE id = ?;`,
    trackId
  );

  return {
    userBestLapMs: bestRow?.best_ms ?? null,
    sharedLapTimeMs: trackRow?.leaderboard_lap_time_ms ?? null,
    offeredLapTimeMs: trackRow?.leaderboard_offered_lap_time_ms ?? null,
  };
}

export async function recordLeaderboardShare(
  db: SQLiteDatabase,
  trackId: string,
  lapTimeMs: number
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks
     SET leaderboard_lap_time_ms = ?,
         leaderboard_offered_lap_time_ms = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;`,
    lapTimeMs,
    lapTimeMs,
    trackId
  );
}

// Syncs the locally known board time from a fetched server entry. The offered
// watermark is left untouched so recorded declines keep suppressing the card.
export async function setSharedLeaderboardTime(
  db: SQLiteDatabase,
  trackId: string,
  lapTimeMs: number
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks
     SET leaderboard_lap_time_ms = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;`,
    lapTimeMs,
    trackId
  );
}

export async function recordLeaderboardOffer(
  db: SQLiteDatabase,
  trackId: string,
  lapTimeMs: number
): Promise<void> {
  await db.runAsync(
    `UPDATE tracks
     SET leaderboard_offered_lap_time_ms = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;`,
    lapTimeMs,
    trackId
  );
}

export async function getTrackById(db: SQLiteDatabase, trackId: string): Promise<TrackDetail | null> {
  const trackRow = await db.getFirstAsync<DbTrackRow>(
    `SELECT *
     FROM tracks
     WHERE id = ?;`,
    trackId
  );

  if (!trackRow) {
    return null;
  }

  const timingLineRows = await db.getAllAsync<DbTimingLineRow>(
    `SELECT *
     FROM timing_lines
     WHERE track_id = ?
     ORDER BY seq ASC;`,
    trackId
  );
  const noteRows = await db.getAllAsync<DbTrackNoteRow>(
    `SELECT *
     FROM track_notes
     WHERE track_id = ?
     ORDER BY seq ASC;`,
    trackId
  );

  const timingLines = timingLineRows.map(mapTimingLineRow);
  const notes = noteRows.map(mapTrackNoteRow);
  const sectorLineCount = timingLines.filter((timingLine) => timingLine.type === 'sector').length;
  const startFinishCount = timingLines.some((timingLine) => timingLine.type === 'start_finish') ? 1 : 0;
  const sectorCount = getSectorCount(sectorLineCount, startFinishCount);
  const personalBest = await getPersonalBest(db, trackId, sectorCount);

  return {
    ...mapTrackRow(trackRow),
    sectorCount,
    timingLines,
    notes,
    personalBest,
  };
}


