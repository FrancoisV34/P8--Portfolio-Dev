import { randomUUID } from 'node:crypto';
import { and, asc, eq, lt } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import { euroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { accounts, economicEntities, transactions } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const entityInput = z.object({ name, type: z.enum(['personal', 'business']) }).strict();
const accountInput = z.object({
  entityId: z.uuid(),
  name,
  type: z.enum(['checking', 'savings', 'cash']),
  openingBalanceCents: z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  openingDate: z.string(),
}).strict();
const updateAccountInput = accountInput.omit({ entityId: true }).extend({ id: z.uuid(), isActive: z.boolean() }).strict();

export type CreateEntity = z.input<typeof entityInput>;
export type CreateAccount = z.input<typeof accountInput>;
export type UpdateAccount = z.input<typeof updateAccountInput>;

/** ownerId doit provenir du contrôle de session serveur, jamais d'un formulaire. */
export function accountsRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);

  function findEntity(id: string) {
    return db.select().from(economicEntities).where(and(
      eq(economicEntities.id, id), eq(economicEntities.ownerId, ownerId),
    )).get();
  }

  return {
    createEntity(input: CreateEntity) {
      const values = entityInput.parse(input);
      return db.insert(economicEntities).values({
        ...values, id: randomUUID(), ownerId, createdAt: new Date().toISOString(),
      }).returning().get();
    },
    listEntities() {
      return db.select().from(economicEntities).where(eq(economicEntities.ownerId, ownerId)).orderBy(asc(economicEntities.name)).all();
    },
    createAccount(input: CreateAccount) {
      const values = accountInput.parse(input);
      const openingDate = parseCalendarDate(values.openingDate);
      const openingBalanceCents = euroCents(values.openingBalanceCents);
      return db.transaction((tx) => {
        if (!findEntity(values.entityId)) throw new Error('Entité introuvable.');
        return tx.insert(accounts).values({
          ...values, openingDate, openingBalanceCents, id: randomUUID(), createdAt: new Date().toISOString(),
        }).returning().get();
      });
    },
    updateAccount(input: UpdateAccount) {
      const values = updateAccountInput.parse(input);
      const openingDate = parseCalendarDate(values.openingDate);
      const openingBalanceCents = euroCents(values.openingBalanceCents);
      const existing = db.select({ id: accounts.id }).from(accounts)
        .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
        .where(and(eq(accounts.id, values.id), eq(economicEntities.ownerId, ownerId))).get();
      if (!existing) throw new Error('Compte introuvable.');
      const earlierTransaction = db.select({ id: transactions.id }).from(transactions).where(and(
        eq(transactions.ownerId, ownerId), eq(transactions.accountId, values.id), lt(transactions.occurredOn, openingDate),
      )).limit(1).get();
      if (earlierTransaction) throw new Error('La date d’ouverture précède des mouvements existants.');
      return db.update(accounts).set({
        name: values.name, openingDate, openingBalanceCents, isActive: values.isActive,
      }).where(eq(accounts.id, values.id)).returning().get();
    },
    listAccounts() {
      return db.select({ account: accounts }).from(accounts)
        .innerJoin(economicEntities, eq(accounts.entityId, economicEntities.id))
        .where(eq(economicEntities.ownerId, ownerId))
        .orderBy(asc(accounts.name)).all().map(({ account }) => account);
    },
  };
}
