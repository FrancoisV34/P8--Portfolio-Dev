import { describe, expect, it } from 'vitest';
import { compareMicroBicServiceToSasu } from '../../app/lib/finance/status-comparison';

describe('comparateur micro BIC services contre SASU dividendes', () => {
  it('sépare les cotisations micro, l’IS et les dividendes potentiels avant fiscalité personnelle', () => {
    const result = compareMicroBicServiceToSasu({ annualRevenueCents: 100_000, annualOperatingExpenseCents: 20_000, microBicServiceSocialRateBasisPoints: 2_000, sasuCorporateTaxRateBasisPoints: 2_500 });
    expect(result).toMatchObject({ microSocialContributionsCents: 20_000, microCashBeforePersonalTaxCents: 60_000, sasuOperatingResultCents: 80_000, sasuCorporateTaxCents: 20_000, sasuPotentialGrossDividendsCents: 60_000, differenceCents: 0 });
  });

  it('ne prélève pas d’IS lorsqu’il n’y a pas de bénéfice SASU', () => {
    const result = compareMicroBicServiceToSasu({ annualRevenueCents: 10_000, annualOperatingExpenseCents: 12_000, microBicServiceSocialRateBasisPoints: 2_000, sasuCorporateTaxRateBasisPoints: 2_500 });
    expect(result).toMatchObject({ sasuOperatingResultCents: -2_000, sasuCorporateTaxCents: 0, sasuPotentialGrossDividendsCents: 0 });
  });
});
