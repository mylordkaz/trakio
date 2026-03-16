import type { SQLiteDatabase } from 'expo-sqlite';
import { SESSION_TEST_SEEDS } from '@/db/test-seeds';
import type {
  GpsPointRow,
  ISODateString,
  LapRow,
  LapSectorRow,
  SessionNoteRow,
  SessionRow,
  SessionStatus,
  TimingLineRow,
  TimingLineType,
  TrackDirection,
  TrackRow,
} from '@/db/types';

type SessionDisplayStatus = 'Best' | 'Recent';

type DbSessionListRow = {
  id: string;
  name: string | null;
  track_id: string;
  track_name: string;
  started_at: ISODateString;
  ended_at: ISODateString | null;
  status: SessionStatus;
  best_lap_ms: number | null;
  total_laps: number;
  max_speed_kph: number | null;
  created_at: ISODateString;
  updated_at: ISODateString;
  computed_best_lap_ms: number | null;
  computed_total_laps: number;
};

type DbSessionDetailRow = DbSessionListRow & {
  notes: string | null;
  track_slug: string;
  track_country: string | null;
  track_location: string | null;
  track_layout_name: string | null;
  track_length_m: number | null;
  track_corners: number | null;
  track_direction: TrackDirection | null;
  track_center_lat: number | null;
  track_center_lng: number | null;
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

type DbGpsPointRow = {
  id: string;
  session_id: string;
  lap_id: string | null;
  recorded_at: ISODateString;
  latitude: number;
  longitude: number;
  speed_mps: number | null;
  accuracy_m: number | null;
  altitude_m: number | null;
  heading_deg: number | null;
  is_timing_crossing: 0 | 1;
  created_at: ISODateString;
};

type DbLapRow = {
  id: string;
  session_id: string;
  lap_number: number;
  started_at: ISODateString;
  ended_at: ISODateString | null;
  lap_time_ms: number | null;
  is_out_lap: 0 | 1;
  is_invalid: 0 | 1;
  max_speed_kph: number | null;
  created_at: ISODateString;
};

type DbLapSectorRow = {
  id: string;
  lap_id: string;
  sector_index: number;
  split_time_ms: number;
  created_at: ISODateString;
};

type DbSessionNoteRow = {
  id: string;
  session_id: string;
  note: string;
  seq: number;
  created_at: ISODateString;
  updated_at: ISODateString;
};

export type SessionListItem = {
  id: string;
  name: string;
  trackId: string;
  trackName: string;
  startedAt: ISODateString;
  bestLapMs: number | null;
  totalLaps: number;
  displayStatus: SessionDisplayStatus;
};

export type SessionLapDetail = LapRow & {
  sectors: LapSectorRow[];
};

export type SessionDetail = {
  session: SessionRow;
  track: TrackRow;
  timingLines: TimingLineRow[];
  gpsPoints: GpsPointRow[];
  laps: SessionLapDetail[];
  notes: SessionNoteRow[];
  displayStatus: SessionDisplayStatus;
};

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function mapSessionRow(row: DbSessionListRow | DbSessionDetailRow): SessionRow {
  return {
    id: row.id,
    name: row.name,
    trackId: row.track_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    notes: 'notes' in row ? row.notes : null,
    bestLapMs: row.best_lap_ms ?? row.computed_best_lap_ms,
    totalLaps: row.total_laps > 0 ? row.total_laps : row.computed_total_laps,
    maxSpeedKph: row.max_speed_kph,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTrackRow(row: DbSessionDetailRow): TrackRow {
  return {
    id: row.track_id,
    slug: row.track_slug,
    name: row.track_name,
    country: row.track_country,
    location: row.track_location,
    layoutName: row.track_layout_name,
    lengthMeters: row.track_length_m,
    corners: row.track_corners,
    direction: row.track_direction,
    centerLatitude: row.track_center_lat,
    centerLongitude: row.track_center_lng,
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
    a: { latitude: row.a_lat, longitude: row.a_lng },
    b: { latitude: row.b_lat, longitude: row.b_lng },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapGpsPointRow(row: DbGpsPointRow): GpsPointRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    lapId: row.lap_id,
    recordedAt: row.recorded_at,
    latitude: row.latitude,
    longitude: row.longitude,
    speedMps: row.speed_mps,
    accuracyM: row.accuracy_m,
    altitudeM: row.altitude_m,
    headingDeg: row.heading_deg,
    isTimingCrossing: row.is_timing_crossing,
    createdAt: row.created_at,
  };
}

function mapLapRow(row: DbLapRow): LapRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    lapNumber: row.lap_number,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    lapTimeMs: row.lap_time_ms,
    isOutLap: row.is_out_lap,
    isInvalid: row.is_invalid,
    maxSpeedKph: row.max_speed_kph,
    createdAt: row.created_at,
  };
}

function mapLapSectorRow(row: DbLapSectorRow): LapSectorRow {
  return {
    id: row.id,
    lapId: row.lap_id,
    sectorIndex: row.sector_index,
    splitTimeMs: row.split_time_ms,
    createdAt: row.created_at,
  };
}

function mapSessionNoteRow(row: DbSessionNoteRow): SessionNoteRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    note: row.note,
    seq: row.seq,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getBestSessionId(db: SQLiteDatabase): Promise<string | null> {
  const bestSession = await db.getFirstAsync<{ id: string }>(
    `SELECT
      s.id,
      COALESCE(
        s.best_lap_ms,
        MIN(
          CASE
            WHEN l.lap_time_ms IS NOT NULL AND l.is_invalid = 0 AND l.is_out_lap = 0
              THEN l.lap_time_ms
          END
        )
      ) AS computed_best_lap_ms
    FROM sessions s
    LEFT JOIN laps l
      ON l.session_id = s.id
    GROUP BY s.id
    HAVING computed_best_lap_ms IS NOT NULL
    ORDER BY computed_best_lap_ms ASC
    LIMIT 1;`
  );

  return bestSession?.id ?? null;
}

function toDisplayStatus(sessionId: string, bestSessionId: string | null): SessionDisplayStatus {
  return sessionId === bestSessionId ? 'Best' : 'Recent';
}

export async function syncSessionTestSeeds(db: SQLiteDatabase) {
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const seed of SESSION_TEST_SEEDS) {
      const { session, laps, lapSectors, gpsPoints, notes } = seed;
      const lapIds = laps.map((lap) => lap.id);
      const noteIds = notes.map((note) => note.id);
      const gpsIds = gpsPoints.map((point) => point.id);
      const lapSectorIds = lapSectors.map((lapSector) => lapSector.id);

      await txn.runAsync(
        `INSERT INTO sessions (
          id,
          name,
          track_id,
          started_at,
          ended_at,
          status,
          best_lap_ms,
          total_laps,
          max_speed_kph
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          track_id = excluded.track_id,
          started_at = excluded.started_at,
          ended_at = excluded.ended_at,
          status = excluded.status,
          best_lap_ms = excluded.best_lap_ms,
          total_laps = excluded.total_laps,
          max_speed_kph = excluded.max_speed_kph,
          updated_at = CURRENT_TIMESTAMP;`,
        session.id,
        session.name,
        session.trackId,
        session.startedAt,
        session.endedAt,
        session.status,
        session.bestLapMs,
        session.totalLaps,
        session.maxSpeedKph
      );

      if (lapSectorIds.length > 0) {
        await txn.runAsync(
          `DELETE FROM lap_sectors
           WHERE lap_id IN (SELECT id FROM laps WHERE session_id = ?)
             AND id NOT IN (${lapSectorIds.map(() => '?').join(', ')});`,
          session.id,
          ...lapSectorIds
        );
      }

      if (gpsIds.length > 0) {
        await txn.runAsync(
          `DELETE FROM gps_points
           WHERE session_id = ?
             AND id NOT IN (${gpsIds.map(() => '?').join(', ')});`,
          session.id,
          ...gpsIds
        );
      }

      if (noteIds.length > 0) {
        await txn.runAsync(
          `DELETE FROM session_notes
           WHERE session_id = ?
             AND id NOT IN (${noteIds.map(() => '?').join(', ')});`,
          session.id,
          ...noteIds
        );
      }

      if (lapIds.length > 0) {
        await txn.runAsync(
          `DELETE FROM laps
           WHERE session_id = ?
             AND id NOT IN (${lapIds.map(() => '?').join(', ')});`,
          session.id,
          ...lapIds
        );
      }

      for (const lap of laps) {
        await txn.runAsync(
          `INSERT INTO laps (
            id,
            session_id,
            lap_number,
            started_at,
            ended_at,
            lap_time_ms,
            is_out_lap,
            is_invalid,
            max_speed_kph
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
            lap_number = excluded.lap_number,
            started_at = excluded.started_at,
            ended_at = excluded.ended_at,
            lap_time_ms = excluded.lap_time_ms,
            is_out_lap = excluded.is_out_lap,
            is_invalid = excluded.is_invalid,
            max_speed_kph = excluded.max_speed_kph;`,
          lap.id,
          session.id,
          lap.lapNumber,
          lap.startedAt,
          lap.endedAt,
          lap.lapTimeMs,
          lap.isOutLap ?? 0,
          lap.isInvalid ?? 0,
          lap.maxSpeedKph ?? null
        );
      }

      for (const lapSector of lapSectors) {
        await txn.runAsync(
          `INSERT INTO lap_sectors (
            id,
            lap_id,
            sector_index,
            split_time_ms
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            lap_id = excluded.lap_id,
            sector_index = excluded.sector_index,
            split_time_ms = excluded.split_time_ms;`,
          lapSector.id,
          lapSector.lapId,
          lapSector.sectorIndex,
          lapSector.splitTimeMs
        );
      }

      for (const point of gpsPoints) {
        await txn.runAsync(
          `INSERT INTO gps_points (
            id,
            session_id,
            lap_id,
            recorded_at,
            latitude,
            longitude,
            speed_mps,
            accuracy_m,
            altitude_m,
            heading_deg,
            is_timing_crossing
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
            lap_id = excluded.lap_id,
            recorded_at = excluded.recorded_at,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            speed_mps = excluded.speed_mps,
            accuracy_m = excluded.accuracy_m,
            altitude_m = excluded.altitude_m,
            heading_deg = excluded.heading_deg,
            is_timing_crossing = excluded.is_timing_crossing;`,
          point.id,
          session.id,
          point.lapId,
          point.recordedAt,
          point.latitude,
          point.longitude,
          point.speedMps ?? null,
          point.accuracyM ?? null,
          point.altitudeM ?? null,
          point.headingDeg ?? null,
          point.isTimingCrossing ?? 0
        );
      }

      for (const note of notes) {
        await txn.runAsync(
          `INSERT INTO session_notes (
            id,
            session_id,
            note,
            seq
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            session_id = excluded.session_id,
            note = excluded.note,
            seq = excluded.seq,
            updated_at = CURRENT_TIMESTAMP;`,
          note.id,
          session.id,
          note.note,
          note.seq
        );
      }
    }
  });
}

export async function listSessions(db: SQLiteDatabase): Promise<SessionListItem[]> {
  const rows = await db.getAllAsync<DbSessionListRow>(
    `SELECT
      s.id,
      s.name,
      s.track_id,
      t.name AS track_name,
      s.started_at,
      s.ended_at,
      s.status,
      s.best_lap_ms,
      s.total_laps,
      s.max_speed_kph,
      s.created_at,
      s.updated_at,
      COALESCE(
        s.best_lap_ms,
        MIN(
          CASE
            WHEN l.lap_time_ms IS NOT NULL AND l.is_invalid = 0 AND l.is_out_lap = 0
              THEN l.lap_time_ms
          END
        )
      ) AS computed_best_lap_ms,
      CASE
        WHEN s.total_laps > 0 THEN s.total_laps
        ELSE COUNT(l.id)
      END AS computed_total_laps
    FROM sessions s
    INNER JOIN tracks t
      ON t.id = s.track_id
    LEFT JOIN laps l
      ON l.session_id = s.id
    GROUP BY s.id
    ORDER BY s.started_at DESC;`
  );
  const bestSessionId = await getBestSessionId(db);

  return rows.map((row) => {
    const session = mapSessionRow(row);

    return {
      id: session.id,
      name: session.name ?? 'Recorded Session',
      trackId: session.trackId,
      trackName: row.track_name,
      startedAt: session.startedAt,
      bestLapMs: session.bestLapMs,
      totalLaps: session.totalLaps,
      displayStatus: toDisplayStatus(session.id, bestSessionId),
    };
  });
}

export async function getSessionById(
  db: SQLiteDatabase,
  sessionId: string
): Promise<SessionDetail | null> {
  const sessionRow = await db.getFirstAsync<DbSessionDetailRow>(
    `SELECT
      s.id,
      s.name,
      s.track_id,
      s.started_at,
      s.ended_at,
      s.status,
      s.notes,
      s.best_lap_ms,
      s.total_laps,
      s.max_speed_kph,
      s.created_at,
      s.updated_at,
      COALESCE(
        s.best_lap_ms,
        MIN(
          CASE
            WHEN l.lap_time_ms IS NOT NULL AND l.is_invalid = 0 AND l.is_out_lap = 0
              THEN l.lap_time_ms
          END
        )
      ) AS computed_best_lap_ms,
      CASE
        WHEN s.total_laps > 0 THEN s.total_laps
        ELSE COUNT(l.id)
      END AS computed_total_laps,
      t.slug AS track_slug,
      t.name AS track_name,
      t.country AS track_country,
      t.location AS track_location,
      t.layout_name AS track_layout_name,
      t.length_m AS track_length_m,
      t.corners AS track_corners,
      t.direction AS track_direction,
      t.center_lat AS track_center_lat,
      t.center_lng AS track_center_lng
    FROM sessions s
    INNER JOIN tracks t
      ON t.id = s.track_id
    LEFT JOIN laps l
      ON l.session_id = s.id
    WHERE s.id = ?
    GROUP BY s.id
    LIMIT 1;`,
    sessionId
  );

  if (!sessionRow) {
    return null;
  }

  const [timingLineRows, gpsPointRows, lapRows, lapSectorRows, noteRows, bestSessionId] =
    await Promise.all([
      db.getAllAsync<DbTimingLineRow>(
        `SELECT *
         FROM timing_lines
         WHERE track_id = ?
         ORDER BY seq ASC;`,
        sessionRow.track_id
      ),
      db.getAllAsync<DbGpsPointRow>(
        `SELECT *
         FROM gps_points
         WHERE session_id = ?
         ORDER BY recorded_at ASC;`,
        sessionId
      ),
      db.getAllAsync<DbLapRow>(
        `SELECT *
         FROM laps
         WHERE session_id = ?
         ORDER BY lap_number ASC;`,
        sessionId
      ),
      db.getAllAsync<DbLapSectorRow>(
        `SELECT ls.*
         FROM lap_sectors ls
         INNER JOIN laps l
           ON l.id = ls.lap_id
         WHERE l.session_id = ?
         ORDER BY l.lap_number ASC, ls.sector_index ASC;`,
        sessionId
      ),
      db.getAllAsync<DbSessionNoteRow>(
        `SELECT *
         FROM session_notes
         WHERE session_id = ?
         ORDER BY seq ASC;`,
        sessionId
      ),
      getBestSessionId(db),
    ]);

  const lapSectorsByLapId = new Map<string, LapSectorRow[]>();
  for (const row of lapSectorRows) {
    const lapSector = mapLapSectorRow(row);
    const existing = lapSectorsByLapId.get(lapSector.lapId) ?? [];
    existing.push(lapSector);
    lapSectorsByLapId.set(lapSector.lapId, existing);
  }

  return {
    session: mapSessionRow(sessionRow),
    track: mapTrackRow(sessionRow),
    timingLines: timingLineRows.map(mapTimingLineRow),
    gpsPoints: gpsPointRows.map(mapGpsPointRow),
    laps: lapRows.map((row) => ({
      ...mapLapRow(row),
      sectors: lapSectorsByLapId.get(row.id) ?? [],
    })),
    notes: noteRows.map(mapSessionNoteRow),
    displayStatus: toDisplayStatus(sessionId, bestSessionId),
  };
}

export async function addSessionNote(
  db: SQLiteDatabase,
  sessionId: string,
  note: string
): Promise<SessionNoteRow> {
  const id = generateId();
  const result = await db.getFirstAsync<{ max_seq: number | null }>(
    'SELECT MAX(seq) AS max_seq FROM session_notes WHERE session_id = ?;',
    sessionId
  );
  const seq = (result?.max_seq ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO session_notes (id, session_id, note, seq)
     VALUES (?, ?, ?, ?);`,
    id,
    sessionId,
    note,
    seq
  );

  const now = new Date().toISOString();

  return {
    id,
    sessionId,
    note,
    seq,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateSessionNote(
  db: SQLiteDatabase,
  noteId: string,
  note: string
): Promise<void> {
  await db.runAsync(
    `UPDATE session_notes
     SET note = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?;`,
    note,
    noteId
  );
}

export async function deleteSessionNote(
  db: SQLiteDatabase,
  noteId: string
): Promise<void> {
  await db.runAsync('DELETE FROM session_notes WHERE id = ?;', noteId);
}
