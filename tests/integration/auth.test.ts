import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';

const directory = mkdtempSync(join(tmpdir(), 'portfolio-auth-test-'));
const database = join(directory, 'auth.sqlite');
const ownerEmail = 'owner@example.test';
const secret = 'a'.repeat(32);
let auth: Awaited<ReturnType<typeof import('../../app/.server/auth/auth.server').getAuth>>['auth'];
let close: () => void;
let requireOwner: typeof import('../../app/.server/auth/owner.server')['requireOwner'];
let handler: typeof import('../../app/routes/api-auth')['action'];
let loginAction: typeof import('../../app/routes/login')['action'];

function request(path: string, method = 'POST', cookie?: string) {
  return new Request(`https://portfolio.example/api/auth${path}`, {
    method,
    headers: { origin: 'https://portfolio.example', ...(cookie ? { cookie } : {}) },
  });
}

beforeAll(async () => {
  const preparation = openDatabase({ path: database, environment: 'test' });
  migrateDatabase(preparation.db);
  preparation.close();
  process.env.DATABASE_PATH = database;
  process.env.BETTER_AUTH_SECRET = secret;
  process.env.FINANCE_OWNER_EMAIL = ownerEmail;
  process.env.FINANCE_OWNER_NAME = 'Propriétaire de test';
  process.env.SITE_URL = 'https://portfolio.example';
  ({ auth, connection: { close } } = (await import('../../app/.server/auth/auth.server')).getAuth());
  ({ requireOwner } = await import('../../app/.server/auth/owner.server'));
  ({ action: handler } = await import('../../app/routes/api-auth'));
  ({ action: loginAction } = await import('../../app/routes/login'));
});

afterAll(() => {
  close?.();
  rmSync(directory, { recursive: true, force: true });
});

async function signIn(email: string, password: string) {
  const response = await auth.api.signInEmail({
    body: { email, password, rememberMe: false },
    headers: new Headers({ origin: 'https://portfolio.example' }),
    asResponse: true,
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie');
  expect(cookie).toBeTruthy();
  return cookie!;
}

describe('compte financier unique', () => {
  it('refuse les créations publiques et les routes auth hors liste blanche', async () => {
    const signUp = await handler({ request: request('/sign-up/email') });
    const reset = await handler({ request: request('/request-password-reset') });
    expect(signUp.status).toBe(404);
    expect(reset.status).toBe(404);
  });

  it('accepte la session du propriétaire mais refuse une autre identité', async () => {
    await auth.api.signUpEmail({ body: { email: ownerEmail, password: 'mot-de-passe-test-123', name: 'Propriétaire de test' } });
    // Cette seconde création représente une corruption administrative simulée :
    // elle ne peut pas être atteinte par l’HTTP public, déjà refusé ci-dessus.
    await auth.api.signUpEmail({ body: { email: 'other@example.test', password: 'mot-de-passe-test-456', name: 'Autre test' } });
    const ownerCookie = await signIn(ownerEmail, 'mot-de-passe-test-123');
    const otherCookie = await signIn('other@example.test', 'mot-de-passe-test-456');
    await expect(requireOwner(request('/get-session', 'GET', ownerCookie))).resolves.toMatchObject({ user: { email: ownerEmail } });
    await expect(requireOwner(request('/get-session', 'GET', otherCookie))).rejects.toMatchObject({ status: 403 });
    const { loader: loginLoader } = await import('../../app/routes/login');
    await expect(loginLoader({ request: new Request('https://portfolio.example/co', { headers: { cookie: otherCookie } }) })).resolves.toEqual({ ready: true });
    await expect(loginLoader({ request: new Request('https://portfolio.example/co', { headers: { cookie: ownerCookie } }) })).resolves.toEqual({ ready: true });
    const form = new FormData();
    form.set('email', 'other@example.test');
    form.set('password', 'mot-de-passe-test-456');
    await expect(loginAction({ request: new Request('https://portfolio.example/co', { method: 'POST', body: form, headers: { origin: 'https://portfolio.example' } }) })).resolves.toEqual({ message: 'Identifiants incorrects ou accès non autorisé.' });
  });

  it('restreint le handler HTTP à connexion, session et déconnexion', async () => {
    const denied = await handler({ request: request('/update-user') });
    expect(denied.status).toBe(404);
    const noSession = await handler({ request: request('/get-session', 'GET') });
    expect(noSession.status).toBe(200);
    expect(await noSession.json()).toBeNull();
  });
});
