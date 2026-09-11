import type { SQLiteDatabase } from 'expo-sqlite';
import { ensureTimingLineTypes } from '@/db/migrations';

const OLD_DDL = `CREATE TABLE timing_lines (
  id TEXT PRIMARY KEY NOT NULL,
  track_id TEXT NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (
  type IN ('start_finish', 'sector', 'speedtrap', 'split', 'pit_entry', 'pit_exit')
),
  seq INTEGER NOT NULL,
  a_lat REAL NOT NULL,
  a_lng REAL NOT NULL,
  b_lat REAL NOT NULL,
  b_lng REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(track_id, seq)
)`;

const NEW_DDL = OLD_DDL.replace(
  "'start_finish', 'sector'",
  "'start_finish', 'start', 'finish', 'sector'",
);

function mockDb(ddl: string | null) {
  const executed: string[] = [];
  const db = {
    getFirstAsync: async () => (ddl === null ? null : { sql: ddl }),
    execAsync: async (sql: string) => {
      executed.push(sql);
    },
  } as unknown as SQLiteDatabase;

  return { db, executed };
}

const all = (executed: string[]) => executed.join('\n');

describe('timing line type rebuild', () => {
  it('rebuilds a database still carrying the old constraint', async () => {
    const { db, executed } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(executed);
    expect(sql).toContain("'start'");
    expect(sql).toContain("'finish'");
    expect(sql).toContain('CREATE TABLE timing_lines_rebuild');
    expect(sql).toContain('DROP TABLE timing_lines');
    expect(sql).toContain('ALTER TABLE timing_lines_rebuild RENAME TO timing_lines');
  });

  it('is idempotent: a rebuilt database is left alone', async () => {
    const { db, executed } = mockDb(NEW_DDL);
    await ensureTimingLineTypes(db);

    expect(executed).toEqual([]);
  });

  it('does not mistake start_finish for the new start literal', async () => {
    // The probe must use quote-delimited literals: 'start_finish' contains the
    // characters of start, so a loose check would skip a database that needs
    // rebuilding. The old DDL above has start_finish and no bare 'start'.
    expect(OLD_DDL.includes("'start'")).toBe(false);
    expect(OLD_DDL).toContain("'start_finish'");

    const { db, executed } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    expect(executed.length).toBeGreaterThan(0);
  });

  it('does nothing when the table does not exist yet', async () => {
    const { db, executed } = mockDb(null);
    await ensureTimingLineTypes(db);

    expect(executed).toEqual([]);
  });

  it('copies every column, so no data is dropped by the rebuild', async () => {
    const { db, executed } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(executed);
    const columns = [
      'id',
      'track_id',
      'name',
      'type',
      'seq',
      'a_lat',
      'a_lng',
      'b_lat',
      'b_lng',
      'created_at',
      'updated_at',
    ];
    const insert = sql.slice(sql.indexOf('INSERT INTO timing_lines_rebuild'));
    const columnList = insert.slice(0, insert.indexOf('FROM timing_lines'));

    for (const column of columns) {
      // Named in both the target list and the SELECT, so timestamps survive.
      expect(columnList.split(column).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('preserves the constraints and recreates both indexes', async () => {
    const { db, executed } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(executed);
    expect(sql).toContain('UNIQUE(track_id, seq)');
    expect(sql).toContain('REFERENCES tracks(id) ON DELETE CASCADE');
    expect(sql).toContain('idx_timing_lines_track_seq');
    expect(sql).toContain('idx_timing_lines_track_type');
  });

  it('wraps the swap in a transaction and restores foreign keys', async () => {
    const { db, executed } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(executed);
    expect(sql).toContain('PRAGMA foreign_keys=OFF;');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
    // Restored last, so a later failure cannot leave them disabled.
    expect(executed[executed.length - 1]).toContain('PRAGMA foreign_keys=ON;');
  });

  it('restores foreign keys even when the rebuild throws', async () => {
    const executed: string[] = [];
    const db = {
      getFirstAsync: async () => ({ sql: OLD_DDL }),
      execAsync: async (sql: string) => {
        executed.push(sql);
        if (sql.includes('CREATE TABLE timing_lines_rebuild')) {
          throw new Error('disk full');
        }
      },
    } as unknown as SQLiteDatabase;

    await expect(ensureTimingLineTypes(db)).rejects.toThrow('disk full');
    expect(executed[executed.length - 1]).toContain('PRAGMA foreign_keys=ON;');
  });
});
