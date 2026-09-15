import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { FinanceDatabase } from '../db/connection.ts';
import { securityEvents } from '../db/schema.ts';

const kind = z.enum(['backup-download']);

/** Journal minimal d'opérations sensibles, sans montant ni contenu financier. */
export function securityEventRepository(db: FinanceDatabase, ownerId: string) {
  const owner = z.string().trim().min(1).max(128).parse(ownerId);
  return {
    latest(rawKind: z.infer<typeof kind>) {
      return db.select({ createdAt: securityEvents.createdAt }).from(securityEvents)
        .where(and(eq(securityEvents.ownerId, owner), eq(securityEvents.kind, kind.parse(rawKind))))
        .orderBy(desc(securityEvents.createdAt)).limit(1).get() ?? null;
    },
    record(rawKind: z.infer<typeof kind>) {
      return db.insert(securityEvents).values({ id: randomUUID(), ownerId: owner, kind: kind.parse(rawKind), createdAt: new Date().toISOString() }).run();
    },
  };
}
