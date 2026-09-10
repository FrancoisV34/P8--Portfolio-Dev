import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { databasePath } from '../../app/.server/db/config';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { budgetRepository } from '../../app/.server/repositories/budget';

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
});
