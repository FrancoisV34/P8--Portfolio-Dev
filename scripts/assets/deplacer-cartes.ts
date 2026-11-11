// Après `react-router build` : déplace les cartes de sources du navigateur hors du dossier publié.
// build/client est servi en entier par scripts/production/server.mjs : une carte laissée là serait
// téléchargeable. Elles vont dans build/sourcemaps/client, où seul Vigie les lit (symbolisation des
// erreurs du navigateur). Le script échoue si une carte ou une référence à une carte subsiste.
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import process from 'node:process';

export function deplacerCartes(racine = resolve('build')): number {
  const publie = join(racine, 'client');
  const destination = join(racine, 'sourcemaps', 'client');
  mkdirSync(destination, { recursive: true });
  const fichiers = readdirSync(publie, { recursive: true })
    .map((nom) => join(publie, String(nom)))
    .filter((chemin) => statSync(chemin).isFile());

  let deplacees = 0;
  for (const chemin of fichiers.filter((f) => f.endsWith('.map'))) {
    renameSync(chemin, join(destination, basename(chemin)));
    deplacees++;
  }
  const restantes = readdirSync(publie, { recursive: true }).filter((nom) => String(nom).endsWith('.map'));
  const referencees = fichiers
    .filter((f) => f.endsWith('.js') || f.endsWith('.css'))
    .filter((f) => readFileSync(f, 'utf8').includes('sourceMappingURL='));
  if (restantes.length > 0 || referencees.length > 0) {
    throw new Error(`Cartes de sources exposées dans build/client : ${[...restantes, ...referencees].join(', ')}`);
  }
  return deplacees;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const deplacees = deplacerCartes();
  process.stdout.write(`${deplacees} carte(s) de sources déplacée(s) hors de build/client.\n`);
}
