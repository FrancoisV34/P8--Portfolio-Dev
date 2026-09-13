import { describe, expect, it } from 'vitest';
import { evaluateCfo, type CfoInput } from '../../app/lib/finance/cfo';

const complete: CfoInput = {
  period: '2026-09', liquidCashCents: 30_000, reserveTargetCents: 10_000, reserveCurrentCents: 10_000,
  unpaidCommitmentCents: 0, debtPaymentCents: 0, businessProvisionCents: 0, gominingContributionCents: 0,
  speculativeAssetCents: 0, grossAssetCents: 30_000, businessCashComplete: true,
  activeProjectCount: 0, projectCapacityStatus: 'compatible',
};

describe('moteur CFO déterministe', () => {
  it('réserve les obligations avant toute autre décision', () => {
    const result = evaluateCfo({ ...complete, unpaidCommitmentCents: 2_000 });
    expect(result).toMatchObject({ priority: 'obligations', obligationCents: 2_000, allocableCashCents: 28_000, allocation: null });
  });

  it('réserve un apport GoMining seulement lorsqu’il est déjà budgété', () => {
    const result = evaluateCfo({ ...complete, gominingContributionCents: 2_000 });
    expect(result).toMatchObject({ priority: 'obligations', obligationCents: 2_000, allocableCashCents: 28_000, allocation: null });
  });

  it('bloque l’allocation tant que la réserve n’est pas atteinte', () => {
    const result = evaluateCfo({ ...complete, reserveCurrentCents: 7_000 });
    expect(result).toMatchObject({ priority: 'reserve', reserveShortfallCents: 3_000, allocableCashCents: 27_000, allocation: null });
  });

  it('ne propose une allocation que dans un contexte complet et conserve chaque centime', () => {
    const result = evaluateCfo(complete);
    expect(result).toMatchObject({ priority: 'allocation', allocableCashCents: 30_000 });
    expect(result.allocation?.map((item) => item.amountCents)).toEqual([10_500, 7_500, 4_500, 3_000, 4_500]);
    expect(result.allocation?.reduce((total, item) => total + item.amountCents, 0)).toBe(result.allocableCashCents);
  });

  it('applique un jeu de poids versionné aux seules nouvelles évaluations', () => {
    const result = evaluateCfo(complete, { version: 'cfo-v2', weights: { placements: 5_000, business: 2_000, material: 1_000, projects: 1_000, opportunities: 1_000 } });
    expect(result.ruleVersion).toBe('cfo-v2');
    expect(result.allocation?.map((item) => item.amountCents)).toEqual([15_000, 6_000, 3_000, 3_000, 3_000]);
  });

  it('bloque la croissance spéculative au-dessus du plafond et signale les données manquantes', () => {
    const speculative = evaluateCfo({ ...complete, speculativeAssetCents: 600, grossAssetCents: 10_000 });
    expect(speculative).toMatchObject({ priority: 'speculative-limit', speculativeShareBasisPoints: 600, allocation: null });
    const incomplete = evaluateCfo({ ...complete, reserveTargetCents: null, businessCashComplete: false, activeProjectCount: 1, projectCapacityStatus: 'unknown' });
    expect(incomplete).toMatchObject({ priority: 'missing-data', allocation: null });
    expect(incomplete.warnings).toHaveLength(3);
  });
});
