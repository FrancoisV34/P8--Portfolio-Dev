import { openDatabase } from '../../app/.server/db/connection.ts';
import { migrateDatabase } from '../../app/.server/db/migrate.ts';

const connection = openDatabase();
try {
  migrateDatabase(connection.db);
  console.log('Migrations SQLite appliquées. Aucune donnée de démonstration ajoutée.');
} finally {
  connection.close();
}
