import { describe, expect, it } from 'vitest';
import { observedWealthAllocation } from '../../app/lib/finance/wealth.ts';

describe('allocation patrimoniale observée', () => {
  it('répartit les liquidités et valorisations par classe sans cible', () => {
    expect(observedWealthAllocation(1_000, [
      { assetClass: 'securities', valueCents: 2_000 },
      { assetClass: 'crypto', valueCents: 1_000 },
    ])).toEqual({ totalCents: 4_000, rows: [
      { assetClass: 'liquidities', amountCents: 1_000, shareBasisPoints: 2_500 },
      { assetClass: 'securities', amountCents: 2_000, shareBasisPoints: 5_000 },
      { assetClass: 'crypto', amountCents: 1_000, shareBasisPoints: 2_500 },
    ] });
  });

  it('laisse l’allocation explicite quand aucune valeur n’est disponible', () => {
    expect(observedWealthAllocation(0, [])).toEqual({ totalCents: 0, rows: [] });
  });
});
