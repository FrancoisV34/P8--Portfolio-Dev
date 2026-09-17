import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { and, asc, desc, eq, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { parseMonth } from '../../lib/finance/dates.ts';
import { observedBusinessScore } from '../../lib/finance/business-score.ts';
import { euroCents, sumEuroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { businessActivities, businessEntityMonthlyCash, businessMonthlyMetrics, businessMonthlyProvisions, economicEntities } from '../db/schema.ts';

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
const provisionInput = z.object({ entityId: z.uuid(), period: z.string(), name, amountCents: cents, note: z.string().trim().max(240) }).strict();
const updateProvisionInput = provisionInput.extend({ id: z.uuid() }).strict();
const decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type CreateBusinessActivity = z.input<typeof activityInput>;
export type SetBusinessMetrics = z.input<typeof metricsInput>;
export type SetBusinessCash = z.input<typeof cashInput>;
export type CreateBusinessProvision = z.input<typeof provisionInput>;
export type UpdateBusinessProvision = z.input<typeof updateProvisionInput>;

function now() { return new Date().toISOString(); }

function trailingMonths(period: string, count: number) {
  const [year, month] = parseMonth(period).split('-').map(Number);
  const last = (year - 1) * 12 + month - 1;
  const first = Math.max(0, last - count + 1);
  return Array.from({ length: last - first + 1 }, (_, index) => {
    const value = first + index;
    return parseMonth(`${Math.floor(value / 12) + 1}-${String(value % 12 + 1).padStart(2, '0')}`);
  });
}

function basisPoints(numerator: number, denominator: number) {
  return new decimal(numerator).mul(10_000).div(denominator).toDecimalPlaces(0, decimal.ROUND_HALF_UP).toNumber();
}

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
    createProvision(input: CreateBusinessProvision) {
      const values = provisionInput.parse(input); const period = parseMonth(values.period);
      if (!ownedBusinessEntity(values.entityId)) throw new Error('Entité business introuvable.');
      const timestamp = now(); return db.insert(businessMonthlyProvisions).values({ id: randomUUID(), ownerId, ...values, period, amountCents: euroCents(values.amountCents), createdAt: timestamp, updatedAt: timestamp }).returning().get();
    },
    updateProvision(input: UpdateBusinessProvision) {
      const { id, ...values } = updateProvisionInput.parse(input); const period = parseMonth(values.period);
      if (!db.select().from(businessMonthlyProvisions).where(and(eq(businessMonthlyProvisions.id, id), eq(businessMonthlyProvisions.ownerId, ownerId))).get()) throw new Error('Provision introuvable.');
      if (!ownedBusinessEntity(values.entityId)) throw new Error('Entité business introuvable.');
      return db.update(businessMonthlyProvisions).set({ ...values, period, amountCents: euroCents(values.amountCents), updatedAt: now() }).where(and(eq(businessMonthlyProvisions.id, id), eq(businessMonthlyProvisions.ownerId, ownerId))).returning().get();
    },
    dashboard(periodInput: string) {
      const period = parseMonth(periodInput);
      const activities = db.select().from(businessActivities).where(eq(businessActivities.ownerId, ownerId)).orderBy(asc(businessActivities.name)).all();
      const metrics = db.select().from(businessMonthlyMetrics).where(and(eq(businessMonthlyMetrics.ownerId, ownerId), eq(businessMonthlyMetrics.period, period))).all();
      const provisions = db.select().from(businessMonthlyProvisions).where(and(eq(businessMonthlyProvisions.ownerId, ownerId), eq(businessMonthlyProvisions.period, period))).orderBy(asc(businessMonthlyProvisions.name)).all();
      const historyPeriods = trailingMonths(period, 6);
      const historyMetrics = db.select().from(businessMonthlyMetrics).where(and(
        eq(businessMonthlyMetrics.ownerId, ownerId), gte(businessMonthlyMetrics.period, historyPeriods[0]!), lte(businessMonthlyMetrics.period, period),
      )).all();
      const metricByActivity = new Map(metrics.map((metric) => [metric.activityId, metric]));
      const cashHistory = db.select().from(businessEntityMonthlyCash).where(eq(businessEntityMonthlyCash.ownerId, ownerId)).orderBy(desc(businessEntityMonthlyCash.period), desc(businessEntityMonthlyCash.createdAt)).all();
      const latestCash = new Map<string, typeof cashHistory[number]>();
      for (const cash of cashHistory) if (cash.period <= period && !latestCash.has(cash.entityId)) latestCash.set(cash.entityId, cash);
      const currentCash = cashHistory.filter((cash) => cash.period === period);
      const activityRows = activities.map((activity) => {
        const metric = metricByActivity.get(activity.id) ?? null;
        const mrrHistoryCents = historyPeriods.map((historyPeriod) => historyMetrics.find((historyMetric) => historyMetric.activityId === activity.id && historyMetric.period === historyPeriod)?.mrrCents ?? null);
        return {
          activity,
          metric,
          score: observedBusinessScore({
            revenueCents: metric?.revenueCents ?? 0,
            operatingExpenseCents: metric?.operatingExpenseCents ?? 0,
            mrrHistoryCents,
          }),
        };
      });
      const activeActivityIds = new Set(activities.filter((activity) => activity.isActive).map((activity) => activity.id));
      const activeActivityCount = activeActivityIds.size;
      const mrrMetrics = activityRows.flatMap(({ activity, metric }) => !activity.isActive || metric?.mrrCents === null || metric === null ? [] : [euroCents(metric.mrrCents)]);
      const activeCustomerMetrics = activityRows.flatMap(({ activity, metric }) => !activity.isActive || metric?.activeCustomerCount === null || metric === null ? [] : [metric.activeCustomerCount]);
      const maintenanceMetrics = activityRows.flatMap(({ activity, metric }) => !activity.isActive || metric?.maintenanceMinutes === null || metric === null ? [] : [metric.maintenanceMinutes]);
      const mrrCents = sumEuroCents(mrrMetrics);
      const mrrHistory = historyPeriods.map((historyPeriod) => {
        const known = historyMetrics.filter((metric) => metric.period === historyPeriod && activeActivityIds.has(metric.activityId) && metric.mrrCents !== null);
        return {
          period: historyPeriod, mrrCents: sumEuroCents(known.map((metric) => euroCents(metric.mrrCents!))),
          mrrActivityCount: known.length, activeActivityCount, complete: activeActivityCount > 0 && known.length === activeActivityCount,
        };
      });
      const concentration = activityRows.flatMap(({ activity, metric }) => !activity.isActive || metric?.mrrCents === null || metric === null ? [] : [{
        activity, mrrCents: euroCents(metric.mrrCents), shareBasisPoints: mrrCents === 0 ? null : basisPoints(metric.mrrCents, mrrCents),
      }]);
      const stabilityPeriods = mrrHistory.slice(-4);
      const stability = stabilityPeriods.length === 4 && stabilityPeriods.every((item) => item.complete)
        ? (() => { const from = stabilityPeriods[0]!; const to = stabilityPeriods[3]!; const changeCents = euroCents(to.mrrCents - from.mrrCents); return { fromPeriod: from.period, toPeriod: to.period, changeCents, changeBasisPoints: from.mrrCents === 0 ? null : basisPoints(changeCents, from.mrrCents) }; })()
        : null;
      return {
        period,
        activities: activityRows,
        cash: [...latestCash.values()].sort((left, right) => left.entityId.localeCompare(right.entityId)),
        revenueCents: sumEuroCents(activityRows.flatMap(({ metric }) => metric ? [euroCents(metric.revenueCents)] : [])),
        operatingExpenseCents: sumEuroCents(activityRows.flatMap(({ metric }) => metric ? [euroCents(metric.operatingExpenseCents)] : [])),
        mrrCents,
        annualRecurringRevenueCents: euroCents(mrrCents * 12),
        mrrActivityCount: mrrMetrics.length,
        activeActivityCount,
        mrrHistory,
        concentration,
        stability,
        activeCustomerCount: activeCustomerMetrics.reduce((total, count) => total + count, 0),
        activeCustomerActivityCount: activeCustomerMetrics.length,
        maintenanceMinutes: maintenanceMetrics.reduce((total, minutes) => total + minutes, 0),
        maintenanceActivityCount: maintenanceMetrics.length,
        retainedCashCents: sumEuroCents([...latestCash.values()].map((cash) => euroCents(cash.retainedCashCents))),
        distributedCents: sumEuroCents(currentCash.map((cash) => euroCents(cash.distributedCents))),
        provisions,
        provisionCents: sumEuroCents(provisions.map((provision) => euroCents(provision.amountCents))),
      };
    },
  };
}
