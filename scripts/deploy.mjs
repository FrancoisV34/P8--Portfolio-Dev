// Déploiement sur Fly.io avec la release Vigie : le hash court du commit (ADR-0009 de Vigie).
// Refuse de déployer des modifications non commitées : la release affichée par Vigie doit
// correspondre exactement au code en production.
import { execFileSync, spawnSync } from 'node:child_process';
import process from 'node:process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

if (git('status', '--porcelain') !== '') {
  process.stderr.write('Déploiement refusé : des modifications ne sont pas commitées.\n');
  process.exit(1);
}
const release = git('rev-parse', '--short', 'HEAD');
process.stdout.write(`Déploiement de la release ${release}…\n`);
const resultat = spawnSync('fly', ['deploy', '--build-arg', `RELEASE=${release}`, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(resultat.status ?? 1);
