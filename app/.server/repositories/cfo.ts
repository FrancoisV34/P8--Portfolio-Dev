import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { cfoBuckets, defaultCfoRuleSet, evaluateCfo, type CfoAllocation, type CfoInput, type CfoResult, type CfoRuleSet, type CfoWeights } from '../../lib/finance/cfo.ts';
import { euroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { cfoComparisons, cfoDecisions, cfoEvaluations, cfoRuleSets } from '../db/schema.ts';

const input = z.object({
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/), liquidCashCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  reserveTargetCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable(), reserveCurrentCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  unpaidCommitmentCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), debtPaymentCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  businessProvisionCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), gominingContributionCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0), speculativeAssetCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), grossAssetCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  businessCashComplete: z.boolean(), activeProjectCount: z.number().int().min(0).max(999), projectCapacityStatus: z.enum(['compatible', 'watch', 'unknown']),
}).strict();
const weightsInput = z.object({ placements: z.number().int().min(0).max(10_000), business: z.number().int().min(0).max(10_000), material: z.number().int().min(0).max(10_000), projects: z.number().int().min(0).max(10_000), opportunities: z.number().int().min(0).max(10_000) }).strict()
  .refine((weights) => Object.values(weights).reduce((total, value) => total + value, 0) === 10_000, 'Les poids doivent totaliser 100 %.');
const allocationInput = z.array(z.object({ bucket: z.enum(cfoBuckets), amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) }).strict()).length(cfoBuckets.length)
  .refine((allocation) => new Set(allocation.map((item) => item.bucket)).size === cfoBuckets.length, 'Destinations invalides.');
const storedAllocation = z.array(z.object({ bucket: z.enum(cfoBuckets), amountCents: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), weightBasisPoints: z.number().int().min(0).max(10_000) }).strict()).length(cfoBuckets.length)
  .refine((allocation) => new Set(allocation.map((item) => item.bucket)).size === cfoBuckets.length, 'Destinations invalides.');
const decisionInput = z.object({ evaluationId: z.uuid(), outcome: z.enum(['accepted', 'modified', 'ignored']), note: z.string().trim().max(240), allocation: allocationInput.optional() }).strict();
const comparisonInput = z.object({ evaluationId: z.uuid(), name: z.string().trim().min(1).max(100), allocation: allocationInput }).strict();

export function cfoRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);
  function evaluation(id: string) {
    const row = db.select().from(cfoEvaluations).where(and(eq(cfoEvaluations.id, z.uuid().parse(id)), eq(cfoEvaluations.ownerId, ownerId))).get();
    if (!row) throw new Error('Évaluation introuvable.');
    return { ...row, input: input.parse(JSON.parse(row.input)) as CfoInput, result: JSON.parse(row.result) as CfoResult };
  }
  function currentRules() {
    const row = db.select().from(cfoRuleSets).where(eq(cfoRuleSets.ownerId, ownerId)).orderBy(desc(cfoRuleSets.revision)).limit(1).get();
    if (!row) return { revision: 1, createdAt: null, ...defaultCfoRuleSet };
    const weights: CfoWeights = { placements: row.placementsBasisPoints, business: row.businessBasisPoints, material: row.materialBasisPoints, projects: row.projectsBasisPoints, opportunities: row.opportunitiesBasisPoints };
    return { revision: row.revision, createdAt: row.createdAt, version: `cfo-v${row.revision}`, weights };
  }
  function allocationFor(total: number, raw: z.infer<typeof allocationInput>): CfoAllocation[] {
    const byBucket = new Map(raw.map((item) => [item.bucket, item.amountCents]));
    const allocation = cfoBuckets.map((bucket) => ({ bucket, amountCents: euroCents(byBucket.get(bucket)!), weightBasisPoints: Math.floor(byBucket.get(bucket)! * 10_000 / total) }));
    const assigned = allocation.reduce((sum, item) => sum + item.weightBasisPoints, 0);
    allocation.at(-1)!.weightBasisPoints += 10_000 - assigned;
    return allocation;
  }
  return {
    currentRules,
    setWeights(raw: CfoWeights) {
      const weights = weightsInput.parse(raw);
      const previous = currentRules();
      const revision = previous.revision + 1;
      return db.insert(cfoRuleSets).values({ id: randomUUID(), ownerId, revision, placementsBasisPoints: weights.placements, businessBasisPoints: weights.business, materialBasisPoints: weights.material, projectsBasisPoints: weights.projects, opportunitiesBasisPoints: weights.opportunities, createdAt: new Date().toISOString() }).returning().get();
    },
    evaluate(raw: CfoInput, rules: CfoRuleSet = currentRules()) {
      const context = input.parse(raw);
      const result = evaluateCfo(context, rules);
      return db.insert(cfoEvaluations).values({
        id: randomUUID(), ownerId, period: context.period, ruleVersion: result.ruleVersion,
        input: JSON.stringify(context), result: JSON.stringify(result), createdAt: new Date().toISOString(),
      }).returning().get();
    },
    list(limit = 12) {
      const safeLimit = z.number().int().min(1).max(100).parse(limit);
      const evaluations = db.select().from(cfoEvaluations).where(eq(cfoEvaluations.ownerId, ownerId)).orderBy(desc(cfoEvaluations.createdAt)).limit(safeLimit).all();
      const ids = evaluations.map((row) => row.id);
      const decisions = ids.length === 0 ? [] : db.select().from(cfoDecisions).where(and(eq(cfoDecisions.ownerId, ownerId), inArray(cfoDecisions.evaluationId, ids))).orderBy(asc(cfoDecisions.createdAt)).all();
      const comparisons = ids.length === 0 ? [] : db.select().from(cfoComparisons).where(and(eq(cfoComparisons.ownerId, ownerId), inArray(cfoComparisons.evaluationId, ids))).orderBy(asc(cfoComparisons.createdAt)).all();
      return evaluations.map((row) => ({
        ...row, input: input.parse(JSON.parse(row.input)) as CfoInput, result: JSON.parse(row.result) as CfoResult,
        decisions: decisions.filter((decision) => decision.evaluationId === row.id).map((decision) => ({ ...decision, plan: decision.plan === null ? null : JSON.parse(decision.plan) })),
        comparisons: comparisons.filter((comparison) => comparison.evaluationId === row.id).map((comparison) => ({ ...comparison, allocation: storedAllocation.parse(JSON.parse(comparison.allocation)) })),
      }));
    },
    get(id: string) {
      return evaluation(id);
    },
    decide(raw: z.input<typeof decisionInput>) {
      const values = decisionInput.parse(raw);
      const selected = evaluation(values.evaluationId);
      if ((values.outcome === 'accepted' || values.outcome === 'modified') && selected.result.allocation === null) throw new Error('Aucune allocation ne peut être acceptée.');
      if (values.outcome !== 'modified' && values.allocation !== undefined) throw new Error('Plan invalide.');
      if (values.outcome === 'modified' && (values.allocation === undefined || values.allocation.reduce((total, item) => total + item.amountCents, 0) !== selected.result.allocableCashCents)) throw new Error('Le plan modifié doit répartir exactement le cash allouable.');
      const allocation = values.outcome === 'accepted' ? selected.result.allocation : values.outcome === 'modified' ? allocationFor(selected.result.allocableCashCents, values.allocation!) : null;
      const plan = allocation === null ? null : JSON.stringify({ evaluationId: selected.id, ruleVersion: selected.ruleVersion, allocation });
      return db.insert(cfoDecisions).values({ id: randomUUID(), ownerId, evaluationId: selected.id, outcome: values.outcome, note: values.note, plan, createdAt: new Date().toISOString() }).returning().get();
    },
    compare(raw: z.input<typeof comparisonInput>) {
      const values = comparisonInput.parse(raw);
      const selected = evaluation(values.evaluationId);
      if (selected.result.allocation === null) throw new Error('Aucune allocation ne peut être comparée.');
      if (values.allocation.reduce((total, item) => total + item.amountCents, 0) !== selected.result.allocableCashCents) throw new Error('La comparaison doit répartir exactement le cash allouable.');
      const allocation = allocationFor(selected.result.allocableCashCents, values.allocation);
      if (allocation.every((item, index) => item.amountCents === selected.result.allocation![index]?.amountCents)) throw new Error('La comparaison doit différer de la proposition.');
      return db.insert(cfoComparisons).values({ id: randomUUID(), ownerId, evaluationId: selected.id, name: values.name, allocation: JSON.stringify(allocation), createdAt: new Date().toISOString() }).returning().get();
    },
  };
}
