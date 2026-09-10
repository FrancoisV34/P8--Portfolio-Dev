import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { databasePath } from '../../app/.server/db/config';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { budgetRepository } from '../../app/.server/repositories/budget';
import { planningRepository } from '../../app/.server/repositories/planning';
import { gominingRepository } from '../../app/.server/repositories/gomining';

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
});
