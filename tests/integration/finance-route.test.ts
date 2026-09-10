import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';

const directory = mkdtempSync(join(tmpdir(), 'portfolio-finance-route-test-'));
const database = join(directory, 'finance.sqlite');
const origin = 'https://portfolio.example';
let loader: typeof import('../../app/routes/finance')['loader'];
let action: typeof import('../../app/routes/finance')['action'];
let cookie: string;

beforeAll(async () => {
  const prepared = openDatabase({ path: database, environment: 'test' });
  migrateDatabase(prepared.db);
  prepared.close();
  Object.assign(process.env, {
    DATABASE_PATH: database,
    BETTER_AUTH_SECRET: 'route-test-secret-private-finance-12345',
    FINANCE_OWNER_EMAIL: 'owner-route@example.test',
    FINANCE_OWNER_NAME: 'Propriétaire route de test',
    SITE_URL: origin,
  });
  const { createAuth } = await import('../../app/.server/auth/auth.server');
  const auth = createAuth();
  try {
    await auth.auth.api.signUpEmail({ body: { email: 'owner-route@example.test', name: 'Propriétaire route de test', password: 'mot-de-passe-test-123' } });
    const response = await auth.auth.api.signInEmail({ body: { email: 'owner-route@example.test', password: 'mot-de-passe-test-123', rememberMe: false }, headers: new Headers({ origin }), asResponse: true });
    cookie = response.headers.get('set-cookie')!;
  } finally {
    auth.connection.close();
  }
  ({ loader, action } = await import('../../app/routes/finance'));
});

afterAll(() => rmSync(directory, { recursive: true, force: true }));

function request(method = 'GET', form?: FormData, requestOrigin = origin) {
  return new Request(`${origin}/finance`, { method, body: form, headers: { cookie, origin: requestOrigin } });
}

describe('route finance privée', () => {
  it('charge le dashboard vide du propriétaire sans exposer de donnée par URL', async () => {
    await expect(loader({ request: request(), params: {} })).resolves.toMatchObject({ name: 'Propriétaire route de test', dashboard: { transactionCount: 0 } });
  });

  it('refuse une mutation provenant d’une autre origine avant toute écriture', async () => {
    const form = new FormData();
    form.set('intent', 'createEntity');
    form.set('name', 'Entité synthétique');
    form.set('type', 'personal');
    await expect(action({ request: request('POST', form, 'https://outside.example') })).rejects.toMatchObject({ status: 403 });
  });

  it('enregistre une entité depuis une action même si le chemin interne se termine par .data', async () => {
    const form = new FormData();
    form.set('intent', 'createEntity');
    form.set('name', 'Entité synthétique');
    form.set('type', 'personal');
    const response = await action({ request: new Request(`${origin}/finance/accounts.data?period=2026-09`, { method: 'POST', body: form, headers: { cookie, origin } }) });
    expect(response).toMatchObject({ status: 302, headers: expect.any(Headers) });
    await expect(loader({ request: request(), params: {} })).resolves.toMatchObject({ entities: [expect.objectContaining({ name: 'Entité synthétique' })] });
  });
});
