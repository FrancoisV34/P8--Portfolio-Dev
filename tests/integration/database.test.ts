import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { createBackup, privateSqlitePath, restoreBackup } from '../../app/.server/db/backup';
import { databasePath } from '../../app/.server/db/config';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { businessRepository } from '../../app/.server/repositories/business';
import { budgetRepository } from '../../app/.server/repositories/budget';
import { cfoRepository } from '../../app/.server/repositories/cfo';
import { planningRepository } from '../../app/.server/repositories/planning';
import { gominingRepository } from '../../app/.server/repositories/gomining';
import { goalsRepository } from '../../app/.server/repositories/goals';
import { regulatoryRepository } from '../../app/.server/repositories/regulatory';
import { regulatorySourceRepository } from '../../app/.server/repositories/regulatory-sources';
import { simulationRepository } from '../../app/.server/repositories/simulations';
import { statusComparisonRepository } from '../../app/.server/repositories/status-comparisons';
import { wealthRepository } from '../../app/.server/repositories/wealth';

let directory: string;
let connection: ReturnType<typeof openDatabase>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'portfolio-sqlite-test-'));
  connection = openDatabase({ path: join(directory, 'test.sqlite'), environment: 'test' });
  migrateDatabase(connection.db);
});
afterEach(() => {
  if (connection?.sqlite.open) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('persistance SQLite privée', () => {
  it('conserve les comparaisons de statuts par propriétaire sans pouvoir les réécrire', () => {
    const owner = statusComparisonRepository(connection.db, 'owner-test');
    const other = statusComparisonRepository(connection.db, 'other-test');
    const comparison = owner.create({ annualRevenueCents: 100_000, annualOperatingExpenseCents: 20_000, microBicServiceSocialRateBasisPoints: 2_000, sasuCorporateTaxRateBasisPoints: 2_500 });
    expect(owner.list()).toEqual([expect.objectContaining({ id: comparison.id, result: expect.objectContaining({ sasuPotentialGrossDividendsCents: 60_000 }) })]);
    expect(other.list()).toEqual([]);
    expect(() => connection.sqlite.prepare('update finance_status_comparisons set input = ? where id = ?').run('{}', comparison.id)).toThrow();
    expect(() => connection.sqlite.prepare('delete from finance_status_comparisons where id = ?').run(comparison.id)).toThrow();
  });

  it('historise le contrôle manuel des sources sans remplacer une règle', async () => {
    const owner = regulatorySourceRepository(connection.db, 'owner-test');
    const inspect = async () => ({ sourceUrl: 'https://www.impots.gouv.fr/professionnel/tva', contentHash: 'a'.repeat(64), statusCode: 200, available: true });
    expect((await owner.check('micro-bic-services', inspect)).state).toBe('review');
    expect((await owner.check('micro-bic-services', inspect)).state).toBe('unchanged');
    expect((await owner.check('micro-bic-services', async () => ({ sourceUrl: 'https://www.impots.gouv.fr/professionnel/tva', contentHash: 'b'.repeat(64), statusCode: 200, available: true }))).state).toBe('changed');
    const latest = owner.dashboard().find((source) => source.sourceKey === 'micro-bic-services')?.latest;
    expect(latest).toMatchObject({ state: 'changed' });
    expect(() => connection.sqlite.prepare('delete from finance_regulatory_source_checks where id = ?').run(latest!.id)).toThrow();
  });

  it('initialise une base vide avec WAL et clés étrangères', () => {
    expect(connection.sqlite.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(connection.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(accountsRepository(connection.db, 'owner-test').listEntities()).toEqual([]);
    expect(accountsRepository(connection.db, 'owner-test').listAccounts()).toEqual([]);
  });

  it('préserve les données après redémarrage et réapplication des migrations', () => {
    const repository = accountsRepository(connection.db, 'owner-test');
    const entity = repository.createEntity({ name: 'Entité de test', type: 'personal' });
    const account = repository.createAccount({ entityId: entity.id, name: 'Compte de test', type: 'checking', openingBalanceCents: -12345, openingDate: '2026-09-01' });
    connection.close();
    connection = openDatabase({ path: join(directory, 'test.sqlite'), environment: 'test' });
    migrateDatabase(connection.db);
    expect(accountsRepository(connection.db, 'owner-test').listAccounts()).toEqual([account]);
    expect(connection.sqlite.pragma('quick_check', { simple: true })).toBe('ok');
  });

  it('sauvegarde une base WAL et la restaure dans un nouveau fichier distinct', async () => {
    const repository = accountsRepository(connection.db, 'owner-test');
    const entity = repository.createEntity({ name: 'Entité de sauvegarde', type: 'personal' });
    const account = repository.createAccount({ entityId: entity.id, name: 'Compte de sauvegarde', type: 'checking', openingBalanceCents: 12345, openingDate: '2026-09-11' });
    const snapshot = join(directory, 'backup.sqlite');
    const restored = join(directory, 'restored.sqlite');

    await createBackup(connection.sqlite, join(directory, 'test.sqlite'), snapshot);
    await restoreBackup(snapshot, restored);

    expect(statSync(snapshot).mode & 0o777).toBe(0o600);
    expect(statSync(restored).mode & 0o777).toBe(0o600);

    const restoredConnection = openDatabase({ path: restored, environment: 'test' });
    try {
      expect(accountsRepository(restoredConnection.db, 'owner-test').listAccounts()).toEqual([account]);
      expect(restoredConnection.sqlite.pragma('quick_check', { simple: true })).toBe('ok');
    } finally {
      restoredConnection.close();
    }
    await expect(restoreBackup(snapshot, restored)).rejects.toThrow('nouveau fichier distinct');
    expect(() => privateSqlitePath('public/snapshot.sqlite', directory)).toThrow('fichiers publics');
  });

  it('fait évoluer un actif existant vers une position manuelle sans perte', () => {
    const legacyDirectory = mkdtempSync(join(tmpdir(), 'portfolio-wealth-legacy-test-'));
    const legacyMigrations = join(legacyDirectory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    for (const filename of readdirSync('drizzle').filter((name) => /^000[0-8]_.*\.sql$/.test(name))) copyFileSync(join('drizzle', filename), join(legacyMigrations, filename));
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 8);
    writeFileSync(join(legacyMigrations, 'meta', '_journal.json'), JSON.stringify(journal));
    const legacy = openDatabase({ path: join(legacyDirectory, 'legacy.sqlite'), environment: 'test' });
    try {
      migrateDatabase(legacy.db, legacyMigrations);
      const entity = accountsRepository(legacy.db, 'owner-legacy').createEntity({ name: 'Entité ancienne', type: 'personal' });
      legacy.sqlite.prepare("insert into finance_wealth_assets (id, owner_id, entity_id, name, asset_class, quantity_description, contributed_cents, created_at, updated_at) values ('asset-legacy', 'owner-legacy', ?, 'Actif ancien', 'securities', '10 titres', 1234, '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')").run(entity.id);
      migrateDatabase(legacy.db);
      expect(legacy.sqlite.prepare("select source, observed_btc_sats as observedBtcSats, contributed_cents as contributedCents from finance_wealth_assets where id = 'asset-legacy'").get()).toEqual({ source: 'manual', observedBtcSats: null, contributedCents: 1234 });
      expect(legacy.sqlite.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      legacy.close();
      rmSync(legacyDirectory, { recursive: true, force: true });
    }
  });

  it('ajoute les métriques SaaS sans effacer une observation business existante', () => {
    const legacyDirectory = mkdtempSync(join(tmpdir(), 'portfolio-business-legacy-test-'));
    const legacyMigrations = join(legacyDirectory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    for (const filename of readdirSync('drizzle').filter((name) => /^00(?:0[0-9]|10)_.*\.sql$/.test(name))) copyFileSync(join('drizzle', filename), join(legacyMigrations, filename));
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 10);
    writeFileSync(join(legacyMigrations, 'meta', '_journal.json'), JSON.stringify(journal));
    const legacy = openDatabase({ path: join(legacyDirectory, 'legacy.sqlite'), environment: 'test' });
    try {
      migrateDatabase(legacy.db, legacyMigrations);
      const entity = accountsRepository(legacy.db, 'owner-legacy').createEntity({ name: 'Société ancienne', type: 'business' });
      legacy.sqlite.prepare("insert into finance_business_activities (id, owner_id, entity_id, name, is_active, created_at, updated_at) values ('activity-legacy', 'owner-legacy', ?, 'Produit ancien', 1, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z')").run(entity.id);
      legacy.sqlite.prepare("insert into finance_business_monthly_metrics (id, owner_id, activity_id, period, revenue_cents, operating_expense_cents, created_at, updated_at) values ('metric-legacy', 'owner-legacy', 'activity-legacy', '2026-09', 12000, 4000, '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z')").run();
      migrateDatabase(legacy.db);
      expect(legacy.sqlite.prepare("select revenue_cents as revenueCents, operating_expense_cents as operatingExpenseCents, mrr_cents as mrrCents, active_customer_count as activeCustomerCount, maintenance_minutes as maintenanceMinutes from finance_business_monthly_metrics where id = 'metric-legacy'").get()).toEqual({ revenueCents: 12_000, operatingExpenseCents: 4_000, mrrCents: null, activeCustomerCount: null, maintenanceMinutes: null });
      expect(businessRepository(legacy.db, 'owner-legacy').dashboard('2026-09')).toMatchObject({ mrrActivityCount: 0, activities: [expect.objectContaining({ metric: expect.objectContaining({ id: 'metric-legacy', revenueCents: 12_000, mrrCents: null }) })] });
    } finally {
      legacy.close();
      rmSync(legacyDirectory, { recursive: true, force: true });
    }
  });

  it('convertit une règle existante en première révision immuable', () => {
    const legacyDirectory = mkdtempSync(join(tmpdir(), 'portfolio-regulatory-legacy-test-'));
    const legacyMigrations = join(legacyDirectory, 'migrations');
    mkdirSync(join(legacyMigrations, 'meta'), { recursive: true });
    for (const filename of readdirSync('drizzle').filter((name) => /^00(?:0[0-9]|1[0-5])_.*\.sql$/.test(name))) copyFileSync(join('drizzle', filename), join(legacyMigrations, filename));
    const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8')) as { entries: { idx: number }[] };
    journal.entries = journal.entries.filter((entry) => entry.idx <= 15);
    writeFileSync(join(legacyMigrations, 'meta', '_journal.json'), JSON.stringify(journal));
    const legacy = openDatabase({ path: join(legacyDirectory, 'legacy.sqlite'), environment: 'test' });
    try {
      migrateDatabase(legacy.db, legacyMigrations);
      legacy.sqlite.prepare("insert into finance_regulatory_rules (id, owner_id, name, value, source, verified_on, valid_from, valid_to, note, created_at, updated_at) values ('rule-legacy', 'owner-legacy', 'Règle ancienne', '10 %', 'Source synthétique', '2026-09-11', '2026-01-01', null, '', '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z')").run();
      migrateDatabase(legacy.db);
      expect(legacy.sqlite.prepare("select id, series_id as seriesId, revision, value from finance_regulatory_rules where id = 'rule-legacy'").get()).toEqual({ id: 'rule-legacy', seriesId: 'rule-legacy', revision: 1, value: '10 %' });
      expect(() => legacy.sqlite.prepare("update finance_regulatory_rules set value = '11 %' where id = 'rule-legacy'").run()).toThrow('immutable');
    } finally {
      legacy.close();
      rmSync(legacyDirectory, { recursive: true, force: true });
    }
  });

  it('filtre les lectures et refuse un rattachement à une autre identité', () => {
    const repository = accountsRepository(connection.db, 'owner-test');
    const other = accountsRepository(connection.db, 'other-test');
    const entity = other.createEntity({ name: 'Autre entité de test', type: 'personal' });
    other.createAccount({ entityId: entity.id, name: 'Autre compte', type: 'cash', openingBalanceCents: 0, openingDate: '2026-09-01' });
    expect(repository.listEntities()).toEqual([]);
    expect(repository.listAccounts()).toEqual([]);
    expect(() => repository.createAccount({ entityId: entity.id, name: 'Interdit', type: 'cash', openingBalanceCents: 0, openingDate: '2026-09-01' })).toThrow('Entité introuvable');
  });

  it('refuse les écritures invalides même si la validation applicative est contournée', () => {
    const entity = accountsRepository(connection.db, 'owner-test').createEntity({ name: 'Entité de test', type: 'personal' });
    const insert = connection.sqlite.prepare("insert into finance_accounts (id, entity_id, name, type, opening_balance_cents, opening_date, created_at) values (?, ?, 'Test', 'checking', ?, ?, '2026-09-09T00:00:00.000Z')");
    expect(() => insert.run('missing-fk', 'missing', 100, '2026-09-01')).toThrow();
    expect(() => insert.run('decimal', entity.id, 1.5, '2026-09-01')).toThrow();
    expect(() => insert.run('unsafe', entity.id, 9007199254740992, '2026-09-01')).toThrow();
    expect(() => insert.run('bad-date', entity.id, 100, '2026-02-30')).toThrow();
    expect(accountsRepository(connection.db, 'owner-test').listAccounts()).toEqual([]);
  });

  it('annule toutes les écritures si une opération atomique échoue', () => {
    expect(() => connection.sqlite.transaction(() => {
      accountsRepository(connection.db, 'owner-test').createEntity({ name: 'À annuler', type: 'personal' });
      throw new Error('Échec simulé');
    })()).toThrow('Échec simulé');
    expect(accountsRepository(connection.db, 'owner-test').listEntities()).toEqual([]);
  });

  it('refuse de placer la base dans des fichiers publics, même via un lien symbolique', () => {
    mkdirSync(join(directory, 'public'));
    symlinkSync(join(directory, 'public'), join(directory, 'linked-public'));
    for (const path of ['public/private.sqlite', 'build/client/private.sqlite', 'linked-public/private.sqlite']) {
      expect(() => databasePath({ path, environment: 'test', projectRoot: directory })).toThrow('fichiers publics');
    }
    expect(() => databasePath({ path: '', environment: 'production', projectRoot: directory })).toThrow('explicitement');
    expect(() => databasePath({ path: '', environment: 'test', projectRoot: directory })).toThrow('explicitement');
    expect(() => databasePath({ path: 'budget.json', environment: 'test', projectRoot: directory })).toThrow('extension');
  });

  it('conserve un journal catégorisé, des transferts atomiques et un dashboard explicable', () => {
    const accounts = accountsRepository(connection.db, 'owner-test');
    const entity = accounts.createEntity({ name: 'Entité de test', type: 'personal' });
    const checking = accounts.createAccount({ entityId: entity.id, name: 'Compte courant test', type: 'checking', openingBalanceCents: 10_000, openingDate: '2026-09-01' });
    const savings = accounts.createAccount({ entityId: entity.id, name: 'Épargne test', type: 'savings', openingBalanceCents: 2_000, openingDate: '2026-09-01' });
    const budget = budgetRepository(connection.db, 'owner-test');
    const income = budget.createCategory({ name: 'Revenu test', kind: 'income' });
    const expense = budget.createCategory({ name: 'Dépense test', kind: 'expense' });
    budget.createTransaction({ accountId: checking.id, categoryId: income.id, kind: 'income', amountCents: 5_000, occurredOn: '2026-09-02', note: '' });
    const payment = budget.createTransaction({ accountId: checking.id, categoryId: expense.id, kind: 'expense', amountCents: 1_200, occurredOn: '2026-09-03', note: 'Paiement synthétique' });
    budget.createTransfer({ fromAccountId: checking.id, toAccountId: savings.id, amountCents: 2_000, occurredOn: '2026-09-04', note: '' });
    const configured = budget.setBudget({ categoryId: expense.id, period: '2026-09', plannedAmountCents: 2_000 });

    const dashboard = budget.dashboard('2026-09');
    expect(dashboard).toMatchObject({ period: '2026-09', incomeCents: 5_000, expenseCents: 1_200, surplusCents: 3_800, transactionCount: 4 });
    expect(dashboard.accounts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: checking.id, balanceCents: 11_800 }),
      expect.objectContaining({ id: savings.id, balanceCents: 4_000 }),
    ]));
    expect(dashboard.budgets).toEqual([expect.objectContaining({ category: expect.objectContaining({ id: expense.id }), budget: configured, actualCents: 1_200 })]);

    budget.updateTransaction({ id: payment.id, accountId: checking.id, categoryId: expense.id, kind: 'expense', amountCents: 1_500, occurredOn: '2026-09-05', note: 'Correction synthétique' });
    expect(budget.dashboard('2026-09')).toMatchObject({ expenseCents: 1_500, surplusCents: 3_500 });
    const transfer = budget.listTransactions('2026-09').find(({ transaction }) => transaction.kind === 'transfer');
    if (!transfer) throw new Error('Transfert de test absent.');
    budget.deleteTransaction(transfer.transaction.id);
    expect(budget.listTransactions('2026-09').filter(({ transaction }) => transaction.kind === 'transfer')).toEqual([]);
  });

  it('refuse les relations financières manipulées et les écritures incomplètes au niveau SQL', () => {
    const accounts = accountsRepository(connection.db, 'owner-test');
    const entity = accounts.createEntity({ name: 'Entité de test', type: 'personal' });
    const account = accounts.createAccount({ entityId: entity.id, name: 'Compte test', type: 'cash', openingBalanceCents: 0, openingDate: '2026-09-01' });
    const owner = budgetRepository(connection.db, 'owner-test');
    const other = budgetRepository(connection.db, 'other-test');
    const category = owner.createCategory({ name: 'Dépense test', kind: 'expense' });
    expect(() => other.createTransaction({ accountId: account.id, categoryId: category.id, kind: 'expense', amountCents: 100, occurredOn: '2026-09-01', note: '' })).toThrow('Catégorie introuvable');
    expect(() => owner.createTransfer({ fromAccountId: account.id, toAccountId: account.id, amountCents: 100, occurredOn: '2026-09-01', note: '' })).toThrow('différents');
    const insert = connection.sqlite.prepare("insert into finance_transactions (id, owner_id, account_id, kind, amount_cents, occurred_on, note, created_at, updated_at) values ('invalid', 'owner-test', ?, 'income', -1, '2026-09-01', '', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => insert.run(account.id)).toThrow();
  });

  it('calcule la réserve depuis les comptes sélectionnés et distingue engagement prévu et paiement relié', () => {
    const ownerAccounts = accountsRepository(connection.db, 'owner-test');
    const ownerEntity = ownerAccounts.createEntity({ name: 'Entité de test', type: 'personal' });
    const checking = ownerAccounts.createAccount({ entityId: ownerEntity.id, name: 'Compte courant test', type: 'checking', openingBalanceCents: 10_000, openingDate: '2026-08-01' });
    const savings = ownerAccounts.createAccount({ entityId: ownerEntity.id, name: 'Épargne test', type: 'savings', openingBalanceCents: 20_000, openingDate: '2026-09-01' });
    const otherAccounts = accountsRepository(connection.db, 'other-test');
    const otherEntity = otherAccounts.createEntity({ name: 'Autre entité de test', type: 'personal' });
    const otherAccount = otherAccounts.createAccount({ entityId: otherEntity.id, name: 'Autre compte test', type: 'cash', openingBalanceCents: 0, openingDate: '2026-09-01' });
    const budget = budgetRepository(connection.db, 'owner-test');
    const expense = budget.createCategory({ name: 'Engagement synthétique', kind: 'expense' });
    const otherExpense = budgetRepository(connection.db, 'other-test').createCategory({ name: 'Autre dépense synthétique', kind: 'expense' });
    const planning = planningRepository(connection.db, 'owner-test');

    planning.setSafetyReserve({ targetAmountCents: 50_000, accountIds: [checking.id, savings.id] });
    expect(() => planning.setSafetyReserve({ targetAmountCents: 50_000, accountIds: [otherAccount.id] })).toThrow('Compte introuvable');
    const commitment = planning.createCommitment({ name: 'Engagement synthétique', categoryId: expense.id, plannedAmountCents: 12_000, dueDay: 5, startPeriod: '2026-09', endPeriod: null });
    expect(() => planning.createCommitment({ name: 'Interdit', categoryId: otherExpense.id, plannedAmountCents: 100, dueDay: 1, startPeriod: '2026-09', endPeriod: null })).toThrow('Catégorie de dépense introuvable');
    budget.createTransaction({ accountId: checking.id, categoryId: expense.id, kind: 'expense', amountCents: 11_000, occurredOn: '2026-09-05', note: '', recurringCommitmentId: commitment.id });
    expect(() => budget.createTransaction({ accountId: checking.id, categoryId: expense.id, kind: 'expense', amountCents: 100, occurredOn: '2026-08-31', note: '', recurringCommitmentId: commitment.id })).toThrow('Engagement introuvable');

    const dashboard = budget.dashboard('2026-09');
    const planningDashboard = planning.dashboard('2026-09', dashboard.accounts, budget.listTransactions('2026-09'));
    expect(planningDashboard.reserve).toMatchObject({ targetAmountCents: 50_000, currentAmountCents: 19_000 });
    expect(planningDashboard.commitments).toEqual([expect.objectContaining({ commitment: expect.objectContaining({ id: commitment.id }), actualCents: 11_000 })]);
    expect(() => planning.deleteCommitment(commitment.id)).toThrow();

    const rawCommitment = connection.sqlite.prepare("insert into finance_recurring_commitments (id, owner_id, name, category_id, planned_amount_cents, due_day, start_period, created_at, updated_at) values ('cross-owner', 'owner-test', 'Interdit', ?, 100, 1, '2026-09', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawCommitment.run(otherExpense.id)).toThrow();
  });

  it('isole les scénarios GoMining, lie seulement une catégorie de dépense du propriétaire et conserve le choix de réinvestissement', () => {
    const owner = gominingRepository(connection.db, 'owner-test');
    const other = gominingRepository(connection.db, 'other-test');
    const category = budgetRepository(connection.db, 'owner-test').createCategory({ name: 'GoMining synthétique', kind: 'expense' });
    const foreignCategory = budgetRepository(connection.db, 'other-test').createCategory({ name: 'Autre GoMining synthétique', kind: 'expense' });
    const scenario = owner.createScenario({ name: 'Scénario synthétique', startPeriod: '2026-09', horizonMonths: 24, initialHashrateMilliTh: 1_000, initialAccumulatedSats: 0, efficiencyMilliWattsPerTh: 12_000, monthlyNetRewardSatsPerTh: 0, priceMilliCentsPerMilliTh: 100_000, btcPriceCents: 1_000_000, budgetCategoryId: category.id, accumulatedBtcPolicy: 'keep', phases: [{ startMonth: 1, endMonth: 12, amountCents: 100 }, { startMonth: 13, endMonth: null, amountCents: 200 }] });
    expect(other.listScenarios()).toEqual([]);
    expect(owner.listScenarios()).toEqual([expect.objectContaining({ scenario: expect.objectContaining({ id: scenario.id, revision: 1, budgetCategoryId: category.id, accumulatedBtcPolicy: 'keep' }), phases: expect.arrayContaining([expect.objectContaining({ startMonth: 1 })]), versions: [expect.objectContaining({ revision: 1, snapshot: expect.objectContaining({ accumulatedBtcPolicy: 'keep' }) })] })]);
    expect(() => owner.createScenario({ name: 'Lien interdit', startPeriod: '2026-09', horizonMonths: 24, initialHashrateMilliTh: 1_000, initialAccumulatedSats: 0, efficiencyMilliWattsPerTh: 12_000, monthlyNetRewardSatsPerTh: 0, priceMilliCentsPerMilliTh: 100_000, btcPriceCents: 1_000_000, budgetCategoryId: foreignCategory.id, accumulatedBtcPolicy: 'keep', phases: [{ startMonth: 1, endMonth: null, amountCents: 100 }] })).toThrow('Catégorie de dépense introuvable');
    const rawScenario = connection.sqlite.prepare("insert into finance_gomining_scenarios (id, owner_id, name, start_period, horizon_months, initial_hashrate_milli_th, initial_accumulated_sats, efficiency_milli_watts_per_th, monthly_net_reward_sats_per_th, price_milli_cents_per_milli_th, btc_price_cents, budget_category_id, accumulated_btc_policy, created_at, updated_at) values ('00000000-0000-4000-8000-000000000001', 'owner-test', 'Lien SQL interdit', '2026-09', 12, 1000, 0, 12000, 0, 100000, 1000000, ?, 'keep', '2026-09-10T00:00:00.000Z', '2026-09-10T00:00:00.000Z')");
    expect(() => rawScenario.run(foreignCategory.id)).toThrow('invalid GoMining budget category');
    owner.setAccumulatedBtcPolicy(scenario.id, 'reinvest-at-threshold');
    expect(owner.listScenarios()[0]?.scenario.accumulatedBtcPolicy).toBe('reinvest-at-threshold');
    owner.updateScenario({ id: scenario.id, name: 'Scénario corrigé', startPeriod: '2026-10', horizonMonths: 36, initialHashrateMilliTh: 2_000, initialAccumulatedSats: 10, efficiencyMilliWattsPerTh: 11_000, monthlyNetRewardSatsPerTh: 1, priceMilliCentsPerMilliTh: 50_000, btcPriceCents: 2_000_000, budgetCategoryId: null, accumulatedBtcPolicy: 'keep', phases: [{ startMonth: 1, endMonth: 12, amountCents: 300 }, { startMonth: 13, endMonth: 36, amountCents: 400 }, { startMonth: 37, endMonth: null, amountCents: 500 }] });
    const saved = owner.listScenarios()[0];
    expect(saved).toEqual(expect.objectContaining({ scenario: expect.objectContaining({ name: 'Scénario corrigé', revision: 3, accumulatedBtcPolicy: 'keep', startPeriod: '2026-10' }), phases: expect.arrayContaining([expect.objectContaining({ startMonth: 37, amountCents: 500 })]), versions: [expect.objectContaining({ revision: 3, snapshot: expect.objectContaining({ name: 'Scénario corrigé' }) }), expect.objectContaining({ revision: 2, snapshot: expect.objectContaining({ accumulatedBtcPolicy: 'reinvest-at-threshold' }) }), expect.objectContaining({ revision: 1, snapshot: expect.objectContaining({ name: 'Scénario synthétique' }) })] }));
    if (!saved) throw new Error('Historique de test absent.');
    const firstVersion = saved.versions.find((version) => version.revision === 1);
    if (!firstVersion) throw new Error('Première version de test absente.');
    expect(() => other.restoreVersion({ scenarioId: scenario.id, versionId: firstVersion.id })).toThrow('Scénario introuvable');
    owner.restoreVersion({ scenarioId: scenario.id, versionId: firstVersion.id });
    const restored = owner.listScenarios()[0];
    expect(restored).toEqual(expect.objectContaining({ scenario: expect.objectContaining({ name: 'Scénario synthétique', revision: 4, accumulatedBtcPolicy: 'keep', startPeriod: '2026-09' }), versions: expect.arrayContaining([expect.objectContaining({ revision: 4, snapshot: expect.objectContaining({ name: 'Scénario synthétique', startPeriod: '2026-09' }) })]) }));
    if (!restored) throw new Error('Restauration de test absente.');
    connection.sqlite.prepare("insert into finance_gomining_scenario_versions (id, scenario_id, revision, snapshot, created_at) values ('00000000-0000-4000-8000-000000000099', ?, 99, '{\"phases\":[]}', '2026-09-10T00:00:00.000Z')").run(scenario.id);
    const readable = owner.listScenarios()[0];
    expect(readable).toMatchObject({ historyIncomplete: true, phases: expect.arrayContaining([expect.objectContaining({ startMonth: 1 })]) });
    expect(readable?.versions.some((version) => version.revision === 99)).toBe(false);
    const rawVersionUpdate = connection.sqlite.prepare("update finance_gomining_scenario_versions set snapshot = '{}' where id = ?");
    expect(() => rawVersionUpdate.run(restored.versions[0]!.id)).toThrow('GoMining version is immutable');
    expect(() => owner.deleteScenario(scenario.id)).toThrow('GoMining version is immutable');
    expect(() => other.deleteScenario(scenario.id)).toThrow('Scénario introuvable');
  });

  it('conserve un bilan patrimonial daté sans doubler les comptes et isole ses relations', () => {
    const ownerAccounts = accountsRepository(connection.db, 'owner-test');
    const ownerEntity = ownerAccounts.createEntity({ name: 'Entité patrimoine test', type: 'personal' });
    ownerAccounts.createAccount({ entityId: ownerEntity.id, name: 'Liquidités test', type: 'savings', openingBalanceCents: 12_000, openingDate: '2026-09-01' });
    const otherEntity = accountsRepository(connection.db, 'other-test').createEntity({ name: 'Entité étrangère', type: 'personal' });
    const owner = wealthRepository(connection.db, 'owner-test');
    const other = wealthRepository(connection.db, 'other-test');
    const { asset } = owner.createAsset({ entityId: ownerEntity.id, name: 'Placement synthétique', assetClass: 'securities', quantityDescription: '12 titres', contributedCents: 10_000, valuedOn: '2026-09-15', valueCents: 12_500, note: '' });
    owner.addValuation({ assetId: asset.id, valuedOn: '2026-10-01', valueCents: 13_000, note: 'Valeur synthétique' });
    const { debt } = owner.createDebt({ entityId: ownerEntity.id, name: 'Dette synthétique', asOfDate: '2026-09-30', outstandingCents: 50_000, monthlyPaymentCents: 1_000, annualRateBasisPoints: 400, remainingMonths: 60 });
    owner.addDebtBalance({ debtId: debt.id, asOfDate: '2026-10-31', outstandingCents: 49_500, monthlyPaymentCents: 1_000, annualRateBasisPoints: 400, remainingMonths: 59 });

    expect(owner.dashboard('2026-09-30')).toMatchObject({ manualAssetCents: 12_500, debtCents: 50_000, assets: [expect.objectContaining({ valuation: expect.objectContaining({ valuedOn: '2026-09-15' }) })], debts: [expect.objectContaining({ balance: expect.objectContaining({ asOfDate: '2026-09-30' }) })] });
    expect(owner.dashboard('2026-10-31')).toMatchObject({ manualAssetCents: 13_000, debtCents: 49_500 });
    expect(other.dashboard('2026-10-31')).toMatchObject({ assets: [], debts: [], manualAssetCents: 0, debtCents: 0 });
    const observedBtc = owner.createAsset({ entityId: ownerEntity.id, name: 'BTC GoMining observés', assetClass: 'crypto', source: 'gomining-observed-btc', observedBtcSats: 123_456, quantityDescription: '', contributedCents: 0, valuedOn: '2026-10-31', valueCents: 700, note: '' });
    expect(owner.dashboard('2026-10-31')).toMatchObject({ manualAssetCents: 13_700, assets: expect.arrayContaining([expect.objectContaining({ asset: expect.objectContaining({ id: observedBtc.asset.id, source: 'gomining-observed-btc', observedBtcSats: 123_456 }) })]) });
    expect(() => owner.createAsset({ entityId: ownerEntity.id, name: 'BTC GoMining en double', assetClass: 'crypto', source: 'gomining-observed-btc', observedBtcSats: 1, quantityDescription: '', contributedCents: 0, valuedOn: '2026-10-30', valueCents: 1, note: '' })).toThrow();
    expect(() => owner.createAsset({ entityId: otherEntity.id, name: 'Actif interdit', assetClass: 'other', quantityDescription: '', contributedCents: 0, valuedOn: '2026-09-01', valueCents: 0, note: '' })).toThrow('Entité introuvable');
    expect(() => other.addValuation({ assetId: asset.id, valuedOn: '2026-10-02', valueCents: 1, note: '' })).toThrow('Actif introuvable');
    expect(() => other.addDebtBalance({ debtId: debt.id, asOfDate: '2026-10-02', outstandingCents: 1, monthlyPaymentCents: 1, annualRateBasisPoints: 0, remainingMonths: 1 })).toThrow('Dette introuvable');

    const rawAsset = connection.sqlite.prepare("insert into finance_wealth_assets (id, owner_id, entity_id, name, asset_class, quantity_description, contributed_cents, created_at, updated_at) values ('asset-cross-owner', 'owner-test', ?, 'Interdit', 'other', '', 0, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawAsset.run(otherEntity.id)).toThrow('invalid wealth asset entity');
    const rawValuation = connection.sqlite.prepare("insert into finance_wealth_asset_valuations (id, owner_id, asset_id, valued_on, value_cents, note, created_at) values ('valuation-cross-owner', 'other-test', ?, '2026-09-30', 100, '', '2026-09-09T00:00:00.000Z')");
    expect(() => rawValuation.run(asset.id)).toThrow('invalid wealth asset valuation');
    const rawDebtBalance = connection.sqlite.prepare("insert into finance_wealth_debt_balances (id, owner_id, debt_id, as_of_date, outstanding_cents, monthly_payment_cents, annual_rate_basis_points, remaining_months, created_at) values ('debt-cross-owner', 'other-test', ?, '2026-09-30', 100, 10, 0, 1, '2026-09-09T00:00:00.000Z')");
    expect(() => rawDebtBalance.run(debt.id)).toThrow('invalid wealth debt balance');
    const rawObservedBtc = connection.sqlite.prepare("insert into finance_wealth_assets (id, owner_id, entity_id, name, asset_class, source, observed_btc_sats, quantity_description, contributed_cents, created_at, updated_at) values ('invalid-observed-btc', 'other-test', ?, 'BTC invalide', 'other', 'gomining-observed-btc', 1, '', 0, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawObservedBtc.run(otherEntity.id)).toThrow();
  });

  it('isole le cash business du foyer et conserve ses observations mensuelles', () => {
    const accounts = accountsRepository(connection.db, 'owner-test');
    const businessEntity = accounts.createEntity({ name: 'Société de test', type: 'business' });
    const personalEntity = accounts.createEntity({ name: 'Foyer de test', type: 'personal' });
    const otherBusinessEntity = accountsRepository(connection.db, 'other-test').createEntity({ name: 'Société étrangère', type: 'business' });
    const owner = businessRepository(connection.db, 'owner-test');
    const other = businessRepository(connection.db, 'other-test');
    const activity = owner.createActivity({ entityId: businessEntity.id, name: 'Produit synthétique' });
    const septemberMetrics = owner.setMetrics({ activityId: activity.id, period: '2026-09', revenueCents: 12_000, operatingExpenseCents: 4_000, mrrCents: 9_000, activeCustomerCount: 3, maintenanceMinutes: 90 });
    owner.setEntityCash({ entityId: businessEntity.id, period: '2026-09', retainedCashCents: 30_000, distributedCents: 2_000 });
    const provision = owner.createProvision({ entityId: businessEntity.id, period: '2026-09', name: 'Provision synthétique', amountCents: 3_000, note: 'Note synthétique' });
    owner.setMetrics({ activityId: activity.id, period: '2026-10', revenueCents: 15_000, operatingExpenseCents: 5_000 });
    expect(owner.dashboard('2026-09')).toMatchObject({ revenueCents: 12_000, operatingExpenseCents: 4_000, mrrCents: 9_000, annualRecurringRevenueCents: 108_000, mrrActivityCount: 1, activeCustomerCount: 3, activeCustomerActivityCount: 1, maintenanceMinutes: 90, maintenanceActivityCount: 1, retainedCashCents: 30_000, distributedCents: 2_000, provisionCents: 3_000, provisions: [expect.objectContaining({ id: provision.id, entityId: businessEntity.id })], activities: [expect.objectContaining({ activity: expect.objectContaining({ id: activity.id }), metric: expect.objectContaining({ revenueCents: 12_000, mrrCents: 9_000, activeCustomerCount: 3, maintenanceMinutes: 90 }) })] });
    expect(owner.dashboard('2026-10')).toMatchObject({ revenueCents: 15_000, operatingExpenseCents: 5_000, mrrCents: 0, mrrActivityCount: 0, activeCustomerActivityCount: 0, maintenanceActivityCount: 0, retainedCashCents: 30_000, distributedCents: 0 });
    expect(other.dashboard('2026-10')).toMatchObject({ activities: [], cash: [], revenueCents: 0, retainedCashCents: 0 });
    expect(() => owner.createActivity({ entityId: personalEntity.id, name: 'Interdit' })).toThrow('Entité business introuvable');
    expect(() => other.createActivity({ entityId: businessEntity.id, name: 'Interdit' })).toThrow('Entité business introuvable');
    expect(() => other.setMetrics({ activityId: activity.id, period: '2026-09', revenueCents: 1, operatingExpenseCents: 0 })).toThrow('Activité introuvable');
    expect(() => other.setEntityCash({ entityId: businessEntity.id, period: '2026-09', retainedCashCents: 1, distributedCents: 0 })).toThrow('Entité business introuvable');
    const rawActivity = connection.sqlite.prepare("insert into finance_business_activities (id, owner_id, entity_id, name, is_active, created_at, updated_at) values ('business-personal', 'owner-test', ?, 'Interdit', 1, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawActivity.run(personalEntity.id)).toThrow('invalid business activity entity');
    const rawMetric = connection.sqlite.prepare("insert into finance_business_monthly_metrics (id, owner_id, activity_id, period, revenue_cents, operating_expense_cents, created_at, updated_at) values ('business-cross-owner', 'other-test', ?, '2026-09', 1, 0, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawMetric.run(activity.id)).toThrow('invalid business activity metric');
    expect(() => other.createProvision({ entityId: businessEntity.id, period: '2026-09', name: 'Interdit', amountCents: 1, note: '' })).toThrow('Entité business introuvable');
    const rawProvision = connection.sqlite.prepare("insert into finance_business_monthly_provisions (id, owner_id, entity_id, period, name, amount_cents, note, created_at, updated_at) values ('business-provision-personal', 'owner-test', ?, '2026-09', 'Interdit', 1, '', '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawProvision.run(personalEntity.id)).toThrow('invalid business provision entity');
    expect(() => connection.sqlite.prepare('update finance_business_monthly_metrics set mrr_cents = -1 where id = ?').run(septemberMetrics.id)).toThrow();
    expect(() => connection.sqlite.prepare('update finance_business_monthly_metrics set active_customer_count = -1 where id = ?').run(septemberMetrics.id)).toThrow();
    expect(() => connection.sqlite.prepare('update finance_business_monthly_metrics set maintenance_minutes = 44641 where id = ?').run(septemberMetrics.id)).toThrow();
    const rawCash = connection.sqlite.prepare("insert into finance_business_entity_monthly_cash (id, owner_id, entity_id, period, retained_cash_cents, distributed_cents, created_at, updated_at) values ('business-cash-personal', 'owner-test', ?, '2026-09', 1, 0, '2026-09-09T00:00:00.000Z', '2026-09-09T00:00:00.000Z')");
    expect(() => rawCash.run(personalEntity.id)).toThrow('invalid business cash entity');
    expect(otherBusinessEntity.id).toBeTruthy();
  });

  it('montre la concentration et la variation MRR sans inventer les périodes incomplètes', () => {
    const accounts = accountsRepository(connection.db, 'owner-test');
    const entity = accounts.createEntity({ name: 'Société MRR de test', type: 'business' });
    const business = businessRepository(connection.db, 'owner-test');
    const first = business.createActivity({ entityId: entity.id, name: 'Application A' });
    const second = business.createActivity({ entityId: entity.id, name: 'Application B' });
    const record = (activityId: string, period: string, mrrCents: number | null) => business.setMetrics({ activityId, period, revenueCents: 0, operatingExpenseCents: 0, mrrCents });
    for (const [period, firstMrr, secondMrr] of [['2026-07', 10_000, 10_000], ['2026-08', 12_000, 8_000], ['2026-09', 15_000, 5_000], ['2026-10', 20_000, 0]] as const) {
      record(first.id, period, firstMrr);
      record(second.id, period, secondMrr);
    }
    expect(business.dashboard('2026-10')).toMatchObject({
      mrrCents: 20_000, mrrActivityCount: 2, activeActivityCount: 2,
      concentration: [expect.objectContaining({ activity: expect.objectContaining({ id: first.id }), mrrCents: 20_000, shareBasisPoints: 10_000 }), expect.objectContaining({ activity: expect.objectContaining({ id: second.id }), mrrCents: 0, shareBasisPoints: 0 })],
      stability: { fromPeriod: '2026-07', toPeriod: '2026-10', changeCents: 0, changeBasisPoints: 0 },
      mrrHistory: expect.arrayContaining([expect.objectContaining({ period: '2026-07', mrrCents: 20_000, mrrActivityCount: 2, complete: true }), expect.objectContaining({ period: '2026-10', mrrCents: 20_000, mrrActivityCount: 2, complete: true })]),
    });
    record(second.id, '2026-10', null);
    expect(business.dashboard('2026-10')).toMatchObject({
      mrrCents: 20_000, mrrActivityCount: 1, stability: null,
      concentration: [expect.objectContaining({ activity: expect.objectContaining({ id: first.id }), shareBasisPoints: 10_000 })],
      mrrHistory: expect.arrayContaining([expect.objectContaining({ period: '2026-10', mrrCents: 20_000, mrrActivityCount: 1, activeActivityCount: 2, complete: false })]),
    });
  });

  it('isole les objectifs et projets manuels du foyer et des autres identités', () => {
    const owner = goalsRepository(connection.db, 'owner-test');
    const other = goalsRepository(connection.db, 'other-test');
    const goal = owner.createGoal({ name: 'Objectif synthétique', targetCents: 100_000, progressCents: 25_000, targetDate: '2027-01-31', priority: 2 });
    const project = owner.createProject({ goalId: goal.id, name: 'Projet synthétique', status: 'active', priority: 1, estimatedCostCents: 12_000, estimatedEffortMinutes: 180, nextAction: 'Écrire le cadrage' });
    owner.setCapacity({ monthlyCapacityMinutes: 120 });
    expect(owner.dashboard()).toMatchObject({ goals: [expect.objectContaining({ id: goal.id, progressCents: 25_000 })], projects: [expect.objectContaining({ id: project.id, goalId: goal.id, status: 'active' })], capacity: { monthlyCapacityMinutes: 120 }, activeProjectCount: 1, activeProjectLimit: 2, activeProjectLimitStatus: 'within-limit', activeEffortProjectCount: 1, activeEffortMinutes: 180, capacityStatus: 'watch' });
    expect(other.dashboard()).toMatchObject({ goals: [], projects: [], capacity: null, capacityStatus: 'unknown' });
    expect(() => other.updateGoal({ id: goal.id, name: 'Interdit', targetCents: 1, progressCents: 0, targetDate: null, priority: 1 })).toThrow('Objectif introuvable');
    expect(() => other.createProject({ goalId: goal.id, name: 'Interdit', status: 'backlog', priority: 1, estimatedCostCents: null, estimatedEffortMinutes: null, nextAction: '' })).toThrow('Objectif introuvable');
    owner.updateProject({ id: project.id, goalId: null, name: 'Projet corrigé', status: 'done', priority: 3, estimatedCostCents: null, estimatedEffortMinutes: null, nextAction: '' });
    expect(owner.dashboard()).toMatchObject({ projects: [expect.objectContaining({ id: project.id, goalId: null, status: 'done', estimatedCostCents: null })], capacityStatus: 'compatible', activeProjectCount: 0, activeEffortMinutes: 0 });
    const rawProject = connection.sqlite.prepare("insert into finance_projects (id, owner_id, goal_id, name, status, priority, next_action, created_at, updated_at) values ('project-cross-owner', 'other-test', ?, 'Interdit', 'backlog', 1, '', '2026-09-11T00:00:00.000Z', '2026-09-11T00:00:00.000Z')");
    expect(() => rawProject.run(goal.id)).toThrow('invalid project goal');
    owner.createProject({ goalId: null, name: 'Projet actif 2', status: 'active', priority: 2, estimatedCostCents: null, estimatedEffortMinutes: 10, nextAction: '' });
    owner.createProject({ goalId: null, name: 'Projet actif 3', status: 'active', priority: 3, estimatedCostCents: null, estimatedEffortMinutes: 10, nextAction: '' });
    expect(owner.dashboard()).toMatchObject({ activeProjectCount: 2, activeProjectLimitStatus: 'within-limit' });
    owner.createProject({ goalId: null, name: 'Projet actif 4', status: 'active', priority: 4, estimatedCostCents: null, estimatedEffortMinutes: 10, nextAction: '' });
    expect(owner.dashboard()).toMatchObject({ activeProjectCount: 3, activeProjectLimit: 2, activeProjectLimitStatus: 'watch' });
  });

  it('conserve les évaluations CFO par propriétaire sans modifier leurs instantanés', () => {
    const owner = cfoRepository(connection.db, 'owner-test');
    const other = cfoRepository(connection.db, 'other-test');
    const evaluation = owner.evaluate({ period: '2026-09', liquidCashCents: 30_000, reserveTargetCents: 10_000, reserveCurrentCents: 10_000, unpaidCommitmentCents: 0, debtPaymentCents: 0, businessProvisionCents: 0, gominingContributionCents: 0, speculativeAssetCents: 0, grossAssetCents: 30_000, businessCashComplete: true, activeProjectCount: 0, projectCapacityStatus: 'compatible' });
    expect(owner.list()).toEqual([expect.objectContaining({ id: evaluation.id, result: expect.objectContaining({ priority: 'allocation', allocableCashCents: 30_000 }) })]);
    const configured = owner.setWeights({ placements: 5_000, business: 2_000, material: 1_000, projects: 1_000, opportunities: 1_000 });
    expect(owner.currentRules()).toMatchObject({ revision: configured.revision, version: 'cfo-v2', weights: { placements: 5_000, business: 2_000 } });
    const configuredEvaluation = owner.evaluate({ period: '2026-10', liquidCashCents: 30_000, reserveTargetCents: 10_000, reserveCurrentCents: 10_000, unpaidCommitmentCents: 0, debtPaymentCents: 0, businessProvisionCents: 0, gominingContributionCents: 0, speculativeAssetCents: 0, grossAssetCents: 30_000, businessCashComplete: true, activeProjectCount: 0, projectCapacityStatus: 'compatible' }, owner.currentRules());
    expect(owner.get(configuredEvaluation.id)).toMatchObject({ ruleVersion: 'cfo-v2', result: { allocation: expect.arrayContaining([expect.objectContaining({ bucket: 'placements', amountCents: 15_000 })]) } });
    expect(other.list()).toEqual([]);
    expect(() => other.get(evaluation.id)).toThrow('Évaluation introuvable');
    const accepted = owner.decide({ evaluationId: evaluation.id, outcome: 'accepted', note: 'Plan synthétique' });
    const modified = owner.decide({ evaluationId: evaluation.id, outcome: 'modified', note: 'Plan adapté', allocation: [{ bucket: 'placements', amountCents: 12_000 }, { bucket: 'business', amountCents: 6_000 }, { bucket: 'material', amountCents: 4_000 }, { bucket: 'projects', amountCents: 3_000 }, { bucket: 'opportunities', amountCents: 5_000 }] });
    const ignored = owner.decide({ evaluationId: evaluation.id, outcome: 'ignored', note: '' });
    const comparison = owner.compare({ evaluationId: evaluation.id, name: 'Plus de placements', allocation: [{ bucket: 'placements', amountCents: 15_000 }, { bucket: 'business', amountCents: 5_000 }, { bucket: 'material', amountCents: 3_000 }, { bucket: 'projects', amountCents: 2_000 }, { bucket: 'opportunities', amountCents: 5_000 }] });
    const stored = owner.list().find((item) => item.id === evaluation.id);
    expect(stored?.decisions).toEqual(expect.arrayContaining([expect.objectContaining({ id: accepted.id, outcome: 'accepted', plan: expect.objectContaining({ evaluationId: evaluation.id }) }), expect.objectContaining({ id: modified.id, outcome: 'modified' }), expect.objectContaining({ id: ignored.id, outcome: 'ignored', plan: null })]));
    expect(stored?.decisions.find((item) => item.id === modified.id)?.plan).toMatchObject({ allocation: expect.arrayContaining([expect.objectContaining({ bucket: 'placements', amountCents: 12_000 })]) });
    expect(stored?.comparisons).toEqual([expect.objectContaining({ id: comparison.id, name: 'Plus de placements', allocation: expect.arrayContaining([expect.objectContaining({ bucket: 'placements', amountCents: 15_000 })]) })]);
    expect(() => owner.decide({ evaluationId: evaluation.id, outcome: 'modified', note: '', allocation: [{ bucket: 'placements', amountCents: 1 }, { bucket: 'business', amountCents: 0 }, { bucket: 'material', amountCents: 0 }, { bucket: 'projects', amountCents: 0 }, { bucket: 'opportunities', amountCents: 0 }] })).toThrow('répartir exactement');
    expect(() => owner.compare({ evaluationId: evaluation.id, name: 'Même proposition', allocation: [{ bucket: 'placements', amountCents: 10_500 }, { bucket: 'business', amountCents: 7_500 }, { bucket: 'material', amountCents: 4_500 }, { bucket: 'projects', amountCents: 3_000 }, { bucket: 'opportunities', amountCents: 4_500 }] })).toThrow('doit différer');
    expect(() => owner.compare({ evaluationId: evaluation.id, name: 'Total invalide', allocation: [{ bucket: 'placements', amountCents: 1 }, { bucket: 'business', amountCents: 0 }, { bucket: 'material', amountCents: 0 }, { bucket: 'projects', amountCents: 0 }, { bucket: 'opportunities', amountCents: 0 }] })).toThrow('répartir exactement');
    expect(() => other.decide({ evaluationId: evaluation.id, outcome: 'ignored', note: '' })).toThrow('Évaluation introuvable');
    expect(() => other.compare({ evaluationId: evaluation.id, name: 'Interdit', allocation: [{ bucket: 'placements', amountCents: 15_000 }, { bucket: 'business', amountCents: 5_000 }, { bucket: 'material', amountCents: 3_000 }, { bucket: 'projects', amountCents: 2_000 }, { bucket: 'opportunities', amountCents: 5_000 }] })).toThrow('Évaluation introuvable');
    expect(() => connection.sqlite.prepare('update finance_cfo_evaluations set result = ? where id = ?').run('{}', evaluation.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_cfo_evaluations where id = ?').run(evaluation.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare("insert into finance_cfo_decisions (id, owner_id, evaluation_id, outcome, note, created_at) values ('cfo-cross-owner', 'other-test', ?, 'ignored', '', '2026-09-12T00:00:00.000Z')").run(evaluation.id)).toThrow('Invalid CFO decision evaluation');
    expect(() => connection.sqlite.prepare('update finance_cfo_decisions set note = ? where id = ?').run('interdit', accepted.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_cfo_decisions where id = ?').run(accepted.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare("insert into finance_cfo_comparisons (id, owner_id, evaluation_id, name, allocation, created_at) values ('cfo-comparison-cross-owner', 'other-test', ?, 'Interdit', '[]', '2026-09-12T00:00:00.000Z')").run(evaluation.id)).toThrow('Invalid CFO comparison evaluation');
    expect(() => connection.sqlite.prepare('update finance_cfo_comparisons set name = ? where id = ?').run('interdit', comparison.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_cfo_comparisons where id = ?').run(comparison.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('update finance_cfo_rule_sets set placements_basis_points = 1 where id = ?').run(configured.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_cfo_rule_sets where id = ?').run(configured.id)).toThrow('immutable');
  });

  it('versionne les hypothèses et les exécutions L15 par propriétaire', () => {
    const owner = simulationRepository(connection.db, 'owner-test');
    const other = simulationRepository(connection.db, 'other-test');
    const values = { months: 12, profile: { annualPlacementReturnBasisPoints: 600, businessMonthlyGrowthBasisPoints: 200, householdExpenseAnnualInflationBasisPoints: 200 }, openingHouseholdCashCents: 10_000, frozenObservedAssetCents: 20_000, monthlyHouseholdIncomeCents: 10_000, monthlyHouseholdExpenseCents: 4_000, weights: { placements: 5_000, business: 0, material: 0, projects: 0, opportunities: 0, debt: 5_000 }, businesses: [], debts: [{ id: 'debt-test', outstandingCents: 10_000, monthlyPaymentCents: 1_000, annualRateBasisPoints: 500 }], goals: [] };
    const first = owner.saveAssumptions(values);
    const second = owner.saveAssumptions({ ...values, monthlyHouseholdIncomeCents: 11_000 });
    expect(owner.current()).toMatchObject({ id: second.id, revision: 2, snapshot: { monthlyHouseholdIncomeCents: 11_000 } });
    expect(other.current()).toBeNull();
    const run = owner.run(second.id);
    expect(owner.list()).toEqual([expect.objectContaining({ id: run.id, assumptionId: second.id, input: expect.objectContaining({ monthlyHouseholdIncomeCents: 11_000 }), result: expect.objectContaining({ months: expect.any(Array) }) })]);
    expect(() => other.run(second.id)).toThrow('Hypothèse de simulation introuvable');
    expect(() => connection.sqlite.prepare('update finance_simulation_assumptions set snapshot = ? where id = ?').run('{}', first.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_simulation_assumptions where id = ?').run(first.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare("insert into finance_simulation_runs (id, owner_id, assumption_id, input, result, created_at) values ('simulation-cross-owner', 'other-test', ?, '{}', '{}', '2026-09-13T00:00:00.000Z')").run(second.id)).toThrow('Invalid simulation assumption');
    expect(() => connection.sqlite.prepare('update finance_simulation_runs set result = ? where id = ?').run('{}', run.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_simulation_runs where id = ?').run(run.id)).toThrow('immutable');
  });

  it('isole les règles réglementaires manuelles et leurs périodes datées', () => {
    const owner = regulatoryRepository(connection.db, 'owner-test');
    const other = regulatoryRepository(connection.db, 'other-test');
    const rule = owner.create({ name: 'Règle synthétique', value: '12,34 %', source: 'Source synthétique', verifiedOn: '2026-09-11', validFrom: '2026-01-01', validTo: '2026-02-28', note: '' });
    expect(owner.list()).toEqual([expect.objectContaining({ id: rule.id, validFrom: '2026-01-01' })]);
    expect(other.list()).toEqual([]);
    owner.create({ name: 'Règle synthétique', value: '15 %', source: 'Source synthétique', verifiedOn: '2026-09-12', validFrom: '2026-04-01', validTo: '2026-06-30', note: '' });
    owner.create({ name: 'Règle synthétique', value: '16 %', source: 'Source synthétique', verifiedOn: '2026-09-12', validFrom: '2026-06-01', validTo: null, note: '' });
    expect(owner.resolve({ name: ' règle synthétique ', asOf: '2026-02-01' })).toMatchObject({ status: 'applicable', rules: [expect.objectContaining({ id: rule.id })] });
    expect(owner.resolve({ name: 'Règle synthétique', asOf: '2026-03-31' })).toMatchObject({ status: 'missing', rules: [] });
    expect(owner.resolve({ name: 'Règle synthétique', asOf: '2026-06-15' })).toMatchObject({ status: 'overlap', rules: expect.arrayContaining([expect.objectContaining({ value: '15 %' }), expect.objectContaining({ value: '16 %' })]) });
    expect(owner.dashboard('2026-03-31')).toMatchObject({ asOf: '2026-03-31', coverage: [expect.objectContaining({ name: 'Règle synthétique', status: 'missing' })] });
    const revised = owner.update({ id: rule.id, name: 'Règle synthétique', value: '12,35 %', source: 'Source synthétique révisée', verifiedOn: '2026-09-12', validFrom: '2026-01-01', validTo: '2026-02-28', note: 'Révision synthétique' });
    expect(revised).toMatchObject({ seriesId: rule.seriesId, revision: 2, value: '12,35 %' });
    expect(revised.id).not.toBe(rule.id);
    expect(owner.list()).toEqual(expect.arrayContaining([expect.objectContaining({ id: revised.id, revision: 2 })]));
    expect(owner.history(revised.id)).toEqual([expect.objectContaining({ id: revised.id, revision: 2 }), expect.objectContaining({ id: rule.id, revision: 1, value: '12,34 %' })]);
    expect(() => connection.sqlite.prepare('update finance_regulatory_rules set value = ? where id = ?').run('modification interdite', rule.id)).toThrow('immutable');
    expect(() => connection.sqlite.prepare('delete from finance_regulatory_rules where id = ?').run(rule.id)).toThrow('immutable');
    expect(() => other.update({ id: rule.id, name: 'Interdit', value: '0', source: 'Source', verifiedOn: '2026-09-11', validFrom: '2026-01-01', validTo: null, note: '' })).toThrow('Règle introuvable');
    expect(() => owner.create({ name: 'Période invalide', value: '0', source: 'Source', verifiedOn: '2026-09-11', validFrom: '2026-02-01', validTo: '2026-01-31', note: '' })).toThrow('Période invalide');
  });
});
