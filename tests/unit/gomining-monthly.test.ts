import { describe, expect, it } from 'vitest';
import { projectMonthlyGoMining, type MonthlyGoMiningScenario } from '../../app/lib/gomining/monthly';

const base: MonthlyGoMiningScenario = {
  horizonMonths: 4,
  initialHashrateMilliTh: 9_000,
  initialAccumulatedSats: 10_000,
  thresholdHashrateMilliTh: 10_000,
  monthlyNetRewardSatsPerTh: 0,
  priceMilliCentsPerMilliTh: 100_000,
  btcPriceCents: 100_000_000,
  contributionPhases: [{ startMonth: 1, endMonth: null, amountCents: 100_000 }],
  accumulatedBtcPolicy: 'keep',
};

describe('projection GoMining mensuelle', () => {
  it('conserve ou réinvestit le stock BTC à la bascule selon D06', () => {
    const kept = projectMonthlyGoMining(base);
    const reinvested = projectMonthlyGoMining({ ...base, accumulatedBtcPolicy: 'reinvest-at-threshold' });
    expect(kept.thresholdReachedMonth).toBe(1);
    expect(kept.retainedBtcSats).toBe(10_000);
    expect(kept.reinvestedBtcSats).toBe(0);
    expect(reinvested.retainedBtcSats).toBe(0);
    expect(reinvested.reinvestedBtcSats).toBe(10_000);
    expect(reinvested.finalHashrateMilliTh).toBeGreaterThan(kept.finalHashrateMilliTh);
  });

  it('applique les apports en fin de mois et les nouveaux gains seulement après le seuil', () => {
    const result = projectMonthlyGoMining({
      ...base, horizonMonths: 2, initialHashrateMilliTh: 9_000, initialAccumulatedSats: 0,
      monthlyNetRewardSatsPerTh: 1_000, contributionPhases: [{ startMonth: 1, endMonth: null, amountCents: 100_000 }],
    });
    expect(result.months[0]).toMatchObject({ startHashrateMilliTh: 9_000, rewardSats: 9_000, endHashrateMilliTh: 10_000, accumulatedBtcSats: 9_000 });
    expect(result.months[1].rewardSats).toBe(10_000);
    expect(result.months[1].reinvestedBtcSats).toBe(10_000);
  });

  it('gère un seuil jamais atteint, les récompenses nulles et les paliers bornés', () => {
    const result = projectMonthlyGoMining({
      ...base, horizonMonths: 3, initialHashrateMilliTh: 1_000, initialAccumulatedSats: 0, thresholdHashrateMilliTh: 9_999,
      contributionPhases: [{ startMonth: 1, endMonth: 1, amountCents: 100 }],
    });
    expect(result.thresholdReachedMonth).toBeNull();
    expect(result.totalRewardSats).toBe(0);
    expect(result.totalContributionCents).toBe(100);
    expect(result.reinvestedBtcSats).toBe(0);
  });
});
