import { Decimal } from 'decimal.js';

// Contexte isolé : aucun module ne peut modifier les arrondis de l'application
// en changeant la configuration globale de decimal.js.
const ExactDecimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
declare const unit: unique symbol;
export type EuroCents = number & { readonly [unit]: 'EUR cents' };
export type Satoshis = number & { readonly [unit]: 'satoshis' };

function safeInteger(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError('Montant hors de la précision entière autorisée.');
  return Object.is(value, -0) ? 0 : value;
}

export const euroCents = (value: number) => safeInteger(value) as EuroCents;
export const satoshis = (value: number) => safeInteger(value) as Satoshis;

function parseDecimalInput(input: string): string {
  const value = input.trim().replace(/[\u00a0\u202f]/g, ' ');
  // Accepte 1234,56, 1234.56 et 1 234,56 ; refuse exposants, séparateurs
  // ambigus et groupes incomplets. Aucun parseFloat permissif.
  if (!/^-?(?:0|[1-9]\d*|[1-9]\d{0,2}(?: \d{3})+)(?:[.,]\d+)?$/.test(value)) {
    throw new TypeError('Saisir un nombre décimal, par exemple 1 234,56.');
  }
  return value.replaceAll(' ', '').replace(',', '.');
}

function parseScaled(input: string, decimals: number) {
  const value = new ExactDecimal(parseDecimalInput(input)).times(new ExactDecimal(10).pow(decimals));
  if (!value.isInteger()) throw new RangeError(`La saisie dépasse ${decimals} décimales.`);
  return safeInteger(value.toNumber());
}

/** Saisie exacte : pas d'arrondi silencieux sur un montant fourni par François. */
export const parseEuros = (input: string) => euroCents(parseScaled(input, 2));
export const parseBitcoin = (input: string) => satoshis(parseScaled(input, 8));

export function sumEuroCents(values: readonly EuroCents[]): EuroCents {
  const sum = values.reduce((total, value) => total.plus(euroCents(value)), new ExactDecimal(0));
  return euroCents(sum.toNumber());
}

export function eurosDecimal(value: EuroCents): string {
  return new ExactDecimal(euroCents(value)).div(100).toFixed(2);
}

export function bitcoinDecimal(value: Satoshis): string {
  return new ExactDecimal(satoshis(value)).div(100_000_000).toFixed(8);
}

export function formatEuros(value: EuroCents): string {
  const [whole, fraction] = eurosDecimal(value).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f')},${fraction}\u00a0€`;
}

/** Contre-valeur historique arrondie au centime, avec le reliquat explicite. */
export function bitcoinEuroValue(quantity: Satoshis, eurosPerBitcoin: string) {
  const rate = new ExactDecimal(parseDecimalInput(eurosPerBitcoin));
  if (rate.lte(0)) throw new RangeError('Le cours BTC/EUR doit être strictement positif.');
  const exact = new ExactDecimal(satoshis(quantity)).times(rate).div(1_000_000);
  const rounded = exact.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return { cents: euroCents(rounded.toNumber()), remainderCents: exact.minus(rounded).toFixed() };
}
