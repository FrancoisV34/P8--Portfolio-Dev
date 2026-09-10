import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { FinanceDatabase } from './connection.ts';

export function migrateDatabase(db: FinanceDatabase, migrationsFolder = resolve('drizzle')) {
  migrate(db, { migrationsFolder });
}
