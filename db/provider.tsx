import type { ReactNode } from 'react';
import { SQLiteProvider } from 'expo-sqlite';
import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/migrations';

type DatabaseProviderProps = {
  children: ReactNode;
};

export function DatabaseProvider({ children }: DatabaseProviderProps) {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      {children}
    </SQLiteProvider>
  );
}
