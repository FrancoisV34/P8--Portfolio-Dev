declare const calendarDate: unique symbol;
declare const month: unique symbol;
export type CalendarDate = string & { readonly [calendarDate]: true };
export type Month = string & { readonly [month]: true };

/** Date comptable civile : aucune conversion UTC susceptible de changer le jour. */
export function parseCalendarDate(value: string): CalendarDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError('Date attendue au format AAAA-MM-JJ.');
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    throw new RangeError('Date inexistante.');
  }
  return value as CalendarDate;
}

export function parseMonth(value: string): Month {
  if (!/^\d{4}-\d{2}$/.test(value)) throw new TypeError('Période attendue au format AAAA-MM.');
  parseCalendarDate(`${value}-01`);
  return value as Month;
}

export function monthOf(value: CalendarDate): Month {
  return parseMonth(parseCalendarDate(value).slice(0, 7));
}
