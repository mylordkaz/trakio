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

// The two handles record separately: an assertion that the swap is
// transactional must fail if the work moves back onto the plain handle.
function mockDb(ddl: string | null, failOn?: string) {
  const dbExecuted: string[] = [];
  const txnExecuted: string[] = [];
  let transactions = 0;

  const db = {
    getFirstAsync: async () => (ddl === null ? null : { sql: ddl }),
    execAsync: async (sql: string) => {
      dbExecuted.push(sql);
    },
    withExclusiveTransactionAsync: async (
      callback: (txn: { execAsync: (sql: string) => Promise<void> }) => Promise<void>,
    ) => {
      transactions += 1;
      await callback({
        execAsync: async (sql: string) => {
          txnExecuted.push(sql);
          if (failOn && sql.includes(failOn)) {
            throw new Error('disk full');
          }
        },
      });
    },
  } as unknown as SQLiteDatabase;

  return {
    db,
    dbExecuted,
    txnExecuted,
    allExecuted: () => [...dbExecuted, ...txnExecuted],
    transactionCount: () => transactions,
  };
}

const all = (executed: string[]) => executed.join('\n');

describe('timing line type rebuild', () => {
  it('rebuilds a database still carrying the old constraint', async () => {
    const { db, allExecuted } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(allExecuted());
    expect(sql).toContain("'start'");
    expect(sql).toContain("'finish'");
    expect(sql).toContain('CREATE TABLE timing_lines_rebuild');
    expect(sql).toContain('DROP TABLE timing_lines');
    expect(sql).toContain('ALTER TABLE timing_lines_rebuild RENAME TO timing_lines');
  });

  it('is idempotent: a rebuilt database is left alone', async () => {
    const { db, allExecuted, transactionCount } = mockDb(NEW_DDL);
    await ensureTimingLineTypes(db);

    expect(allExecuted()).toEqual([]);
    expect(transactionCount()).toBe(0);
  });

  it('does not mistake start_finish for the new start literal', async () => {
    // The probe must use quote-delimited literals: 'start_finish' contains the
    // characters of start, so a loose check would skip a database that still
    // needs rebuilding.
    expect(OLD_DDL.includes("'start'")).toBe(false);
    expect(OLD_DDL).toContain("'start_finish'");

    const { db, allExecuted } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    expect(allExecuted().length).toBeGreaterThan(0);
  });

  it('does nothing when the table does not exist yet', async () => {
    const { db, allExecuted } = mockDb(null);
    await ensureTimingLineTypes(db);

    expect(allExecuted()).toEqual([]);
  });

  it('copies every column, so no data is dropped by the rebuild', async () => {
    const { db, allExecuted } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(allExecuted());
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
    const { db, allExecuted } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    const sql = all(allExecuted());
    expect(sql).toContain('UNIQUE(track_id, seq)');
    expect(sql).toContain('REFERENCES tracks(id) ON DELETE CASCADE');
    expect(sql).toContain('idx_timing_lines_track_seq');
    expect(sql).toContain('idx_timing_lines_track_type');
  });

  it('does the whole swap inside one transaction', async () => {
    const { db, dbExecuted, txnExecuted, transactionCount } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    expect(transactionCount()).toBe(1);
    // The swap runs entirely on the transaction handle, so a failure rolls it
    // back rather than leaving the table dropped. Nothing touches the plain
    // handle, which would escape the rollback.
    expect(txnExecuted.length).toBeGreaterThan(0);
    expect(dbExecuted).toEqual([]);
    expect(all(txnExecuted)).toContain('DROP TABLE timing_lines');
  });

  it('never disables foreign keys, so a failure cannot leave them off', async () => {
    // Nothing references timing_lines, so the rebuild does not need the
    // foreign-key toggle at all. Re-enabling them is silently ignored while a
    // transaction is still open, so a failed rebuild that relied on a pragma
    // would leave them disabled.
    const { db, allExecuted } = mockDb(OLD_DDL);
    await ensureTimingLineTypes(db);

    expect(all(allExecuted())).not.toContain('foreign_keys');
  });

  it('propagates a failure so the transaction rolls back', async () => {
    const { db, allExecuted } = mockDb(OLD_DDL, 'CREATE TABLE timing_lines_rebuild');

    await expect(ensureTimingLineTypes(db)).rejects.toThrow('disk full');
    expect(all(allExecuted())).not.toContain('foreign_keys');
  });
});
