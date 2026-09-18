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

/**
 * Le numéro de jour d'une date civile — l'abscisse des courbes datées.
 *
 * ⚠️ Aucun `Date` : l'algorithme est purement arithmétique (jours depuis l'ère
 * civile, Howard Hinnant). Passer par `new Date('2026-09-01')` parse en UTC et
 * décale le jour à l'ouest de Greenwich ; c'est exactement ce que le reste de ce
 * fichier refuse, et une courbe dont les abscisses glissent d'un jour selon le
 * fuseau ne vaut rien.
 *
 * La valeur absolue n'a pas de sens ; seuls les ÉCARTS en ont, et ils sont
 * exacts — années bissextiles comprises.
 */
export function dayNumber(value: string): number {
  const date = parseCalendarDate(value);
  const [rawYear, rawMonth, day] = date.split('-').map(Number);
  // Mars devient le premier mois : le 29 février tombe alors en fin d'année,
  // et le calcul n'a plus de cas particulier.
  const year = rawYear - (rawMonth <= 2 ? 1 : 0);
  const era = Math.floor(year / 400);
  const yearOfEra = year - era * 400;
  const dayOfYear = Math.floor((153 * (rawMonth + (rawMonth > 2 ? -3 : 9)) + 2) / 5) + day - 1;
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146_097 + dayOfEra - 719_468;
}
