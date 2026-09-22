import { createHash, randomUUID } from 'node:crypto';
import { and, asc, count, eq, isNotNull, ne, notInArray } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import { euroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, economicEntities, importBatches, importLines, transactions } from '../db/schema.ts';
import { budgetRepository } from './budget.ts';

const MAX_LINES = 2000;
const PENDING_LIMIT = 200;

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
const acceptInput = z.discriminatedUnion('kind', [
  z.object({
    id: z.uuid(), kind: z.enum(['income', 'expense']), categoryId: z.uuid(), amountCents, occurredOn: z.string(), note,
    recurringCommitmentId: z.uuid().nullable().optional(),
  }).strict(),
  z.object({
    id: z.uuid(), kind: z.literal('transfer'), counterpartAccountId: z.uuid(), direction: z.enum(['out', 'in']), amountCents, occurredOn: z.string(), note,
  }).strict(),
]);

export type CreateImportBatch = z.input<typeof batchInput>;
export type AcceptImportLine = z.input<typeof acceptInput>;
export type ImportDuplicate = 'imported' | 'journal' | null;

/**
 * Libellé comparable d'un relevé à l'autre : casse, accents et espaces ne
 * distinguent pas deux opérations. Les chiffres restent — une date ou une
 * référence dans le libellé sépare bien deux paiements.
 */
function comparableLabel(label: string) {
  return label.normalize('NFD').replace(/\p{Mn}/gu, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

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
    return db.select({ id: accounts.id, isActive: accounts.isActive }).from(accounts)
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

  return {
    createBatch(input: CreateImportBatch) {
      const values = batchInput.parse(input);
      const account = ownedActiveAccount(values.accountId);
      if (!account || !account.isActive) throw new Error('Compte introuvable.');
      const lines = values.lines.map((line, position) => {
        const occurredOn = parseCalendarDate(line.occurredOn);
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
      return rows.map(({ line, batch, accountName }) => ({
        line, accountName,
        batch: { id: batch.id, accountId: batch.accountId, sourceKind: batch.sourceKind, sourceName: batch.sourceName },
        duplicate: this.duplicateOf(line, batch.accountId),
      }));
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
      return db.transaction(() => {
        const found = pendingLine(values.id);
        if (!found) throw new Error('Ligne introuvable.');
        let transactionId: string;
        if (values.kind === 'transfer') {
          const [fromAccountId, toAccountId] = values.direction === 'out'
            ? [found.accountId, values.counterpartAccountId] : [values.counterpartAccountId, found.accountId];
          const transferGroupId = budget.createTransfer({ fromAccountId, toAccountId, amountCents: values.amountCents, occurredOn: values.occurredOn, note: values.note });
          // Le relevé ne décrit que la jambe de son propre compte.
          transactionId = db.select({ id: transactions.id }).from(transactions).where(and(
            eq(transactions.ownerId, ownerId), eq(transactions.transferGroupId, transferGroupId), eq(transactions.accountId, found.accountId),
          )).get()!.id;
        } else {
          transactionId = budget.createTransaction({
            accountId: found.accountId, categoryId: values.categoryId, kind: values.kind, amountCents: values.amountCents,
            occurredOn: values.occurredOn, note: values.note, recurringCommitmentId: values.recurringCommitmentId,
          }).id;
        }
        close(values.id, { status: 'accepted', transactionId });
        return transactionId;
      });
    },
    rejectLine(id: string) {
      z.uuid().parse(id);
      close(id, { status: 'rejected', transactionId: null });
    },
  };
}
