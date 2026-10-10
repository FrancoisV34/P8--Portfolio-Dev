import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// L'image de production ne copie que certains fichiers sources (Dockerfile,
// étape `runtime`). Un module chargé directement par le serveur ou par un
// script d'administration, mais absent de l'image, arrête la Machine au
// démarrage — c'est arrivé le 9 octobre 2026 (release v23). Les autres tests
// tournent hors Docker et ne peuvent pas le voir.
const racine = process.cwd();

/** Chemins (fichiers ou dossiers) que l'étape `runtime` place dans `/app`. */
function cheminsCopies() {
  const dockerfile = readFileSync(join(racine, 'Dockerfile'), 'utf8');
  const etape = dockerfile.slice(dockerfile.search(/^FROM .* AS runtime$/m));
  const copies: string[] = [];
  for (const ligne of etape.split('\n')) {
    const morceaux = ligne.trim().split(/\s+/);
    if (morceaux[0] !== 'COPY') continue;
    const sources = morceaux.slice(1, -1).filter((morceau) => !morceau.startsWith('--'));
    const depuisBuild = morceaux.some((morceau) => morceau.startsWith('--from='));
    // `COPY --from=build /app/x ./x` garde la destination ; `COPY a b ./` garde les sources.
    if (depuisBuild) copies.push(normalize(morceaux.at(-1)!));
    else copies.push(...sources.map((source) => normalize(source)));
  }
  return copies;
}

function resoudre(depuis: string, cible: string) {
  const base = join(dirname(depuis), cible);
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, join(base, 'index.ts')]) {
    if (existsSync(candidat) && !candidat.endsWith('/')) return candidat;
  }
  return base;
}

/** Tous les fichiers sources atteints par des imports relatifs, à partir des points d'entrée. */
function modulesCharges(entrees: string[]) {
  const vus = new Set<string>();
  const aVisiter = [...entrees];
  while (aVisiter.length > 0) {
    const fichier = aVisiter.pop()!;
    if (vus.has(fichier)) continue;
    vus.add(fichier);
    // Le build est produit puis copié en entier : ses imports internes ne concernent pas ce test.
    if (relative(racine, fichier).startsWith('build/') || !existsSync(fichier)) continue;
    const source = readFileSync(fichier, 'utf8');
    for (const [, cible] of source.matchAll(/(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      aVisiter.push(resoudre(fichier, cible));
    }
  }
  return [...vus].map((fichier) => relative(racine, fichier));
}

describe('image de production', () => {
  it('contient chaque module chargé par le serveur et les scripts d’administration', () => {
    const copies = cheminsCopies();
    const entrees = [
      'scripts/production/server.mjs',
      ...['scripts/db', 'scripts/auth'].flatMap((dossier) =>
        readdirSync(join(racine, dossier)).filter((nom) => nom.endsWith('.ts')).map((nom) => `${dossier}/${nom}`)),
    ].map((chemin) => join(racine, chemin));

    const charges = modulesCharges(entrees).filter((chemin) => !chemin.startsWith('build/'));
    const absents = charges.filter((chemin) =>
      !copies.some((copie) => chemin === copie || chemin.startsWith(`${copie}/`)));

    expect(charges.length).toBeGreaterThan(10);
    expect(absents).toEqual([]);
  });
});
