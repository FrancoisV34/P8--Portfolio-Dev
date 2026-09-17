import { parseCalendarDate, parseMonth } from './dates.ts';
import { euroCents } from './units.ts';

type Commitment = { id: string; name: string; plannedAmountCents: number; dueDay: number; startPeriod: string; endPeriod: string | null };
type Goal = { id: string; name: string; targetDate: string | null; priority: number };
type Rule = { id: string; name: string; validTo: string | null };
type Debt = { id: string; name: string; monthlyPaymentCents: number };
type BusinessSignal = { id: string; name: string; revenueCents: number; operatingExpenseCents: number };

export type FinancialCalendarEvent = {
  id: string;
  date: string;
  kind: 'commitment' | 'goal' | 'regulation';
  title: string;
  detail: string;
  amountCents: number | null;
};

export type FinancialCalendarUndated = {
  id: string;
  kind: 'debt' | 'business';
  title: string;
  detail: string;
  amountCents: number | null;
};

function lastDay(period: string) {
  const value = parseMonth(period);
  const [year, month] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Ne crée que des événements dont la date existe dans les données. Les dettes
 * et observations business sans jour d'échéance restent volontairement hors du
 * calendrier daté : elles sont rendues séparément, sans date inventée.
 */
export function financialCalendar(input: {
  period: string;
  commitments: readonly Commitment[];
  goals: readonly Goal[];
  rules: readonly Rule[];
  debts: readonly Debt[];
  businessSignals: readonly BusinessSignal[];
}) {
  const period = parseMonth(input.period);
  const dayLimit = lastDay(period);
  const events: FinancialCalendarEvent[] = [
    ...input.commitments
      .filter((commitment) => commitment.startPeriod <= period && (commitment.endPeriod === null || commitment.endPeriod >= period))
      .map((commitment) => ({ id: `commitment:${commitment.id}`, date: parseCalendarDate(`${period}-${String(Math.min(commitment.dueDay, dayLimit)).padStart(2, '0')}`), kind: 'commitment' as const, title: commitment.name, detail: 'Engagement prévu — non assimilé à un paiement.', amountCents: euroCents(commitment.plannedAmountCents) })),
    ...input.goals
      .filter((goal) => goal.targetDate !== null && goal.targetDate.slice(0, 7) === period)
      .map((goal) => ({ id: `goal:${goal.id}`, date: parseCalendarDate(goal.targetDate!), kind: 'goal' as const, title: goal.name, detail: `Échéance d’objectif · priorité ${goal.priority}.`, amountCents: null })),
    ...input.rules
      .filter((rule) => rule.validTo !== null && rule.validTo.slice(0, 7) === period)
      .map((rule) => ({ id: `rule:${rule.id}`, date: parseCalendarDate(rule.validTo!), kind: 'regulation' as const, title: rule.name, detail: 'Fin de validité à vérifier ; aucune valeur n’est prolongée automatiquement.', amountCents: null })),
  ].sort((left, right) => left.date.localeCompare(right.date) || left.title.localeCompare(right.title));

  const undated: FinancialCalendarUndated[] = [
    ...input.debts.map((debt) => ({ id: `debt:${debt.id}`, kind: 'debt' as const, title: debt.name, detail: 'Mensualité indicative : renseigner son jour d’échéance pour l’ajouter au calendrier.', amountCents: euroCents(debt.monthlyPaymentCents) })),
    ...input.businessSignals.map((signal) => ({ id: `business:${signal.id}`, kind: 'business' as const, title: signal.name, detail: 'Observation mensuelle business, sans date d’encaissement ni d’échéance.', amountCents: euroCents(signal.revenueCents - signal.operatingExpenseCents) })),
  ];

  return { period, events, undated };
}
