import type { SQLiteDatabase } from 'expo-sqlite';
import {
  FRESH_INSTALL_MARKER_KEY,
  markFreshDatabaseBeforeSchemaCreation,
  preMonetizationInstallValue,
} from '../app-metadata';

function createDbMock() {
  const execAsync = jest.fn().mockResolvedValue(undefined);
  const getFirstAsync = jest.fn();
  const runAsync = jest.fn().mockResolvedValue(undefined);
  const db = { execAsync, getFirstAsync, runAsync } as unknown as SQLiteDatabase;

  return { db, execAsync, getFirstAsync, runAsync };
}

describe('install-origin metadata', () => {
  it('marks an empty database as fresh before application tables are created', async () => {
    const { db, getFirstAsync, runAsync } = createDbMock();
    getFirstAsync.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await markFreshDatabaseBeforeSchemaCreation(db);

    expect(runAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO app_metadata'),
      FRESH_INSTALL_MARKER_KEY,
      '1',
    );
  });

  it('keeps the fresh marker after an interrupted migration chain', async () => {
    const { db, getFirstAsync, runAsync } = createDbMock();
    getFirstAsync.mockResolvedValueOnce({ value: '1' });

    await markFreshDatabaseBeforeSchemaCreation(db);

    expect(runAsync).not.toHaveBeenCalled();
  });

  it('does not mark a legacy version-zero database as a fresh install', async () => {
    const { db, getFirstAsync, runAsync } = createDbMock();
    getFirstAsync
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'sessions' });

    await markFreshDatabaseBeforeSchemaCreation(db);

    expect(runAsync).not.toHaveBeenCalled();
  });

  it('grandfathers only databases without the fresh-install marker', () => {
    expect(preMonetizationInstallValue(true)).toBe('0');
    expect(preMonetizationInstallValue(false)).toBe('1');
  });
});
