import { describe, expect, it } from 'vitest';
import { financialCalendar } from '../../app/lib/finance/calendar';

describe('financialCalendar', () => {
  it('rassemble seulement les échéances explicites et garde les autres signaux sans date', () => {
    const calendar = financialCalendar({
      period: '2026-02',
      commitments: [{ id: '00000000-0000-4000-8000-000000000001', name: 'Loyer', plannedAmountCents: 1_000, dueDay: 31, startPeriod: '2026-01', endPeriod: null }],
      goals: [{ id: '00000000-0000-4000-8000-000000000002', name: 'Objectif février', targetDate: '2026-02-15', priority: 2 }, { id: '00000000-0000-4000-8000-000000000003', name: 'Objectif mars', targetDate: '2026-03-01', priority: 1 }],
      rules: [{ id: '00000000-0000-4000-8000-000000000004', name: 'Règle temporaire', validTo: '2026-02-28' }],
      debts: [{ id: '00000000-0000-4000-8000-000000000005', name: 'Prêt', monthlyPaymentCents: 500 }],
      businessSignals: [{ id: '00000000-0000-4000-8000-000000000006', name: 'SaaS', revenueCents: 2_000, operatingExpenseCents: 750 }],
    });

    expect(calendar.events).toEqual([
      expect.objectContaining({ date: '2026-02-15', kind: 'goal', title: 'Objectif février' }),
      expect.objectContaining({ date: '2026-02-28', kind: 'commitment', title: 'Loyer', amountCents: 1_000 }),
      expect.objectContaining({ date: '2026-02-28', kind: 'regulation', title: 'Règle temporaire' }),
    ]);
    expect(calendar.undated).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'debt', title: 'Prêt', amountCents: 500 }),
      expect.objectContaining({ kind: 'business', title: 'SaaS', amountCents: 1_250 }),
    ]));
  });
});
