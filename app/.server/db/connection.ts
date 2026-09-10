import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { databasePath } from './config.ts';
import * as schema from './schema.ts';

export function openDatabase(options: Parameters<typeof databasePath>[0] = {}) {
  const path = databasePath(options);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const sqlite = new Database(path);
  try {
    chmodSync(path, 0o600);
    sqlite.pragma('foreign_keys = ON');
    sqlite.pragma('busy_timeout = 5000');
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('synchronous = FULL');
    for (const suffix of ['-wal', '-shm']) {
      if (existsSync(`${path}${suffix}`)) chmodSync(`${path}${suffix}`, 0o600);
    }
    return { db: drizzle(sqlite, { schema }), sqlite, close: () => sqlite.close() };
  } catch (error) {
    sqlite.close();
    throw error;
  }
}

export type FinanceDatabase = ReturnType<typeof openDatabase>['db'];
