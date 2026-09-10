import { describe, expect, it } from 'vitest';
import { bitcoinDecimal, bitcoinEuroValue, euroCents, eurosDecimal, formatEuros, parseBitcoin, parseEuros, sumEuroCents } from '../../app/lib/finance/units';

describe('montants financiers exacts', () => {
  it('accepte les saisies françaises, le point décimal et un découvert', () => {
    expect(parseEuros('1 234,56')).toBe(123456);
    expect(parseEuros('1\u202f234.56')).toBe(123456);
    expect(parseEuros('-23,45')).toBe(-2345);
    expect(parseEuros('0')).toBe(0);
    expect(eurosDecimal(parseEuros('0,29'))).toBe('0.29');
    expect(sumEuroCents([parseEuros('0,10'), parseEuros('0,20')])).toBe(30);
  });

  it.each(['', '1e3', '1,234.56', '12 34,56', 'NaN', 'Infinity', '12 euros', '1,001', '0x10', '01,00'])('refuse une saisie ambiguë ou une précision perdue : %s', (input) => {
    expect(() => parseEuros(input)).toThrow();
  });

  it('conserve le dernier centime à la limite de précision des entiers JS', () => {
    const max = parseEuros('90071992547409,91');
    expect(max).toBe(Number.MAX_SAFE_INTEGER);
    expect(eurosDecimal(max)).toBe('90071992547409.91');
    expect(formatEuros(max)).toBe('90\u202f071\u202f992\u202f547\u202f409,91\u00a0€');
    expect(() => parseEuros('90071992547409,92')).toThrow();
    expect(() => sumEuroCents([max, euroCents(1)])).toThrow();
    expect(() => euroCents(0.1)).toThrow();
  });

  it('représente le satoshi et ne mélange pas EUR et BTC', () => {
    expect(parseBitcoin('0,00000001')).toBe(1);
    expect(bitcoinDecimal(parseBitcoin('1.23456789'))).toBe('1.23456789');
    expect(() => parseBitcoin('0.000000001')).toThrow();
  });

  it('rend explicites l’arrondi commercial et le reliquat d’une contre-valeur BTC', () => {
    // Hypothèses synthétiques de test, sans cours réel ni recommandation.
    expect(bitcoinEuroValue(parseBitcoin('0.00000001'), '50000')).toEqual({ cents: 0, remainderCents: '0.05' });
    expect(bitcoinEuroValue(parseBitcoin('0.0000001'), '50000')).toEqual({ cents: 1, remainderCents: '-0.5' });
    expect(bitcoinEuroValue(parseBitcoin('-0.0000001'), '50000')).toEqual({ cents: -1, remainderCents: '0.5' });
    expect(() => bitcoinEuroValue(parseBitcoin('1'), '0')).toThrow();
  });
});
