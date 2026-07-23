import type { SQLiteDatabase } from 'expo-sqlite';

export const PRE_MONETIZATION_INSTALL_KEY = 'installed_before_pro_v1';
export const FRESH_INSTALL_MARKER_KEY = 'fresh_install_v1';

export async function ensureAppMetadataTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);
}

export async function markFreshDatabaseBeforeSchemaCreation(db: SQLiteDatabase) {
  await ensureAppMetadataTable(db);

  if (await hasFreshInstallMarker(db)) {
    return;
  }

  const existingAppTable = await db.getFirstAsync<{ name: string }>(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> 'app_metadata'
    LIMIT 1;
  `);

  if (!existingAppTable) {
    await db.runAsync(
      'INSERT OR IGNORE INTO app_metadata (key, value) VALUES (?, ?);',
      FRESH_INSTALL_MARKER_KEY,
      '1',
    );
  }
}

export async function hasFreshInstallMarker(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ?;',
    FRESH_INSTALL_MARKER_KEY,
  );

  return row?.value === '1';
}

export async function wasInstalledBeforeMonetization(db: SQLiteDatabase): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ?;',
    PRE_MONETIZATION_INSTALL_KEY,
  );

  return row?.value === '1';
}

export function preMonetizationInstallValue(hasFreshInstallMarker: boolean): '0' | '1' {
  return hasFreshInstallMarker ? '0' : '1';
}
