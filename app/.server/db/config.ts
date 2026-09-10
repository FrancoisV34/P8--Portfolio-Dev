import { existsSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function physicalPath(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  return resolve(physicalPath(parent), relative(parent, path));
}

function inside(path: string, directory: string) {
  const remainder = relative(directory, path);
  return remainder === '' || (!remainder.startsWith(`..${sep}`) && remainder !== '..' && !isAbsolute(remainder));
}

export function databasePath(options: {
  path?: string;
  environment?: string;
  projectRoot?: string;
} = {}) {
  const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
  const configured = options.path ?? process.env.DATABASE_PATH;
  if (!configured?.trim() && ['production', 'test'].includes(environment)) {
    throw new Error('DATABASE_PATH doit être défini explicitement pour la production et les tests.');
  }
  if (configured === ':memory:' || configured?.startsWith('file:')) {
    throw new Error('DATABASE_PATH doit désigner un fichier SQLite local.');
  }
  const root = options.projectRoot ?? process.cwd();
  const path = resolve(root, configured?.trim() || 'data/development.sqlite');
  if (!/\.(sqlite|db)$/.test(path)) {
    throw new Error('Utiliser une extension .sqlite ou .db pour le fichier privé.');
  }
  const actualPath = physicalPath(path);
  for (const directory of ['public', 'build/client']) {
    if (inside(actualPath, physicalPath(resolve(root, directory)))) {
      throw new Error('La base de données ne peut pas être stockée dans les fichiers publics.');
    }
  }
  return path;
}
