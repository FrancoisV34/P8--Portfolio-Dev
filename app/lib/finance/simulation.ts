import Decimal from 'decimal.js';
import { euroCents, sumEuroCents, type EuroCents } from './units.ts';

export const simulationBuckets = ['placements', 'business', 'material', 'projects', 'opportunities', 'debt'] as const;
export type SimulationBucket = typeof simulationBuckets[number];
export type SimulationWeights = Record<SimulationBucket, number>;
export type SimulationProfile = {
  annualPlacementReturnBasisPoints: number;
  businessMonthlyGrowthBasisPoints: number;
  householdExpenseAnnualInflationBasisPoints: number;
};
export type SimulationCharge = { name: string; amountCents: number; frequency: 'once' | 'monthly' | 'quarterly' | 'annual'; startMonth: number; endMonth: number | null };
export type SimulationBusiness = { id: string; openingCashCents: number; monthlyRevenueCents: number; charges: readonly SimulationCharge[] };
export type SimulationDebt = { id: string; outstandingCents: number; monthlyPaymentCents: number; annualRateBasisPoints: number };
export type SimulationGoal = { id: string; targetCents: number; progressCents: number; priority: number };
export type SimulationInput = {
  months: number;
  profile: SimulationProfile;
  openingHouseholdCashCents: number;
  frozenObservedAssetCents: number;
  monthlyHouseholdIncomeCents: number;
  monthlyHouseholdExpenseCents: number;
  gominingContributionCentsByMonth?: readonly number[];
  weights: SimulationWeights;
  businesses: readonly SimulationBusiness[];
  debts: readonly SimulationDebt[];
  goals: readonly SimulationGoal[];
};
export type SimulationMonth = {
  month: number;
  householdIncomeCents: EuroCents;
  householdExpenseCents: EuroCents;
  gominingContributionCents: EuroCents;
  scheduledDebtPaymentCents: EuroCents;
  extraDebtPaymentCents: EuroCents;
  allocableSurplusCents: EuroCents;
  householdCashCents: EuroCents;
  placementCents: EuroCents;
  businessCashCents: EuroCents;
  materialCents: EuroCents;
  debtCents: EuroCents;
  netWealthCents: EuroCents;
};
export type SimulationResult = {
  months: SimulationMonth[];
  finalNetWealthCents: EuroCents;
  minimumHouseholdCashCents: EuroCents;
  finalDebtCents: EuroCents;
  totalInterestCents: EuroCents;
  finalBusinessCashCents: EuroCents;
  goals: Array<{ id: string; projectedProgressCents: EuroCents; targetCents: EuroCents }>;
  freedomRateBasisPoints: number | null;
};

const decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const validFrequencies = new Set<SimulationCharge['frequency']>(['once', 'monthly', 'quarterly', 'annual']);

function cents(value: number) { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Montant de simulation invalide.'); return euroCents(value); }
function bps(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error(`${label} invalide.`); return value; }
function rounded(value: InstanceType<typeof decimal>) { return euroCents(value.toDecimalPlaces(0, decimal.ROUND_HALF_UP).toNumber()); }
function monthlyCompoundRate(annualBasisPoints: number) { return new decimal(1).plus(new decimal(annualBasisPoints).div(10_000)).pow(new decimal(1).div(12)).minus(1); }
function due(charge: SimulationCharge, month: number) {
  if (!Number.isSafeInteger(charge.startMonth) || charge.startMonth < 1 || (charge.endMonth !== null && (!Number.isSafeInteger(charge.endMonth) || charge.endMonth < charge.startMonth)) || !validFrequencies.has(charge.frequency)) throw new Error('Échéance business invalide.');
  if (month < charge.startMonth || (charge.endMonth !== null && month > charge.endMonth)) return false;
  const distance = month - charge.startMonth;
  return charge.frequency === 'once' ? distance === 0 : charge.frequency === 'monthly' ? true : charge.frequency === 'quarterly' ? distance % 3 === 0 : distance % 12 === 0;
}
function allocation(total: EuroCents, weights: SimulationWeights) {
  const entries = simulationBuckets.map((bucket) => [bucket, weights[bucket]] as const);
  if (entries.some(([, value]) => !Number.isSafeInteger(value) || value < 0 || value > 10_000) || entries.reduce((sum, [, value]) => sum + value, 0) !== 10_000) throw new Error('Répartition de simulation invalide.');
  const result = new Map<SimulationBucket, EuroCents>();
  let assigned = 0;
  for (const [bucket, weight] of entries) { const value = euroCents(Math.floor(total * weight / 10_000)); result.set(bucket, value); assigned += value; }
  result.set('debt', euroCents(result.get('debt')! + total - assigned));
  return result;
}

/** Projection mensuelle déterministe. Elle n'écrit jamais les données observées. */
export function projectSimulation(raw: SimulationInput): SimulationResult {
  if (!Number.isSafeInteger(raw.months) || raw.months < 1 || raw.months > 120) throw new Error('Horizon de simulation invalide.');
  const profile = {
    annualPlacementReturnBasisPoints: bps(raw.profile.annualPlacementReturnBasisPoints, 'Rendement placements'),
    businessMonthlyGrowthBasisPoints: bps(raw.profile.businessMonthlyGrowthBasisPoints, 'Croissance business'),
    householdExpenseAnnualInflationBasisPoints: bps(raw.profile.householdExpenseAnnualInflationBasisPoints, 'Inflation dépenses'),
  };
  let householdCash = cents(raw.openingHouseholdCashCents);
  const frozenObservedAssetCents = cents(raw.frozenObservedAssetCents);
  const householdIncome = cents(raw.monthlyHouseholdIncomeCents);
  const initialExpense = cents(raw.monthlyHouseholdExpenseCents);
  let placements = euroCents(0); let material = euroCents(0); let totalInterest = euroCents(0); let minimumHouseholdCash = householdCash;
  const businesses = raw.businesses.map((item) => ({ ...item, cashCents: cents(item.openingCashCents), revenueCents: cents(item.monthlyRevenueCents), charges: item.charges.map((charge) => ({ ...charge, amountCents: cents(charge.amountCents) })) }));
  const debts = raw.debts.map((item) => ({ ...item, remainingCents: cents(item.outstandingCents), paymentCents: cents(item.monthlyPaymentCents), annualRateBasisPoints: bps(item.annualRateBasisPoints, 'Taux de dette') }));
  const goals = raw.goals.map((item) => ({ ...item, targetCents: cents(item.targetCents), progressCents: cents(item.progressCents) })).sort((a, b) => a.priority - b.priority);
  const placementRate = monthlyCompoundRate(profile.annualPlacementReturnBasisPoints);
  const expenseRate = monthlyCompoundRate(profile.householdExpenseAnnualInflationBasisPoints);
  const businessGrowth = new decimal(1).plus(new decimal(profile.businessMonthlyGrowthBasisPoints).div(10_000));
  const rows: SimulationMonth[] = [];

  for (let month = 1; month <= raw.months; month += 1) {
    const householdExpenseCents = rounded(new decimal(initialExpense).mul(new decimal(1).plus(expenseRate).pow(month - 1)));
    const gominingContributionCents = cents(raw.gominingContributionCentsByMonth?.[month - 1] ?? 0);
    let scheduledDebtPaymentCents = euroCents(0);
    for (const debt of debts) {
      if (debt.remainingCents === 0) continue;
      const interest = Math.min(debt.remainingCents, rounded(new decimal(debt.remainingCents).mul(debt.annualRateBasisPoints).div(10_000).div(12)));
      const payment = Math.min(debt.remainingCents + interest, debt.paymentCents);
      debt.remainingCents = euroCents(debt.remainingCents + interest - payment);
      scheduledDebtPaymentCents = euroCents(scheduledDebtPaymentCents + payment);
      totalInterest = euroCents(totalInterest + interest);
    }
    const surplus = euroCents(Math.max(0, householdIncome - householdExpenseCents - gominingContributionCents - scheduledDebtPaymentCents));
    const allocated = allocation(surplus, raw.weights);
    const requestedExtraDebtPaymentCents = allocated.get('debt')!;
    let unpaidDebtAllocationCents = requestedExtraDebtPaymentCents;
    for (const debt of [...debts].sort((a, b) => b.annualRateBasisPoints - a.annualRateBasisPoints)) {
      const payment = Math.min(debt.remainingCents, unpaidDebtAllocationCents);
      debt.remainingCents = euroCents(debt.remainingCents - payment);
      unpaidDebtAllocationCents = euroCents(unpaidDebtAllocationCents - payment);
    }
    const businessAllocation = allocated.get('business')!;
    const unallocatedBusinessCents = businesses.length === 0 ? businessAllocation : euroCents(0);
    const share = businesses.length === 0 ? 0 : Math.floor(businessAllocation / businesses.length);
    let businessRemainder = businessAllocation - share * businesses.length;
    for (const business of businesses) {
      const charges = sumEuroCents(business.charges.filter((charge) => due(charge, month)).map((charge) => charge.amountCents));
      const allocatedCash = euroCents(share + (businessRemainder > 0 ? 1 : 0));
      businessRemainder -= allocatedCash > share ? 1 : 0;
      business.cashCents = euroCents(Math.max(0, business.cashCents + business.revenueCents - charges + allocatedCash));
      business.revenueCents = rounded(new decimal(business.revenueCents).mul(businessGrowth));
    }
    let projectAllocation = allocated.get('projects')!;
    for (const goal of goals) { const contribution = Math.min(Math.max(0, goal.targetCents - goal.progressCents), projectAllocation); goal.progressCents = euroCents(goal.progressCents + contribution); projectAllocation = euroCents(projectAllocation - contribution); }
    placements = rounded(new decimal(placements + allocated.get('placements')!).mul(new decimal(1).plus(placementRate)));
    material = euroCents(material + allocated.get('material')!);
    householdCash = euroCents(householdCash + householdIncome - householdExpenseCents - gominingContributionCents - scheduledDebtPaymentCents - surplus + allocated.get('opportunities')! + unpaidDebtAllocationCents + unallocatedBusinessCents + projectAllocation);
    minimumHouseholdCash = euroCents(Math.min(minimumHouseholdCash, householdCash));
    const debtCents = sumEuroCents(debts.map((debt) => debt.remainingCents));
    const businessCashCents = sumEuroCents(businesses.map((business) => business.cashCents));
    const netWealthCents = euroCents(frozenObservedAssetCents + householdCash + placements + businessCashCents + material - debtCents);
    rows.push({ month, householdIncomeCents: householdIncome, householdExpenseCents, gominingContributionCents, scheduledDebtPaymentCents, extraDebtPaymentCents: euroCents(requestedExtraDebtPaymentCents - unpaidDebtAllocationCents), allocableSurplusCents: surplus, householdCashCents: householdCash, placementCents: placements, businessCashCents, materialCents: material, debtCents, netWealthCents });
  }
  const last = rows.at(-1)!;
  return { months: rows, finalNetWealthCents: last.netWealthCents, minimumHouseholdCashCents: minimumHouseholdCash, finalDebtCents: last.debtCents, totalInterestCents: totalInterest, finalBusinessCashCents: last.businessCashCents, goals: goals.map(({ id, progressCents, targetCents }) => ({ id, projectedProgressCents: progressCents, targetCents })), freedomRateBasisPoints: householdExpenseCentsForFreedom(last.householdExpenseCents, businesses) };
}

function householdExpenseCentsForFreedom(expenseCents: EuroCents, businesses: Array<{ cashCents: EuroCents }>) {
  if (expenseCents === 0) return null;
  return Math.round(sumEuroCents(businesses.map((business) => business.cashCents)) * 10_000 / expenseCents);
}
