import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { cfoRepository } from '../../app/.server/repositories/cfo';

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
    const observedBtc = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createObservedGoMiningBtc', entityId: entity.id, observedBtcSats: '123456', valuedOn: '2026-09-30', valueAmount: '7,00', note: '' })) observedBtc.set(key, value);
    await expect(action({ request: request('POST', observedBtc) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/wealth?period=2026-09`, { headers: { cookie } }), params: { '*': 'wealth' } })).resolves.toMatchObject({ wealth: { manualAssetCents: 1_900, assets: expect.arrayContaining([expect.objectContaining({ asset: expect.objectContaining({ source: 'gomining-observed-btc', observedBtcSats: 123_456 }) })]) } });
  });

  it('isole les observations business du foyer par des mutations privées', async () => {
    const entity = new FormData();
    entity.set('intent', 'createEntity');
    entity.set('name', 'Société route synthétique');
    entity.set('type', 'business');
    await expect(action({ request: request('POST', entity) })).resolves.toMatchObject({ status: 302 });
    const loaded = await loader({ request: request(), params: {} });
    const businessEntity = loaded.entities.find((item) => item.name === 'Société route synthétique');
    if (!businessEntity) throw new Error('Entité business de test absente.');
    const activity = new FormData();
    activity.set('intent', 'createBusinessActivity');
    activity.set('entityId', businessEntity.id);
    activity.set('name', 'Activité route synthétique');
    await expect(action({ request: request('POST', activity) })).resolves.toMatchObject({ status: 302 });
    const created = await loader({ request: request(), params: {} });
    const businessActivity = created.business.activities.find(({ activity: item }) => item.name === 'Activité route synthétique')?.activity;
    if (!businessActivity) throw new Error('Activité business de test absente.');
    const metrics = new FormData();
    for (const [key, value] of Object.entries({ intent: 'setBusinessMetrics', activityId: businessActivity.id, period: '2026-09', revenueAmount: '120,00', operatingExpenseAmount: '40,00', mrrAmount: '90,00', activeCustomerCount: '3', maintenanceMinutes: '75' })) metrics.set(key, value);
    await expect(action({ request: request('POST', metrics) })).resolves.toMatchObject({ status: 302 });
    const cash = new FormData();
    for (const [key, value] of Object.entries({ intent: 'setBusinessCash', entityId: businessEntity.id, period: '2026-09', retainedCashAmount: '300,00', distributedAmount: '20,00' })) cash.set(key, value);
    await expect(action({ request: request('POST', cash) })).resolves.toMatchObject({ status: 302 });
    const provision = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createBusinessProvision', entityId: businessEntity.id, period: '2026-09', name: 'Provision route synthétique', amount: '30,00', note: '' })) provision.set(key, value);
    await expect(action({ request: request('POST', provision) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/business?period=2026-09`, { headers: { cookie } }), params: { '*': 'business' } })).resolves.toMatchObject({
      section: 'business',
      business: { revenueCents: 12_000, operatingExpenseCents: 4_000, mrrCents: 9_000, annualRecurringRevenueCents: 108_000, activeCustomerCount: 3, maintenanceMinutes: 75, retainedCashCents: 30_000, distributedCents: 2_000, provisionCents: 3_000, provisions: [expect.objectContaining({ entityId: businessEntity.id, name: 'Provision route synthétique' })], activities: [expect.objectContaining({ activity: expect.objectContaining({ id: businessActivity.id }), metric: expect.objectContaining({ revenueCents: 12_000, mrrCents: 9_000, activeCustomerCount: 3, maintenanceMinutes: 75 }) })] },
      transactions: [],
    });
  });

  it('enregistre les objectifs et projets par POST sans créer de transaction', async () => {
    const goal = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createGoal', name: 'Objectif route synthétique', targetAmount: '1 000,00', progressAmount: '250,00', targetDate: '2027-01-31', priority: '2' })) goal.set(key, value);
    await expect(action({ request: request('POST', goal) })).resolves.toMatchObject({ status: 302 });
    const loaded = await loader({ request: request(), params: {} });
    const createdGoal = loaded.goals.goals.find((item) => item.name === 'Objectif route synthétique');
    if (!createdGoal) throw new Error('Objectif de test absent.');
    const project = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createProject', goalId: createdGoal.id, name: 'Projet route synthétique', status: 'active', priority: '1', estimatedCostAmount: '50,00', estimatedEffortMinutes: '120', nextAction: 'Préparer le plan' })) project.set(key, value);
    await expect(action({ request: request('POST', project) })).resolves.toMatchObject({ status: 302 });
    const capacity = new FormData();
    capacity.set('intent', 'setProjectCapacity');
    capacity.set('monthlyCapacityMinutes', '90');
    await expect(action({ request: request('POST', capacity) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/goals?period=2026-09`, { headers: { cookie } }), params: { '*': 'goals' } })).resolves.toMatchObject({
      section: 'goals', goals: { goals: [expect.objectContaining({ id: createdGoal.id, targetCents: 100_000, progressCents: 25_000 })], projects: [expect.objectContaining({ goalId: createdGoal.id, status: 'active', estimatedCostCents: 5_000, estimatedEffortMinutes: 120 })], capacity: expect.objectContaining({ monthlyCapacityMinutes: 90 }), activeEffortMinutes: 120, capacityStatus: 'watch' }, transactions: [],
    });
  });

  it('évalue le CFO côté serveur et conserve un instantané sans mouvement financier', async () => {
    const weights = new FormData();
    for (const [key, value] of Object.entries({ intent: 'setCfoWeights', placementsWeight: '50,00', businessWeight: '20,00', materialWeight: '10,00', projectsWeight: '10,00', opportunitiesWeight: '10,00' })) weights.set(key, value);
    await expect(action({ request: request('POST', weights) })).resolves.toMatchObject({ status: 302 });
    const form = new FormData();
    form.set('intent', 'evaluateCfo');
    await expect(action({ request: request('POST', form) })).resolves.toMatchObject({ status: 302 });
    const loaded = await loader({ request: new Request(`${origin}/finance/cfo?period=2026-09`, { headers: { cookie } }), params: { '*': 'cfo' } });
    expect(loaded).toMatchObject({ section: 'cfo', cfo: { context: expect.objectContaining({ gominingContributionCents: 100 }), rules: expect.objectContaining({ version: 'cfo-v2' }) }, transactions: [] });
    const evaluation = loaded.cfo.history.find((item) => item.ruleVersion === 'cfo-v2');
    if (!evaluation) throw new Error('Évaluation CFO de test absente.');
    const ignored = new FormData();
    ignored.set('intent', 'decideCfo');
    ignored.set('evaluationId', evaluation.id);
    ignored.set('outcome', 'ignored');
    ignored.set('note', 'Décision route synthétique');
    await expect(action({ request: request('POST', ignored) })).resolves.toMatchObject({ status: 302 });
    const comparisonConnection = openDatabase({ path: database, environment: 'test' });
    const owner = comparisonConnection.sqlite.prepare('select id from user where email = ?').get('owner-route@example.test') as { id: string };
    const comparisonEvaluation = cfoRepository(comparisonConnection.db, owner.id).evaluate({ period: '2026-09', liquidCashCents: 10_000, reserveTargetCents: 0, reserveCurrentCents: 0, unpaidCommitmentCents: 0, debtPaymentCents: 0, businessProvisionCents: 0, gominingContributionCents: 0, speculativeAssetCents: 0, grossAssetCents: 10_000, businessCashComplete: true, activeProjectCount: 0, projectCapacityStatus: 'compatible' });
    comparisonConnection.close();
    const comparison = new FormData();
    for (const [key, value] of Object.entries({ intent: 'compareCfo', evaluationId: comparisonEvaluation.id, name: 'Hypothèse route synthétique', placementsAmount: '40,00', businessAmount: '30,00', materialAmount: '10,00', projectsAmount: '10,00', opportunitiesAmount: '10,00' })) comparison.set(key, value);
    await expect(action({ request: request('POST', comparison) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/cfo?period=2026-09`, { headers: { cookie } }), params: { '*': 'cfo' } })).resolves.toMatchObject({ cfo: { history: expect.arrayContaining([expect.objectContaining({ id: evaluation.id, decisions: [expect.objectContaining({ outcome: 'ignored', note: 'Décision route synthétique' })] }), expect.objectContaining({ id: comparisonEvaluation.id, comparisons: [expect.objectContaining({ name: 'Hypothèse route synthétique' })] })]) } });
  });

  it('versionne puis lance une simulation privée sans modifier le journal réel', async () => {
    const initial = await loader({ request: new Request(`${origin}/finance/simulations?period=2026-09`, { headers: { cookie } }), params: { '*': 'simulations' } });
    const gominingScenario = initial.gomining[0]?.scenario;
    if (!gominingScenario) throw new Error('Scénario GoMining de test absent.');
    const form = new FormData();
    for (const [key, value] of Object.entries({ intent: 'saveSimulation', months: '12', profileKind: 'central', placementReturn: '6,00', businessGrowth: '2,00', expenseInflation: '2,00', openingHouseholdCash: '100,00', frozenObservedAssets: '50,00', monthlyHouseholdIncome: '200,00', monthlyHouseholdExpense: '100,00', gominingScenarioId: gominingScenario.id, placementsWeight: '50,00', businessWeight: '10,00', materialWeight: '0,00', projectsWeight: '10,00', opportunitiesWeight: '10,00', debtWeight: '20,00' })) form.set(key, value);
    for (const { activity } of initial.business.activities) { form.set(`businessCash-${activity.id}`, '0,00'); form.set(`businessRevenue-${activity.id}`, '0,00'); }
    const firstActivity = initial.business.activities[0]?.activity;
    if (firstActivity) { for (const [key, value] of Object.entries({ [`businessChargeName-${firstActivity.id}-0`]: 'Charge route synthétique', [`businessChargeAmount-${firstActivity.id}-0`]: '12,00', [`businessChargeFrequency-${firstActivity.id}-0`]: 'quarterly', [`businessChargeStart-${firstActivity.id}-0`]: '1', [`businessChargeEnd-${firstActivity.id}-0`]: '12' })) form.set(key, value); }
    await expect(action({ request: new Request(`${origin}/finance/simulations?period=2026-09`, { method: 'POST', body: form, headers: { cookie, origin } }) })).resolves.toMatchObject({ status: 302 });
    const saved = await loader({ request: new Request(`${origin}/finance/simulations?period=2026-09`, { headers: { cookie } }), params: { '*': 'simulations' } });
    const assumption = saved.simulations.current;
    if (!assumption) throw new Error('Hypothèse de simulation absente.');
    expect(assumption.snapshot).toMatchObject({ months: 12, profileKind: 'central', monthlyHouseholdIncomeCents: 20_000, gominingScenarioId: gominingScenario.id, gominingContributionCentsByMonth: expect.arrayContaining([100]), businesses: firstActivity ? [expect.objectContaining({ id: firstActivity.id, charges: [expect.objectContaining({ name: 'Charge route synthétique', frequency: 'quarterly' })] })] : [] });
    const run = new FormData(); run.set('intent', 'runSimulation'); run.set('assumptionId', assumption.id);
    await expect(action({ request: new Request(`${origin}/finance/simulations?period=2026-09`, { method: 'POST', body: run, headers: { cookie, origin } }) })).resolves.toMatchObject({ status: 302 });
    await expect(loader({ request: new Request(`${origin}/finance/simulations?period=2026-09`, { headers: { cookie } }), params: { '*': 'simulations' } })).resolves.toMatchObject({ simulations: { runs: [expect.objectContaining({ assumptionId: assumption.id, result: expect.objectContaining({ months: expect.any(Array) }) })] }, transactions: [] });
  });

  it('résout une règle réglementaire uniquement côté serveur, sans valeur de repli', async () => {
    const rule = new FormData();
    for (const [key, value] of Object.entries({ intent: 'createRegulatoryRule', name: 'Règle route synthétique', value: '10 %', source: 'Source route synthétique', verifiedOn: '2026-09-12', validFrom: '2026-01-01', validTo: '2026-03-31', note: '' })) rule.set(key, value);
    await expect(action({ request: request('POST', rule) })).resolves.toMatchObject({ status: 302 });
    const resolve = new FormData();
    resolve.set('intent', 'resolveRegulatoryRule');
    resolve.set('name', 'Règle route synthétique');
    resolve.set('asOf', '2026-04-01');
    await expect(action({ request: request('POST', resolve) })).resolves.toMatchObject({ regulationResolution: { status: 'missing', rules: [] } });
    await expect(loader({ request: new Request(`${origin}/finance/regulations?period=2026-04`, { headers: { cookie } }), params: { '*': 'regulations' } })).resolves.toMatchObject({ regulations: { asOf: '2026-04-30', coverage: expect.arrayContaining([expect.objectContaining({ name: 'Règle route synthétique', status: 'missing' })]) } });
  });
});
