import Database from 'better-sqlite3';
import { databasePath } from '../../app/.server/db/config.ts';

// fileMustExist empêche une vérification de créer une base vide par erreur.
const sqlite = new Database(databasePath(), { readonly: true, fileMustExist: true });
try {
  const integrity = sqlite.pragma('quick_check', { simple: true });
  const foreignKeys = sqlite.pragma('foreign_key_check');
  if (integrity !== 'ok' || (Array.isArray(foreignKeys) && foreignKeys.length > 0)) {
    throw new Error('La vérification de la base a échoué.');
  }
  const migrations = sqlite.prepare('select count(*) as count from __drizzle_migrations').get() as { count: number };
  console.log(`SQLite : intégrité OK, clés étrangères OK, ${migrations.count} migration(s) appliquée(s).`);
} finally {
  sqlite.close();
}
