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
  it('redirige une lecture directe sans session vers /co, sans URL de retour ni contenu privé', async () => {
    let response: unknown;
    try { await loader({ request: new Request(`${origin}/finance`), params: {} }); } catch (error) { response = error; }
    expect(response).toBeInstanceOf(Response);
    expect(response).toMatchObject({ status: 302 });
    expect((response as Response).headers.get('location')).toBe('/co');
    expect((response as Response).headers.get('cache-control')).toContain('no-store');
  });

  it('refuse toujours une mutation sans session côté serveur', async () => {
    const form = new FormData();
    form.set('intent', 'createEntity');
    form.set('name', 'Entité interdite');
    form.set('type', 'personal');
    await expect(action({ request: new Request(`${origin}/finance`, { method: 'POST', body: form, headers: { origin } }) })).rejects.toMatchObject({ status: 401 });
  });

  it('charge le dashboard vide du propriétaire sans exposer de donnée par URL', async () => {
    await expect(loader({ request: request(), params: {} })).resolves.toMatchObject({ name: 'Propriétaire route de test', dashboard: { transactionCount: 0 }, planning: { reserve: null, commitments: [] } });
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

  it('enregistre un scénario GoMining côté serveur sans créer de transaction financière', async () => {
    const category = new FormData();
    category.set('intent', 'createCategory');
    category.set('name', 'GoMining synthétique');
    category.set('kind', 'expense');
    await expect(action({ request: request('POST', category) })).resolves.toMatchObject({ status: 302 });
    const loadedBeforeScenario = await loader({ request: request(), params: {} });
    const budgetCategory = loadedBeforeScenario.categories.find((item) => item.name === 'GoMining synthétique');
    if (!budgetCategory) throw new Error('Catégorie de test absente.');
    const form = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createGoMiningScenario', name: 'Scénario synthétique', startPeriod: '2026-09', horizonMonths: '12', initialHashrateMilliTh: '1000', initialAccumulatedSats: '0', efficiencyMilliWattsPerTh: '12000', monthlyNetRewardSatsPerTh: '0', pricePerMilliTh: '1,00', btcPrice: '10000,00', phaseOne: '1,00', phaseTwo: '1,00', phaseThree: '1,00' })) form.set(key, value);
    form.set('budgetCategoryId', budgetCategory.id);
    await expect(action({ request: request('POST', form) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: request(), params: {} })).resolves.toMatchObject({ gomining: [expect.objectContaining({ scenario: expect.objectContaining({ name: 'Scénario synthétique', revision: 1, budgetCategoryId: budgetCategory.id }), versions: [expect.objectContaining({ revision: 1 })] })], gominingBudgetPlans: [expect.objectContaining({ categoryId: budgetCategory.id, contributionCents: 100 })], transactions: [] });
  });

  it('enregistre un actif et une dette patrimoniaux par POST, avec état daté', async () => {
    const loaded = await loader({ request: request(), params: {} });
    const entity = loaded.entities[0];
    if (!entity) throw new Error('Entité de test absente.');
    const asset = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createWealthAsset', entityId: entity.id, name: 'Placement patrimonial synthétique', assetClass: 'securities', quantityDescription: '1 titre', contributedAmount: '10,00', valuedOn: '2026-09-30', valueAmount: '12,00', note: '' })) asset.set(key, value);
    await expect(action({ request: request('POST', asset) })).resolves.toMatchObject({ status: 302 });
    const debt = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createWealthDebt', entityId: entity.id, name: 'Dette patrimoniale synthétique', asOfDate: '2026-09-30', outstandingAmount: '100,00', monthlyPayment: '10,00', annualRate: '4,25', remainingMonths: '12' })) debt.set(key, value);
    await expect(action({ request: request('POST', debt) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/wealth?period=2026-09`, { headers: { cookie } }), params: { '*': 'wealth' } })).resolves.toMatchObject({ section: 'wealth', wealth: { manualAssetCents: 1_200, debtCents: 10_000, assets: [expect.objectContaining({ asset: expect.objectContaining({ name: 'Placement patrimonial synthétique' }) })], debts: [expect.objectContaining({ debt: expect.objectContaining({ name: 'Dette patrimoniale synthétique' }) })] } });
  });
});
