import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { parseCalendarDate } from '../../lib/finance/dates.ts';
import { projectDebtSchedule } from '../../lib/finance/debt.ts';
import { euroCents, sumEuroCents } from '../../lib/finance/units.ts';
import type { FinanceDatabase } from '../db/connection.ts';
import { economicEntities, wealthAssetValuations, wealthAssets, wealthDebtBalances, wealthDebts } from '../db/schema.ts';

const name = z.string().trim().min(1).max(100);
const cents = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const positiveCents = cents.refine((value) => value > 0, 'Montant requis.');
const date = z.string().transform((value, context) => {
  try { return parseCalendarDate(value); } catch { context.addIssue({ code: 'custom', message: 'Date invalide.' }); return z.NEVER; }
});
const assetInput = z.object({ entityId: z.uuid(), name, assetClass: z.enum(['securities', 'crypto', 'real_estate', 'business', 'other']), source: z.enum(['manual', 'gomining-observed-btc']).default('manual'), observedBtcSats: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).nullable().optional().default(null), quantityDescription: z.string().trim().max(80), contributedCents: cents, valuedOn: date, valueCents: cents, note: z.string().trim().max(240) }).strict()
  .refine(({ source, assetClass, observedBtcSats }) => source === 'manual' ? observedBtcSats === null : assetClass === 'crypto' && observedBtcSats !== null, 'Position BTC GoMining invalide.');
const valuationInput = z.object({ assetId: z.uuid(), valuedOn: date, valueCents: cents, note: z.string().trim().max(240) }).strict();
const debtInput = z.object({ entityId: z.uuid(), name, asOfDate: date, outstandingCents: cents, monthlyPaymentCents: positiveCents, annualRateBasisPoints: z.number().int().min(0).max(100_000), remainingMonths: z.number().int().min(1).max(600) }).strict();
const debtBalanceInput = debtInput.omit({ entityId: true, name: true }).extend({ debtId: z.uuid() }).strict();

export type CreateWealthAsset = z.input<typeof assetInput>;
export type AddWealthValuation = z.input<typeof valuationInput>;
export type CreateWealthDebt = z.input<typeof debtInput>;
export type AddWealthDebtBalance = z.input<typeof debtBalanceInput>;

function now() { return new Date().toISOString(); }

/** Toutes les lectures et écritures sont restreintes au propriétaire de session. */
export function wealthRepository(db: FinanceDatabase, ownerId: string) {
  z.string().trim().min(1).max(128).parse(ownerId);

  function ownedEntity(entityId: string) {
    return db.select({ id: economicEntities.id }).from(economicEntities).where(and(eq(economicEntities.id, entityId), eq(economicEntities.ownerId, ownerId))).get();
  }
  function ownedAsset(assetId: string) {
    return db.select().from(wealthAssets).where(and(eq(wealthAssets.id, assetId), eq(wealthAssets.ownerId, ownerId))).get();
  }
  function ownedDebt(debtId: string) {
    return db.select().from(wealthDebts).where(and(eq(wealthDebts.id, debtId), eq(wealthDebts.ownerId, ownerId))).get();
  }

  return {
    createAsset(input: CreateWealthAsset) {
      const values = assetInput.parse(input);
      if (!ownedEntity(values.entityId)) throw new Error('Entité introuvable.');
      const timestamp = now();
      return db.transaction((tx) => {
        const asset = tx.insert(wealthAssets).values({
          id: randomUUID(), ownerId, entityId: values.entityId, name: values.name, assetClass: values.assetClass,
          source: values.source, observedBtcSats: values.observedBtcSats, quantityDescription: values.quantityDescription,
          contributedCents: euroCents(values.contributedCents), createdAt: timestamp, updatedAt: timestamp,
        }).returning().get();
        const valuation = tx.insert(wealthAssetValuations).values({ id: randomUUID(), ownerId, assetId: asset.id, valuedOn: values.valuedOn, valueCents: euroCents(values.valueCents), note: values.note, createdAt: timestamp }).returning().get();
        return { asset, valuation };
      });
    },
    addValuation(input: AddWealthValuation) {
      const values = valuationInput.parse(input);
      if (!ownedAsset(values.assetId)) throw new Error('Actif introuvable.');
      return db.insert(wealthAssetValuations).values({ id: randomUUID(), ownerId, ...values, valueCents: euroCents(values.valueCents), createdAt: now() }).returning().get();
    },
    createDebt(input: CreateWealthDebt) {
      const values = debtInput.parse(input);
      if (!ownedEntity(values.entityId)) throw new Error('Entité introuvable.');
      projectDebtSchedule(values);
      const timestamp = now();
      return db.transaction((tx) => {
        const debt = tx.insert(wealthDebts).values({ id: randomUUID(), ownerId, entityId: values.entityId, name: values.name, createdAt: timestamp, updatedAt: timestamp }).returning().get();
        const balance = tx.insert(wealthDebtBalances).values({ id: randomUUID(), ownerId, debtId: debt.id, asOfDate: values.asOfDate, outstandingCents: euroCents(values.outstandingCents), monthlyPaymentCents: euroCents(values.monthlyPaymentCents), annualRateBasisPoints: values.annualRateBasisPoints, remainingMonths: values.remainingMonths, createdAt: timestamp }).returning().get();
        return { debt, balance };
      });
    },
    addDebtBalance(input: AddWealthDebtBalance) {
      const values = debtBalanceInput.parse(input);
      if (!ownedDebt(values.debtId)) throw new Error('Dette introuvable.');
      projectDebtSchedule(values);
      return db.insert(wealthDebtBalances).values({ id: randomUUID(), ownerId, ...values, outstandingCents: euroCents(values.outstandingCents), monthlyPaymentCents: euroCents(values.monthlyPaymentCents), createdAt: now() }).returning().get();
    },
    dashboard(asOfDateInput: string) {
      const asOfDate = parseCalendarDate(asOfDateInput);
      const assetRows = db.select().from(wealthAssets).where(eq(wealthAssets.ownerId, ownerId)).orderBy(asc(wealthAssets.name)).all();
      const valuationHistory = db.select().from(wealthAssetValuations).where(eq(wealthAssetValuations.ownerId, ownerId)).orderBy(desc(wealthAssetValuations.valuedOn), desc(wealthAssetValuations.createdAt)).all();
      const valuations = valuationHistory.filter((valuation) => valuation.valuedOn <= asOfDate);
      const latestValuation = new Map<string, typeof valuations[number]>();
      for (const valuation of valuations) if (!latestValuation.has(valuation.assetId)) latestValuation.set(valuation.assetId, valuation);
      const debtRows = db.select().from(wealthDebts).where(eq(wealthDebts.ownerId, ownerId)).orderBy(asc(wealthDebts.name)).all();
      const balanceHistory = db.select().from(wealthDebtBalances).where(eq(wealthDebtBalances.ownerId, ownerId)).orderBy(desc(wealthDebtBalances.asOfDate), desc(wealthDebtBalances.createdAt)).all();
      const balances = balanceHistory.filter((balance) => balance.asOfDate <= asOfDate);
      const latestBalance = new Map<string, typeof balances[number]>();
      for (const balance of balances) if (!latestBalance.has(balance.debtId)) latestBalance.set(balance.debtId, balance);
      const assets = assetRows.map((asset) => ({ asset, valuation: latestValuation.get(asset.id) ?? null, valuations: valuationHistory.filter((valuation) => valuation.assetId === asset.id) }));
      const debts = debtRows.map((debt) => ({ debt, balance: latestBalance.get(debt.id) ?? null, balances: balanceHistory.filter((balance) => balance.debtId === debt.id) }));
      return {
        asOfDate, assets, debts,
        manualAssetCents: sumEuroCents(assets.flatMap(({ valuation }) => valuation ? [euroCents(valuation.valueCents)] : [])),
        debtCents: sumEuroCents(debts.flatMap(({ balance }) => balance ? [euroCents(balance.outstandingCents)] : [])),
      };
    },
  };
}
