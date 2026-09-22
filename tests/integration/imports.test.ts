import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { budgetRepository } from '../../app/.server/repositories/budget';
import { importsRepository, type CreateImportBatch } from '../../app/.server/repositories/imports';

let directory: string;
let connection: ReturnType<typeof openDatabase>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'portfolio-imports-test-'));
  connection = openDatabase({ path: join(directory, 'test.sqlite'), environment: 'test' });
  migrateDatabase(connection.db);
});
afterEach(() => {
  if (connection?.sqlite.open) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

// Données synthétiques : aucun relevé réel ne figure dans les tests.
function setup(ownerId = 'owner-test') {
  const accounts = accountsRepository(connection.db, ownerId);
  const budget = budgetRepository(connection.db, ownerId);
  const entity = accounts.createEntity({ name: 'Foyer', type: 'personal' });
  const checking = accounts.createAccount({ entityId: entity.id, name: 'Compte courant', type: 'checking', openingBalanceCents: 100_000, openingDate: '2026-01-01' });
  const savings = accounts.createAccount({ entityId: entity.id, name: 'Livret', type: 'savings', openingBalanceCents: 0, openingDate: '2026-01-01' });
  const groceries = budget.createCategory({ name: 'Courses', kind: 'expense' });
  const salary = budget.createCategory({ name: 'Salaire', kind: 'income' });
  return { budget, imports: importsRepository(connection.db, ownerId), checking, savings, groceries, salary };
}

const sha = (character: string) => character.repeat(64);
function statement(accountId: string, overrides: Partial<CreateImportBatch> = {}): CreateImportBatch {
  return {
    accountId, sourceKind: 'csv', sourceName: 'releve-septembre.csv', sourceSha256: sha('a'),
    lines: [
      { rawDate: '03/09/2026', rawLabel: 'CB SUPERMARCHE 02/09', rawAmount: '-42,10', occurredOn: '2026-09-03', label: 'CB SUPERMARCHE 02/09', amountCents: -4_210 },
      { rawDate: '05/09/2026', rawLabel: 'VIR SALAIRE', rawAmount: '2 500,00', occurredOn: '2026-09-05', label: 'VIR SALAIRE', amountCents: 250_000 },
    ],
    ...overrides,
  };
}
const countTransactions = () => (connection.sqlite.prepare('select count(*) as n from finance_transactions').get() as { n: number }).n;

describe('file des relevés importés', () => {
  it('conserve les lignes lues dans l’ordre du relevé, en attente et hors du journal', () => {
    const { imports, checking } = setup();
    expect(imports.createBatch(statement(checking.id)).lineCount).toBe(2);
    const pending = imports.listPending();
    expect(pending.map(({ line }) => [line.position, line.rawAmount, line.amountCents, line.status])).toEqual([[0, '-42,10', -4_210, 'pending'], [1, '2 500,00', 250_000, 'pending']]);
    expect(pending[0]).toMatchObject({ accountName: 'Compte courant', duplicate: null, batch: { sourceName: 'releve-septembre.csv' } });
    expect(imports.countPending()).toBe(2);
    expect(countTransactions()).toBe(0);
  });

  it('crée la transaction corrigée à la validation et garde le texte lu intact', () => {
    const { imports, budget, checking, groceries } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    // Correction d'une mauvaise lecture : 42,10 € lus, 42,70 € réels.
    const transactionId = imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 4_270, occurredOn: '2026-09-02', note: 'Courses' });
    expect(budget.listTransactions('2026-09')).toEqual([expect.objectContaining({ transaction: expect.objectContaining({ id: transactionId, amountCents: -4_270, occurredOn: '2026-09-02', kind: 'expense', accountId: checking.id }) })]);
    const stored = connection.sqlite.prepare('select status, transaction_id, raw_amount, amount_cents from finance_import_lines where id = ?').get(first.line.id);
    expect(stored).toEqual({ status: 'accepted', transaction_id: transactionId, raw_amount: '-42,10', amount_cents: -4_210 });
    expect(imports.countPending()).toBe(1);
  });

  it('refuse une seconde validation de la même ligne sans créer de second mouvement', () => {
    const { imports, checking, groceries } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    const decision = { id: first.line.id, kind: 'expense' as const, categoryId: groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' };
    imports.acceptLine(decision);
    expect(() => imports.acceptLine(decision)).toThrow('Ligne introuvable.');
    expect(() => imports.rejectLine(first.line.id)).toThrow('Ligne introuvable.');
    expect(countTransactions()).toBe(1);
  });

  it('annule toute la validation si la transaction est refusée', () => {
    const { imports, checking, groceries, salary } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    // Une catégorie de revenu pour une dépense : le journal refuse, la ligne reste à valider.
    expect(() => imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: salary.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow('Catégorie introuvable.');
    // Une date corrigée avant l'ouverture du compte est refusée de même.
    expect(() => imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 4_210, occurredOn: '2025-12-31', note: '' })).toThrow('Compte introuvable.');
    expect(countTransactions()).toBe(0);
    expect(imports.countPending()).toBe(2);
  });

  it('valide un transfert en créant les deux jambes et rattache celle du compte relevé', () => {
    const { imports, budget, checking, savings } = setup();
    imports.createBatch(statement(checking.id, { lines: [{ rawDate: '10/09/2026', rawLabel: 'VIR LIVRET', rawAmount: '-300,00', occurredOn: '2026-09-10', label: 'VIR LIVRET', amountCents: -30_000 }] }));
    const [line] = imports.listPending();
    const transactionId = imports.acceptLine({ id: line.line.id, kind: 'transfer', counterpartAccountId: savings.id, direction: 'out', amountCents: 30_000, occurredOn: '2026-09-10', note: 'Épargne' });
    const legs = budget.listTransactions('2026-09').map(({ transaction }) => transaction);
    expect(legs).toHaveLength(2);
    expect(legs.find((leg) => leg.id === transactionId)).toMatchObject({ accountId: checking.id, amountCents: -30_000, kind: 'transfer' });
    expect(legs.find((leg) => leg.id !== transactionId)).toMatchObject({ accountId: savings.id, amountCents: 30_000 });
    // Le relevé du livret, importé ensuite, montre la même opération : elle est signalée.
    imports.createBatch(statement(savings.id, { sourceSha256: sha('b'), lines: [{ rawDate: '10/09/2026', rawLabel: 'VIR RECU', rawAmount: '300,00', occurredOn: '2026-09-10', label: 'VIR RECU', amountCents: 30_000 }] }));
    expect(imports.listPending()[0].duplicate).toBe('journal');
  });

  it('refuse un transfert vers le compte du relevé lui-même', () => {
    const { imports, checking } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    expect(() => imports.acceptLine({ id: first.line.id, kind: 'transfer', counterpartAccountId: checking.id, direction: 'out', amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow();
    expect(countTransactions()).toBe(0);
  });

  it('ignore une ligne sans rien écrire au journal', () => {
    const { imports, checking } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    imports.rejectLine(first.line.id);
    expect(imports.listPending().map(({ line }) => line.position)).toEqual([1]);
    expect(countTransactions()).toBe(0);
  });

  it('refuse de réimporter le même fichier pour le même compte', () => {
    const { imports, checking, savings } = setup();
    imports.createBatch(statement(checking.id));
    expect(() => imports.createBatch(statement(checking.id))).toThrow('Ce relevé a déjà été importé pour ce compte.');
    expect(imports.createBatch(statement(savings.id)).lineCount).toBe(2);
  });

  it('refuse un lot invalide sans en écrire aucune ligne', () => {
    const { imports, checking } = setup();
    const line = statement(checking.id).lines[0];
    expect(() => imports.createBatch(statement(checking.id, { lines: [line, { ...line, amountCents: 0 }] }))).toThrow();
    expect(() => imports.createBatch(statement(checking.id, { lines: [line, { ...line, occurredOn: '2026-02-30' }] }))).toThrow();
    expect(() => imports.createBatch(statement(checking.id, { lines: Array.from({ length: 2001 }, () => line) }))).toThrow();
    expect(() => imports.createBatch(statement(checking.id, { lines: [] }))).toThrow();
    expect(() => imports.createBatch(statement(checking.id, { sourceSha256: 'not-a-hash' }))).toThrow();
    expect(imports.countPending()).toBe(0);
    expect(connection.sqlite.prepare('select count(*) as n from finance_import_batches').get()).toEqual({ n: 0 });
  });

  it('signale sans l’écarter une ligne déjà présente au journal ou dans un autre relevé', () => {
    const { imports, budget, checking, groceries } = setup();
    budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-09-03', note: 'saisie manuelle' });
    imports.createBatch(statement(checking.id));
    expect(imports.listPending().map(({ duplicate }) => duplicate)).toEqual(['journal', null]);
    // Le même relevé, exporté une seconde fois (autre fichier), chevauche le premier.
    imports.createBatch(statement(checking.id, { sourceKind: 'pdf', sourceName: 'releve.pdf', sourceSha256: sha('c') }));
    expect(imports.listPending().map(({ duplicate }) => duplicate)).toEqual(['imported', 'imported', 'imported', 'imported']);
  });

  it('ne prend pas deux opérations identiques du même relevé pour un doublon', () => {
    const { imports, checking, groceries } = setup();
    const coffee = { rawDate: '03/09/2026', rawLabel: 'CB CAFE', rawAmount: '-2,50', occurredOn: '2026-09-03', label: 'CB CAFE', amountCents: -250 };
    imports.createBatch(statement(checking.id, { lines: [coffee, coffee] }));
    const [first] = imports.listPending();
    imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 250, occurredOn: '2026-09-03', note: '' });
    expect(imports.listPending().map(({ duplicate }) => duplicate)).toEqual([null]);
  });

  it('laisse supprimer du journal une transaction importée, sans perdre la trace de la ligne', () => {
    const { imports, budget, checking, groceries } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    const transactionId = imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    budget.deleteTransaction(transactionId);
    expect(connection.sqlite.prepare('select status, transaction_id from finance_import_lines where id = ?').get(first.line.id)).toEqual({ status: 'accepted', transaction_id: null });
  });

  it('isole les relevés et les décisions par propriétaire', () => {
    const { imports, checking, groceries } = setup();
    const other = setup('other-test');
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    expect(other.imports.listPending()).toEqual([]);
    expect(other.imports.countPending()).toBe(0);
    expect(() => other.imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: other.groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow('Ligne introuvable.');
    expect(() => other.imports.rejectLine(first.line.id)).toThrow('Ligne introuvable.');
    expect(() => other.imports.createBatch(statement(checking.id, { sourceSha256: sha('d') }))).toThrow('Compte introuvable.');
    // Accepter sa propre ligne vers la catégorie d'un autre propriétaire échoue aussi.
    expect(() => imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: other.groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow('Catégorie introuvable.');
    expect(imports.acceptLine({ id: first.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toBeTypeOf('string');
  });

  it('interdit en base une décision incohérente', () => {
    const { imports, checking } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    expect(() => connection.sqlite.prepare("update finance_import_lines set status = 'accepted' where id = ?").run(first.line.id)).toThrow();
    expect(() => connection.sqlite.prepare("update finance_import_lines set amount_cents = 0 where id = ?").run(first.line.id)).toThrow();
  });
});
