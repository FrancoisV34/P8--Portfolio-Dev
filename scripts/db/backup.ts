import { createBackup, privateSqlitePath } from '../../app/.server/db/backup.ts';
import { databasePath } from '../../app/.server/db/config.ts';
import { openDatabase } from '../../app/.server/db/connection.ts';

const [output, ...extra] = process.argv.slice(2);
if (!output || extra.length > 0) throw new Error('Indiquer uniquement un nouveau fichier de sauvegarde SQLite.');

const source = databasePath();
const destination = privateSqlitePath(output);
const connection = openDatabase();
try {
  await createBackup(connection.sqlite, source, destination);
  console.log('Sauvegarde SQLite créée et vérifiée.');
} finally {
  connection.close();
}
