import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../app/.server/db/connection';
import { migrateDatabase } from '../../app/.server/db/migrate';
import { accountsRepository } from '../../app/.server/repositories/accounts';
import { budgetRepository } from '../../app/.server/repositories/budget';
import { planningRepository } from '../../app/.server/repositories/planning';
import { importsRepository, OPENED_TOO_LATE, recognitionKey, type CreateImportBatch } from '../../app/.server/repositories/imports';

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

  it('refuse un relevé qui commence avant l’ouverture du compte, en disant quoi corriger', () => {
    const { imports, checking } = setup();
    const early = { ...statement(checking.id).lines[0], occurredOn: '2025-12-31' };
    expect(() => imports.createBatch(statement(checking.id, { lines: [statement(checking.id).lines[1], early] }))).toThrow(OPENED_TOO_LATE);
    expect(imports.countPending()).toBe(0);
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

describe('rapprochement et reconnaissance', () => {
  const spotify = (fact: string, amountCents = -1_214, occurredOn = '2026-09-25') => ({
    rawDate: occurredOn.split('-').reverse().join('/'), rawLabel: `CB Spotify France FACT ${fact}`, rawAmount: '-12,14', occurredOn, label: `CB Spotify France FACT ${fact}`, amountCents,
  });

  it('reconnaît un libellé d’un mois sur l’autre malgré la date de facture et les références', () => {
    expect(recognitionKey('CB Spotify France FACT 240926')).toBe(recognitionKey('CB  spotify france FACT 241026'));
    expect(recognitionKey('PRLV Free Telecom')).toBe('PRLV FREE TELECOM');
    expect(recognitionKey('VIR SEPA LUNDIMATIN-090621-092026033934-78')).toBe(recognitionKey('VIR SEPA LUNDIMATIN-090621-102026044012-78'));
    expect(recognitionKey('CB gomining.com')).not.toBe(recognitionKey('CB APPLE.COM/BILL'));
  });

  it('propose de rattacher une ligne au mouvement saisi à la main, et aligne celui-ci sur le relevé', () => {
    const { imports, budget, checking, groceries } = setup();
    const manual = budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-09-01', note: 'saisie manuelle' });
    imports.createBatch(statement(checking.id));
    const [line] = imports.listPending();
    expect(line.suggestion).toMatchObject({ recognized: 'link', linkTo: manual.id, candidates: [expect.objectContaining({ id: manual.id, exact: true, categoryName: 'Courses' })] });

    imports.linkLine({ id: line.line.id, transactionId: manual.id, adopt: true });
    expect(countTransactions()).toBe(1);
    // Le relevé fait foi pour la date ; la catégorie et la note saisies restent.
    expect(budget.listTransactions('2026-09')[0].transaction).toMatchObject({ id: manual.id, occurredOn: '2026-09-03', amountCents: -4_210, note: 'saisie manuelle', categoryId: groceries.id });
    expect(connection.sqlite.prepare('select status, transaction_id from finance_import_lines where id = ?').get(line.line.id)).toEqual({ status: 'accepted', transaction_id: manual.id });
  });

  it('corrige le montant à l’adoption, ou le laisse tel quel sans adoption', () => {
    const { imports, budget, checking, groceries } = setup();
    const manual = budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_000, occurredOn: '2026-09-03', note: '' });
    imports.createBatch(statement(checking.id));
    const [line] = imports.listPending();
    // Montant différent : candidat proposé, mais pas « reconnu ».
    expect(line.suggestion).toMatchObject({ recognized: null, candidates: [expect.objectContaining({ id: manual.id, exact: false })] });
    imports.linkLine({ id: line.line.id, transactionId: manual.id, adopt: false });
    expect(budget.listTransactions('2026-09')[0].transaction.amountCents).toBe(-4_000);
  });

  it('refuse un rattachement à un autre compte, au sens opposé, ou à un mouvement déjà rapproché', () => {
    const { imports, budget, checking, savings, groceries, salary } = setup();
    const elsewhere = budget.createTransaction({ accountId: savings.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    const income = budget.createTransaction({ accountId: checking.id, categoryId: salary.id, kind: 'income', amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    const manual = budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    const coffee = statement(checking.id).lines[0];
    imports.createBatch(statement(checking.id, { lines: [coffee, coffee] }));
    const [first, second] = imports.listPending();
    expect(first.suggestion.candidates.map(({ id }) => id)).toEqual([manual.id]);
    expect(() => imports.linkLine({ id: first.line.id, transactionId: elsewhere.id, adopt: false })).toThrow('Mouvement introuvable.');
    expect(() => imports.linkLine({ id: first.line.id, transactionId: income.id, adopt: false })).toThrow('Mouvement introuvable.');
    imports.linkLine({ id: first.line.id, transactionId: manual.id, adopt: false });
    expect(() => imports.linkLine({ id: second.line.id, transactionId: manual.id, adopt: false })).toThrow('déjà rapproché');
    // Une fois rapproché, le mouvement n'est plus proposé aux autres lignes.
    expect(imports.listPending()[0].suggestion.candidates).toEqual([]);
    // Un autre propriétaire ne peut rien rattacher.
    expect(() => setup('other-test').imports.linkLine({ id: second.line.id, transactionId: manual.id, adopt: false })).toThrow('Ligne introuvable.');
  });

  it('reconnaît la décision du mois précédent et ne la propose en lot qu’au même montant', () => {
    const { imports, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, { lines: [spotify('240926')] }));
    imports.acceptLine({ id: imports.listPending()[0].line.id, kind: 'expense', categoryId: groceries.id, amountCents: 1_214, occurredOn: '2026-09-25', note: '' });

    imports.createBatch(statement(checking.id, { sourceSha256: sha('b'), lines: [spotify('241026', -1_214, '2026-10-25'), spotify('251026', -1_314, '2026-10-26')] }));
    const [same, higher] = imports.listPending();
    expect(same.suggestion).toMatchObject({ recognized: 'create', known: { sameAmount: true, decision: { kind: 'expense', categoryId: groceries.id } } });
    // Spotify augmente : la ligne est reconnue, mais sort du lot pour être regardée.
    expect(higher.suggestion).toMatchObject({ recognized: null, known: { sameAmount: false } });
  });

  it('valide en un clic les seules lignes encore reconnues, et laisse les autres dans la file', () => {
    const { imports, budget, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, { lines: [spotify('240926')] }));
    imports.acceptLine({ id: imports.listPending()[0].line.id, kind: 'expense', categoryId: groceries.id, amountCents: 1_214, occurredOn: '2026-09-25', note: '' });
    const manual = budget.createTransaction({ accountId: checking.id, categoryId: groceries.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-10-02', note: '' });
    imports.createBatch(statement(checking.id, { sourceSha256: sha('b'), lines: [
      spotify('241026', -1_214, '2026-10-25'),
      { ...statement(checking.id).lines[0], occurredOn: '2026-10-03' },
      { ...spotify('251026', -999, '2026-10-26'), label: 'CB INCONNU', rawLabel: 'CB INCONNU' },
    ] }));
    const pending = imports.listPending();
    expect(pending.map(({ suggestion }) => suggestion.recognized)).toEqual(['create', 'link', null]);

    // L'identifiant d'une ligne non reconnue, glissé dans l'envoi, est ignoré.
    expect(imports.acceptRecognized(pending.map(({ line }) => line.id))).toEqual({ accepted: 2, skipped: 1 });
    expect(imports.listPending().map(({ line }) => line.label)).toEqual(['CB INCONNU']);
    const october = budget.listTransactions('2026-10').map(({ transaction }) => transaction);
    expect(october).toHaveLength(2);
    expect(october.find((transaction) => transaction.id === manual.id)?.occurredOn).toBe('2026-10-03');
    expect(() => imports.acceptRecognized([])).toThrow();
  });

  it('écarte du lot une ligne qui échoue, sans faire échouer les autres', () => {
    const { imports, budget, checking, groceries } = setup();
    // Un abonnement résilié : son engagement s'arrête en septembre.
    const commitment = planningRepository(connection.db, 'owner-test').createCommitment({ name: 'Spotify', categoryId: groceries.id, plannedAmountCents: 1_214, dueDay: 25, startPeriod: '2026-09', endPeriod: '2026-09' });
    const free = { rawDate: '04/09/2026', rawLabel: 'PRLV Free Telecom', rawAmount: '-39,99', occurredOn: '2026-09-04', label: 'PRLV Free Telecom', amountCents: -3_999 };
    imports.createBatch(statement(checking.id, { lines: [spotify('240926'), free] }));
    const [abonnement, box] = imports.listPending();
    imports.acceptLine({ id: abonnement.line.id, kind: 'expense', categoryId: groceries.id, recurringCommitmentId: commitment.id, amountCents: 1_214, occurredOn: '2026-09-25', note: '' });
    imports.acceptLine({ id: box.line.id, kind: 'expense', categoryId: groceries.id, amountCents: 3_999, occurredOn: '2026-09-04', note: '' });

    imports.createBatch(statement(checking.id, { sourceSha256: sha('b'), lines: [spotify('241026', -1_214, '2026-10-25'), { ...free, occurredOn: '2026-10-04' }] }));
    const pending = imports.listPending();
    expect(pending.map(({ suggestion }) => suggestion.recognized)).toEqual(['create', 'create']);
    // L'engagement échu fait refuser Spotify ; Free passe quand même.
    expect(imports.acceptRecognized(pending.map(({ line }) => line.id))).toEqual({ accepted: 1, skipped: 1 });
    expect(imports.listPending().map(({ line }) => line.label)).toEqual(['CB Spotify France FACT 241026']);
    expect(budget.listTransactions('2026-10').map(({ transaction }) => transaction.amountCents)).toEqual([-3_999]);
  });

  it('rattache en lot un transfert identique sans en déplacer la date', () => {
    const { imports, budget, checking, savings } = setup();
    budget.createTransfer({ fromAccountId: checking.id, toAccountId: savings.id, amountCents: 5_000, occurredOn: '2026-09-08', note: 'saisi à la main' });
    imports.createBatch(statement(checking.id, { lines: [{ rawDate: '10/09/2026', rawLabel: 'VIR LIVRET', rawAmount: '-50,00', occurredOn: '2026-09-10', label: 'VIR LIVRET', amountCents: -5_000 }] }));
    const [line] = imports.listPending();
    expect(line.suggestion.recognized).toBe('link');
    expect(imports.acceptRecognized([line.line.id])).toEqual({ accepted: 1, skipped: 0 });
    expect(budget.listTransactions('2026-09').map(({ transaction }) => transaction.occurredOn)).toEqual(['2026-09-08', '2026-09-08']);
  });

  it('ne propose plus une catégorie désactivée depuis', () => {
    const { imports, budget, checking, groceries } = setup();
    imports.createBatch(statement(checking.id, { lines: [spotify('240926')] }));
    imports.acceptLine({ id: imports.listPending()[0].line.id, kind: 'expense', categoryId: groceries.id, amountCents: 1_214, occurredOn: '2026-09-25', note: '' });
    budget.updateCategory({ id: groceries.id, name: 'Courses', kind: 'expense', isActive: false });
    imports.createBatch(statement(checking.id, { sourceSha256: sha('b'), lines: [spotify('241026', -1_214, '2026-10-25')] }));
    expect(imports.listPending()[0].suggestion).toMatchObject({ known: null, recognized: null });
  });

  it('crée à la validation la catégorie ou le compte de destination qui manquait', () => {
    const { imports, budget, checking, groceries } = setup();
    const coffee = statement(checking.id).lines[0];
    imports.createBatch(statement(checking.id, { lines: [coffee, { ...coffee, amountCents: -130_000, label: 'VIR SEPA VERS AUTRE BANQUE' }, coffee] }));
    const [first, second, third] = imports.listPending();

    imports.acceptLine({ id: first.line.id, kind: 'expense', newCategoryName: 'Abonnements', amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    // Le même nom réutilise la catégorie au lieu d'échouer sur le doublon.
    imports.acceptLine({ id: third.line.id, kind: 'expense', newCategoryName: 'Abonnements', amountCents: 4_210, occurredOn: '2026-09-03', note: '' });
    expect(budget.listCategories().filter(({ name }) => name === 'Abonnements')).toHaveLength(1);

    imports.acceptLine({ id: second.line.id, kind: 'transfer', newCounterpartAccount: { name: 'Compte autre banque', type: 'checking' }, direction: 'out', amountCents: 130_000, occurredOn: '2026-09-03', note: '' });
    const legs = budget.listTransactions('2026-09').filter(({ transaction }) => transaction.kind === 'transfer');
    expect(legs.map(({ accountName, transaction }) => [accountName, transaction.amountCents]).sort()).toEqual([['Compte autre banque', 130_000], ['Compte courant', -130_000]]);

    imports.createBatch(statement(checking.id, { sourceSha256: sha('b'), lines: [coffee] }));
    const [next] = imports.listPending();
    expect(() => imports.acceptLine({ id: next.line.id, kind: 'expense', categoryId: groceries.id, newCategoryName: 'Autre', amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow('pas les deux');
    expect(() => imports.acceptLine({ id: next.line.id, kind: 'expense', amountCents: 4_210, occurredOn: '2026-09-03', note: '' })).toThrow('pas les deux');
  });

  it('n’ouvre aucun compte si la validation échoue ensuite', () => {
    const { imports, checking } = setup();
    imports.createBatch(statement(checking.id));
    const [first] = imports.listPending();
    // Date avant l'ouverture du compte relevé : le transfert est refusé, et le compte créé avec lui disparaît.
    expect(() => imports.acceptLine({ id: first.line.id, kind: 'transfer', newCounterpartAccount: { name: 'Fantôme', type: 'savings' }, direction: 'out', amountCents: 4_210, occurredOn: '2025-12-31', note: '' })).toThrow();
    expect(connection.sqlite.prepare("select count(*) as n from finance_accounts where name = 'Fantôme'").get()).toEqual({ n: 0 });
  });

  describe('virement entre deux de mes comptes', () => {
    const sortie = { rawDate: '04/09/2026', rawLabel: 'VIR SEPA VERS LIVRET', rawAmount: '- 1 300,00', occurredOn: '2026-09-04', label: 'VIR SEPA VERS LIVRET', amountCents: -130_000 };
    const entree = (amountCents = 130_000, occurredOn = '2026-09-05') => ({ rawDate: '05/09/2026', rawLabel: 'VIR SEPA RECU', rawAmount: '+ 1 300,00', occurredOn, label: 'VIR SEPA RECU', amountCents });

    function virementSaisiDepuisLeCompte1() {
      const context = setup();
      context.imports.createBatch(statement(context.checking.id, { lines: [sortie] }));
      context.imports.acceptLine({ id: context.imports.listPending()[0].line.id, kind: 'transfer', counterpartAccountId: context.savings.id, direction: 'out', amountCents: 130_000, occurredOn: '2026-09-04', note: '' });
      return context;
    }

    it('rattache la ligne reçue sur le compte 2 au virement déjà créé, sans le dédoubler', () => {
      const { imports, budget, savings, checking } = virementSaisiDepuisLeCompte1();
      imports.createBatch(statement(savings.id, { sourceSha256: sha('b'), lines: [entree()] }));
      const [ligne] = imports.listPending();
      expect(ligne.suggestion).toMatchObject({ recognized: 'link', candidates: [expect.objectContaining({ kind: 'transfer', amountCents: 130_000, counterpartAccountName: 'Compte courant' })] });
      // Depuis la modale, « Aligner » reste coché : la banque du compte 2 a crédité un jour plus tard.
      imports.linkLine({ id: ligne.line.id, transactionId: ligne.suggestion.linkTo!, adopt: true });
      const jambes = budget.listTransactions('2026-09').map(({ transaction }) => transaction);
      expect(jambes).toHaveLength(2);
      expect(jambes.map(({ accountId, amountCents }) => [accountId === checking.id ? 'compte 1' : 'compte 2', amountCents]).sort()).toEqual([['compte 1', -130_000], ['compte 2', 130_000]]);
    });

    it('refuse de relier un virement dont les deux montants ne collent pas', () => {
      const { imports, savings } = virementSaisiDepuisLeCompte1();
      imports.createBatch(statement(savings.id, { sourceSha256: sha('b'), lines: [entree(129_900)] }));
      const [ligne] = imports.listPending();
      // Le virement n'est même pas proposé : il ne peut pas être le même.
      expect(ligne.suggestion.candidates).toEqual([]);
      const jambe = connection.sqlite.prepare("select id from finance_transactions where account_id = ? and kind = 'transfer'").get(savings.id) as { id: string };
      expect(() => imports.linkLine({ id: ligne.line.id, transactionId: jambe.id, adopt: false })).toThrow('Les deux montants du virement ne correspondent pas');
      expect(() => imports.linkLine({ id: ligne.line.id, transactionId: jambe.id, adopt: true })).toThrow('Les deux montants du virement ne correspondent pas');
    });
  });
});
