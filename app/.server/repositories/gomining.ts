import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { parseMonth } from '../../lib/finance/dates.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { categories, gominingContributionPhases, gominingScenarios, gominingScenarioVersions } from '../db/schema.ts';

const safeInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const phase = z.object({ startMonth: z.number().int().min(1).max(600), endMonth: z.number().int().min(1).max(600).nullable(), amountCents: safeInteger }).strict()
  .refine(({ startMonth, endMonth }) => endMonth === null || endMonth >= startMonth, 'Période de palier invalide.');
const scenarioInput = z.object({
  name: z.string().trim().min(1).max(100), startPeriod: z.string(), horizonMonths: z.number().int().min(1).max(600),
  initialHashrateMilliTh: positiveInteger, initialAccumulatedSats: safeInteger, efficiencyMilliWattsPerTh: positiveInteger,
  monthlyNetRewardSatsPerTh: safeInteger, priceMilliCentsPerMilliTh: positiveInteger, btcPriceCents: positiveInteger,
  budgetCategoryId: z.uuid().nullable().optional().default(null), accumulatedBtcPolicy: z.enum(['keep', 'reinvest-at-threshold']), phases: z.array(phase).min(1).max(12),
}).strict().refine(({ phases }) => new Set(phases.map(({ startMonth }) => startMonth)).size === phases.length, 'Paliers dupliqués.');
const scenarioUpdateInput = scenarioInput.extend({ id: z.uuid() }).strict();
const restoreInput = z.object({ scenarioId: z.uuid(), versionId: z.uuid() }).strict();

export type CreateGoMiningScenario = z.input<typeof scenarioInput>;
export type UpdateGoMiningScenario = z.input<typeof scenarioUpdateInput>;
type StoredScenario = typeof gominingScenarios.$inferSelect;
type StoredPhase = typeof gominingContributionPhases.$inferSelect;

function now() { return new Date().toISOString(); }
function snapshotFor(scenario: StoredScenario, phases: StoredPhase[]) {
  return JSON.stringify(scenarioInput.parse({
    name: scenario.name, startPeriod: scenario.startPeriod, horizonMonths: scenario.horizonMonths,
    initialHashrateMilliTh: scenario.initialHashrateMilliTh, initialAccumulatedSats: scenario.initialAccumulatedSats,
    efficiencyMilliWattsPerTh: scenario.efficiencyMilliWattsPerTh, monthlyNetRewardSatsPerTh: scenario.monthlyNetRewardSatsPerTh,
    priceMilliCentsPerMilliTh: scenario.priceMilliCentsPerMilliTh, btcPriceCents: scenario.btcPriceCents,
    budgetCategoryId: scenario.budgetCategoryId, accumulatedBtcPolicy: scenario.accumulatedBtcPolicy,
    phases: phases.map(({ startMonth, endMonth, amountCents }) => ({ startMonth, endMonth, amountCents })),
  }));
}

// Les instantanés historiques sont immuables. Une ancienne migration peut avoir
// produit un instantané incomplet : il ne doit ni casser tout le dashboard ni
// être "complété" avec des valeurs inventées.
function readSnapshot(snapshot: string) {
  try {
    const parsed = scenarioInput.safeParse(JSON.parse(snapshot));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Scénarios privés uniquement : aucun de leurs apports ne crée un mouvement réel. */
export function gominingRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);
  return {
    createScenario(input: CreateGoMiningScenario) {
      const values = scenarioInput.parse(input);
      if (values.budgetCategoryId && !db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, values.budgetCategoryId), eq(categories.ownerId, ownerId), eq(categories.kind, 'expense'))).get()) throw new Error('Catégorie de dépense introuvable.');
      const startPeriod = parseMonth(values.startPeriod);
      const timestamp = now();
      const { phases, ...scenarioValues } = values;
      return db.transaction((tx) => {
        const scenario = tx.insert(gominingScenarios).values({
          ...scenarioValues, id: randomUUID(), ownerId, startPeriod, createdAt: timestamp, updatedAt: timestamp,
        }).returning().get();
        const phaseRows = phases.map((item) => ({ ...item, id: randomUUID(), scenarioId: scenario.id }));
        tx.insert(gominingContributionPhases).values(phaseRows).run();
        tx.insert(gominingScenarioVersions).values({ id: randomUUID(), scenarioId: scenario.id, revision: scenario.revision, snapshot: snapshotFor(scenario, phaseRows), createdAt: timestamp }).run();
        return scenario;
      });
    },
    updateScenario(input: UpdateGoMiningScenario) {
      const values = scenarioUpdateInput.parse(input);
      if (values.budgetCategoryId && !db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, values.budgetCategoryId), eq(categories.ownerId, ownerId), eq(categories.kind, 'expense'))).get()) throw new Error('Catégorie de dépense introuvable.');
      const startPeriod = parseMonth(values.startPeriod);
      const { id, phases, ...scenarioValues } = values;
      return db.transaction((tx) => {
        const timestamp = now();
        const scenario = tx.update(gominingScenarios).set({ ...scenarioValues, startPeriod, revision: sql`${gominingScenarios.revision} + 1`, updatedAt: timestamp })
          .where(and(eq(gominingScenarios.id, id), eq(gominingScenarios.ownerId, ownerId))).returning().get();
        if (!scenario) throw new Error('Scénario introuvable.');
        tx.delete(gominingContributionPhases).where(eq(gominingContributionPhases.scenarioId, id)).run();
        const phaseRows = phases.map((item) => ({ ...item, id: randomUUID(), scenarioId: id }));
        tx.insert(gominingContributionPhases).values(phaseRows).run();
        tx.insert(gominingScenarioVersions).values({ id: randomUUID(), scenarioId: id, revision: scenario.revision, snapshot: snapshotFor(scenario, phaseRows), createdAt: timestamp }).run();
      });
    },
    listScenarios() {
      const scenarios = db.select().from(gominingScenarios).where(eq(gominingScenarios.ownerId, ownerId)).orderBy(asc(gominingScenarios.name)).all();
      const phases = scenarios.length === 0 ? [] : db.select().from(gominingContributionPhases).where(inArray(gominingContributionPhases.scenarioId, scenarios.map(({ id }) => id))).all();
      const versions = scenarios.length === 0 ? [] : db.select().from(gominingScenarioVersions).where(inArray(gominingScenarioVersions.scenarioId, scenarios.map(({ id }) => id))).orderBy(desc(gominingScenarioVersions.revision)).all();
      return scenarios.map((scenario) => {
        const scenarioVersions = versions.filter((item) => item.scenarioId === scenario.id);
        const validVersions = scenarioVersions.flatMap((item) => {
          const snapshot = readSnapshot(item.snapshot);
          return snapshot ? [{ ...item, snapshot }] : [];
        });
        return {
          scenario,
          phases: phases.filter((item) => item.scenarioId === scenario.id).sort((a, b) => a.startMonth - b.startMonth),
          versions: validVersions,
          historyIncomplete: validVersions.length !== scenarioVersions.length,
        };
      });
    },
    setAccumulatedBtcPolicy(id: string, accumulatedBtcPolicy: 'keep' | 'reinvest-at-threshold') {
      const scenarioId = z.uuid().parse(id);
      const policy = z.enum(['keep', 'reinvest-at-threshold']).parse(accumulatedBtcPolicy);
      return db.transaction((tx) => {
        const timestamp = now();
        const scenario = tx.update(gominingScenarios).set({ accumulatedBtcPolicy: policy, revision: sql`${gominingScenarios.revision} + 1`, updatedAt: timestamp })
          .where(and(eq(gominingScenarios.id, scenarioId), eq(gominingScenarios.ownerId, ownerId))).returning().get();
        if (!scenario) throw new Error('Scénario introuvable.');
        const phases = tx.select().from(gominingContributionPhases).where(eq(gominingContributionPhases.scenarioId, scenarioId)).all();
        tx.insert(gominingScenarioVersions).values({ id: randomUUID(), scenarioId, revision: scenario.revision, snapshot: snapshotFor(scenario, phases), createdAt: timestamp }).run();
      });
    },
    restoreVersion(input: z.input<typeof restoreInput>) {
      const { scenarioId, versionId } = restoreInput.parse(input);
      const current = db.select().from(gominingScenarios).where(and(eq(gominingScenarios.id, scenarioId), eq(gominingScenarios.ownerId, ownerId))).get();
      if (!current) throw new Error('Scénario introuvable.');
      const version = db.select().from(gominingScenarioVersions).where(and(eq(gominingScenarioVersions.id, versionId), eq(gominingScenarioVersions.scenarioId, scenarioId))).get();
      if (!version) throw new Error('Version introuvable.');
      const values = scenarioInput.parse(JSON.parse(version.snapshot));
      if (values.budgetCategoryId && !db.select({ id: categories.id }).from(categories).where(and(eq(categories.id, values.budgetCategoryId), eq(categories.ownerId, ownerId), eq(categories.kind, 'expense'))).get()) throw new Error('Catégorie de dépense introuvable.');
      const startPeriod = parseMonth(values.startPeriod);
      const { phases, ...scenarioValues } = values;
      return db.transaction((tx) => {
        const timestamp = now();
        const scenario = tx.update(gominingScenarios).set({ ...scenarioValues, startPeriod, revision: sql`${gominingScenarios.revision} + 1`, updatedAt: timestamp })
          .where(and(eq(gominingScenarios.id, scenarioId), eq(gominingScenarios.ownerId, ownerId))).returning().get();
        if (!scenario) throw new Error('Scénario introuvable.');
        tx.delete(gominingContributionPhases).where(eq(gominingContributionPhases.scenarioId, scenarioId)).run();
        const phaseRows = phases.map((item) => ({ ...item, id: randomUUID(), scenarioId }));
        tx.insert(gominingContributionPhases).values(phaseRows).run();
        tx.insert(gominingScenarioVersions).values({ id: randomUUID(), scenarioId, revision: scenario.revision, snapshot: snapshotFor(scenario, phaseRows), createdAt: timestamp }).run();
      });
    },
    deleteScenario(id: string) {
      const scenarioId = z.uuid().parse(id);
      const deleted = db.delete(gominingScenarios).where(and(eq(gominingScenarios.id, scenarioId), eq(gominingScenarios.ownerId, ownerId))).run();
      if (deleted.changes !== 1) throw new Error('Scénario introuvable.');
    },
  };
}
