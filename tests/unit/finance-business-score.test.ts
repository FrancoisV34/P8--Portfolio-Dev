import { describe, expect, it } from 'vitest';
import { observedBusinessScore } from '../../app/lib/finance/business-score';

describe('indice business observé', () => {
  it('combine la marge et la tendance MRR avec une couverture complète', () => {
    expect(observedBusinessScore({ revenueCents: 10_000, operatingExpenseCents: 7_500, mrrHistoryCents: [10_000, 10_500, 10_750, 11_000] })).toEqual({
      scoreBasisPoints: 6_250,
      coverageBasisPoints: 10_000,
      components: [
        { key: 'operating-margin', label: 'Marge opérationnelle du mois', observedBasisPoints: 2_500, scoreBasisPoints: 5_000 },
        { key: 'mrr-trend', label: 'Évolution du MRR sur trois mois', observedBasisPoints: 1_000, scoreBasisPoints: 7_500 },
      ],
    });
  });

  it('ne pénalise pas une série MRR inconnue : elle réduit seulement la couverture', () => {
    expect(observedBusinessScore({ revenueCents: 10_000, operatingExpenseCents: 7_500, mrrHistoryCents: [10_000, null, 10_750, 11_000] })).toEqual({
      scoreBasisPoints: 5_000,
      coverageBasisPoints: 5_000,
      components: [{ key: 'operating-margin', label: 'Marge opérationnelle du mois', observedBasisPoints: 2_500, scoreBasisPoints: 5_000 }],
    });
  });

  it('ne produit aucun score sans signal calculable', () => {
    expect(observedBusinessScore({ revenueCents: 0, operatingExpenseCents: 0, mrrHistoryCents: [null, null, null, null] })).toEqual({ scoreBasisPoints: null, coverageBasisPoints: 0, components: [] });
  });
});
