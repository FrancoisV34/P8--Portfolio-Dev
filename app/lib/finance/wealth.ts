import Decimal from 'decimal.js';
import { euroCents, sumEuroCents, type EuroCents } from './units.ts';

export const observedAllocationClasses = ['liquidities', 'securities', 'crypto', 'real_estate', 'business', 'other'] as const;
export type ObservedAllocationClass = typeof observedAllocationClasses[number];

type ValuedAsset = { assetClass: Exclude<ObservedAllocationClass, 'liquidities'>; valueCents: number };

const decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Répartition constatée, sans objectif ni recommandation d'allocation. */
export function observedWealthAllocation(liquidCents: number, assets: readonly ValuedAsset[]) {
  const totals = new Map<ObservedAllocationClass, EuroCents>([['liquidities', euroCents(liquidCents)]]);
  for (const asset of assets) totals.set(asset.assetClass, sumEuroCents([totals.get(asset.assetClass) ?? euroCents(0), euroCents(asset.valueCents)]));
  const rows = observedAllocationClasses.map((assetClass) => ({ assetClass, amountCents: totals.get(assetClass) ?? euroCents(0) }));
  const totalCents = sumEuroCents(rows.map((row) => row.amountCents));
  return {
    totalCents,
    rows: rows.filter((row) => row.amountCents !== 0).map((row) => ({
      ...row,
      shareBasisPoints: totalCents === 0 ? null : new decimal(row.amountCents).mul(10_000).div(totalCents).toDecimalPlaces(0, decimal.ROUND_HALF_UP).toNumber(),
    })),
  };
}
