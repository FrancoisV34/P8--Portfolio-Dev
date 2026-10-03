import Database from 'better-sqlite3';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { databasePath } from './config.ts';

function failure(message: string): never {
  throw new Error(message);
}

function verifyDatabase(path: string) {
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = sqlite.pragma('quick_check', { simple: true });
    const foreignKeys = sqlite.pragma('foreign_key_check');
    const migrations = sqlite.prepare('select count(*) as count from __drizzle_migrations').get() as { count: number };
    if (integrity !== 'ok' || (Array.isArray(foreignKeys) && foreignKeys.length > 0) || migrations.count < 1) {
      failure('La sauvegarde SQLite est invalide.');
    }
  } catch {
    failure('La sauvegarde SQLite est invalide.');
  } finally {
    sqlite?.close();
  }
}

function freshDestination(source: string, destination: string) {
  const temporary = `${destination}.partial`;
  if (resolve(source) === resolve(destination) || resolve(source) === resolve(temporary) || existsSync(destination) || existsSync(temporary)) {
    failure('La destination doit être un nouveau fichier distinct.');
  }
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  return temporary;
}

export function privateSqlitePath(path: string, projectRoot = process.cwd()) {
  return databasePath({ path, environment: 'backup', projectRoot });
}

export async function createBackup(sqlite: Database.Database, source: string, destination: string) {
  const temporary = freshDestination(source, destination);
  try {
    await sqlite.backup(temporary);
    chmodSync(temporary, 0o600);
    verifyDatabase(temporary);
    renameSync(temporary, destination);
    removeSidecars(temporary);
  } catch {
    rmSync(temporary, { force: true });
    removeSidecars(temporary);
    failure('La sauvegarde SQLite n’a pas pu être créée.');
  }
}

export async function restoreBackup(source: string, destination: string) {
  const temporary = freshDestination(source, destination);
  verifyDatabase(source);
  let sqlite: Database.Database | undefined;
  try {
    sqlite = new Database(source, { readonly: true, fileMustExist: true });
    await sqlite.backup(temporary);
    chmodSync(temporary, 0o600);
    verifyDatabase(temporary);
    renameSync(temporary, destination);
    removeSidecars(temporary);
  } catch {
    rmSync(temporary, { force: true });
    removeSidecars(temporary);
    failure('La restauration SQLite n’a pas pu être effectuée.');
  } finally {
    sqlite?.close();
  }
}

const maximumDownloadBytes = 64 * 1024 * 1024;

/**
 * ⚠️ **Une sauvegarde téléchargée ne doit pas pouvoir ouvrir une session.**
 * Better Auth garde le jeton de session en clair : une copie de la base qui
 * le contient permet de se connecter sans mot de passe tant qu'il n'a pas
 * expiré. Constaté le 3 octobre 2026 sur une sauvegarde de production. Les
 * sessions et jetons de vérification sont donc retirés de la copie, et
 * `VACUUM` réécrit le fichier pour qu'ils ne survivent pas dans ses pages
 * libres. Le mot de passe haché reste : sans lui, une base restaurée serait
 * inutilisable.
 */
function withoutCredentials(path: string) {
  const copy = new Database(path, { fileMustExist: true });
  try {
    copy.exec('delete from session; delete from verification;');
    copy.pragma('journal_mode = DELETE');
    copy.exec('VACUUM');
  } finally {
    copy.close();
  }
  verifyDatabase(path);
  removeSidecars(path);
}

/** Une base ouverte en WAL laisse `-wal` et `-shm` à côté d'elle. */
function removeSidecars(path: string) {
  for (const suffix of ['-wal', '-shm']) rmSync(`${path}${suffix}`, { force: true });
}

/**
 * Produit une copie SQLite cohérente uniquement le temps d'un téléchargement
 * propriétaire. Le fichier temporaire n'est jamais conservé sur le serveur.
 */
export async function createDownloadBackup(sqlite: Database.Database, source: string) {
  const directory = await mkdtemp(join(tmpdir(), 'fv-finance-backup-'));
  const destination = join(directory, 'finance.sqlite');
  try {
    await createBackup(sqlite, source, destination);
    withoutCredentials(destination);
    const size = (await stat(destination)).size;
    if (size < 1 || size > maximumDownloadBytes) failure('La sauvegarde SQLite n’a pas pu être créée.');
    const downloadedAt = new Date().toISOString().replaceAll(':', '-').replace('.', '-');
    return { bytes: await readFile(destination), filename: `finance-backup-${downloadedAt}.sqlite` };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
