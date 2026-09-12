import { resolve } from 'node:path';
import { restoreBackup, privateSqlitePath } from '../../app/.server/db/backup.ts';
import { databasePath } from '../../app/.server/db/config.ts';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length > 0) throw new Error('Indiquer une sauvegarde SQLite et un nouveau fichier de restauration.');

const source = privateSqlitePath(input);
const destination = privateSqlitePath(output);
if (resolve(destination) === resolve(databasePath())) {
  throw new Error('La restauration doit viser une base séparée de la base active.');
}

await restoreBackup(source, destination);
console.log('Restauration SQLite créée et vérifiée dans une base séparée.');
