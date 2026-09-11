import Decimal from 'decimal.js';
import { parseCalendarDate } from './dates.ts';
import { euroCents } from './units.ts';

export type DebtScheduleInput = {
  asOfDate: string;
  outstandingCents: number;
  monthlyPaymentCents: number;
  annualRateBasisPoints: number;
  remainingMonths: number;
};

export type DebtScheduleRow = {
  month: number;
  interestCents: number;
  principalCents: number;
  paymentCents: number;
  remainingCents: number;
};

const decimal = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function roundedCents(value: InstanceType<typeof decimal>) {
  return euroCents(value.toDecimalPlaces(0, decimal.ROUND_HALF_UP).toNumber());
}

/** Échéancier indicatif à partir d'un capital restant dû daté et déclaré. */
export function projectDebtSchedule(input: DebtScheduleInput) {
  const asOfDate = parseCalendarDate(input.asOfDate);
  const outstandingCents = euroCents(input.outstandingCents);
  const monthlyPaymentCents = euroCents(input.monthlyPaymentCents);
  if (outstandingCents < 0 || monthlyPaymentCents <= 0 || !Number.isSafeInteger(input.annualRateBasisPoints) || input.annualRateBasisPoints < 0 || input.annualRateBasisPoints > 100_000 || !Number.isSafeInteger(input.remainingMonths) || input.remainingMonths < 1 || input.remainingMonths > 600) throw new Error('Échéancier invalide.');

  let remaining = outstandingCents;
  const monthlyRate = new decimal(input.annualRateBasisPoints).div(10_000).div(12);
  const rows: DebtScheduleRow[] = [];
  for (let month = 1; month <= input.remainingMonths && remaining > 0; month += 1) {
    const interestCents = Math.min(remaining, roundedCents(new decimal(remaining).mul(monthlyRate)));
    if (monthlyPaymentCents <= interestCents) {
      const paymentCents = monthlyPaymentCents;
      remaining = euroCents(remaining + interestCents - paymentCents);
      rows.push({ month, interestCents, principalCents: 0, paymentCents, remainingCents: remaining });
      break;
    }
    const principalCents = Math.min(remaining, monthlyPaymentCents - interestCents);
    const paymentCents = euroCents(interestCents + principalCents);
    remaining = euroCents(remaining - principalCents);
    rows.push({ month, interestCents, principalCents, paymentCents, remainingCents: remaining });
    if (principalCents === 0) break;
  }
  return { asOfDate, rows, remainingCents: remaining, amortizes: remaining === 0 };
}
