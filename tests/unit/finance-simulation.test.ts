import { describe, expect, it } from 'vitest';
import { projectSimulation, type SimulationInput } from '../../app/lib/finance/simulation';

const base: SimulationInput = {
  months: 2,
  profile: { annualPlacementReturnBasisPoints: 0, businessMonthlyGrowthBasisPoints: 0, householdExpenseAnnualInflationBasisPoints: 0 },
  openingHouseholdCashCents: 10_000, frozenObservedAssetCents: 50_000, monthlyHouseholdIncomeCents: 20_000, monthlyHouseholdExpenseCents: 5_000,
  weights: { placements: 5_000, business: 0, material: 0, projects: 0, opportunities: 0, debt: 5_000 },
  businesses: [], debts: [{ id: 'debt', outstandingCents: 20_000, monthlyPaymentCents: 1_000, annualRateBasisPoints: 0 }], goals: [],
};

describe('moteur de simulation mensuelle', () => {
  it('répartit un surplus identique et rembourse la dette avant toute dette moins chère', () => {
    const result = projectSimulation(base);
    expect(result.months[0]).toMatchObject({ allocableSurplusCents: 14_000, scheduledDebtPaymentCents: 1_000, extraDebtPaymentCents: 7_000, placementCents: 7_000, debtCents: 12_000, householdCashCents: 10_000 });
    expect(result).toMatchObject({ finalDebtCents: 4_000, finalNetWealthCents: 70_000 });
  });

  it('applique les charges business seulement aux échéances définies et conserve le cash dans le business', () => {
    const result = projectSimulation({ ...base, months: 3, weights: { placements: 0, business: 10_000, material: 0, projects: 0, opportunities: 0, debt: 0 }, debts: [], businesses: [{ id: 'app', openingCashCents: 1_000, monthlyRevenueCents: 10_000, charges: [{ name: 'SaaS', amountCents: 2_000, frequency: 'monthly', startMonth: 1, endMonth: null }, { name: 'Licence', amountCents: 3_000, frequency: 'quarterly', startMonth: 1, endMonth: null }] }] });
    expect(result.months.map((month) => month.businessCashCents)).toEqual([21_000, 44_000, 67_000]);
    expect(result.months.map((month) => month.businessMonthlyNetCents)).toEqual([5_000, 8_000, 8_000]);
    expect(result.months[0]?.householdCashCents).toBe(10_000);
  });

  it('laisse chaque activité déroger explicitement à la croissance du profil', () => {
    const result = projectSimulation({ ...base, months: 2, profile: { ...base.profile, businessMonthlyGrowthBasisPoints: 1_000 }, debts: [], businesses: [{ id: 'stable', openingCashCents: 0, monthlyRevenueCents: 10_000, monthlyGrowthBasisPoints: 0, charges: [] }, { id: 'growth', openingCashCents: 0, monthlyRevenueCents: 10_000, monthlyGrowthBasisPoints: 2_000, charges: [] }] });
    expect(result.months[1]?.businessMonthlyNetCents).toBe(22_000);
  });

  it('calcule le taux de liberté depuis le dégagement mensuel, sans transformer le cash business retenu en revenu foyer', () => {
    const result = projectSimulation({ ...base, months: 1, debts: [], weights: { placements: 0, business: 0, material: 0, projects: 0, opportunities: 10_000, debt: 0 }, businesses: [{ id: 'app', openingCashCents: 500_000, monthlyRevenueCents: 10_000, charges: [{ name: 'Hébergement', amountCents: 4_000, frequency: 'monthly', startMonth: 1, endMonth: null }] }] });
    expect(result).toMatchObject({ finalBusinessCashCents: 506_000, finalBusinessMonthlyNetCents: 6_000, freedomRateBasisPoints: 12_000 });
    expect(result.months[0]?.householdCashCents).toBe(25_000);
  });

  it('applique le rendement aux seuls nouveaux placements et sert les objectifs par priorité', () => {
    const result = projectSimulation({ ...base, months: 1, frozenObservedAssetCents: 50_000, debts: [], weights: { placements: 5_000, business: 0, material: 0, projects: 5_000, opportunities: 0, debt: 0 }, profile: { ...base.profile, annualPlacementReturnBasisPoints: 1_200 }, goals: [{ id: 'first', targetCents: 4_000, progressCents: 0, priority: 1 }, { id: 'second', targetCents: 10_000, progressCents: 0, priority: 2 }] });
    expect(result.months[0]?.placementCents).toBeGreaterThan(7_500);
    expect(result.goals).toEqual([{ id: 'first', targetCents: 4_000, projectedProgressCents: 4_000 }, { id: 'second', targetCents: 10_000, projectedProgressCents: 3_500 }]);
  });

  it('retire un unique apport GoMining sélectionné du cash disponible', () => {
    const result = projectSimulation({ ...base, months: 1, debts: [], gominingContributionCentsByMonth: [2_000], weights: { placements: 0, business: 0, material: 0, projects: 0, opportunities: 10_000, debt: 0 } });
    expect(result.months[0]).toMatchObject({ gominingContributionCents: 2_000, allocableSurplusCents: 13_000, householdCashCents: 23_000 });
  });
});
