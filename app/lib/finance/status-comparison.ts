import Decimal from 'decimal.js';
import { euroCents, type EuroCents } from './units.ts';

export type MicroVsSasuInput = {
  annualRevenueCents: number;
  annualOperatingExpenseCents: number;
  microBicServiceSocialRateBasisPoints: number;
  sasuCorporateTaxRateBasisPoints: number;
};

export type MicroVsSasuResult = {
  microSocialContributionsCents: EuroCents;
  microCashBeforePersonalTaxCents: EuroCents;
  sasuOperatingResultCents: EuroCents;
  sasuCorporateTaxCents: EuroCents;
  sasuPotentialGrossDividendsCents: EuroCents;
  differenceCents: EuroCents;
  warnings: string[];
};

const decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
function cents(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} invalide.`); return euroCents(value); }
function rate(value: number, label: string) { if (!Number.isSafeInteger(value) || value < 0 || value > 100_000) throw new Error(`${label} invalide.`); return value; }
function rounded(value: InstanceType<typeof decimal>) { return euroCents(value.toDecimalPlaces(0, decimal.ROUND_HALF_UP).toNumber()); }

/** Comparaison informative France : micro BIC services contre SASU à 100 % dividendes. */
export function compareMicroBicServiceToSasu(raw: MicroVsSasuInput): MicroVsSasuResult {
  const revenue = cents(raw.annualRevenueCents, 'Chiffre d’affaires');
  const expenses = cents(raw.annualOperatingExpenseCents, 'Charges');
  const microRate = rate(raw.microBicServiceSocialRateBasisPoints, 'Taux social micro');
  const corporateTaxRate = rate(raw.sasuCorporateTaxRateBasisPoints, 'Taux IS');
  const microSocialContributionsCents = rounded(new decimal(revenue).mul(microRate).div(10_000));
  const microCashBeforePersonalTaxCents = euroCents(revenue - expenses - microSocialContributionsCents);
  const sasuOperatingResultCents = euroCents(revenue - expenses);
  const sasuCorporateTaxCents = sasuOperatingResultCents <= 0 ? euroCents(0) : rounded(new decimal(sasuOperatingResultCents).mul(corporateTaxRate).div(10_000));
  const sasuPotentialGrossDividendsCents = euroCents(Math.max(0, sasuOperatingResultCents - sasuCorporateTaxCents));
  return {
    microSocialContributionsCents, microCashBeforePersonalTaxCents, sasuOperatingResultCents, sasuCorporateTaxCents, sasuPotentialGrossDividendsCents,
    differenceCents: euroCents(sasuPotentialGrossDividendsCents - microCashBeforePersonalTaxCents),
    warnings: [
      'Comparaison indicative : l’impôt personnel sur le revenu et sur les dividendes est exclu.',
      'La SASU est modélisée sans rémunération : le montant est un bénéfice potentiellement distribuable, pas un versement garanti.',
      'TVA, éligibilité au régime micro, frais de création/comptabilité et situation personnelle ne sont pas calculés.',
    ],
  };
}
