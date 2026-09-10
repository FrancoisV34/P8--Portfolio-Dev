import { randomUUID } from 'node:crypto';
import { and, asc, eq, gte, inArray, isNull, lte, or } from 'drizzle-orm';
import { z } from 'zod';
import { parseMonth } from '../../lib/finance/dates.ts';
import { euroCents, sumEuroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, categories, economicEntities, recurringCommitments, safetyReserveAccounts, safetyReserves, transactions } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const cents = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const reserveInput = z.object({ targetAmountCents: cents, accountIds: z.array(z.uuid()).min(1).max(20) }).strict()
  .refine(({ accountIds }) => new Set(accountIds).size === accountIds.length, 'Comptes dupliqués.');
const commitmentInput = z.object({
  name, categoryId: z.uuid(), plannedAmountCents: cents, dueDay: z.number().int().min(1).max(31), startPeriod: z.string(), endPeriod: z.string().nullable(),
}).strict();
const commitmentUpdateInput = commitmentInput.extend({ id: z.uuid() }).strict();

export type SetSafetyReserve = z.input<typeof reserveInput>;
export type CreateRecurringCommitment = z.input<typeof commitmentInput>;
export type UpdateRecurringCommitment = z.input<typeof commitmentUpdateInput>;

function now() { return new Date().toISOString(); }

/** Paramètres mensuels privés. Les montants réalisés restent dans le journal. */
export function planningRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);

  function normalizeCommitment(input: CreateRecurringCommitment) {
    const values = commitmentInput.parse(input);
    const startPeriod = parseMonth(values.startPeriod);
    const endPeriod = values.endPeriod === null ? null : parseMonth(values.endPeriod);
    if (endPeriod !== null && endPeriod < startPeriod) throw new Error('Période de fin invalide.');
    return { ...values, startPeriod, endPeriod, plannedAmountCents: euroCents(values.plannedAmountCents) };
  }
  function ownedExpenseCategory(categoryId: string) {
    return db.select({ id: categories.id }).from(categories).where(and(
      eq(categories.id, categoryId), eq(categories.ownerId, ownerId), eq(categories.kind, 'expense'),
    )).get();
  }
  function ownedCommitment(id: string) {
    return db.select().from(recurringCommitments).where(and(
      eq(recurringCommitments.id, id), eq(recurringCommitments.ownerId, ownerId),
    )).get();
  }

  return {
    setSafetyReserve(input: SetSafetyReserve) {
      const values = reserveInput.parse(input);
      const selected = db.select({ id: accounts.id }).from(accounts).innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
        .where(and(inArray(accounts.id, values.accountIds), eq(economicEntities.ownerId, ownerId))).all();
      if (selected.length !== values.accountIds.length) throw new Error('Compte introuvable.');
      const timestamp = now();
      return db.transaction((tx) => {
        const existing = tx.select().from(safetyReserves).where(eq(safetyReserves.ownerId, ownerId)).get();
        const reserve = existing
          ? tx.update(safetyReserves).set({ targetAmountCents: euroCents(values.targetAmountCents), updatedAt: timestamp }).where(eq(safetyReserves.id, existing.id)).returning().get()
          : tx.insert(safetyReserves).values({ id: randomUUID(), ownerId, targetAmountCents: euroCents(values.targetAmountCents), createdAt: timestamp, updatedAt: timestamp }).returning().get();
        tx.delete(safetyReserveAccounts).where(eq(safetyReserveAccounts.reserveId, reserve.id)).run();
        tx.insert(safetyReserveAccounts).values(values.accountIds.map((accountId) => ({ reserveId: reserve.id, accountId }))).run();
        return reserve;
      });
    },
    deleteSafetyReserve() {
      const deleted = db.delete(safetyReserves).where(eq(safetyReserves.ownerId, ownerId)).run();
      if (deleted.changes !== 1) throw new Error('Réserve introuvable.');
    },
    createCommitment(input: CreateRecurringCommitment) {
      const values = normalizeCommitment(input);
      if (!ownedExpenseCategory(values.categoryId)) throw new Error('Catégorie de dépense introuvable.');
      const timestamp = now();
      return db.insert(recurringCommitments).values({ ...values, id: randomUUID(), ownerId, createdAt: timestamp, updatedAt: timestamp }).returning().get();
    },
    updateCommitment(input: UpdateRecurringCommitment) {
      const initial = commitmentUpdateInput.parse(input);
      const values = normalizeCommitment(initial);
      const current = ownedCommitment(initial.id);
      if (!current) throw new Error('Engagement introuvable.');
      if (!ownedExpenseCategory(values.categoryId)) throw new Error('Catégorie de dépense introuvable.');
      if (current.categoryId !== values.categoryId && db.select({ id: transactions.id }).from(transactions).where(and(
        eq(transactions.ownerId, ownerId), eq(transactions.recurringCommitmentId, current.id),
      )).limit(1).get()) throw new Error('Catégorie déjà utilisée par un paiement.');
      return db.update(recurringCommitments).set({
        name: values.name, categoryId: values.categoryId, plannedAmountCents: values.plannedAmountCents,
        dueDay: values.dueDay, startPeriod: values.startPeriod, endPeriod: values.endPeriod, updatedAt: now(),
      }).where(and(eq(recurringCommitments.id, initial.id), eq(recurringCommitments.ownerId, ownerId))).returning().get();
    },
    deleteCommitment(id: string) {
      z.uuid().parse(id);
      const deleted = db.delete(recurringCommitments).where(and(eq(recurringCommitments.id, id), eq(recurringCommitments.ownerId, ownerId))).run();
      if (deleted.changes !== 1) throw new Error('Engagement introuvable.');
    },
    listCommitments() {
      return db.select({ commitment: recurringCommitments, categoryName: categories.name }).from(recurringCommitments)
        .innerJoin(categories, eq(recurringCommitments.categoryId, categories.id))
        .where(and(eq(recurringCommitments.ownerId, ownerId), eq(categories.ownerId, ownerId))).orderBy(asc(recurringCommitments.name)).all();
    },
    dashboard(periodInput: string, accountBalances: readonly { id: string; name: string; balanceCents: number }[], monthTransactions: readonly { transaction: { recurringCommitmentId: string | null; amountCents: number } }[]) {
      const period = parseMonth(periodInput);
      const reserve = db.select().from(safetyReserves).where(eq(safetyReserves.ownerId, ownerId)).get();
      const selectedIds = reserve ? db.select({ accountId: safetyReserveAccounts.accountId }).from(safetyReserveAccounts)
        .where(eq(safetyReserveAccounts.reserveId, reserve.id)).all().map(({ accountId }) => accountId) : [];
      const selectedAccounts = accountBalances.filter((account) => selectedIds.includes(account.id));
      const actualByCommitment = new Map<string, number>();
      for (const { transaction } of monthTransactions) if (transaction.recurringCommitmentId) {
        actualByCommitment.set(transaction.recurringCommitmentId, (actualByCommitment.get(transaction.recurringCommitmentId) ?? 0) + -transaction.amountCents);
      }
      const commitments = db.select({ commitment: recurringCommitments, categoryName: categories.name }).from(recurringCommitments)
        .innerJoin(categories, eq(recurringCommitments.categoryId, categories.id))
        .where(and(eq(recurringCommitments.ownerId, ownerId), eq(categories.ownerId, ownerId), lte(recurringCommitments.startPeriod, period), or(isNull(recurringCommitments.endPeriod), gte(recurringCommitments.endPeriod, period))))
        .orderBy(asc(recurringCommitments.dueDay), asc(recurringCommitments.name)).all();
      return {
        reserve: reserve ? {
          ...reserve,
          accounts: selectedAccounts,
          currentAmountCents: sumEuroCents(selectedAccounts.map((account) => euroCents(account.balanceCents))),
        } : null,
        commitments: commitments.map(({ commitment, categoryName }) => ({
          commitment, categoryName, actualCents: euroCents(actualByCommitment.get(commitment.id) ?? 0),
        })),
      };
    },
  };
}
