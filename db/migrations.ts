import type { SQLiteDatabase } from 'expo-sqlite';
import { syncSessionTestSeeds } from '@/db/sessions';
import { syncTrackSeeds } from '@/db/tracks';

type Migration = {
  version: number;
  up: (db: SQLiteDatabase) => Promise<void>;
};

const TIMING_LINE_TYPE_CHECK = `
  type IN ('start_finish', 'sector', 'speedtrap', 'split', 'pit_entry', 'pit_exit')
`;

async function createBaseSchema(db: SQLiteDatabase) {
  await db.execAsync(`
      CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        country TEXT,
        location TEXT,
        layout_name TEXT,
        length_m REAL,
        corners INTEGER,
        direction TEXT CHECK (direction IN ('clockwise', 'counterclockwise')),
        center_lat REAL,
        center_lng REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS timing_lines (
        id TEXT PRIMARY KEY NOT NULL,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (${TIMING_LINE_TYPE_CHECK}),
        seq INTEGER NOT NULL,
        a_lat REAL NOT NULL,
        a_lng REAL NOT NULL,
        b_lat REAL NOT NULL,
        b_lng REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(track_id, seq)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE RESTRICT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'recording', 'completed', 'aborted')),
        notes TEXT,
        best_lap_ms INTEGER,
        total_laps INTEGER NOT NULL DEFAULT 0,
        max_speed_kph REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS laps (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        lap_number INTEGER NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        lap_time_ms INTEGER,
        is_out_lap INTEGER NOT NULL DEFAULT 0 CHECK (is_out_lap IN (0, 1)),
        is_invalid INTEGER NOT NULL DEFAULT 0 CHECK (is_invalid IN (0, 1)),
        max_speed_kph REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, lap_number)
      );

      CREATE TABLE IF NOT EXISTS lap_sectors (
        id TEXT PRIMARY KEY NOT NULL,
        lap_id TEXT NOT NULL REFERENCES laps(id) ON DELETE CASCADE,
        sector_index INTEGER NOT NULL,
        split_time_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(lap_id, sector_index)
      );

      CREATE TABLE IF NOT EXISTS gps_points (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        lap_id TEXT REFERENCES laps(id) ON DELETE SET NULL,
        recorded_at TEXT NOT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        speed_mps REAL,
        accuracy_m REAL,
        altitude_m REAL,
        heading_deg REAL,
        is_timing_crossing INTEGER NOT NULL DEFAULT 0 CHECK (is_timing_crossing IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS track_notes (
        id TEXT PRIMARY KEY NOT NULL,
        track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(track_id, seq)
      );

      CREATE TABLE IF NOT EXISTS session_notes (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        seq INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, seq)
      );

      CREATE INDEX IF NOT EXISTS idx_timing_lines_track_seq
        ON timing_lines(track_id, seq);

      CREATE INDEX IF NOT EXISTS idx_timing_lines_track_type
        ON timing_lines(track_id, type, seq);

      CREATE INDEX IF NOT EXISTS idx_sessions_track_started_at
        ON sessions(track_id, started_at DESC);

      CREATE INDEX IF NOT EXISTS idx_laps_session_lap_number
        ON laps(session_id, lap_number);

      CREATE INDEX IF NOT EXISTS idx_lap_sectors_lap_id
        ON lap_sectors(lap_id, sector_index);

      CREATE INDEX IF NOT EXISTS idx_gps_points_session_recorded_at
        ON gps_points(session_id, recorded_at);

      CREATE INDEX IF NOT EXISTS idx_gps_points_lap_recorded_at
        ON gps_points(lap_id, recorded_at);

      CREATE INDEX IF NOT EXISTS idx_track_notes_track_seq
        ON track_notes(track_id, seq);

      CREATE INDEX IF NOT EXISTS idx_session_notes_session_seq
        ON session_notes(session_id, seq);
  `);
}

async function hasTable(db: SQLiteDatabase, tableName: string) {
  const result = await db.getFirstAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
    tableName
  );

  return Boolean(result?.name);
}

async function getColumnNames(db: SQLiteDatabase, tableName: string) {
  const rows = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName});`);
  return rows.map((row) => row.name);
}

async function migrateLegacyTrackSchema(db: SQLiteDatabase) {
  const tracksExists = await hasTable(db, 'tracks');

  if (!tracksExists) {
    await createBaseSchema(db);
    return;
  }

  const trackColumns = await getColumnNames(db, 'tracks');
  const trackSectorsExists = await hasTable(db, 'track_sectors');
  const timingLinesExists = await hasTable(db, 'timing_lines');
  const hasLegacyTimingColumns = trackColumns.includes('timing_line_start_lat');

  if (!trackSectorsExists && timingLinesExists && !hasLegacyTimingColumns) {
    return;
  }

  await db.execAsync('PRAGMA foreign_keys = OFF;');

  try {
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.execAsync(`
        CREATE TABLE IF NOT EXISTS tracks_v2 (
          id TEXT PRIMARY KEY NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          country TEXT,
          location TEXT,
          layout_name TEXT,
          length_m REAL,
          corners INTEGER,
          direction TEXT CHECK (direction IN ('clockwise', 'counterclockwise')),
          center_lat REAL,
          center_lng REAL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS timing_lines (
          id TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (${TIMING_LINE_TYPE_CHECK}),
          seq INTEGER NOT NULL,
          a_lat REAL NOT NULL,
          a_lng REAL NOT NULL,
          b_lat REAL NOT NULL,
          b_lng REAL NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(track_id, seq)
        );
      `);

      await txn.execAsync(`
        INSERT OR REPLACE INTO tracks_v2 (
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
          created_at,
          updated_at
        )
        SELECT
          id,
          slug,
          name,
          country,
          location,
          layout_name,
          length_m,
          corners,
          direction,
          NULL,
          NULL,
          created_at,
          updated_at
        FROM tracks;
      `);

      if (hasLegacyTimingColumns) {
        await txn.execAsync(`
          INSERT OR IGNORE INTO timing_lines (
            id,
            track_id,
            name,
            type,
            seq,
            a_lat,
            a_lng,
            b_lat,
            b_lng,
            created_at,
            updated_at
          )
          SELECT
            id || ':start_finish',
            id,
            'Start/Finish',
            'start_finish',
            0,
            timing_line_start_lat,
            timing_line_start_lng,
            timing_line_end_lat,
            timing_line_end_lng,
            created_at,
            updated_at
          FROM tracks
          WHERE timing_line_start_lat IS NOT NULL
            AND timing_line_start_lng IS NOT NULL
            AND timing_line_end_lat IS NOT NULL
            AND timing_line_end_lng IS NOT NULL;
        `);
      }

      if (trackSectorsExists) {
        await txn.execAsync(`
          INSERT OR IGNORE INTO timing_lines (
            id,
            track_id,
            name,
            type,
            seq,
            a_lat,
            a_lng,
            b_lat,
            b_lng,
            created_at,
            updated_at
          )
          SELECT
            id,
            track_id,
            name,
            'sector',
            sector_index,
            line_start_lat,
            line_start_lng,
            line_end_lat,
            line_end_lng,
            created_at,
            created_at
          FROM track_sectors;
        `);
      }

      await txn.execAsync(`
        DROP TABLE IF EXISTS track_sectors;
        DROP TABLE tracks;
        ALTER TABLE tracks_v2 RENAME TO tracks;

        CREATE INDEX IF NOT EXISTS idx_timing_lines_track_seq
          ON timing_lines(track_id, seq);

        CREATE INDEX IF NOT EXISTS idx_timing_lines_track_type
          ON timing_lines(track_id, type, seq);
      `);
    });
  } finally {
    await db.execAsync('PRAGMA foreign_keys = ON;');
  }
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: createBaseSchema,
  },
  {
    version: 2,
    up: migrateLegacyTrackSchema,
  },
  {
    version: 3,
    up: async (db) => {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS track_notes (
          id TEXT PRIMARY KEY NOT NULL,
          track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
          note TEXT NOT NULL,
          seq INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(track_id, seq)
        );

        CREATE INDEX IF NOT EXISTS idx_track_notes_track_seq
          ON track_notes(track_id, seq);
      `);
    },
  },
  {
    version: 4,
    up: async (db) => {
      const sessionColumns = await getColumnNames(db, 'sessions');

      if (!sessionColumns.includes('name')) {
        await db.execAsync('ALTER TABLE sessions ADD COLUMN name TEXT;');
      }

      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS session_notes (
          id TEXT PRIMARY KEY NOT NULL,
          session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
          note TEXT NOT NULL,
          seq INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(session_id, seq)
        );

        CREATE INDEX IF NOT EXISTS idx_session_notes_session_seq
          ON session_notes(session_id, seq);
      `);
    },
  },
];

export const DATABASE_NAME = 'trakio.db';
export const LATEST_DATABASE_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync('PRAGMA journal_mode = WAL;');

  const result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = result?.user_version ?? 0;

  if (currentVersion < LATEST_DATABASE_VERSION) {
    for (const migration of MIGRATIONS) {
      if (migration.version <= currentVersion) {
        continue;
      }

      await migration.up(db);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    }
  }

  await syncTrackSeeds(db);
  await syncSessionTestSeeds(db);
}
