import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { regulatoryRules } from '../db/schema.ts';

const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional().default(null);
const ruleInput = z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(120), source: z.string().trim().min(1).max(500), verifiedOn: z.string(), validFrom: z.string(), validTo: optional(z.string()), note: z.string().trim().max(240) }).strict();
const updateInput = ruleInput.extend({ id: z.uuid() }).strict();
const resolutionInput = z.object({ name: z.string().trim().min(1).max(100), asOf: z.string() }).strict();
function now() { return new Date().toISOString(); }
function keyFor(name: string) { return name.normalize('NFKC').trim().toLocaleLowerCase('fr-FR'); }
export function regulatoryRepository(db: FinanceDatabase, ownerId: string) {
  const owner = z.string().trim().min(1).max(128).parse(ownerId);
  const values = (input: z.output<typeof ruleInput>) => { const verifiedOn = parseCalendarDate(input.verifiedOn); const validFrom = parseCalendarDate(input.validFrom); const validTo = input.validTo === null ? null : parseCalendarDate(input.validTo); if (validTo !== null && validTo < validFrom) throw new Error('Période invalide.'); return { ...input, verifiedOn, validFrom, validTo }; };
  const list = () => db.select().from(regulatoryRules).where(eq(regulatoryRules.ownerId, owner)).orderBy(asc(regulatoryRules.validFrom), asc(regulatoryRules.name)).all();
  const resolve = (input: z.input<typeof resolutionInput>) => {
    const { name, asOf } = resolutionInput.parse(input);
    const date = parseCalendarDate(asOf);
    const rules = list().filter((rule) => keyFor(rule.name) === keyFor(name));
    const applicable = rules.filter((rule) => rule.validFrom <= date && (rule.validTo === null || date <= rule.validTo));
    return { name, asOf: date, status: applicable.length === 0 ? 'missing' as const : applicable.length === 1 ? 'applicable' as const : 'overlap' as const, rules: applicable };
  };
  return {
    create(input: z.input<typeof ruleInput>) { const timestamp = now(); return db.insert(regulatoryRules).values({ id: randomUUID(), ownerId: owner, ...values(ruleInput.parse(input)), createdAt: timestamp, updatedAt: timestamp }).returning().get(); },
    update(input: z.input<typeof updateInput>) { const { id, ...raw } = updateInput.parse(input); if (!db.select().from(regulatoryRules).where(and(eq(regulatoryRules.id, id), eq(regulatoryRules.ownerId, owner))).get()) throw new Error('Règle introuvable.'); return db.update(regulatoryRules).set({ ...values(raw), updatedAt: now() }).where(and(eq(regulatoryRules.id, id), eq(regulatoryRules.ownerId, owner))).returning().get(); },
    list,
    resolve,
    dashboard(asOf: string) {
      const date = parseCalendarDate(asOf);
      const rules = list();
      const names = [...new Map(rules.map((rule) => [keyFor(rule.name), rule.name])).values()];
      return { asOf: date, rules, coverage: names.map((name) => resolve({ name, asOf: date })) };
    },
  };
}
