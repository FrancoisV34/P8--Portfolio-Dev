import { describe, expect, it } from 'vitest';
import { monthOf, parseCalendarDate, parseMonth } from '../../app/lib/finance/dates';

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
