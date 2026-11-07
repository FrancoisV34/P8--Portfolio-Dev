import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { importAgent, runAgentCommand, USAGE } from '../../app/.server/imports/agent';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { budgetRepository } from '../../app/.server/repositories/budget';
import { importsRepository, type CreateImportBatch } from '../../app/.server/repositories/imports';

let directory: string;
let connection: ReturnType<typeof openDatabase>;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'portfolio-imports-agent-test-'));
  connection = openDatabase({ path: join(directory, 'test.sqlite'), environment: 'test' });
  migrateDatabase(connection.db);
});
afterEach(() => {
  if (connection?.sqlite.open) connection.close();
  rmSync(directory, { recursive: true, force: true });
});

// Données synthétiques : aucun relevé réel ne figure dans les tests.
const OWNER = 'owner-test';
function setup(ownerId = OWNER) {
  const accounts = accountsRepository(connection.db, ownerId);
  const budget = budgetRepository(connection.db, ownerId);
  const entity = accounts.createEntity({ name: 'Foyer', type: 'personal' });
  const checking = accounts.createAccount({ entityId: entity.id, name: 'Compte courant', type: 'checking', openingBalanceCents: 100_000, openingDate: '2026-01-01' });
  const savings = accounts.createAccount({ entityId: entity.id, name: 'Livret', type: 'savings', openingBalanceCents: 0, openingDate: '2026-01-01' });
  const groceries = budget.createCategory({ name: 'Courses', kind: 'expense' });
  const leisure = budget.createCategory({ name: 'Loisirs', kind: 'expense' });
  const salary = budget.createCategory({ name: 'Salaire', kind: 'income' });
  return { budget, imports: importsRepository(connection.db, ownerId), agent: importAgent(connection.db, ownerId), checking, savings, groceries, leisure, salary };
}
const sha = (character: string) => character.repeat(64);
const row = (date: string, label: string, amountCents: number) =>
  ({ rawDate: date, rawLabel: label, rawAmount: String(amountCents), occurredOn: date, label, amountCents });
function statement(accountId: string, lines: CreateImportBatch['lines'], character = 'a'): CreateImportBatch {
  return { accountId, sourceKind: 'pdf', sourceName: `releve-${character}.pdf`, sourceSha256: sha(character), lines };
}
const september = [row('2026-09-03', 'CB SUPERMARCHE', -4_210), row('2026-09-05', 'VIR SALAIRE', 250_000), row('2026-09-06', 'VIR VERS LIVRET', -10_000)];
const journal = () => connection.sqlite.prepare('select kind, amount_cents as amountCents, occurred_on as occurredOn, note, category_id as categoryId from finance_transactions order by occurred_on, amount_cents').all();
const pendingIds = (imports: ReturnType<typeof importsRepository>) => imports.listPending().map(({ line }) => line.id);

describe('agent de validation des relevés', () => {
  it('montre la file et le contexte utiles, sans montant dans les exemples', () => {
    const { imports, agent, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, september));
    const [first] = agent.list();
    expect(first).toMatchObject({ account: 'Compte courant', date: '2026-09-03', label: 'CB SUPERMARCHE', amountCents: -4_210, duplicate: null, suggested: null, candidates: [] });
    imports.acceptLine({ id: first.line, kind: 'expense', categoryId: groceries.id, amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    const context = agent.context();
    expect(context.categories.map(({ name }) => name)).toEqual(['Courses', 'Loisirs', 'Salaire']);
    expect(context.accounts.map(({ name }) => name)).toEqual(['Compte courant', 'Livret']);
    expect(context.examples).toEqual([{ label: 'CB SUPERMARCHE', category: 'Courses' }]);
    expect(JSON.stringify(context)).not.toMatch(/4210|4_210|42[.,]10/);
  });

  it('sans --confirm, joue le lot puis n’écrit rien', () => {
    const { imports, agent, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, september));
    const [line] = pendingIds(imports);
    const result = agent.apply([`accept:${line}:${groceries.id}`], { confirm: false });
    expect(result).toEqual({ run: null, written: false, applied: [{ line, action: 'create' }], refused: [] });
    expect(journal()).toEqual([]);
    expect(imports.countPending()).toBe(3);
    expect(agent.runs()).toEqual([]);
  });

  it('catégorise, vire et valide avec le montant, la date et le libellé du relevé', () => {
    const { imports, agent, checking, savings, groceries, salary } = setup();
    imports.createBatch(statement(checking.id, september));
    const [courses, paie, epargne] = pendingIds(imports);
    const result = agent.apply([`accept:${courses}:${groceries.id}`, `accept:${paie}:${salary.id}`, `transfer:${epargne}:${savings.id}`], { confirm: true });
    expect(result.applied).toHaveLength(3);
    expect(result.refused).toEqual([]);
    expect(imports.countPending()).toBe(0);
    expect(journal()).toEqual([
      { kind: 'expense', amountCents: -4_210, occurredOn: '2026-09-03', note: 'CB SUPERMARCHE', categoryId: groceries.id },
      { kind: 'income', amountCents: 250_000, occurredOn: '2026-09-05', note: 'VIR SALAIRE', categoryId: salary.id },
      { kind: 'transfer', amountCents: -10_000, occurredOn: '2026-09-06', note: 'VIR VERS LIVRET', categoryId: null },
      { kind: 'transfer', amountCents: 10_000, occurredOn: '2026-09-06', note: 'VIR VERS LIVRET', categoryId: null },
    ]);
    expect(agent.runs()).toMatchObject([{ run: result.run, decisions: 3, undone: 0 }]);
  });

  it('refuse ce qui sort de son périmètre et laisse la ligne dans la file', () => {
    const { budget, imports, agent, checking, groceries, salary } = setup();
    const other = setup('autre-proprietaire');
    const closed = budget.createCategory({ name: 'Ancienne', kind: 'expense' });
    budget.updateCategory({ id: closed.id, name: 'Ancienne', kind: 'expense', isActive: false });
    imports.createBatch(statement(checking.id, september));
    const [courses, paie, epargne] = pendingIds(imports);
    const result = agent.apply([
      `accept:${courses}:${salary.id}`, // une dépense dans une catégorie de revenu
      `accept:${paie}:${other.salary.id}`, // la catégorie d'un autre propriétaire
      `transfer:${epargne}:${checking.id}`, // un virement vers le même compte
    ], { confirm: true });
    expect(result.applied).toEqual([]);
    expect(result.refused.map(({ reason }) => reason)).toEqual(['Catégorie introuvable.', 'Catégorie introuvable.', 'Les comptes du transfert doivent être différents.']);
    expect(agent.apply([`accept:${courses}:${closed.id}`, `transfer:${epargne}:${other.savings.id}`], { confirm: true }).refused.map(({ reason }) => reason))
      .toEqual(['Catégorie introuvable.', 'Compte introuvable.']);
    expect(other.agent.apply([`accept:${courses}:${other.groceries.id}`], { confirm: true }).refused).toEqual([{ line: courses, reason: 'Ligne introuvable.' }]);
    expect(agent.apply([`accept:${courses}:${groceries.id}`], { confirm: true }).applied).toHaveLength(1);
    expect(journal()).toHaveLength(1);
    expect(imports.countPending()).toBe(2);
  });

  it('s’arrête devant un doublon possible', () => {
    const { budget, imports, agent, checking, groceries } = setup();
    budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-08-29', note: 'saisi à la main' });
    imports.createBatch(statement(checking.id, september));
    const [courses] = pendingIds(imports);
    const result = agent.apply([`accept:${courses}:${groceries.id}`], { confirm: true });
    expect(result.refused).toEqual([{ line: courses, reason: expect.stringContaining('Doublon possible') }]);
    expect(journal()).toHaveLength(1);
  });

  it('ne contredit pas une décision déjà prise par François pour le même libellé', () => {
    const { imports, agent, checking, groceries, leisure } = setup();
    imports.createBatch(statement(checking.id, [row('2026-08-03', 'CB SUPERMARCHE', -3_000)], 'b'));
    imports.acceptLine({ id: pendingIds(imports)[0], kind: 'expense', categoryId: groceries.id, amountCents: 3_000, occurredOn: '2026-08-03', note: '' });
    imports.createBatch(statement(checking.id, september));
    const [courses, paie] = pendingIds(imports);
    expect(agent.list()[0]).toMatchObject({ line: courses, suggested: 'create' });
    expect(agent.apply([`accept:${courses}:${leisure.id}`], { confirm: true }).refused).toEqual([{ line: courses, reason: expect.stringContaining('suggested') }]);
    expect(agent.apply([`suggested:${paie}`], { confirm: true }).refused).toEqual([{ line: paie, reason: 'L’app ne propose rien pour cette ligne.' }]);
    expect(agent.apply([`suggested:${courses}`], { confirm: true }).applied).toEqual([{ line: courses, action: 'create' }]);
    expect(journal().at(-1)).toMatchObject({ amountCents: -4_210, categoryId: groceries.id });
  });

  it('annule un lot : supprime ce qu’il a créé, détache ce qu’il a rattaché et rend la date', () => {
    const { budget, imports, agent, checking, savings, groceries, salary } = setup();
    const manual = budget.createTransaction({ accountId: checking.id, categoryId: salary.id, kind: 'income', amountCents: 250_000, occurredOn: '2026-09-04', note: 'paie' });
    imports.createBatch(statement(checking.id, september));
    const [courses, paie, epargne] = pendingIds(imports);
    const before = journal();
    const result = agent.apply([`accept:${courses}:${groceries.id}`, `suggested:${paie}`, `transfer:${epargne}:${savings.id}`], { confirm: true });
    expect(result.applied.map(({ action }) => action)).toEqual(['create', 'link', 'create']);
    expect(journal()).toHaveLength(4);
    expect(connection.sqlite.prepare('select occurred_on as d from finance_transactions where id = ?').get(manual.id)).toEqual({ d: '2026-09-05' });

    expect(agent.undo(result.run!)).toEqual({ undone: 3, kept: 0 });
    expect(journal()).toEqual(before);
    expect(imports.countPending()).toBe(3);
    expect(agent.runs()).toMatchObject([{ run: result.run, decisions: 3, undone: 3 }]);
    expect(() => agent.undo(result.run!)).toThrow('Lot introuvable');
  });

  it('à l’annulation, laisse ce que François a repris en main', () => {
    const { budget, imports, agent, checking, groceries, salary } = setup();
    imports.createBatch(statement(checking.id, september));
    const [courses, paie] = pendingIds(imports);
    const result = agent.apply([`accept:${courses}:${groceries.id}`, `accept:${paie}:${salary.id}`], { confirm: true });
    const created = connection.sqlite.prepare('select id from finance_transactions where kind = ?').get('expense') as { id: string };
    budget.deleteTransaction(created.id);
    expect(agent.undo(result.run!)).toEqual({ undone: 1, kept: 1 });
    expect(journal()).toEqual([]);
    expect(imports.countPending()).toBe(2);
    expect(() => setup('tiers').agent.undo(result.run!)).toThrow('Lot introuvable');
  });

  it('n’accepte de la ligne de commande que des identifiants', () => {
    const { imports, agent, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, september));
    const [courses] = pendingIds(imports);
    for (const token of [`accept:${courses}`, `reject:${courses}`, `accept:${courses}:Courses`, `accept:${courses}:${groceries.id};drop`, `ACCEPT:${courses}:${groceries.id}`, '']) {
      expect(() => agent.apply([token], { confirm: true })).toThrow('Décision illisible.');
    }
    expect(() => agent.apply([], { confirm: true })).toThrow('Entre 1 et 200');
    expect(() => agent.apply(Array.from({ length: 201 }, () => `suggested:${courses}`), { confirm: true })).toThrow('Entre 1 et 200');
    expect(() => agent.apply([`suggested:${courses}`, `accept:${courses}:${groceries.id}`], { confirm: true })).toThrow('qu’une décision');
    for (const args of [[], ['delete'], ['list', 'extra'], ['undo'], ['undo', 'a', 'b'], ['context', '--all']]) {
      expect(() => runAgentCommand(connection.db, OWNER, args)).toThrow(USAGE);
    }
    expect(() => runAgentCommand(connection.db, OWNER, ['undo', 'pas-un-uuid'])).toThrow();
    expect(runAgentCommand(connection.db, OWNER, ['apply', `accept:${courses}:${groceries.id}`])).toMatchObject({ written: false, run: null });
    expect(runAgentCommand(connection.db, OWNER, ['apply', '--confirm', `accept:${courses}:${groceries.id}`])).toMatchObject({ written: true });
    expect(journal()).toHaveLength(1);
  });
});
