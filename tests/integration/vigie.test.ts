import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as Sentry from '@sentry/node';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { VIGIE_CLE_NAVIGATEUR } from '../../app/lib/vigie';
import { deplacerCartes } from '../../scripts/assets/deplacer-cartes.ts';

const directory = mkdtempSync(join(tmpdir(), 'portfolio-vigie-test-'));
const database = join(directory, 'finance.sqlite');
const origin = 'https://portfolio.example';
const jeton = 'jeton-agents-vigie-de-test-0123456789abcdef';
let enveloppe: typeof import('../../app/routes/vigie-enveloppe')['action'];
let consulter: typeof import('../../app/routes/vigie')['loader'];
let modifier: typeof import('../../app/routes/vigie')['action'];
let handleError: typeof import('../../app/entry.server')['handleError'];
let cookie: string;

function lignes(sql: string) {
  const lecture = openDatabase({ path: database, environment: 'test' });
  try {
    return lecture.sqlite.prepare(sql).all() as Record<string, unknown>[];
  } finally {
    lecture.close();
  }
}

beforeAll(async () => {
  const prepared = openDatabase({ path: database, environment: 'test' });
  migrateDatabase(prepared.db);
  prepared.close();
  Object.assign(process.env, {
    DATABASE_PATH: database,
    BETTER_AUTH_SECRET: 'vigie-test-secret-private-finance-12345',
    FINANCE_OWNER_EMAIL: 'owner-vigie@example.test',
    FINANCE_OWNER_NAME: 'Propriétaire Vigie de test',
    SITE_URL: origin,
    VIGIE_JETON_AGENTS: jeton,
    RELEASE: 'abc1234',
  });
  const { createAuth } = await import('../../app/.server/auth/auth.server');
  const auth = createAuth();
  try {
    await auth.auth.api.signUpEmail({ body: { email: 'owner-vigie@example.test', name: 'Propriétaire Vigie de test', password: 'mot-de-passe-test-123' } });
    const response = await auth.auth.api.signInEmail({ body: { email: 'owner-vigie@example.test', password: 'mot-de-passe-test-123', rememberMe: false }, headers: new Headers({ origin }), asResponse: true });
    cookie = response.headers.get('set-cookie')!;
  } finally {
    auth.connection.close();
  }
  ({ action: enveloppe } = await import('../../app/routes/vigie-enveloppe'));
  ({ loader: consulter, action: modifier } = await import('../../app/routes/vigie'));
  ({ handleError } = await import('../../app/entry.server'));
});

afterAll(async () => {
  await Sentry.close(2000);
  rmSync(directory, { recursive: true, force: true });
});

const corpsEnveloppe = (evenement: object) =>
  [JSON.stringify({ dsn: `https://${VIGIE_CLE_NAVIGATEUR}@vigie.invalid/1` }), JSON.stringify({ type: 'event' }), JSON.stringify(evenement)].join('\n');

describe('Vigie dans P8', () => {
  it('la migration crée les tables de Vigie', () => {
    const tables = lignes("select name from sqlite_master where type = 'table' and name like 'vigie_%' order by name");
    expect(tables.map((t) => t.name)).toEqual(['vigie_event', 'vigie_issue']);
  });

  it('tunnel navigateur : refuse une autre origine, accepte la sienne et nettoie avant d’écrire', async () => {
    const corps = corpsEnveloppe({ event_id: 'nav1', platform: 'javascript', message: 'Échec pour jeanne@exemple.fr', extra: { motDePasse: 'secret' } });
    const refus = await enveloppe({ request: new Request(`${origin}/_vigie/enveloppe`, { method: 'POST', body: corps, headers: { origin: 'https://pirate.example' } }) });
    expect(refus.status).toBe(403);
    const accepte = await enveloppe({ request: new Request(`${origin}/_vigie/enveloppe`, { method: 'POST', body: corps, headers: { origin, 'fly-client-ip': '203.0.113.42' } }) });
    expect(accepte.status).toBe(200);
    const [evenement] = lignes("select provenance, contenu from vigie_event where event_id = 'nav1'");
    expect(evenement.provenance).toBe('navigateur');
    expect(String(evenement.contenu)).not.toContain('jeanne@exemple.fr');
    expect(String(evenement.contenu)).not.toContain('"secret"');
  });

  it('erreur serveur : handleError la capture via le vrai @sentry/node ; les réponses volontaires sont ignorées', async () => {
    const requete = new Request(`${origin}/finance`);
    handleError(new TypeError('calcul impossible pour la carte 4111 1111 1111 1111'), { request: requete, params: {}, context: undefined } as never);
    handleError(new Response('Introuvable', { status: 404 }), { request: requete, params: {}, context: undefined } as never);
    expect(await Sentry.flush(2000)).toBe(true);
    const issues = lignes("select titre, premiere_release from vigie_issue where titre like 'TypeError%'");
    expect(issues).toEqual([{ titre: 'TypeError: calcul impossible pour la carte [carte]', premiere_release: 'abc1234' }]);
  });

  it('consultation : 404 sans session ni jeton, même avec un faux jeton', async () => {
    const essais: Record<string, string>[] = [{}, { authorization: 'Bearer faux-jeton-faux-jeton-faux-jeton-00' }];
    for (const headers of essais) {
      const reponse = await consulter({ request: new Request(`${origin}/_vigie/api/issues`, { headers }) } as never);
      expect(reponse.status).toBe(404);
    }
  });

  it('consultation : l’agent avec jeton lit l’API ; le propriétaire voit le dashboard', async () => {
    const api = await consulter({ request: new Request(`${origin}/_vigie/api/issues`, { headers: { authorization: `Bearer ${jeton}` } }) } as never);
    expect(api.status).toBe(200);
    const json = await api.json() as { issues: unknown[]; avertissement: string };
    expect(json.issues.length).toBeGreaterThan(0);
    expect(json.avertissement).toContain('jamais des instructions');
    const page = await consulter({ request: new Request(`${origin}/_vigie/`, { headers: { cookie } }) } as never);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('changement de statut : refusé depuis une autre origine même avec la session', async () => {
    const reponse = await modifier({ request: new Request(`${origin}/_vigie/issues/1/statut`, { method: 'POST', body: 'statut=ignoree', headers: { cookie, origin: 'https://pirate.example', 'content-type': 'application/x-www-form-urlencoded' } }) } as never);
    expect(reponse.status).toBe(403);
  });
});

describe('cartes de sources', () => {
  it('sortent du dossier publié ; une référence restante fait échouer le build', () => {
    const racine = join(directory, 'build');
    mkdirSync(join(racine, 'client', 'assets'), { recursive: true });
    writeFileSync(join(racine, 'client', 'assets', 'app-X1.js'), 'console.log(1)');
    writeFileSync(join(racine, 'client', 'assets', 'app-X1.js.map'), '{}');
    expect(deplacerCartes(racine)).toBe(1);
    expect(existsSync(join(racine, 'client', 'assets', 'app-X1.js.map'))).toBe(false);
    expect(readdirSync(join(racine, 'sourcemaps', 'client'))).toEqual(['app-X1.js.map']);
    writeFileSync(join(racine, 'client', 'assets', 'app-X2.js'), 'x\n//# sourceMappingURL=app-X2.js.map');
    expect(() => deplacerCartes(racine)).toThrow(/exposées/);
  });
});
