import { createHash, randomUUID } from 'node:crypto';
import { and, asc, count, desc, eq, gt, gte, isNotNull, lt, lte, ne, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import { euroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, categories, economicEntities, importBatches, importLines, transactions } from '../db/schema.ts';
import { accountsRepository } from './accounts.ts';
import { budgetRepository } from './budget.ts';

const MAX_LINES = 2000;
const PENDING_LIMIT = 200;
// Un mouvement saisi à la main peut précéder ou suivre la date bancaire de
// quelques jours ; au-delà d'une semaine, ce n'est plus le même.
const MATCH_WINDOW_DAYS = 7;
const EXACT_MATCH_DAYS = 3;
const CANDIDATE_LIMIT = 5;
const HISTORY_LIMIT = 2000;

const note = z.string().trim().max(240);
const lineInput = z.object({
  rawDate: z.string().max(40), rawLabel: z.string().max(240), rawAmount: z.string().max(40),
  occurredOn: z.string(), label: z.string().trim().max(240),
  amountCents: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).refine((value) => value !== 0),
}).strict();
const batchInput = z.object({
  accountId: z.uuid(), sourceKind: z.enum(['csv', 'pdf']), sourceName: z.string().trim().min(1).max(120),
  sourceSha256: z.string().regex(/^[0-9a-f]{64}$/), lines: z.array(lineInput).min(1).max(MAX_LINES),
}).strict();
const amountCents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const newName = z.string().trim().min(1).max(100);
// Catégorie ou compte de destination : un existant OU un nouveau, jamais les deux.
const acceptInput = z.discriminatedUnion('kind', [
  z.object({
    id: z.uuid(), kind: z.enum(['income', 'expense']), categoryId: z.uuid().optional(), newCategoryName: newName.optional(),
    amountCents, occurredOn: z.string(), note, recurringCommitmentId: z.uuid().nullable().optional(),
  }).strict(),
  z.object({
    id: z.uuid(), kind: z.literal('transfer'), counterpartAccountId: z.uuid().optional(),
    newCounterpartAccount: z.object({ name: newName, type: z.enum(['checking', 'savings', 'cash']) }).strict().optional(),
    direction: z.enum(['out', 'in']), amountCents, occurredOn: z.string(), note,
  }).strict(),
]);
const linkInput = z.object({ id: z.uuid(), transactionId: z.uuid(), adopt: z.boolean() }).strict();

export type CreateImportBatch = z.input<typeof batchInput>;
export type AcceptImportLine = z.input<typeof acceptInput>;
export const TRANSFER_MISMATCH = 'Les deux montants du virement ne correspondent pas : ce n’est pas la même opération.';
export const OPENED_TOO_LATE = 'Le relevé commence avant la date d’ouverture de ce compte : avance cette date dans la section Comptes, puis réimporte.';
export type LinkImportLine = z.input<typeof linkInput>;
export type ImportDuplicate = 'imported' | 'journal' | null;
export type ImportCandidate = {
  id: string; occurredOn: string; amountCents: number; kind: 'income' | 'expense' | 'transfer'; note: string; categoryName: string | null;
  /** Pour un virement : l'autre compte, celui d'où vient ou où va l'argent. */
  counterpartAccountName: string | null;
  /** Même montant, à trois jours près : très probablement la même opération. */
  exact: boolean;
};
export type KnownDecision =
  | { kind: 'income' | 'expense'; categoryId: string; recurringCommitmentId: string | null }
  | { kind: 'transfer'; counterpartAccountId: string; direction: 'out' | 'in' };
/**
 * Ce que l'app propose pour une ligne. `recognized` dit si la ligne peut
 * partir dans la validation groupée — c'est une proposition, jamais un geste :
 * rien n'est écrit tant que François n'a pas cliqué.
 */
export type ImportSuggestion = {
  candidates: ImportCandidate[];
  known: { decision: KnownDecision; sameAmount: boolean } | null;
  recognized: 'link' | 'create' | null;
  linkTo: string | null;
};

/**
 * Libellé comparable d'un relevé à l'autre : casse, accents et espaces ne
 * distinguent pas deux opérations. Les chiffres restent — une date ou une
 * référence dans le libellé sépare bien deux paiements.
 */
function comparableLabel(label: string) {
  return label.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

/**
 * Clé de reconnaissance d'un mois sur l'autre : le libellé comparable, sans
 * la date de facture (« FACT 090926 ») ni les longues références, qui changent
 * à chaque prélèvement d'un même abonnement.
 */
export function recognitionKey(label: string) {
  return comparableLabel(label).replace(/\bFACT \d{6}\b/g, ' ').replace(/\d{5,}/g, '#').replace(/\s+/g, ' ').trim();
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const daysBetween = (a: string, b: string) => Math.round(Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

function fingerprint(accountId: string, occurredOn: string, amount: number, label: string) {
  return createHash('sha256').update(JSON.stringify([accountId, occurredOn, amount, comparableLabel(label)])).digest('hex');
}

/**
 * File des relevés importés. Un lecteur (CSV, PDF) dépose des lignes ; seule
 * une validation explicite, ligne par ligne, les fait entrer dans le journal.
 * ownerId provient exclusivement du contrôle de session serveur.
 */
export function importsRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);
  const budget = budgetRepository(db, ownerId);

  function ownedActiveAccount(id: string) {
    return db.select({ id: accounts.id, isActive: accounts.isActive, openingDate: accounts.openingDate }).from(accounts)
      .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
      .where(and(eq(accounts.id, id), eq(economicEntities.ownerId, ownerId))).get();
  }
  function pendingLine(id: string) {
    return db.select({ line: importLines, accountId: importBatches.accountId }).from(importLines)
      .innerJoin(importBatches, eq(importLines.batchId, importBatches.id))
      .where(and(eq(importLines.id, id), eq(importLines.ownerId, ownerId), eq(importBatches.ownerId, ownerId), eq(importLines.status, 'pending'))).get();
  }
  function close(id: string, values: { status: 'accepted' | 'rejected'; transactionId: string | null }) {
    // La condition sur `pending` protège d'une double validation concurrente :
    // la seconde ne modifie aucune ligne et annule sa transaction.
    const closed = db.update(importLines).set({ ...values, decidedAt: new Date().toISOString() })
      .where(and(eq(importLines.id, id), eq(importLines.ownerId, ownerId), eq(importLines.status, 'pending'))).run();
    if (closed.changes !== 1) throw new Error('Ligne introuvable.');
  }
  // Un mouvement ne se rapproche que d'une seule ligne de relevé.
  const linkedTransactions = () => db.select({ id: importLines.transactionId }).from(importLines)
    .where(and(eq(importLines.ownerId, ownerId), isNotNull(importLines.transactionId)));
  function isLinked(transactionId: string) {
    return Boolean(db.select({ id: importLines.id }).from(importLines)
      .where(and(eq(importLines.ownerId, ownerId), eq(importLines.transactionId, transactionId))).limit(1).get());
  }

  /**
   * Mouvements du même compte, de même sens, à une semaine près, pas encore
   * rapprochés. Un virement entre deux comptes n'est proposé qu'au centime
   * près : c'est l'autre moitié d'une opération déjà connue, pas une estimation.
   */
  function candidatesFor(line: typeof importLines.$inferSelect, accountId: string): ImportCandidate[] {
    const rows = db.select({ transaction: transactions, categoryName: categories.name }).from(transactions)
      .leftJoin(categories, eq(transactions.categoryId, categories.id))
      .where(and(
        eq(transactions.ownerId, ownerId), eq(transactions.accountId, accountId),
        gte(transactions.occurredOn, shiftDate(line.occurredOn, -MATCH_WINDOW_DAYS)), lte(transactions.occurredOn, shiftDate(line.occurredOn, MATCH_WINDOW_DAYS)),
        line.amountCents < 0 ? lt(transactions.amountCents, 0) : gt(transactions.amountCents, 0),
        notInArray(transactions.id, linkedTransactions()),
      )).all();
    const distance = (transaction: typeof transactions.$inferSelect) =>
      [Math.abs(transaction.amountCents - line.amountCents), daysBetween(transaction.occurredOn, line.occurredOn)] as const;
    return rows
      .filter(({ transaction }) => transaction.kind !== 'transfer' || transaction.amountCents === line.amountCents)
      .sort((a, b) => { const [ecartA, joursA] = distance(a.transaction); const [ecartB, joursB] = distance(b.transaction); return ecartA - ecartB || joursA - joursB; })
      .slice(0, CANDIDATE_LIMIT)
      .map(({ transaction, categoryName }) => ({
        id: transaction.id, occurredOn: transaction.occurredOn, amountCents: transaction.amountCents, kind: transaction.kind,
        note: transaction.note, categoryName, counterpartAccountName: transaction.kind === 'transfer' ? counterpartName(transaction) : null,
        exact: transaction.amountCents === line.amountCents && daysBetween(transaction.occurredOn, line.occurredOn) <= EXACT_MATCH_DAYS,
      }));
  }
  function counterpartName(transaction: typeof transactions.$inferSelect) {
    return db.select({ name: accounts.name }).from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id)).where(and(
      eq(transactions.ownerId, ownerId), eq(transactions.transferGroupId, transaction.transferGroupId!), ne(transactions.id, transaction.id),
    )).get()?.name ?? null;
  }

  /**
   * Décision prise la dernière fois pour un libellé reconnu sur ce compte. Une
   * catégorie ou un compte désactivé depuis n'est plus proposé.
   */
  function historyFor(accountId: string) {
    const rows = db.select({ label: importLines.label, amountCents: importLines.amountCents, transaction: transactions }).from(importLines)
      .innerJoin(importBatches, eq(importLines.batchId, importBatches.id))
      .innerJoin(transactions, eq(importLines.transactionId, transactions.id))
      .where(and(eq(importLines.ownerId, ownerId), eq(importBatches.ownerId, ownerId), eq(importBatches.accountId, accountId), eq(importLines.status, 'accepted'), eq(transactions.ownerId, ownerId)))
      .orderBy(desc(importLines.decidedAt)).limit(HISTORY_LIMIT).all();
    const known = new Map<string, { amountCents: number; decision: KnownDecision }>();
    for (const { label, amountCents: amount, transaction } of rows) {
      const key = recognitionKey(label);
      if (!key || known.has(key)) continue;
      const decision = decisionOf(transaction);
      if (decision) known.set(key, { amountCents: amount, decision });
    }
    return known;
  }
  function decisionOf(transaction: typeof transactions.$inferSelect): KnownDecision | null {
    if (transaction.kind === 'transfer') {
      const other = db.select({ accountId: transactions.accountId }).from(transactions).where(and(
        eq(transactions.ownerId, ownerId), eq(transactions.transferGroupId, transaction.transferGroupId!), ne(transactions.id, transaction.id),
      )).get();
      const counterpart = other && ownedActiveAccount(other.accountId);
      if (!counterpart || !counterpart.isActive) return null;
      return { kind: 'transfer', counterpartAccountId: other.accountId, direction: transaction.amountCents < 0 ? 'out' : 'in' };
    }
    const category = db.select({ isActive: categories.isActive }).from(categories)
      .where(and(eq(categories.id, transaction.categoryId!), eq(categories.ownerId, ownerId))).get();
    if (!category?.isActive) return null;
    return { kind: transaction.kind, categoryId: transaction.categoryId!, recurringCommitmentId: transaction.recurringCommitmentId };
  }

  /**
   * ⚠️ **Rapprocher passe avant reconnaître.** Si un mouvement identique est
   * déjà au journal (saisi à la main), la ligne lui est rattachée : en créer un
   * second, même « reconnu », compterait la dépense deux fois.
   */
  function suggestionFor(line: typeof importLines.$inferSelect, accountId: string, duplicate: ImportDuplicate, history: ReturnType<typeof historyFor>): ImportSuggestion {
    const candidates = candidatesFor(line, accountId);
    const previous = history.get(recognitionKey(line.label));
    const known = previous ? { decision: previous.decision, sameAmount: previous.amountCents === line.amountCents } : null;
    const exact = candidates.filter((candidate) => candidate.exact);
    if (exact.length === 1 && duplicate !== 'imported') return { candidates, known, recognized: 'link', linkTo: exact[0].id };
    const sameAmountNearby = candidates.some((candidate) => candidate.amountCents === line.amountCents);
    if (exact.length === 0 && !sameAmountNearby && known?.sameAmount && duplicate === null) return { candidates, known, recognized: 'create', linkTo: null };
    return { candidates, known, recognized: null, linkTo: null };
  }

  return {
    createBatch(input: CreateImportBatch) {
      const values = batchInput.parse(input);
      const account = ownedActiveAccount(values.accountId);
      if (!account || !account.isActive) throw new Error('Compte introuvable.');
      const lines = values.lines.map((line, position) => {
        const occurredOn = parseCalendarDate(line.occurredOn);
        // Sans ce contrôle, chaque validation échouerait ensuite une à une,
        // sur un refus qui ne dirait pas pourquoi.
        if (occurredOn < account.openingDate) throw new Error(OPENED_TOO_LATE);
        const amount = euroCents(line.amountCents);
        return { ...line, position, occurredOn, amountCents: amount, fingerprint: fingerprint(values.accountId, occurredOn, amount, line.label) };
      });
      return db.transaction((tx) => {
        const known = tx.select({ id: importBatches.id }).from(importBatches).where(and(
          eq(importBatches.ownerId, ownerId), eq(importBatches.accountId, values.accountId), eq(importBatches.sourceSha256, values.sourceSha256),
        )).get();
        if (known) throw new Error('Ce relevé a déjà été importé pour ce compte.');
        const createdAt = new Date().toISOString();
        const batch = tx.insert(importBatches).values({
          id: randomUUID(), ownerId, accountId: values.accountId, sourceKind: values.sourceKind,
          sourceName: values.sourceName, sourceSha256: values.sourceSha256, createdAt,
        }).returning().get();
        tx.insert(importLines).values(lines.map((line) => ({ ...line, id: randomUUID(), ownerId, batchId: batch.id, createdAt }))).run();
        return { batch, lineCount: lines.length };
      });
    },
    /**
     * Les lignes à valider, dans l'ordre du relevé. Un doublon est signalé,
     * jamais écarté : seul François décide qu'une ligne est déjà saisie.
     */
    listPending() {
      const rows = db.select({ line: importLines, batch: importBatches, accountName: accounts.name }).from(importLines)
        .innerJoin(importBatches, eq(importLines.batchId, importBatches.id))
        .innerJoin(accounts, eq(importBatches.accountId, accounts.id))
        .where(and(eq(importLines.ownerId, ownerId), eq(importBatches.ownerId, ownerId), eq(importLines.status, 'pending')))
        .orderBy(asc(importBatches.createdAt), asc(importLines.position)).limit(PENDING_LIMIT).all();
      const histories = new Map<string, ReturnType<typeof historyFor>>();
      return rows.map(({ line, batch, accountName }) => {
        const duplicate = this.duplicateOf(line, batch.accountId);
        if (!histories.has(batch.accountId)) histories.set(batch.accountId, historyFor(batch.accountId));
        return {
          line, accountName,
          batch: { id: batch.id, accountId: batch.accountId, sourceKind: batch.sourceKind, sourceName: batch.sourceName },
          duplicate, suggestion: suggestionFor(line, batch.accountId, duplicate, histories.get(batch.accountId)!),
        };
      });
    },
    duplicateOf(line: typeof importLines.$inferSelect, accountId: string): ImportDuplicate {
      const imported = db.select({ id: importLines.id }).from(importLines).where(and(
        eq(importLines.ownerId, ownerId), eq(importLines.fingerprint, line.fingerprint),
        ne(importLines.batchId, line.batchId), ne(importLines.status, 'rejected'),
      )).limit(1).get();
      if (imported) return 'imported';
      // Une opération identique du même relevé, déjà validée, n'est pas un
      // doublon : deux cafés le même jour au même prix restent deux cafés.
      const sameBatch = db.select({ id: importLines.transactionId }).from(importLines).where(and(
        eq(importLines.ownerId, ownerId), eq(importLines.batchId, line.batchId), isNotNull(importLines.transactionId),
      )).all().map(({ id }) => id!);
      const journal = db.select({ id: transactions.id }).from(transactions).where(and(
        eq(transactions.ownerId, ownerId), eq(transactions.accountId, accountId),
        eq(transactions.occurredOn, line.occurredOn), eq(transactions.amountCents, line.amountCents),
        ...(sameBatch.length > 0 ? [notInArray(transactions.id, sameBatch)] : []),
      )).limit(1).get();
      return journal ? 'journal' : null;
    },
    countPending() {
      return db.select({ value: count() }).from(importLines).where(and(eq(importLines.ownerId, ownerId), eq(importLines.status, 'pending'))).get()?.value ?? 0;
    },
    acceptLine(input: AcceptImportLine) {
      const values = acceptInput.parse(input);
      if (values.kind === 'transfer' ? Boolean(values.counterpartAccountId) === Boolean(values.newCounterpartAccount) : Boolean(values.categoryId) === Boolean(values.newCategoryName)) {
        throw new Error('Choisir un existant ou en créer un, pas les deux.');
      }
      return db.transaction(() => {
        const found = pendingLine(values.id);
        if (!found) throw new Error('Ligne introuvable.');
        let transactionId: string;
        if (values.kind === 'transfer') {
          let counterpartAccountId = values.counterpartAccountId!;
          if (values.newCounterpartAccount) {
            // Le nouveau compte rejoint l'entité du compte importé et s'ouvre
            // à zéro le jour de l'opération : son solde vient du transfert.
            const entity = db.select({ entityId: accounts.entityId }).from(accounts).where(eq(accounts.id, found.accountId)).get()!;
            counterpartAccountId = accountsRepository(db, ownerId).createAccount({
              entityId: entity.entityId, name: values.newCounterpartAccount.name, type: values.newCounterpartAccount.type,
              openingBalanceCents: 0, openingDate: values.occurredOn,
            }).id;
          }
          const [fromAccountId, toAccountId] = values.direction === 'out'
            ? [found.accountId, counterpartAccountId] : [counterpartAccountId, found.accountId];
          const transferGroupId = budget.createTransfer({ fromAccountId, toAccountId, amountCents: values.amountCents, occurredOn: values.occurredOn, note: values.note });
          // Le relevé ne décrit que la jambe de son propre compte.
          transactionId = db.select({ id: transactions.id }).from(transactions).where(and(
            eq(transactions.ownerId, ownerId), eq(transactions.transferGroupId, transferGroupId), eq(transactions.accountId, found.accountId),
          )).get()!.id;
        } else {
          const categoryId = values.categoryId ?? (budget.listCategories().find((category) => category.kind === values.kind && category.name === values.newCategoryName)
            ?? budget.createCategory({ name: values.newCategoryName!, kind: values.kind })).id;
          transactionId = budget.createTransaction({
            accountId: found.accountId, categoryId, kind: values.kind, amountCents: values.amountCents,
            occurredOn: values.occurredOn, note: values.note, recurringCommitmentId: values.recurringCommitmentId,
          }).id;
        }
        close(values.id, { status: 'accepted', transactionId });
        return transactionId;
      });
    },
    /**
     * La ligne est déjà au journal : on la rattache au mouvement existant au
     * lieu d'en créer un second. `adopt` aligne montant et date sur le relevé,
     * qui fait foi ; la catégorie et la note saisies restent.
     */
    linkLine(input: LinkImportLine) {
      const values = linkInput.parse(input);
      return db.transaction(() => {
        const found = pendingLine(values.id);
        if (!found) throw new Error('Ligne introuvable.');
        const target = db.select().from(transactions).where(and(eq(transactions.id, values.transactionId), eq(transactions.ownerId, ownerId))).get();
        if (!target || target.accountId !== found.accountId || Math.sign(target.amountCents) !== Math.sign(found.line.amountCents)) throw new Error('Mouvement introuvable.');
        if (isLinked(target.id)) throw new Error('Ce mouvement est déjà rapproché d’une autre ligne.');
        if (target.kind === 'transfer') {
          // Les deux relevés doivent montrer la même somme. La date, elle, n'est
          // pas réalignée : deux banques créditent et débitent à un jour près,
          // et les deux moitiés du virement partagent la même date au journal.
          if (target.amountCents !== found.line.amountCents) throw new Error(TRANSFER_MISMATCH);
        } else if (values.adopt && (target.amountCents !== found.line.amountCents || target.occurredOn !== found.line.occurredOn)) {
          budget.updateTransaction({
            id: target.id, accountId: target.accountId, categoryId: target.categoryId!, kind: target.kind,
            amountCents: Math.abs(found.line.amountCents), occurredOn: found.line.occurredOn, note: target.note, recurringCommitmentId: target.recurringCommitmentId,
          });
        }
        close(values.id, { status: 'accepted', transactionId: target.id });
        return target.id;
      });
    },
    /**
     * « Valider les lignes reconnues » : un seul clic, mais sur une liste
     * d'identifiants que la page a montrés. La reconnaissance est recalculée
     * ici — une ligne envoyée qui ne l'est plus (montant différent, mouvement
     * saisi entre-temps) reste dans la file au lieu d'être validée.
     */
    acceptRecognized(ids: string[]) {
      const list = [...new Set(z.array(z.uuid()).min(1).max(PENDING_LIMIT).parse(ids))];
      return db.transaction(() => {
        const histories = new Map<string, ReturnType<typeof historyFor>>();
        let accepted = 0;
        for (const id of list) {
          const found = pendingLine(id);
          if (!found) continue;
          if (!histories.has(found.accountId)) histories.set(found.accountId, historyFor(found.accountId));
          const suggestion = suggestionFor(found.line, found.accountId, this.duplicateOf(found.line, found.accountId), histories.get(found.accountId)!);
          try {
            if (suggestion.recognized === 'link') {
              this.linkLine({ id, transactionId: suggestion.linkTo!, adopt: true });
            } else if (suggestion.recognized === 'create') {
              const decision = suggestion.known!.decision;
              const common = { id, amountCents: Math.abs(found.line.amountCents), occurredOn: found.line.occurredOn, note: found.line.label };
              this.acceptLine(decision.kind === 'transfer' ? { ...common, ...decision } : { ...common, ...decision });
            } else continue;
          } catch {
            // Une ligne refusée (engagement échu, compte fermé…) reste dans la
            // file sans faire échouer les autres : son point de sauvegarde
            // SQLite est annulé, pas la validation entière.
            continue;
          }
          accepted++;
        }
        return { accepted, skipped: list.length - accepted };
      });
    },
    rejectLine(id: string) {
      z.uuid().parse(id);
      close(id, { status: 'rejected', transactionId: null });
    },
  };
}
