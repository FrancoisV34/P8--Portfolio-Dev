import { describe, expect, it } from 'vitest';
import { dayNumber, monthOf, parseCalendarDate, parseMonth } from '../../app/lib/finance/dates';

describe('dates comptables civiles', () => {
  it('rattache une date à son mois sans décalage de fuseau', () => {
    expect(monthOf(parseCalendarDate('2026-09-01'))).toBe('2026-09');
    expect(parseCalendarDate('2024-02-29')).toBe('2024-02-29');
    expect(parseCalendarDate('2000-02-29')).toBe('2000-02-29');
    expect(parseMonth('2026-12')).toBe('2026-12');
  });
  it.each(['2026-02-29', '1900-02-29', '2026-04-31', '2026-00-01', '2026-01-00', '0000-01-01', '09/09/2026', '2026-09-01T00:00:00Z'])('refuse une date inexistante ou un autre format : %s', (date) => {
    expect(() => parseCalendarDate(date)).toThrow();
  });
  it.each(['2026-13', '2026-1', '2026-01-01'])('refuse une période invalide : %s', (month) => {
    expect(() => parseMonth(month)).toThrow();
  });
});

describe('numéro de jour — l’abscisse des courbes datées', () => {
  it('compte les jours réels entre deux dates', () => {
    // Le cas qui décide de tout : 19 jours, puis 210. Une courbe à points
    // équidistants donnerait la même largeur aux deux, et afficherait une pente
    // finale onze fois trop raide.
    expect(dayNumber('2026-02-03') - dayNumber('2026-01-15')).toBe(19);
    expect(dayNumber('2026-09-01') - dayNumber('2026-02-03')).toBe(210);
  });

  it('tient compte des années bissextiles', () => {
    // 2024 est bissextile, 2026 ne l’est pas. Une arithmétique en mois de
    // 30 jours, ou un février figé à 28, se trompe ici.
    expect(dayNumber('2024-03-01') - dayNumber('2024-02-28')).toBe(2);
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
    expect(dayNumber('2025-01-01') - dayNumber('2024-01-01')).toBe(366);
    expect(dayNumber('2027-01-01') - dayNumber('2026-01-01')).toBe(365);
  });

  it('franchit les siècles sans décalage', () => {
    // 1900 n’est pas bissextile, 2000 l’est : la règle des 400 ans.
    expect(dayNumber('1900-03-01') - dayNumber('1900-02-28')).toBe(1);
    expect(dayNumber('2000-03-01') - dayNumber('2000-02-28')).toBe(2);
  });

  it('croît strictement avec la date', () => {
    const jours = ['2025-12-31', '2026-01-01', '2026-06-15', '2026-12-31'].map(dayNumber);
    expect(jours).toEqual([...jours].sort((a, b) => a - b));
    expect(new Set(jours).size).toBe(jours.length);
  });

  it('refuse ce que le reste du module refuse', () => {
    expect(() => dayNumber('2026-02-30')).toThrow(RangeError);
    expect(() => dayNumber('2026-9-1')).toThrow(TypeError);
  });
});
