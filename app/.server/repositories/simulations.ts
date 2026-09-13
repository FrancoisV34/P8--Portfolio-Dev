import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { projectSimulation, type SimulationInput, type SimulationResult } from '../../lib/finance/simulation.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { simulationAssumptions, simulationRuns } from '../db/schema.ts';

const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const bps = z.number().int().min(0).max(100_000);
const identifier = z.string().trim().min(1).max(128);
const charge = z.object({ name: z.string().trim().min(1).max(100), amountCents: cents, frequency: z.enum(['once', 'monthly', 'quarterly', 'annual']), startMonth: z.number().int().min(1).max(120), endMonth: z.number().int().min(1).max(120).nullable() }).strict()
  .refine(({ startMonth, endMonth }) => endMonth === null || endMonth >= startMonth, 'Période de charge invalide.');
const input = z.object({
  months: z.number().int().min(1).max(120),
  profileKind: z.enum(['prudent', 'central', 'ambitious', 'custom']).optional(),
  profile: z.object({ annualPlacementReturnBasisPoints: bps, businessMonthlyGrowthBasisPoints: bps, householdExpenseAnnualInflationBasisPoints: bps }).strict(),
  openingHouseholdCashCents: cents, frozenObservedAssetCents: cents, monthlyHouseholdIncomeCents: cents, monthlyHouseholdExpenseCents: cents,
  gominingScenarioId: z.uuid().nullable().optional(),
  gominingContributionCentsByMonth: z.array(cents).max(120).optional(),
  weights: z.object({ placements: z.number().int().min(0).max(10_000), business: z.number().int().min(0).max(10_000), material: z.number().int().min(0).max(10_000), projects: z.number().int().min(0).max(10_000), opportunities: z.number().int().min(0).max(10_000), debt: z.number().int().min(0).max(10_000) }).strict().refine((value) => Object.values(value).reduce((sum, item) => sum + item, 0) === 10_000, 'La répartition doit totaliser 100 %.'),
  businesses: z.array(z.object({ id: identifier, openingCashCents: cents, monthlyRevenueCents: cents, monthlyGrowthBasisPoints: bps.optional(), charges: z.array(charge).max(60) }).strict()).max(30),
  debts: z.array(z.object({ id: identifier, outstandingCents: cents, monthlyPaymentCents: cents, annualRateBasisPoints: bps }).strict()).max(30),
  goals: z.array(z.object({ id: identifier, targetCents: cents, progressCents: cents, priority: z.number().int().min(1).max(999) }).strict()).max(100),
}).strict();

function parseSnapshot(snapshot: string) { return input.parse(JSON.parse(snapshot)) as SimulationInput; }

/** Hypothèses et exécutions L15 : propriétaire vérifié, données privées et immuables. */
export function simulationRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);
  function assumption(id: string) {
    const row = db.select().from(simulationAssumptions).where(and(eq(simulationAssumptions.id, z.uuid().parse(id)), eq(simulationAssumptions.ownerId, ownerId))).get();
    if (!row) throw new Error('Hypothèse de simulation introuvable.');
    return { ...row, snapshot: parseSnapshot(row.snapshot) };
  }
  return {
    current() {
      const row = db.select().from(simulationAssumptions).where(eq(simulationAssumptions.ownerId, ownerId)).orderBy(desc(simulationAssumptions.revision)).limit(1).get();
      return row ? { ...row, snapshot: parseSnapshot(row.snapshot) } : null;
    },
    saveAssumptions(raw: SimulationInput) {
      const snapshot = input.parse(raw) as SimulationInput;
      const previous = this.current();
      return db.insert(simulationAssumptions).values({ id: randomUUID(), ownerId, revision: (previous?.revision ?? 0) + 1, snapshot: JSON.stringify(snapshot), createdAt: new Date().toISOString() }).returning().get();
    },
    run(assumptionId: string) {
      const selected = assumption(assumptionId);
      const result = projectSimulation(selected.snapshot);
      return db.insert(simulationRuns).values({ id: randomUUID(), ownerId, assumptionId: selected.id, input: JSON.stringify(selected.snapshot), result: JSON.stringify(result), createdAt: new Date().toISOString() }).returning().get();
    },
    list(limit = 20) {
      const safeLimit = z.number().int().min(1).max(100).parse(limit);
      const runs = db.select().from(simulationRuns).where(eq(simulationRuns.ownerId, ownerId)).orderBy(desc(simulationRuns.createdAt)).limit(safeLimit).all();
      const assumptionIds = [...new Set(runs.map((row) => row.assumptionId))];
      const assumptions = assumptionIds.length === 0 ? [] : db.select().from(simulationAssumptions).where(and(eq(simulationAssumptions.ownerId, ownerId), inArray(simulationAssumptions.id, assumptionIds))).orderBy(asc(simulationAssumptions.revision)).all();
      return runs.map((row) => ({ ...row, input: parseSnapshot(row.input), result: JSON.parse(row.result) as SimulationResult, assumption: assumptions.find((item) => item.id === row.assumptionId) ?? null }));
    },
    getAssumption(id: string) { return assumption(id); },
  };
}
