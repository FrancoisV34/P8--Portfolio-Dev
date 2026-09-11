import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseMonth } from '../../lib/finance/dates.ts';
import { euroCents, sumEuroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { businessActivities, businessEntityMonthlyCash, businessMonthlyMetrics, economicEntities } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const mrrCents = z.number().int().min(0).max(Math.floor(Number.MAX_SAFE_INTEGER / 12));
const optional = <T extends z.ZodType>(schema: T) => schema.nullable().optional().default(null);
const activityInput = z.object({ entityId: z.uuid(), name }).strict();
const metricsInput = z.object({
  activityId: z.uuid(), period: z.string(), revenueCents: cents, operatingExpenseCents: cents,
  mrrCents: optional(mrrCents), activeCustomerCount: optional(z.number().int().min(0).max(1_000_000_000)), maintenanceMinutes: optional(z.number().int().min(0).max(44_640)),
}).strict();
const cashInput = z.object({ entityId: z.uuid(), period: z.string(), retainedCashCents: cents, distributedCents: cents }).strict();

export type CreateBusinessActivity = z.input<typeof activityInput>;
export type SetBusinessMetrics = z.input<typeof metricsInput>;
export type SetBusinessCash = z.input<typeof cashInput>;

function now() { return new Date().toISOString(); }

/** Données observées business, isolées du journal et du foyer. */
export function businessRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);

  function ownedBusinessEntity(entityId: string) {
    return db.select().from(economicEntities).where(and(
      eq(economicEntities.id, entityId), eq(economicEntities.ownerId, ownerId), eq(economicEntities.type, 'business'),
    )).get();
  }
  function ownedActivity(activityId: string) {
    return db.select().from(businessActivities).where(and(eq(businessActivities.id, activityId), eq(businessActivities.ownerId, ownerId))).get();
  }

  return {
    createActivity(input: CreateBusinessActivity) {
      const values = activityInput.parse(input);
      if (!ownedBusinessEntity(values.entityId)) throw new Error('Entité business introuvable.');
      const timestamp = now();
      return db.insert(businessActivities).values({ id: randomUUID(), ownerId, ...values, createdAt: timestamp, updatedAt: timestamp }).returning().get();
    },
    setMetrics(input: SetBusinessMetrics) {
      const values = metricsInput.parse(input);
      const period = parseMonth(values.period);
      if (!ownedActivity(values.activityId)) throw new Error('Activité introuvable.');
      const timestamp = now();
      const existing = db.select({ id: businessMonthlyMetrics.id }).from(businessMonthlyMetrics).where(and(
        eq(businessMonthlyMetrics.ownerId, ownerId), eq(businessMonthlyMetrics.activityId, values.activityId), eq(businessMonthlyMetrics.period, period),
      )).get();
      const changes = {
        revenueCents: euroCents(values.revenueCents), operatingExpenseCents: euroCents(values.operatingExpenseCents),
        mrrCents: values.mrrCents === null ? null : euroCents(values.mrrCents), activeCustomerCount: values.activeCustomerCount,
        maintenanceMinutes: values.maintenanceMinutes, updatedAt: timestamp,
      };
      return existing
        ? db.update(businessMonthlyMetrics).set(changes).where(eq(businessMonthlyMetrics.id, existing.id)).returning().get()
        : db.insert(businessMonthlyMetrics).values({ id: randomUUID(), ownerId, activityId: values.activityId, period, ...changes, createdAt: timestamp }).returning().get();
    },
    setEntityCash(input: SetBusinessCash) {
      const values = cashInput.parse(input);
      const period = parseMonth(values.period);
      if (!ownedBusinessEntity(values.entityId)) throw new Error('Entité business introuvable.');
      const timestamp = now();
      const existing = db.select({ id: businessEntityMonthlyCash.id }).from(businessEntityMonthlyCash).where(and(
        eq(businessEntityMonthlyCash.ownerId, ownerId), eq(businessEntityMonthlyCash.entityId, values.entityId), eq(businessEntityMonthlyCash.period, period),
      )).get();
      const changes = { retainedCashCents: euroCents(values.retainedCashCents), distributedCents: euroCents(values.distributedCents), updatedAt: timestamp };
      return existing
        ? db.update(businessEntityMonthlyCash).set(changes).where(eq(businessEntityMonthlyCash.id, existing.id)).returning().get()
        : db.insert(businessEntityMonthlyCash).values({ id: randomUUID(), ownerId, entityId: values.entityId, period, ...changes, createdAt: timestamp }).returning().get();
    },
    dashboard(periodInput: string) {
      const period = parseMonth(periodInput);
      const activities = db.select().from(businessActivities).where(eq(businessActivities.ownerId, ownerId)).orderBy(asc(businessActivities.name)).all();
      const metrics = db.select().from(businessMonthlyMetrics).where(and(eq(businessMonthlyMetrics.ownerId, ownerId), eq(businessMonthlyMetrics.period, period))).all();
      const metricByActivity = new Map(metrics.map((metric) => [metric.activityId, metric]));
      const cashHistory = db.select().from(businessEntityMonthlyCash).where(eq(businessEntityMonthlyCash.ownerId, ownerId)).orderBy(desc(businessEntityMonthlyCash.period), desc(businessEntityMonthlyCash.createdAt)).all();
      const latestCash = new Map<string, typeof cashHistory[number]>();
      for (const cash of cashHistory) if (cash.period <= period && !latestCash.has(cash.entityId)) latestCash.set(cash.entityId, cash);
      const currentCash = cashHistory.filter((cash) => cash.period === period);
      const activityRows = activities.map((activity) => ({ activity, metric: metricByActivity.get(activity.id) ?? null }));
      const mrrMetrics = activityRows.flatMap(({ metric }) => metric?.mrrCents === null || metric === null ? [] : [euroCents(metric.mrrCents)]);
      const activeCustomerMetrics = activityRows.flatMap(({ metric }) => metric?.activeCustomerCount === null || metric === null ? [] : [metric.activeCustomerCount]);
      const maintenanceMetrics = activityRows.flatMap(({ metric }) => metric?.maintenanceMinutes === null || metric === null ? [] : [metric.maintenanceMinutes]);
      const mrrCents = sumEuroCents(mrrMetrics);
      return {
        period,
        activities: activityRows,
        cash: [...latestCash.values()].sort((left, right) => left.entityId.localeCompare(right.entityId)),
        revenueCents: sumEuroCents(activityRows.flatMap(({ metric }) => metric ? [euroCents(metric.revenueCents)] : [])),
        operatingExpenseCents: sumEuroCents(activityRows.flatMap(({ metric }) => metric ? [euroCents(metric.operatingExpenseCents)] : [])),
        mrrCents,
        annualRecurringRevenueCents: euroCents(mrrCents * 12),
        mrrActivityCount: mrrMetrics.length,
        activeCustomerCount: activeCustomerMetrics.reduce((total, count) => total + count, 0),
        activeCustomerActivityCount: activeCustomerMetrics.length,
        maintenanceMinutes: maintenanceMetrics.reduce((total, minutes) => total + minutes, 0),
        maintenanceActivityCount: maintenanceMetrics.length,
        retainedCashCents: sumEuroCents([...latestCash.values()].map((cash) => euroCents(cash.retainedCashCents))),
        distributedCents: sumEuroCents(currentCash.map((cash) => euroCents(cash.distributedCents))),
      };
    },
  };
}
