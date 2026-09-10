import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, lt } from 'drizzle-orm';
import { z } from 'zod';
import { monthOf, parseCalendarDate, parseMonth } from '../../lib/finance/dates.ts';
import { euroCents, sumEuroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, categories, economicEntities, monthlyBudgets, recurringCommitments, transactions } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const note = z.string().trim().max(240);
const categoryInput = z.object({ name, kind: z.enum(['income', 'expense']) }).strict();
const categoryUpdateInput = categoryInput.extend({ id: z.uuid(), isActive: z.boolean() }).strict();
const transactionInput = z.object({
  accountId: z.uuid(), categoryId: z.uuid(), kind: z.enum(['income', 'expense']),
  amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), occurredOn: z.string(), note,
  recurringCommitmentId: z.uuid().nullable().optional(),
}).strict();
const transactionUpdateInput = transactionInput.extend({ id: z.uuid() }).strict();
const transferInput = z.object({
  fromAccountId: z.uuid(), toAccountId: z.uuid(), amountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), occurredOn: z.string(), note,
}).strict();
const budgetInput = z.object({ categoryId: z.uuid(), period: z.string(), plannedAmountCents: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) }).strict();

export type CreateCategory = z.input<typeof categoryInput>;
export type UpdateCategory = z.input<typeof categoryUpdateInput>;
export type CreateTransaction = z.input<typeof transactionInput>;
export type CreateTransfer = z.input<typeof transferInput>;
export type SetBudget = z.input<typeof budgetInput>;

function periodBounds(period: string) {
  const value = parseMonth(period);
  const [year, month] = value.split('-').map(Number);
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`;
  return { period: value, start: `${value}-01`, end: `${next}-01` };
}

function now() { return new Date().toISOString(); }

/** Toutes les recherches partent de ownerId, issu exclusivement de la session. */
export function budgetRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);

  function ownedAccounts(ids: readonly string[]) {
    if (ids.length === 0) return [];
    return db.select({ id: accounts.id, isActive: accounts.isActive, openingDate: accounts.openingDate }).from(accounts)
      .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
      .where(and(inArray(accounts.id, [...ids]), eq(economicEntities.ownerId, ownerId))).all();
  }
  function ownedCategory(id: string, kind?: 'income' | 'expense') {
    const where = [eq(categories.id, id), eq(categories.ownerId, ownerId)];
    if (kind) where.push(eq(categories.kind, kind));
    return db.select().from(categories).where(and(...where)).get();
  }
  function assertCommitment(id: string | null | undefined, categoryId: string, occurredOn: string) {
    if (!id) return null;
    const commitment = db.select().from(recurringCommitments).where(and(
      eq(recurringCommitments.id, id), eq(recurringCommitments.ownerId, ownerId), eq(recurringCommitments.categoryId, categoryId),
    )).get();
    const period = monthOf(parseCalendarDate(occurredOn));
    if (!commitment || commitment.startPeriod > period || (commitment.endPeriod !== null && commitment.endPeriod < period)) {
      throw new Error('Engagement introuvable.');
    }
    return commitment.id;
  }
  function assertAccount(id: string, occurredOn: string) {
    const account = ownedAccounts([id]).find((candidate) => candidate.id === id);
    if (!account || !account.isActive || occurredOn < account.openingDate) throw new Error('Compte introuvable.');
  }

  return {
    createCategory(input: CreateCategory) {
      const values = categoryInput.parse(input);
      return db.insert(categories).values({ ...values, id: randomUUID(), ownerId, createdAt: now() }).returning().get();
    },
    updateCategory(input: UpdateCategory) {
      const values = categoryUpdateInput.parse(input);
      if (!ownedCategory(values.id)) throw new Error('Catégorie introuvable.');
      return db.update(categories).set({ name: values.name, kind: values.kind, isActive: values.isActive })
        .where(and(eq(categories.id, values.id), eq(categories.ownerId, ownerId))).returning().get();
    },
    listCategories() {
      return db.select().from(categories).where(eq(categories.ownerId, ownerId)).orderBy(asc(categories.kind), asc(categories.name)).all();
    },
    createTransaction(input: CreateTransaction) {
      const values = transactionInput.parse(input);
      const occurredOn = parseCalendarDate(values.occurredOn);
      const category = ownedCategory(values.categoryId, values.kind);
      if (!category) throw new Error('Catégorie introuvable.');
      assertAccount(values.accountId, occurredOn);
      const recurringCommitmentId = values.kind === 'expense' ? assertCommitment(values.recurringCommitmentId, category.id, occurredOn) : null;
      const amountCents = euroCents(values.kind === 'income' ? values.amountCents : -values.amountCents);
      const timestamp = now();
      return db.insert(transactions).values({
        id: randomUUID(), ownerId, accountId: values.accountId, categoryId: category.id,
        kind: values.kind, amountCents, occurredOn, note: values.note, recurringCommitmentId, createdAt: timestamp, updatedAt: timestamp,
      }).returning().get();
    },
    updateTransaction(input: z.input<typeof transactionUpdateInput>) {
      const values = transactionUpdateInput.parse(input);
      const current = db.select().from(transactions).where(and(eq(transactions.id, values.id), eq(transactions.ownerId, ownerId))).get();
      if (!current || current.kind === 'transfer') throw new Error('Transaction introuvable.');
      const category = ownedCategory(values.categoryId, values.kind);
      if (!category) throw new Error('Catégorie introuvable.');
      const occurredOn = parseCalendarDate(values.occurredOn);
      assertAccount(values.accountId, occurredOn);
      const recurringCommitmentId = values.kind === 'expense' ? assertCommitment(values.recurringCommitmentId, category.id, occurredOn) : null;
      return db.update(transactions).set({
        accountId: values.accountId, categoryId: category.id, kind: values.kind,
        amountCents: euroCents(values.kind === 'income' ? values.amountCents : -values.amountCents),
        occurredOn, note: values.note, recurringCommitmentId, updatedAt: now(),
      }).where(and(eq(transactions.id, values.id), eq(transactions.ownerId, ownerId))).returning().get();
    },
    createTransfer(input: CreateTransfer) {
      const values = transferInput.parse(input);
      if (values.fromAccountId === values.toAccountId) throw new Error('Les comptes du transfert doivent être différents.');
      const amountCents = euroCents(values.amountCents);
      const occurredOn = parseCalendarDate(values.occurredOn);
      assertAccount(values.fromAccountId, occurredOn);
      assertAccount(values.toAccountId, occurredOn);
      const timestamp = now();
      const transferGroupId = randomUUID();
      return db.transaction((tx) => {
        tx.insert(transactions).values([
          { id: randomUUID(), ownerId, accountId: values.fromAccountId, kind: 'transfer', amountCents: euroCents(-amountCents), occurredOn, note: values.note, transferGroupId, createdAt: timestamp, updatedAt: timestamp },
          { id: randomUUID(), ownerId, accountId: values.toAccountId, kind: 'transfer', amountCents, occurredOn, note: values.note, transferGroupId, createdAt: timestamp, updatedAt: timestamp },
        ]).run();
        return transferGroupId;
      });
    },
    deleteTransaction(id: string) {
      const transaction = db.select().from(transactions).where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId))).get();
      if (!transaction) throw new Error('Transaction introuvable.');
      return db.transaction((tx) => transaction.transferGroupId
        ? tx.delete(transactions).where(and(eq(transactions.ownerId, ownerId), eq(transactions.transferGroupId, transaction.transferGroupId))).run()
        : tx.delete(transactions).where(and(eq(transactions.id, id), eq(transactions.ownerId, ownerId))).run());
    },
    listTransactions(period: string) {
      const range = periodBounds(period);
      return db.select({ transaction: transactions, accountName: accounts.name, categoryName: categories.name, commitmentName: recurringCommitments.name })
        .from(transactions).innerJoin(accounts, eq(transactions.accountId, accounts.id))
        .leftJoin(categories, eq(transactions.categoryId, categories.id))
        .leftJoin(recurringCommitments, eq(transactions.recurringCommitmentId, recurringCommitments.id))
        .where(and(eq(transactions.ownerId, ownerId), gte(transactions.occurredOn, range.start), lt(transactions.occurredOn, range.end)))
        .orderBy(desc(transactions.occurredOn), desc(transactions.createdAt)).limit(250).all();
    },
    setBudget(input: SetBudget) {
      const values = budgetInput.parse(input);
      const period = parseMonth(values.period);
      if (!ownedCategory(values.categoryId, 'expense')) throw new Error('Catégorie de dépense introuvable.');
      const timestamp = now();
      const existing = db.select({ id: monthlyBudgets.id }).from(monthlyBudgets).where(and(
        eq(monthlyBudgets.ownerId, ownerId), eq(monthlyBudgets.categoryId, values.categoryId), eq(monthlyBudgets.period, period),
      )).get();
      if (existing) return db.update(monthlyBudgets).set({ plannedAmountCents: euroCents(values.plannedAmountCents), updatedAt: timestamp })
        .where(eq(monthlyBudgets.id, existing.id)).returning().get();
      return db.insert(monthlyBudgets).values({ id: randomUUID(), ownerId, categoryId: values.categoryId, period,
        plannedAmountCents: euroCents(values.plannedAmountCents), createdAt: timestamp, updatedAt: timestamp }).returning().get();
    },
    deleteBudget(id: string) {
      const deleted = db.delete(monthlyBudgets).where(and(eq(monthlyBudgets.id, id), eq(monthlyBudgets.ownerId, ownerId))).run();
      if (deleted.changes !== 1) throw new Error('Budget introuvable.');
    },
    dashboard(period: string) {
      const range = periodBounds(period);
      const accountRows = db.select({ account: accounts }).from(accounts)
        .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
        .where(eq(economicEntities.ownerId, ownerId)).orderBy(asc(accounts.name)).all().map(({ account }) => account);
      const allMovements = db.select({ accountId: transactions.accountId, amountCents: transactions.amountCents }).from(transactions)
        .where(and(eq(transactions.ownerId, ownerId), lt(transactions.occurredOn, range.end))).all();
      const balanceByAccount = new Map<string, number>();
      for (const movement of allMovements) balanceByAccount.set(movement.accountId, (balanceByAccount.get(movement.accountId) ?? 0) + movement.amountCents);
      const monthTransactions = this.listTransactions(range.period);
      const incomeCents = sumEuroCents(monthTransactions.filter(({ transaction }) => transaction.kind === 'income').map(({ transaction }) => euroCents(transaction.amountCents)));
      const expenseCents = sumEuroCents(monthTransactions.filter(({ transaction }) => transaction.kind === 'expense').map(({ transaction }) => euroCents(-transaction.amountCents)));
      const expenseCategories = db.select().from(categories).where(and(eq(categories.ownerId, ownerId), eq(categories.kind, 'expense'))).orderBy(asc(categories.name)).all();
      const budgets = db.select().from(monthlyBudgets).where(and(eq(monthlyBudgets.ownerId, ownerId), eq(monthlyBudgets.period, range.period))).all();
      const actualByCategory = new Map<string, number>();
      for (const { transaction } of monthTransactions) if (transaction.kind === 'expense' && transaction.categoryId) actualByCategory.set(transaction.categoryId, (actualByCategory.get(transaction.categoryId) ?? 0) + -transaction.amountCents);
      const plannedByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
      return {
        period: range.period,
        accounts: accountRows.map((account) => ({ ...account, balanceCents: euroCents(account.openingBalanceCents + (balanceByAccount.get(account.id) ?? 0)) })),
        incomeCents, expenseCents, surplusCents: euroCents(incomeCents - expenseCents),
        budgets: expenseCategories.map((category) => ({ category, budget: plannedByCategory.get(category.id) ?? null, actualCents: euroCents(actualByCategory.get(category.id) ?? 0) })),
        transactionCount: monthTransactions.length,
      };
    },
    currentPeriodFrom(date: string) { return monthOf(parseCalendarDate(date)); },
  };
}
