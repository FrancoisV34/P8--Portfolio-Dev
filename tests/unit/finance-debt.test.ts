import { describe, expect, it } from 'vitest';
import { projectDebtSchedule } from '../../app/lib/finance/debt.ts';

describe('échéancier de dette', () => {
  it('sépare intérêts et capital depuis un capital restant dû daté', () => {
    const schedule = projectDebtSchedule({ asOfDate: '2026-09-30', outstandingCents: 10_000, monthlyPaymentCents: 1_000, annualRateBasisPoints: 1200, remainingMonths: 24 });
    expect(schedule.rows[0]).toEqual({ month: 1, interestCents: 100, principalCents: 900, paymentCents: 1_000, remainingCents: 9_100 });
    expect(schedule.rows).toHaveLength(11);
    expect(schedule.remainingCents).toBe(0);
    expect(schedule.amortizes).toBe(true);
  });

  it('signale une mensualité qui ne rembourse pas le capital', () => {
    const schedule = projectDebtSchedule({ asOfDate: '2026-09-30', outstandingCents: 10_000, monthlyPaymentCents: 50, annualRateBasisPoints: 1200, remainingMonths: 24 });
    expect(schedule.rows).toEqual([{ month: 1, interestCents: 100, principalCents: 0, paymentCents: 50, remainingCents: 10_050 }]);
    expect(schedule.amortizes).toBe(false);
  });
});
