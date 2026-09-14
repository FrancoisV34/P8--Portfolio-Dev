import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { compareMicroBicServiceToSasu, type MicroVsSasuInput, type MicroVsSasuResult } from '../../lib/finance/status-comparison.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { statusComparisons } from '../db/schema.ts';

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const rate = z.number().int().min(0).max(100_000);
const input = z.object({ annualRevenueCents: cents, annualOperatingExpenseCents: cents, microBicServiceSocialRateBasisPoints: rate, sasuCorporateTaxRateBasisPoints: rate }).strict();

/** Instantanés privés du comparateur France micro BIC services / SASU dividendes. */
export function statusComparisonRepository(db: FinanceDatabase, ownerId: string) {
  const owner = z.string().trim().min(1).max(128).parse(ownerId);
  return {
    create(raw: MicroVsSasuInput) {
      const snapshot = input.parse(raw) as MicroVsSasuInput;
      const result = compareMicroBicServiceToSasu(snapshot);
      return db.insert(statusComparisons).values({ id: randomUUID(), ownerId: owner, input: JSON.stringify(snapshot), result: JSON.stringify(result), createdAt: new Date().toISOString() }).returning().get();
    },
    list(limit = 20) {
      const safeLimit = z.number().int().min(1).max(100).parse(limit);
      return db.select().from(statusComparisons).where(eq(statusComparisons.ownerId, owner)).orderBy(desc(statusComparisons.createdAt)).limit(safeLimit).all().map((row) => ({ ...row, input: input.parse(JSON.parse(row.input)) as MicroVsSasuInput, result: JSON.parse(row.result) as MicroVsSasuResult }));
    },
  };
}
