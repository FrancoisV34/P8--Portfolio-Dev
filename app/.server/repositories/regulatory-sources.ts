import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { inspectOfficialRegulatorySource, isOfficialRegulatorySourceKey, officialRegulatorySources, type OfficialRegulatorySourceKey } from '../regulatory/official-sources.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { regulatorySourceChecks } from '../db/schema.ts';

const key = z.string().trim().min(1).max(80);
const storedStates = ['review', 'unchanged', 'changed', 'unavailable'] as const;

/** Historique privé des vérifications manuelles ; aucune règle n'est modifiée ici. */
export function regulatorySourceRepository(db: FinanceDatabase, ownerId: string) {
  const owner = z.string().trim().min(1).max(128).parse(ownerId);
  const latest = (sourceKey: OfficialRegulatorySourceKey) => db.select().from(regulatorySourceChecks).where(and(eq(regulatorySourceChecks.ownerId, owner), eq(regulatorySourceChecks.sourceKey, sourceKey))).orderBy(desc(regulatorySourceChecks.checkedAt)).limit(1).get();
  return {
    async check(sourceKey: string, inspect = inspectOfficialRegulatorySource) {
      const candidate = key.parse(sourceKey);
      if (!isOfficialRegulatorySourceKey(candidate)) throw new Error('Source réglementaire inconnue.');
      const source = candidate;
      const inspection = await inspect(source);
      const previous = latest(source);
      const state = !inspection.available ? 'unavailable' : previous?.contentHash === null || previous === undefined ? 'review' : previous.contentHash === inspection.contentHash ? 'unchanged' : 'changed';
      return db.insert(regulatorySourceChecks).values({ id: randomUUID(), ownerId: owner, sourceKey: source, sourceUrl: inspection.sourceUrl, contentHash: inspection.contentHash, state, statusCode: inspection.statusCode, checkedAt: new Date().toISOString() }).returning().get();
    },
    dashboard() {
      return (Object.keys(officialRegulatorySources) as OfficialRegulatorySourceKey[]).map((sourceKey) => ({ sourceKey, ...officialRegulatorySources[sourceKey], latest: latest(sourceKey) ?? null }));
    },
    list() { return db.select().from(regulatorySourceChecks).where(eq(regulatorySourceChecks.ownerId, owner)).orderBy(desc(regulatorySourceChecks.checkedAt)).all(); },
    states: storedStates,
  };
}
