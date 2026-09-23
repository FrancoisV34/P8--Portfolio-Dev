import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Form, Link, redirect, useActionData, useFetcher, useLoaderData } from 'react-router';
import { getAuth } from '../.server/auth/auth.server.ts';
import { authIsConfigured } from '../.server/auth/config.ts';
import { requireOwner } from '../.server/auth/owner.server.ts';
import { accountsRepository } from '../.server/repositories/accounts.ts';
import { businessRepository } from '../.server/repositories/business.ts';
import { budgetRepository } from '../.server/repositories/budget.ts';
import { cfoRepository } from '../.server/repositories/cfo.ts';
import { gominingRepository } from '../.server/repositories/gomining.ts';
import { goalsRepository } from '../.server/repositories/goals.ts';
import { importsRepository } from '../.server/repositories/imports.ts';
import { planningRepository } from '../.server/repositories/planning.ts';
import { regulatoryRepository } from '../.server/repositories/regulatory.ts';
import { regulatorySourceRepository } from '../.server/repositories/regulatory-sources.ts';
import { simulationRepository } from '../.server/repositories/simulations.ts';
import { statusComparisonRepository } from '../.server/repositories/status-comparisons.ts';
import { wealthRepository } from '../.server/repositories/wealth.ts';
import { requireSameOrigin } from '../.server/security/same-origin.server.ts';
import { dayNumber, parseMonth } from '../lib/finance/dates.ts';
import { moveSelection, nextSort, sortJournal, type JournalColumn, type JournalSort } from '../lib/finance/journal.ts';
import { cfoBuckets, type CfoInput } from '../lib/finance/cfo.ts';
import { simulationBuckets, type SimulationInput, type SimulationProfileKind } from '../lib/finance/simulation.ts';
import { projectDebtSchedule } from '../lib/finance/debt.ts';
import { financialCalendar } from '../lib/finance/calendar.ts';
import { projectMonthlyGoMining } from '../lib/gomining/monthly.ts';
import { euroCents, eurosDecimal, formatEuros, parseEuros, sumEuroCents } from '../lib/finance/units.ts';
import { TableauDense } from '../Components/finance/TableauDense.tsx';
import { Trend } from '../Components/finance/Trend.tsx';
import './finance.scss';

const sections = ['overview', 'accounts', 'categories', 'transactions', 'budget', 'calendar', 'wealth', 'business', 'goals', 'cfo', 'simulations', 'regulations', 'statuses', 'gomining'] as const;
type Section = typeof sections[number];
type RegulatoryResolution = ReturnType<ReturnType<typeof regulatoryRepository>['resolve']>;
type ActionData = { error: string } | { regulationResolution: RegulatoryResolution } | { saved: true } | undefined;

const privateHeaders = () => ({ 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow, noarchive' });
const unavailable = () => { throw new Response('Espace privé indisponible.', { status: 503, headers: privateHeaders() }); };
const currentPeriod = () => new Date().toISOString().slice(0, 7);

function sectionFor(splat: string): Section {
  const section = splat.split('/')[0];
  if (!section) return 'overview';
  if ((sections as readonly string[]).includes(section)) return section as Section;
  throw new Response('Introuvable.', { status: 404, headers: privateHeaders() });
}
function field(data: FormData, key: string, max = 500) {
  const value = data.get(key);
  if (typeof value !== 'string' || value.length > max) throw new Error('invalid');
  return value;
}
function optionalField(data: FormData, key: string, max = 500) { const value = data.get(key); if (value === null) return null; if (typeof value !== 'string' || value.length > max) throw new Error('invalid'); return value === '' ? null : value; }
function fields(data: FormData, key: string, max = 500, limit = 20) {
  const values = data.getAll(key);
  if (values.length === 0 || values.length > limit || values.some((value) => typeof value !== 'string' || value.length > max)) throw new Error('invalid');
  return values as string[];
}
function amount(data: FormData, key: string, signed = false) {
  const value = parseEuros(field(data, key, 32));
  if ((!signed && value <= 0) || !Number.isSafeInteger(value)) throw new Error('invalid');
  return value;
}
function nonNegativeAmount(data: FormData, key: string) {
  const value = parseEuros(field(data, key, 32));
  if (value < 0 || !Number.isSafeInteger(value)) throw new Error('invalid');
  return value;
}
function optionalNonNegativeAmount(data: FormData, key: string) { const value = optionalField(data, key, 32); if (value === null) return null; const amount = parseEuros(value); if (amount < 0 || !Number.isSafeInteger(amount)) throw new Error('invalid'); return amount; }
function milliCentAmount(data: FormData, key: string) {
  const raw = field(data, key, 32).trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,5}))?$/.exec(raw);
  if (!match) throw new Error('invalid');
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? '').padEnd(5, '0'));
  const value = whole * 100_000n + fraction;
  if (value <= 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('invalid');
  return Number(value);
}
function basisPoints(data: FormData, key: string) {
  const raw = field(data, key, 16).trim().replace(',', '.');
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) throw new Error('invalid');
  const value = BigInt(match[1]!) * 100n + BigInt((match[2] ?? '').padEnd(2, '0'));
  if (value > 100_000n) throw new Error('invalid');
  return Number(value);
}
function optionalBasisPoints(data: FormData, key: string) { const value = optionalField(data, key, 16); if (value === null) return undefined; const copy = new FormData(); copy.set(key, value); return basisPoints(copy, key); }
function cfoWeight(data: FormData, key: string) { const value = basisPoints(data, key); if (value > 10_000) throw new Error('invalid'); return value; }
function cfoAllocation(data: FormData) { return cfoBuckets.map((bucket) => ({ bucket, amountCents: nonNegativeAmount(data, `${bucket}Amount`) })); }
function simulationWeight(data: FormData, key: string) { const value = cfoWeight(data, key); return value; }
function simulationCharges(data: FormData, activityId: string) {
  const charges: Array<SimulationInput['businesses'][number]['charges'][number]> = [];
  for (let index = 0; index < 60; index += 1) {
    const name = data.get(`businessChargeName-${activityId}-${index}`);
    if (name === null) continue;
    if (typeof name !== 'string') throw new Error('invalid');
    const amount = data.get(`businessChargeAmount-${activityId}-${index}`);
    if (typeof amount !== 'string') throw new Error('invalid');
    if (name.trim() === '' && amount.trim() === '') continue;
    const frequency = field(data, `businessChargeFrequency-${activityId}-${index}`, 16);
    if (!['once', 'monthly', 'quarterly', 'annual'].includes(frequency)) throw new Error('invalid');
    charges.push({ name: field(data, `businessChargeName-${activityId}-${index}`, 100), amountCents: nonNegativeAmount(data, `businessChargeAmount-${activityId}-${index}`), frequency: frequency as SimulationInput['businesses'][number]['charges'][number]['frequency'], startMonth: integer(data, `businessChargeStart-${activityId}-${index}`, 1, 120), endMonth: optionalInteger(data, `businessChargeEnd-${activityId}-${index}`, 1, 120) });
  }
  return charges;
}
function simulationInputFromForm(data: FormData, activityIds: readonly string[], debtRows: Array<{ debt: { id: string }; balance: { outstandingCents: number; monthlyPaymentCents: number; annualRateBasisPoints: number } | null }>, goalRows: Array<{ id: string; targetCents: number; progressCents: number; priority: number }>, gominingScenarioId: string | null, gominingContributionCentsByMonth: number[]): SimulationInput {
  return {
    months: integer(data, 'months', 1, 120), profileKind: field(data, 'profileKind', 16) as SimulationProfileKind, profile: { annualPlacementReturnBasisPoints: basisPoints(data, 'placementReturn'), businessMonthlyGrowthBasisPoints: basisPoints(data, 'businessGrowth'), householdExpenseAnnualInflationBasisPoints: basisPoints(data, 'expenseInflation') },
    openingHouseholdCashCents: nonNegativeAmount(data, 'openingHouseholdCash'), frozenObservedAssetCents: nonNegativeAmount(data, 'frozenObservedAssets'), monthlyHouseholdIncomeCents: nonNegativeAmount(data, 'monthlyHouseholdIncome'), monthlyHouseholdExpenseCents: nonNegativeAmount(data, 'monthlyHouseholdExpense'), gominingScenarioId, gominingContributionCentsByMonth,
    weights: { placements: simulationWeight(data, 'placementsWeight'), business: simulationWeight(data, 'businessWeight'), material: simulationWeight(data, 'materialWeight'), projects: simulationWeight(data, 'projectsWeight'), opportunities: simulationWeight(data, 'opportunitiesWeight'), debt: simulationWeight(data, 'debtWeight') },
    businesses: activityIds.map((id) => ({ id, openingCashCents: nonNegativeAmount(data, `businessCash-${id}`), monthlyRevenueCents: nonNegativeAmount(data, `businessRevenue-${id}`), monthlyGrowthBasisPoints: optionalBasisPoints(data, `businessGrowth-${id}`), charges: simulationCharges(data, id) })),
    debts: debtRows.flatMap(({ debt, balance }) => balance ? [{ id: debt.id, outstandingCents: balance.outstandingCents, monthlyPaymentCents: balance.monthlyPaymentCents, annualRateBasisPoints: balance.annualRateBasisPoints }] : []),
    goals: goalRows.map(({ id, targetCents, progressCents, priority }) => ({ id, targetCents, progressCents, priority })),
  };
}
function integer(data: FormData, key: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { const value = Number(field(data, key, 24)); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('invalid'); return value; }
function optionalInteger(data: FormData, key: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { const raw = optionalField(data, key, 24); if (raw === null) return null; const value = Number(raw); if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error('invalid'); return value; }
function goMiningInput(data: FormData) {
  return {
    name: field(data, 'name', 100), startPeriod: field(data, 'startPeriod', 7), horizonMonths: integer(data, 'horizonMonths', 1, 600),
    initialHashrateMilliTh: integer(data, 'initialHashrateMilliTh', 1), initialAccumulatedSats: integer(data, 'initialAccumulatedSats'), efficiencyMilliWattsPerTh: integer(data, 'efficiencyMilliWattsPerTh', 1),
    monthlyNetRewardSatsPerTh: integer(data, 'monthlyNetRewardSatsPerTh'), priceMilliCentsPerMilliTh: milliCentAmount(data, 'pricePerMilliTh'), btcPriceCents: amount(data, 'btcPrice'), budgetCategoryId: optionalField(data, 'budgetCategoryId', 64),
    accumulatedBtcPolicy: data.has('reinvestAccumulated') ? 'reinvest-at-threshold' as const : 'keep' as const,
    phases: [{ startMonth: 1, endMonth: 12, amountCents: amount(data, 'phaseOne') }, { startMonth: 13, endMonth: 36, amountCents: amount(data, 'phaseTwo') }, { startMonth: 37, endMonth: null, amountCents: amount(data, 'phaseThree') }],
  };
}
function monthDistance(start: string, target: string) { const [startYear, startMonth] = parseMonth(start).split('-').map(Number); const [targetYear, targetMonth] = parseMonth(target).split('-').map(Number); return (targetYear - startYear) * 12 + targetMonth - startMonth + 1; }
function endOfMonth(period: string) { const [year, month] = parseMonth(period).split('-').map(Number); return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`; }
function cfoInputFor(
  period: string,
  entities: ReturnType<ReturnType<typeof accountsRepository>['listEntities']>,
  dashboard: ReturnType<ReturnType<typeof budgetRepository>['dashboard']>,
  planning: ReturnType<ReturnType<typeof planningRepository>['dashboard']>,
  wealth: ReturnType<ReturnType<typeof wealthRepository>['dashboard']>,
  business: ReturnType<ReturnType<typeof businessRepository>['dashboard']>,
  goals: ReturnType<ReturnType<typeof goalsRepository>['dashboard']>,
  gominingContributionCents: number,
): CfoInput {
  const liquidCashCents = Math.max(0, sumEuroCents(dashboard.accounts.map((account) => euroCents(account.balanceCents))));
  const unpaidCommitmentCents = sumEuroCents(planning.commitments.map(({ commitment, actualCents }) => euroCents(Math.max(0, commitment.plannedAmountCents - actualCents))));
  const debtPaymentCents = sumEuroCents(wealth.debts.flatMap(({ balance }) => balance ? [euroCents(balance.monthlyPaymentCents)] : []));
  const speculativeAssetCents = wealth.allocation.rows.find((item) => item.assetClass === 'crypto')?.amountCents ?? 0;
  const businessEntities = entities.filter((entity) => entity.type === 'business');
  return {
    period, liquidCashCents, reserveTargetCents: planning.reserve?.targetAmountCents ?? null, reserveCurrentCents: planning.reserve?.currentAmountCents ?? 0,
    unpaidCommitmentCents, debtPaymentCents, businessProvisionCents: business.provisionCents, gominingContributionCents,
    speculativeAssetCents, grossAssetCents: wealth.allocation.totalCents,
    businessCashComplete: businessEntities.length === 0 || business.cash.length >= businessEntities.length,
    activeProjectCount: goals.activeProjectCount, projectCapacityStatus: goals.capacityStatus,
  };
}
function gominingBudgetPlansFor(period: string, scenarios: Array<{ scenario: { id: string; name: string; startPeriod: string; budgetCategoryId: string | null }; projection: { months: Array<{ contributionCents: number }> } }>) {
  return scenarios.flatMap(({ scenario, projection }) => { const month = monthDistance(scenario.startPeriod, period); const contributionCents = projection.months[month - 1]?.contributionCents ?? 0; return scenario.budgetCategoryId && contributionCents > 0 ? [{ scenarioId: scenario.id, name: scenario.name, categoryId: scenario.budgetCategoryId, contributionCents }] : []; });
}
function back(request: Request) { const url = new URL(request.url); return redirect(`${url.pathname.replace(/\.data$/, '')}${url.search}`); }
function failure() { return { error: 'La saisie ne peut pas être enregistrée. Vérifie les champs et réessaie.' }; }

export async function loader({ request, params }: { request: Request; params: Record<string, string | undefined> }) {
  if (!authIsConfigured()) return unavailable();
  let session: Awaited<ReturnType<typeof requireOwner>>;
  try {
    session = await requireOwner(request);
  } catch (error) {
    // Rediriger vers la page de connexion publierait son adresse à tout
    // visiteur de /finance : sans session, cette route n'existe pas.
    if (error instanceof Response && error.status === 401) {
      throw new Response('Introuvable.', { status: 404, headers: privateHeaders() });
    }
    if (error instanceof Response) throw error;
    return unavailable();
  }
  try {
    const url = new URL(request.url);
    const period = parseMonth(url.searchParams.get('period') ?? currentPeriod());
    const database = getAuth().connection.db;
    const accounts = accountsRepository(database, session.user.id);
    const budget = budgetRepository(database, session.user.id);
    const planning = planningRepository(database, session.user.id);
    const mining = gominingRepository(database, session.user.id);
    const wealth = wealthRepository(database, session.user.id);
    const business = businessRepository(database, session.user.id);
    const goals = goalsRepository(database, session.user.id);
    const regulations = regulatoryRepository(database, session.user.id);
    const regulatorySources = regulatorySourceRepository(database, session.user.id);
    const cfo = cfoRepository(database, session.user.id);
    const simulations = simulationRepository(database, session.user.id);
    const statusComparisons = statusComparisonRepository(database, session.user.id);
    const imports = importsRepository(database, session.user.id);
    const gominingScenarios = mining.listScenarios().map(({ scenario, phases, versions, historyIncomplete }) => ({ scenario, phases, versions, historyIncomplete, projection: projectMonthlyGoMining({ ...scenario, thresholdHashrateMilliTh: 10_000, contributionPhases: phases }) }));
    const transactions = budget.listTransactions(period);
    const dashboard = budget.dashboard(period);
    const entities = accounts.listEntities();
    const planningDashboard = planning.dashboard(period, dashboard.accounts, transactions);
    const wealthDashboard = wealth.dashboard(endOfMonth(period), sumEuroCents(dashboard.accounts.map((account) => euroCents(account.balanceCents))));
    const businessDashboard = business.dashboard(period);
    const goalsDashboard = goals.dashboard();
    const gominingBudgetPlans = gominingBudgetPlansFor(period, gominingScenarios);
    const cfoRules = cfo.currentRules();
    const regulationsDashboard = regulations.dashboard(endOfMonth(period));
    const calendar = financialCalendar({
      period,
      commitments: planningDashboard.commitments.map(({ commitment }) => commitment),
      goals: goalsDashboard.goals,
      rules: regulationsDashboard.rules,
      debts: wealthDashboard.debts.flatMap(({ debt, balance }) => balance ? [{ id: debt.id, name: debt.name, monthlyPaymentCents: balance.monthlyPaymentCents }] : []),
      businessSignals: businessDashboard.activities.flatMap(({ activity, metric }) => metric === null ? [] : [{ id: activity.id, name: activity.name, revenueCents: metric.revenueCents, operatingExpenseCents: metric.operatingExpenseCents }]),
    });
    return {
      name: session.user.name, section: sectionFor(params['*'] ?? ''), period,
      entities, accounts: accounts.listAccounts(), categories: budget.listCategories(),
      transactions, dashboard, closures: budget.listClosures(period), reconciliations: budget.listReconciliations(period), commitments: planning.listCommitments(), planning: planningDashboard,
      wealth: wealthDashboard, business: businessDashboard, goals: goalsDashboard,
      cfo: { context: cfoInputFor(period, entities, dashboard, planningDashboard, wealthDashboard, businessDashboard, goalsDashboard, sumEuroCents(gominingBudgetPlans.map((plan) => euroCents(plan.contributionCents)))), rules: cfoRules, history: cfo.list() },
      simulations: { current: simulations.current(), runs: simulations.list() },
      statusComparisons: statusComparisons.list(),
      imports: { pending: imports.listPending(), count: imports.countPending() },
      regulations: regulationsDashboard,
      calendar,
      regulatorySources: regulatorySources.dashboard(),
      gomining: gominingScenarios,
      gominingBudgetPlans,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return unavailable();
  }
}

export async function action({ request }: { request: Request }) {
  if (!authIsConfigured()) return unavailable();
  const session = await requireOwner(request);
  requireSameOrigin(request);
  // Un corps illisible se traite comme une saisie refusée, pas comme une panne.
  const data = await request.formData().catch(() => null);
  if (!data) return failure();
  // La modale de saisie rapide enchaîne les mouvements sans quitter la page :
  // une redirection la refermerait à chaque enregistrement. Elle demande donc
  // une réponse de données ; tout le reste du formulaire continue de rediriger.
  const quick = data.get('quick') === '1';
  try {
    const intent = field(data, 'intent', 40);
    if (intent === 'signOut') {
      // La session est révoquée puis le navigateur repart sur le portfolio :
      // renvoyer vers la page de connexion publierait son adresse.
      const signedOut = await getAuth().auth.api.signOut({ headers: request.headers, asResponse: true });
      const headers = new Headers({ Location: '/' });
      for (const cookie of signedOut.headers.getSetCookie?.() ?? []) headers.append('Set-Cookie', cookie);
      return redirect('/', { headers });
    }
    const database = getAuth().connection.db;
    const accounts = accountsRepository(database, session.user.id);
    const budget = budgetRepository(database, session.user.id);
    const planning = planningRepository(database, session.user.id);
    const mining = gominingRepository(database, session.user.id);
    const wealth = wealthRepository(database, session.user.id);
    const business = businessRepository(database, session.user.id);
    const goals = goalsRepository(database, session.user.id);
    const regulations = regulatoryRepository(database, session.user.id);
    const regulatorySources = regulatorySourceRepository(database, session.user.id);
    const cfo = cfoRepository(database, session.user.id);
    const simulations = simulationRepository(database, session.user.id);
    const statusComparisons = statusComparisonRepository(database, session.user.id);
    const imports = importsRepository(database, session.user.id);
    switch (intent) {
      case 'createEntity': accounts.createEntity({ name: field(data, 'name', 100), type: field(data, 'type', 20) as 'personal' | 'business' }); break;
      case 'createAccount': accounts.createAccount({ entityId: field(data, 'entityId', 64), name: field(data, 'name', 100), type: field(data, 'type', 20) as 'checking' | 'savings' | 'cash', openingBalanceCents: amount(data, 'openingBalance', true), openingDate: field(data, 'openingDate', 10) }); break;
      case 'updateAccount': accounts.updateAccount({ id: field(data, 'id', 64), name: field(data, 'name', 100), type: field(data, 'type', 20) as 'checking' | 'savings' | 'cash', openingBalanceCents: amount(data, 'openingBalance', true), openingDate: field(data, 'openingDate', 10), isActive: field(data, 'isActive', 8) === 'true' }); break;
      case 'createCategory': budget.createCategory({ name: field(data, 'name', 100), kind: field(data, 'kind', 20) as 'income' | 'expense' }); break;
      case 'updateCategory': budget.updateCategory({ id: field(data, 'id', 64), name: field(data, 'name', 100), kind: field(data, 'kind', 20) as 'income' | 'expense', isActive: field(data, 'isActive', 8) === 'true' }); break;
      case 'createTransaction': budget.createTransaction({ accountId: field(data, 'accountId', 64), categoryId: field(data, 'categoryId', 64), kind: field(data, 'kind', 20) as 'income' | 'expense', amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240), recurringCommitmentId: optionalField(data, 'recurringCommitmentId', 64) }); break;
      case 'updateTransaction': budget.updateTransaction({ id: field(data, 'id', 64), accountId: field(data, 'accountId', 64), categoryId: field(data, 'categoryId', 64), kind: field(data, 'kind', 20) as 'income' | 'expense', amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240), recurringCommitmentId: optionalField(data, 'recurringCommitmentId', 64) }); break;
      case 'createTransfer': budget.createTransfer({ fromAccountId: field(data, 'fromAccountId', 64), toAccountId: field(data, 'toAccountId', 64), amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240) }); break;
      case 'deleteTransaction': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); budget.deleteTransaction(field(data, 'id', 64)); break;
      case 'setBudget': budget.setBudget({ categoryId: field(data, 'categoryId', 64), period: field(data, 'period', 7), plannedAmountCents: amount(data, 'plannedAmount') }); break;
      case 'deleteBudget': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); budget.deleteBudget(field(data, 'id', 64)); break;
      case 'closeMonth': if (field(data, 'confirmClosure', 10) !== 'close') throw new Error('invalid'); budget.closeMonth({ period: field(data, 'period', 7) }); break;
      case 'setReconciliation': budget.setReconciliation({ accountId: field(data, 'accountId', 64), period: field(data, 'period', 7), statementDate: field(data, 'statementDate', 10), statementBalanceCents: amount(data, 'statementBalance', true) }); break;
      case 'acceptImportLine': {
        const kind = field(data, 'kind', 20);
        const decision = { id: field(data, 'id', 64), amountCents: amount(data, 'amount'), occurredOn: field(data, 'occurredOn', 10), note: field(data, 'note', 240) };
        if (kind === 'transfer') imports.acceptLine({ ...decision, kind, counterpartAccountId: field(data, 'counterpartAccountId', 64), direction: field(data, 'direction', 4) as 'out' | 'in' });
        else imports.acceptLine({ ...decision, kind: kind as 'income' | 'expense', categoryId: field(data, 'categoryId', 64), recurringCommitmentId: optionalField(data, 'recurringCommitmentId', 64) });
        break;
      }
      case 'rejectImportLine': imports.rejectLine(field(data, 'id', 64)); break;
      case 'setSafetyReserve': planning.setSafetyReserve({ targetAmountCents: amount(data, 'targetAmount'), accountIds: fields(data, 'accountIds', 64) }); break;
      case 'deleteSafetyReserve': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); planning.deleteSafetyReserve(); break;
      case 'createCommitment': planning.createCommitment({ name: field(data, 'name', 100), categoryId: field(data, 'categoryId', 64), plannedAmountCents: amount(data, 'plannedAmount'), dueDay: Number(field(data, 'dueDay', 2)), startPeriod: field(data, 'startPeriod', 7), endPeriod: optionalField(data, 'endPeriod', 7) }); break;
      case 'updateCommitment': planning.updateCommitment({ id: field(data, 'id', 64), name: field(data, 'name', 100), categoryId: field(data, 'categoryId', 64), plannedAmountCents: amount(data, 'plannedAmount'), dueDay: Number(field(data, 'dueDay', 2)), startPeriod: field(data, 'startPeriod', 7), endPeriod: optionalField(data, 'endPeriod', 7) }); break;
      case 'deleteCommitment': if (field(data, 'confirmDelete', 10) !== 'delete') throw new Error('invalid'); planning.deleteCommitment(field(data, 'id', 64)); break;
      case 'createGoMiningScenario': mining.createScenario(goMiningInput(data)); break;
      case 'updateGoMiningScenario': mining.updateScenario({ id: field(data, 'id', 64), ...goMiningInput(data) }); break;
      case 'restoreGoMiningVersion': mining.restoreVersion({ scenarioId: field(data, 'scenarioId', 64), versionId: field(data, 'versionId', 64) }); break;
      case 'setGoMiningPolicy': mining.setAccumulatedBtcPolicy(field(data, 'id', 64), data.has('reinvestAccumulated') ? 'reinvest-at-threshold' : 'keep'); break;
      case 'createWealthAsset': wealth.createAsset({ entityId: field(data, 'entityId', 64), name: field(data, 'name', 100), assetClass: field(data, 'assetClass', 32) as 'securities' | 'crypto' | 'real_estate' | 'business' | 'other', source: 'manual', observedBtcSats: null, quantityDescription: field(data, 'quantityDescription', 80), contributedCents: nonNegativeAmount(data, 'contributedAmount'), valuedOn: field(data, 'valuedOn', 10), valueCents: nonNegativeAmount(data, 'valueAmount'), note: field(data, 'note', 240) }); break;
      case 'createObservedGoMiningBtc': wealth.createAsset({ entityId: field(data, 'entityId', 64), name: 'BTC GoMining observés', assetClass: 'crypto', source: 'gomining-observed-btc', observedBtcSats: integer(data, 'observedBtcSats'), quantityDescription: '', contributedCents: 0, valuedOn: field(data, 'valuedOn', 10), valueCents: nonNegativeAmount(data, 'valueAmount'), note: field(data, 'note', 240) }); break;
      case 'addWealthValuation': wealth.addValuation({ assetId: field(data, 'assetId', 64), valuedOn: field(data, 'valuedOn', 10), valueCents: nonNegativeAmount(data, 'valueAmount'), note: field(data, 'note', 240) }); break;
      case 'createWealthDebt': wealth.createDebt({ entityId: field(data, 'entityId', 64), name: field(data, 'name', 100), asOfDate: field(data, 'asOfDate', 10), outstandingCents: nonNegativeAmount(data, 'outstandingAmount'), monthlyPaymentCents: amount(data, 'monthlyPayment'), annualRateBasisPoints: basisPoints(data, 'annualRate'), remainingMonths: integer(data, 'remainingMonths', 1, 600) }); break;
      case 'addWealthDebtBalance': wealth.addDebtBalance({ debtId: field(data, 'debtId', 64), asOfDate: field(data, 'asOfDate', 10), outstandingCents: nonNegativeAmount(data, 'outstandingAmount'), monthlyPaymentCents: amount(data, 'monthlyPayment'), annualRateBasisPoints: basisPoints(data, 'annualRate'), remainingMonths: integer(data, 'remainingMonths', 1, 600) }); break;
      case 'createBusinessActivity': business.createActivity({ entityId: field(data, 'entityId', 64), name: field(data, 'name', 100) }); break;
      case 'setBusinessMetrics': business.setMetrics({ activityId: field(data, 'activityId', 64), period: field(data, 'period', 7), revenueCents: nonNegativeAmount(data, 'revenueAmount'), operatingExpenseCents: nonNegativeAmount(data, 'operatingExpenseAmount'), mrrCents: optionalNonNegativeAmount(data, 'mrrAmount'), activeCustomerCount: optionalInteger(data, 'activeCustomerCount', 0, 1_000_000_000), maintenanceMinutes: optionalInteger(data, 'maintenanceMinutes', 0, 44_640) }); break;
      case 'setBusinessCash': business.setEntityCash({ entityId: field(data, 'entityId', 64), period: field(data, 'period', 7), retainedCashCents: nonNegativeAmount(data, 'retainedCashAmount'), distributedCents: nonNegativeAmount(data, 'distributedAmount') }); break;
      case 'createBusinessProvision': business.createProvision({ entityId: field(data, 'entityId', 64), period: field(data, 'period', 7), name: field(data, 'name', 100), amountCents: nonNegativeAmount(data, 'amount'), note: field(data, 'note', 240) }); break;
      case 'updateBusinessProvision': business.updateProvision({ id: field(data, 'id', 64), entityId: field(data, 'entityId', 64), period: field(data, 'period', 7), name: field(data, 'name', 100), amountCents: nonNegativeAmount(data, 'amount'), note: field(data, 'note', 240) }); break;
      case 'createGoal': goals.createGoal({ name: field(data, 'name', 100), targetCents: amount(data, 'targetAmount'), progressCents: nonNegativeAmount(data, 'progressAmount'), targetDate: optionalField(data, 'targetDate', 10), priority: integer(data, 'priority', 1, 999) }); break;
      case 'updateGoal': goals.updateGoal({ id: field(data, 'id', 64), name: field(data, 'name', 100), targetCents: amount(data, 'targetAmount'), progressCents: nonNegativeAmount(data, 'progressAmount'), targetDate: optionalField(data, 'targetDate', 10), priority: integer(data, 'priority', 1, 999) }); break;
      case 'createProject': goals.createProject({ goalId: optionalField(data, 'goalId', 64), name: field(data, 'name', 100), status: field(data, 'status', 16) as 'backlog' | 'active' | 'paused' | 'done', priority: integer(data, 'priority', 1, 999), estimatedCostCents: optionalNonNegativeAmount(data, 'estimatedCostAmount'), estimatedEffortMinutes: optionalInteger(data, 'estimatedEffortMinutes', 0, 44_640), nextAction: field(data, 'nextAction', 240) }); break;
      case 'updateProject': goals.updateProject({ id: field(data, 'id', 64), goalId: optionalField(data, 'goalId', 64), name: field(data, 'name', 100), status: field(data, 'status', 16) as 'backlog' | 'active' | 'paused' | 'done', priority: integer(data, 'priority', 1, 999), estimatedCostCents: optionalNonNegativeAmount(data, 'estimatedCostAmount'), estimatedEffortMinutes: optionalInteger(data, 'estimatedEffortMinutes', 0, 44_640), nextAction: field(data, 'nextAction', 240) }); break;
      case 'setProjectCapacity': goals.setCapacity({ monthlyCapacityMinutes: integer(data, 'monthlyCapacityMinutes', 0, 44_640) }); break;
      case 'evaluateCfo': {
        const period = parseMonth(new URL(request.url).searchParams.get('period') ?? currentPeriod());
        const dashboard = budget.dashboard(period);
        const planningDashboard = planning.dashboard(period, dashboard.accounts, budget.listTransactions(period));
        const wealthDashboard = wealth.dashboard(endOfMonth(period), sumEuroCents(dashboard.accounts.map((account) => euroCents(account.balanceCents))));
        const entities = accounts.listEntities();
        const gominingScenarios = mining.listScenarios().map(({ scenario, phases }) => ({ scenario, projection: projectMonthlyGoMining({ ...scenario, thresholdHashrateMilliTh: 10_000, contributionPhases: phases }) }));
        const gominingContributionCents = sumEuroCents(gominingBudgetPlansFor(period, gominingScenarios).map((plan) => euroCents(plan.contributionCents)));
        cfo.evaluate(cfoInputFor(period, entities, dashboard, planningDashboard, wealthDashboard, business.dashboard(period), goals.dashboard(), gominingContributionCents), cfo.currentRules());
        break;
      }
      case 'setCfoWeights': cfo.setWeights({ placements: cfoWeight(data, 'placementsWeight'), business: cfoWeight(data, 'businessWeight'), material: cfoWeight(data, 'materialWeight'), projects: cfoWeight(data, 'projectsWeight'), opportunities: cfoWeight(data, 'opportunitiesWeight') }); break;
      case 'decideCfo': {
        const outcome = field(data, 'outcome', 16) as 'accepted' | 'modified' | 'ignored';
        cfo.decide({ evaluationId: field(data, 'evaluationId', 64), outcome, note: field(data, 'note', 240), allocation: outcome === 'modified' ? cfoAllocation(data) : undefined });
        break;
      }
      case 'compareCfo': cfo.compare({ evaluationId: field(data, 'evaluationId', 64), name: field(data, 'name', 100), allocation: cfoAllocation(data) }); break;
      case 'saveSimulation': {
        const period = parseMonth(new URL(request.url).searchParams.get('period') ?? currentPeriod());
        const selectedScenarioId = optionalField(data, 'gominingScenarioId', 64);
        const selectedScenario = selectedScenarioId === null ? null : mining.listScenarios().find(({ scenario }) => scenario.id === selectedScenarioId);
        if (selectedScenarioId !== null && !selectedScenario) throw new Error('Scénario GoMining introuvable.');
        const projection = selectedScenario ? projectMonthlyGoMining({ ...selectedScenario.scenario, thresholdHashrateMilliTh: 10_000, contributionPhases: selectedScenario.phases }) : null;
        const activityIds = business.dashboard(period).activities.map(({ activity }) => activity.id);
        const wealthDashboard = wealth.dashboard(endOfMonth(period), 0);
        simulations.saveAssumptions(simulationInputFromForm(data, activityIds, wealthDashboard.debts, goals.dashboard().goals, selectedScenarioId, projection?.months.map((month) => month.contributionCents) ?? []));
        break;
      }
      case 'runSimulation': simulations.run(field(data, 'assumptionId', 64)); break;
      case 'compareMicroToSasu': statusComparisons.create({ annualRevenueCents: nonNegativeAmount(data, 'annualRevenue'), annualOperatingExpenseCents: nonNegativeAmount(data, 'annualOperatingExpense'), microBicServiceSocialRateBasisPoints: basisPoints(data, 'microSocialRate'), sasuCorporateTaxRateBasisPoints: basisPoints(data, 'sasuCorporateTaxRate') }); break;
      case 'createRegulatoryRule': regulations.create({ name: field(data, 'name', 100), value: field(data, 'value', 120), source: field(data, 'source', 500), verifiedOn: field(data, 'verifiedOn', 10), validFrom: field(data, 'validFrom', 10), validTo: optionalField(data, 'validTo', 10), note: field(data, 'note', 240) }); break;
      case 'updateRegulatoryRule': regulations.update({ id: field(data, 'id', 64), name: field(data, 'name', 100), value: field(data, 'value', 120), source: field(data, 'source', 500), verifiedOn: field(data, 'verifiedOn', 10), validFrom: field(data, 'validFrom', 10), validTo: optionalField(data, 'validTo', 10), note: field(data, 'note', 240) }); break;
      case 'resolveRegulatoryRule': return { regulationResolution: regulations.resolve({ name: field(data, 'name', 100), asOf: field(data, 'asOf', 10) }) };
      case 'checkRegulatorySource': await regulatorySources.check(field(data, 'sourceKey', 80)); break;
      default: throw new Error('invalid');
    }
  } catch { return failure(); }
  if (quick) return { saved: true } as const;
  return back(request);
}

export const headers = () => privateHeaders();
export const meta = () => [{ title: 'Finance privée — François Vittecoq' }, { name: 'robots', content: 'noindex, nofollow' }];

const path = (section: Exclude<Section, 'overview'>, period: string) => `/finance/${section}?period=${encodeURIComponent(period)}`;
function near(period: string, delta: -1 | 1) {
  const [year, month] = parseMonth(period).split('-').map(Number); const index = month - 1 + delta;
  return `${year + Math.floor(index / 12)}-${String((index + 12) % 12 + 1).padStart(2, '0')}`;
}
const money = (cents: number) => formatEuros(euroCents(cents));
const decimalMoney = (cents: number) => eurosDecimal(euroCents(cents));
const preciseMoney = (milliCents: number) => `${(milliCents / 100_000).toFixed(5).replace('.', ',')} €`;
/**
 * Un montant à l'écran.
 *
 * ⚠️ Le signe est posé ICI, pas dans `formatEuros` : la fonction d'unité reste
 * exacte et réutilisable (export, calculs), la présentation ajoute le signe.
 * Le moins est un vrai **U+2212**, pas un trait d'union : dans une colonne en
 * chiffres tabulaires, le trait d'union est plus court et désaligne la colonne.
 *
 * ⚠️ Et la couleur ne vient JAMAIS seule — le signe la double toujours. C'est
 * ce qui garde l'écran lisible en niveaux de gris et pour qui ne distingue pas
 * le rouge du vert. `signe={false}` pour les contextes où un montant n'a pas
 * de polarité (un prévu, une cible).
 */
const classeMontant = (cents: number) => cents > 0 ? 'amount-positive' : cents < 0 ? 'amount-negative' : 'amount-neutral';
const Currency = ({ cents, signe = false }: { cents: number; signe?: boolean }) => {
  const texte = money(Math.abs(cents));
  if (!signe) return <span className="tnum">{texte}</span>;
  const marque = cents > 0 ? '+' : cents < 0 ? '\u2212' : '';
  return <span className={`tnum ${classeMontant(cents)}`}>{marque}{texte}</span>;
};
/**
 * « 4 sept. » — la date dense du journal.
 *
 * ⚠️ Midi, pas minuit. `new Date('2026-09-01')` est interprété en UTC : à l'ouest
 * de Greenwich, le 1er du mois s'affiche comme le dernier jour du mois
 * précédent, et la ligne change de mois à l'écran.
 */
const moisAxe = (period: string) => new Date(`${period}-01T12:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
const dateAxe = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
const dateCourte = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
const Satoshi = () => <abbr title="Un satoshi est la plus petite unité du bitcoin : 1 BTC vaut 100 000 000 satoshis.">satoshis</abbr>;

/**
 * Les 14 sections, groupées en cinq familles.
 *
 * ⚠️ Pourquoi un rail plutôt que quatorze onglets : sur 1280 px, une barre
 * défilable cache la moitié du produit et coûte un geste de défilement à chaque
 * navigation. Le regroupement dit en plus ce qui va avec quoi. Sous 900 px, la
 * barre revient — c'est le seul endroit où elle est le moindre mal.
 */
const FAMILLES: { nom: string; sections: { cle: Section; libelle: string }[] }[] = [
  { nom: 'Pilotage', sections: [
    { cle: 'overview', libelle: 'Synthèse' },
    { cle: 'cfo', libelle: 'CFO' },
    { cle: 'goals', libelle: 'Objectifs' },
  ] },
  { nom: 'Flux', sections: [
    { cle: 'transactions', libelle: 'Transactions' },
    { cle: 'budget', libelle: 'Budget' },
    { cle: 'calendar', libelle: 'Calendrier' },
  ] },
  { nom: 'Patrimoine', sections: [
    { cle: 'wealth', libelle: 'Patrimoine' },
    { cle: 'accounts', libelle: 'Comptes' },
    { cle: 'gomining', libelle: 'GoMining' },
  ] },
  { nom: 'Business', sections: [
    { cle: 'business', libelle: 'Business' },
    { cle: 'statuses', libelle: 'Micro / SASU' },
  ] },
  { nom: 'Référentiel', sections: [
    { cle: 'categories', libelle: 'Catégories' },
    { cle: 'regulations', libelle: 'Règles' },
    { cle: 'simulations', libelle: 'Simulations' },
  ] },
];

const TITRES: Record<Section, string> = {
  overview: 'Vue d’ensemble', accounts: 'Comptes', categories: 'Catégories',
  transactions: 'Transactions', budget: 'Budget', calendar: 'Calendrier financier',
  wealth: 'Patrimoine', business: 'Business', goals: 'Objectifs et projets',
  cfo: 'Moteur CFO', simulations: 'Simulations', regulations: 'Règles vérifiées',
  statuses: 'Micro vs SASU', gomining: 'GoMining',
};

/** La famille qui contient une section — sert de sur-titre à l'en-tête. */
function familleDe(section: Section) {
  return FAMILLES.find((f) => f.sections.some((s) => s.cle === section))?.nom ?? '';
}

function lienDe(cle: Section, period: string) {
  return cle === 'overview' ? `/finance?period=${period}` : path(cle, period);
}

export default function Finance() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<ActionData>();
  const actionError = actionData && 'error' in actionData ? actionData.error : undefined;
  const activeAccounts = data.accounts.filter((item) => item.isActive);
  const activeCategories = data.categories.filter((item) => item.isActive);
  const balances = new Map(data.dashboard.accounts.map((item) => [item.id, item.balanceCents]));
  // Le raccourci ne s'arme que si une saisie est possible : sans compte ni
  // catégorie active, `N` ouvrirait une modale dont aucun champ ne serait
  // remplissable.
  const pretPourSaisie = activeAccounts.length > 0 && activeCategories.length > 0;
  const { ouverte, ouvrir, fermer } = useRaccourciSaisie(pretPourSaisie);
  return <div className="finance-shell">
    <Rail section={data.section} period={data.period} />

    <main className="finance-page">
      <Onglets section={data.section} period={data.period} />

      <header className="finance-header">
        <div>
          <p className="finance-eyebrow">{familleDe(data.section)}</p>
          <h1>{TITRES[data.section]}</h1>
        </div>
        <div className="finance-header__actions">
          {/* Le navigateur de période vit dans l'en-tête collant, jamais dans
              le contenu : il est présent sur presque tous les écrans. */}
          <Period period={data.period} />
          {/* Un raccourci que rien n'annonce n'est utilisé par personne — et
              sur un écran tactile il n'existe pas du tout. Le bouton porte
              donc le geste, la touche n'est que l'accélérateur. */}
          {pretPourSaisie ? <button type="button" className="finance-button" onClick={(evenement) => ouvrir(evenement.currentTarget)}>
            Saisir <kbd>N</kbd>
          </button> : null}
          <form method="post" action="/api/finance/backup">
            <button className="finance-button finance-button--quiet" type="submit">Sauvegarde</button>
          </form>
          <Form method="post">
            <input type="hidden" name="intent" value="signOut" />
            <button className="finance-button finance-button--quiet">Se déconnecter</button>
          </Form>
        </div>
      </header>

      {actionError ? <p className="finance-alert" role="alert"><span><strong>Erreur. </strong>{actionError}</span></p> : null}

    {data.section === 'overview' ? <Overview data={data} /> : null}
    {data.section === 'accounts' ? <Accounts data={data} balances={balances} /> : null}
    {data.section === 'categories' ? <Categories categories={data.categories} /> : null}
    {data.section === 'transactions' ? <Transactions data={data} accounts={activeAccounts} categories={activeCategories} /> : null}
    {data.section === 'budget' ? <Budget data={data} /> : null}
    {data.section === 'calendar' ? <Calendar data={data} /> : null}
    {data.section === 'wealth' ? <Wealth data={data} /> : null}
    {data.section === 'business' ? <Business data={data} /> : null}
    {data.section === 'goals' ? <Goals data={data} /> : null}
    {data.section === 'cfo' ? <Cfo data={data} /> : null}
    {data.section === 'simulations' ? <Simulations data={data} /> : null}
    {data.section === 'regulations' ? <Regulations data={data} /> : null}
    {data.section === 'statuses' ? <StatusComparisons data={data} /> : null}
      {data.section === 'gomining' ? <GoMining data={data} /> : null}
    </main>

    {ouverte ? <ModaleSaisie data={data} accounts={activeAccounts} categories={activeCategories} onFermer={fermer} /> : null}
  </div>;
}

/**
 * Rail latéral, groupé en cinq familles. Masqué sous 900 px au profit de la
 * barre d'onglets — l'une des trois seules bascules de gabarit du design.
 */
function Rail({ section, period }: { section: Section; period: string }) {
  return <nav className="finance-rail" data-chrome="rail" aria-label="Navigation financière">
    <div className="finance-rail__brand">
      <span className="finance-rail__mono" aria-hidden="true">FV</span>
      <span className="finance-rail__who">
        <strong>Espace privé</strong>
        <span>François Vittecoq</span>
      </span>
    </div>

    {FAMILLES.map((famille) => <div className="finance-rail__family" key={famille.nom}>
      <p className="finance-rail__label">{famille.nom}</p>
      {famille.sections.map(({ cle, libelle }) => <Link
        key={cle}
        to={lienDe(cle, period)}
        aria-current={section === cle ? 'page' : undefined}
      >{libelle}</Link>)}
    </div>)}

  </nav>;
}

/** Sous 900 px : les quatorze sections à plat, défilables. */
function Onglets({ section, period }: { section: Section; period: string }) {
  return <div data-chrome="tabs">
    <nav className="finance-tabs" aria-label="Navigation financière">
      {FAMILLES.flatMap((famille) => famille.sections).map(({ cle, libelle }) => <Link
        key={cle}
        to={lienDe(cle, period)}
        aria-current={section === cle ? 'page' : undefined}
      >{libelle}</Link>)}
      <span className="finance-tabs__fade" aria-hidden="true" />
    </nav>
  </div>;
}

type Data = Awaited<ReturnType<typeof loader>>;
function Period({ period }: { period: string }) {
  const courant = new Date().toISOString().slice(0, 7);
  const libelle = new Date(`${period}-01T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  return <nav className="finance-month" aria-label="Période budgétaire">
    <Link to={`/finance?period=${near(period, -1)}`} aria-label="Mois précédent">‹</Link>
    <strong>{libelle}</strong>
    <Link to={`/finance?period=${near(period, 1)}`} aria-label="Mois suivant">›</Link>
    {/* Bouton EXPLICITE, pas un état implicite : depuis novembre, un seul
        geste doit suffire pour revenir au mois courant. */}
    {period !== courant
      ? <Link className="finance-month__today" to={`/finance?period=${courant}`}>Ce mois</Link>
      : null}
  </nav>;
}
function Overview({ data }: { data: Data }) {
  if (data.accounts.length === 0) return <section className="finance-empty"><h2>Commencer par les comptes</h2><p>Ajoute une entité puis les soldes d’ouverture datés. Ils ne sont pas des revenus ni des dépenses.</p><Link className="finance-button" to={path('accounts', data.period)}>Configurer les comptes</Link></section>;
  const reserve = data.planning.reserve;
  return <section className="finance-content">
    <section className="finance-metrics"><Metric label="Revenus" cents={data.dashboard.incomeCents} /><Metric label="Dépenses" cents={data.dashboard.expenseCents} /><Metric label="Reste du mois" cents={data.dashboard.surplusCents} emphasis /></section>
    <section className="finance-card"><h2>Soldes à la fin de la période</h2><SoldesComptes accounts={data.dashboard.accounts} /></section>
    <section className="finance-card"><h2>Suivi du budget</h2>{data.dashboard.budgets.length ? <PrevuRealise budgets={data.dashboard.budgets} /> : <p>Ajoute des catégories de dépense puis un budget mensuel.</p>}<Link className="finance-text-link" to={path('budget', data.period)}>Ouvrir le budget</Link></section>
    <MonthlyClosure data={data} />
    <Reconciliation data={data} />
    <section className="finance-card"><h2>Réserve de sécurité</h2>{reserve ? <><p>{money(reserve.currentAmountCents)} disponibles sur {reserve.accounts.length} compte{reserve.accounts.length > 1 ? 's' : ''}, pour une cible de {money(reserve.targetAmountCents)}.</p><p>{reserve.currentAmountCents >= reserve.targetAmountCents ? 'La cible est atteinte pour cette période.' : `Reste à constituer : ${money(reserve.targetAmountCents - reserve.currentAmountCents)}.`}</p></> : <p>Aucune réserve n’est encore configurée.</p>}<Link className="finance-text-link" to={path('budget', data.period)}>Configurer le suivi</Link></section>
    <section className="finance-card"><h2>Engagements du mois</h2>{data.planning.commitments.length ? <EngagementsDuMois commitments={data.planning.commitments} /> : <p>Aucun engagement récurrent prévu pour ce mois.</p>}<Link className="finance-text-link" to={path('budget', data.period)}>Gérer les engagements</Link></section>
    <section className="finance-card"><h2>Historique</h2><p>Le suivi commence avec {data.period}. Les tendances seront affichées seulement quand des mois réels seront disponibles.</p></section>
  </section>;
}
/** Les soldes de fin de période, compte par compte, et leur somme. */
function SoldesComptes({ accounts }: { accounts: Data['dashboard']['accounts'] }) {
  const total = sumEuroCents(accounts.map((account) => euroCents(account.balanceCents)));
  return <TableauDense
    legende={`${accounts.length} compte${accounts.length > 1 ? 's' : ''}`}
    lignes={accounts}
    cle={(account) => account.id}
    colonnes={[
      { cle: 'nom', libelle: 'Compte', valeur: (account) => account.name, tri: (account) => account.name },
      { cle: 'solde', libelle: 'Solde', numerique: true, valeur: (account) => <Currency cents={account.balanceCents} />, tri: (account) => account.balanceCents },
    ]}
    carte={{ titre: (account) => account.name, montant: (account) => <Currency cents={account.balanceCents} /> }}
    total={{ libelle: 'Total', cellules: { solde: <Currency cents={total} /> }, carte: <Currency cents={total} /> }}
  />;
}
/**
 * Prévu contre réalisé, par catégorie de dépense.
 *
 * ⚠️ **Le reste n'existe que si un prévu existe.** Une catégorie sans budget
 * n'a pas « 0 € de reste » : elle n'a pas de cible. Afficher un reste négatif
 * égal au réalisé la ferait passer pour un dépassement.
 */
function PrevuRealise({ budgets, detail }: { budgets: Data['dashboard']['budgets']; detail?: (ligne: Data['dashboard']['budgets'][number]) => ReactNode }) {
  const reste = ({ budget, actualCents }: Data['dashboard']['budgets'][number]) => budget ? euroCents(budget.plannedAmountCents - actualCents) : null;
  const prevu = sumEuroCents(budgets.flatMap(({ budget }) => budget ? [euroCents(budget.plannedAmountCents)] : []));
  const realise = sumEuroCents(budgets.map(({ actualCents }) => euroCents(actualCents)));
  return <TableauDense
    legende="Un reste négatif signale un dépassement du prévu."
    lignes={budgets}
    cle={({ category }) => category.id}
    colonnes={[
      { cle: 'categorie', libelle: 'Catégorie', valeur: ({ category }) => category.name, tri: ({ category }) => category.name },
      { cle: 'prevu', libelle: 'Prévu', numerique: true, valeur: ({ budget }) => budget ? <Currency cents={budget.plannedAmountCents} /> : '—', tri: ({ budget }) => budget?.plannedAmountCents ?? null },
      { cle: 'realise', libelle: 'Réalisé', numerique: true, valeur: ({ actualCents }) => <Currency cents={actualCents} />, tri: ({ actualCents }) => actualCents },
      { cle: 'reste', libelle: 'Reste', numerique: true, valeur: (ligne) => { const cents = reste(ligne); return cents === null ? '—' : <Currency cents={cents} signe />; }, tri: reste, classe: (ligne) => { const cents = reste(ligne); return cents === null ? '' : classeMontant(cents); } },
    ]}
    carte={{ titre: ({ category }) => category.name, sousTitre: ({ budget }) => budget ? `prévu ${money(budget.plannedAmountCents)}` : 'sans prévu', montant: ({ actualCents }) => <Currency cents={actualCents} /> }}
    total={{ libelle: 'Total', cellules: { prevu: <Currency cents={prevu} />, realise: <Currency cents={realise} />, reste: <Currency cents={euroCents(prevu - realise)} signe /> }, carte: <Currency cents={realise} /> }}
    detail={detail}
  />;
}
/** Les engagements récurrents du mois : payé contre prévu, sans présumer d'un paiement. */
function EngagementsDuMois({ commitments, detail }: { commitments: Data['planning']['commitments']; detail?: (ligne: Data['planning']['commitments'][number]) => ReactNode }) {
  const ecart = ({ commitment, actualCents }: Data['planning']['commitments'][number]) => euroCents(actualCents - commitment.plannedAmountCents);
  return <TableauDense
    legende="Un engagement est un prévu : seul un paiement relié depuis le journal compte comme payé."
    lignes={commitments}
    cle={({ commitment }) => commitment.id}
    colonnes={[
      { cle: 'nom', libelle: 'Engagement', valeur: ({ commitment, categoryName }) => <>{commitment.name}<span className="finance-table__aparte"> · {categoryName}</span></>, tri: ({ commitment }) => commitment.name },
      { cle: 'jour', libelle: 'Jour', numerique: true, valeur: ({ commitment }) => commitment.dueDay, tri: ({ commitment }) => commitment.dueDay },
      { cle: 'paye', libelle: 'Payé', numerique: true, valeur: ({ actualCents }) => <Currency cents={actualCents} />, tri: ({ actualCents }) => actualCents },
      { cle: 'prevu', libelle: 'Prévu', numerique: true, valeur: ({ commitment }) => <Currency cents={commitment.plannedAmountCents} />, tri: ({ commitment }) => commitment.plannedAmountCents },
      { cle: 'ecart', libelle: 'Écart', numerique: true, valeur: (ligne) => ligne.actualCents === 0 ? 'non payé' : <Currency cents={ecart(ligne)} signe />, tri: (ligne) => ligne.actualCents === 0 ? null : ecart(ligne) },
    ]}
    carte={{ titre: ({ commitment }) => commitment.name, sousTitre: ({ commitment, actualCents }) => `le ${commitment.dueDay} · ${actualCents === 0 ? 'non payé' : `${money(actualCents)} payé`}`, montant: ({ commitment }) => <Currency cents={commitment.plannedAmountCents} /> }}
    detail={detail}
  />;
}
function MonthlyClosure({ data }: { data: Data }) {
  const latest = data.closures[0];
  return <section className="finance-card"><h2>Clôture mensuelle</h2>{latest ? <><p>Version {latest.closure.revision} enregistrée le {latest.closure.createdAt.slice(0, 16).replace('T', ' ')} UTC. Elle reste inchangée si le journal est corrigé ensuite.</p><List rows={[[`${latest.snapshot.transactionCount} mouvement${latest.snapshot.transactionCount > 1 ? 's' : ''}`, money(latest.snapshot.surplusCents)], ['Soldes figés', money(sumEuroCents(latest.snapshot.accounts.map(({ balanceCents }) => euroCents(balanceCents))))]]} />{data.closures.length > 1 ? <details><summary>{data.closures.length} versions de clôture</summary><List rows={data.closures.map(({ closure, snapshot }) => [`Version ${closure.revision}`, `${snapshot.transactionCount} mouvements · ${money(snapshot.surplusCents)}`])} /></details> : null}</> : <p>Aucune clôture pour ce mois. Elle enregistrera les montants réellement saisis et les soldes, sans bloquer les corrections futures.</p>}<Form method="post" className="finance-form"><input type="hidden" name="intent" value="closeMonth" /><input type="hidden" name="period" value={data.period} /><label className="finance-inline"><input type="checkbox" name="confirmClosure" value="close" required /> Je confirme l’enregistrement de cet instantané.</label><button className="finance-button">{latest ? 'Créer une nouvelle version' : 'Clôturer le mois'}</button></Form></section>;
}
function Reconciliation({ data }: { data: Data }) {
  const byAccount = new Map(data.reconciliations.map((item) => [item.accountId, item]));
  const ecart = (account: Data['dashboard']['accounts'][number]) => { const reconciliation = byAccount.get(account.id); return reconciliation ? euroCents(reconciliation.statementBalanceCents - account.balanceCents) : null; };
  return <section className="finance-card finance-card--wide"><h2>Rapprochement des comptes</h2>
    <p className="finance-help">Saisis le solde figurant sur le relevé. L’écart compare ce relevé au journal, sans modifier ni le solde calculé ni les transactions.</p>
    <TableauDense
      legende="Un écart non nul signale un mouvement manquant ou mal saisi dans le journal."
      lignes={data.dashboard.accounts}
      cle={(account) => account.id}
      colonnes={[
        { cle: 'compte', libelle: 'Compte', valeur: (account) => account.name, tri: (account) => account.name },
        { cle: 'date', libelle: 'Relevé du', valeur: (account) => { const date = byAccount.get(account.id)?.statementDate; return date ? <time dateTime={date}>{dateCourte(date)}</time> : 'aucun relevé'; }, tri: (account) => byAccount.get(account.id)?.statementDate ?? null },
        { cle: 'journal', libelle: 'Journal', numerique: true, valeur: (account) => <Currency cents={account.balanceCents} />, tri: (account) => account.balanceCents },
        { cle: 'releve', libelle: 'Relevé', numerique: true, valeur: (account) => { const reconciliation = byAccount.get(account.id); return reconciliation ? <Currency cents={reconciliation.statementBalanceCents} /> : '—'; }, tri: (account) => byAccount.get(account.id)?.statementBalanceCents ?? null },
        { cle: 'ecart', libelle: 'Écart', numerique: true, valeur: (account) => { const cents = ecart(account); return cents === null ? '—' : <Currency cents={cents} signe />; }, tri: ecart, classe: (account) => { const cents = ecart(account); return cents === null ? '' : classeMontant(cents); } },
      ]}
      carte={{ titre: (account) => account.name, sousTitre: (account) => { const cents = ecart(account); return cents === null ? 'aucun relevé ce mois' : cents === 0 ? 'rapproché' : `écart ${money(cents)}`; }, montant: (account) => <Currency cents={account.balanceCents} /> }}
      libelleDetail="Rapprocher"
      detail={(account) => { const reconciliation = byAccount.get(account.id); return <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setReconciliation" /><input type="hidden" name="accountId" value={account.id} /><input type="hidden" name="period" value={data.period} /><label>Date du relevé<input name="statementDate" type="date" defaultValue={reconciliation?.statementDate ?? `${data.period}-01`} required /></label><label>Solde figurant sur le relevé (€)<input name="statementBalance" defaultValue={reconciliation ? decimalMoney(reconciliation.statementBalanceCents) : ''} inputMode="decimal" required /></label><button className="finance-button">Enregistrer le rapprochement</button></Form>; }}
    />
  </section>;
}
function Calendar({ data }: { data: Data }) {
  const calendar = data.calendar;
  const kind = { commitment: 'Engagement', goal: 'Objectif', regulation: 'Règle à revoir', debt: 'Dette à dater', business: 'Observation business' };
  const montant = (event: { amountCents: number | null }) => event.amountCents === null ? '—' : <Currency cents={event.amountCents} />;
  return <section className="finance-content">
    <nav className="finance-month" aria-label="Période du calendrier"><Link to={path('calendar', near(data.period, -1))}>Mois précédent</Link><strong>{calendar.period}</strong><Link to={path('calendar', near(data.period, 1))}>Mois suivant</Link></nav>
    <section className="finance-card"><h2>Échéances datées</h2><p className="finance-help">Uniquement les dates réellement enregistrées. Un engagement prévu ne devient jamais un paiement dans ce calendrier.</p>{calendar.events.length === 0 ? <p>Aucune échéance datée pour cette période.</p> : <TableauDense
      legende={`${calendar.events.length} échéance${calendar.events.length > 1 ? 's' : ''} en ${calendar.period}`}
      lignes={calendar.events}
      cle={(event) => event.id}
      colonnes={[
        { cle: 'date', libelle: 'Date', valeur: (event) => <time dateTime={event.date}>{dateCourte(event.date)}</time>, tri: (event) => event.date },
        { cle: 'titre', libelle: 'Échéance', valeur: (event) => <>{event.title}<span className="finance-table__aparte"> · {event.detail}</span></>, tri: (event) => event.title },
        { cle: 'nature', libelle: 'Nature', valeur: (event) => kind[event.kind], tri: (event) => kind[event.kind] },
        { cle: 'montant', libelle: 'Montant', numerique: true, valeur: montant, tri: (event) => event.amountCents },
      ]}
      carte={{ titre: (event) => event.title, sousTitre: (event) => `${dateCourte(event.date)} · ${kind[event.kind]}`, montant }}
    />}</section>
    <section className="finance-card"><h2>À dater</h2><p className="finance-help">Ces éléments sont connus, mais leurs données ne donnent pas de jour fiable. Ils ne sont donc pas placés arbitrairement dans le mois.</p>{calendar.undated.length === 0 ? <p>Aucun élément à dater.</p> : <TableauDense
      legende={`${calendar.undated.length} élément${calendar.undated.length > 1 ? 's' : ''} sans jour fiable`}
      lignes={calendar.undated}
      cle={(event) => event.id}
      colonnes={[
        { cle: 'titre', libelle: 'Élément', valeur: (event) => <>{event.title}<span className="finance-table__aparte"> · {event.detail}</span></>, tri: (event) => event.title },
        { cle: 'nature', libelle: 'Nature', valeur: (event) => kind[event.kind], tri: (event) => kind[event.kind] },
        { cle: 'montant', libelle: 'Montant', numerique: true, valeur: montant, tri: (event) => event.amountCents },
      ]}
      carte={{ titre: (event) => event.title, sousTitre: (event) => kind[event.kind], montant }}
    />}</section>
  </section>;
}
/**
 * Tuile de métrique. Deux variantes, pas trois.
 *
 * ⚠️ **L'emphase se mérite : une seule par écran.** C'est la seule tuile dont
 * le montant porte la couleur de signe — partout ailleurs, le chiffre reste en
 * couleur de texte. Colorer tous les montants d'un écran revient à n'en
 * signaler aucun.
 */
function Metric({ label, cents, emphasis = false, note }: { label: string; cents: number; emphasis?: boolean; note?: string }) {
  return <article className={`finance-metric ${emphasis ? 'finance-metric--emphasis' : ''}`}>
    <p>{label}</p>
    <strong><Currency cents={cents} signe={emphasis} /></strong>
    {note ? <span className="finance-metric__note">{note}</span> : null}
  </article>;
}
/**
 * La courbe du MRR — et son seul vrai piège : **un mois incomplet n'est pas un
 * mois à zéro.**
 *
 * Le tableau juste en dessous peut écrire « Non renseigné » ; une courbe, elle,
 * ne sait pas écrire. Tracer un mois où deux activités sur trois sont
 * renseignées dessinerait une chute de MRR qui n'a jamais eu lieu — c'est un
 * trou de saisie, pas une perte de clients. Seuls les mois COMPLETS sont
 * tracés, et les autres sont comptés à côté plutôt que passés sous silence.
 */
function TendanceMrr({ history }: { history: Data['business']['mrrHistory'] }) {
  const complets = history.filter((item) => item.complete);
  if (complets.length === 0) return null;
  const exclus = history.length - complets.length;
  return <Trend
    legende="MRR observé — mois complets"
    note={exclus === 0 ? undefined : `${exclus} mois sur ${history.length} ne sont pas tracés : leur MRR n’est renseigné que pour une partie des activités actives.`}
    series={complets.map((item) => ({ label: moisAxe(item.period), cents: item.mrrCents, at: dayNumber(`${item.period}-01`) }))}
  />;
}

/**
 * La barre de progression d'un objectif, à la taille d'une cellule de tableau.
 *
 * ⚠️ Le pourcentage affiché n'est plus plafonné à 100 %. L'ancienne version
 * écrivait `Math.min(100, …)` : un objectif dépassé de 40 % s'affichait
 * « 100,0 % », et le dépassement — l'information la plus intéressante —
 * disparaissait. Seule la LARGEUR de la barre est bornée ; le chiffre dit vrai,
 * et la barre change de couleur au-delà de la cible.
 */
function ProgressionCompacte({ atteint, cible }: { atteint: number; cible: number }) {
  const part = cible > 0 ? (atteint / cible) * 100 : null;
  const largeur = part === null ? 0 : Math.min(100, Math.max(0, part));
  return <span className={`finance-progress finance-progress--cellule${part !== null && part > 100 ? ' finance-progress--over' : ''}`}>
    <span className="finance-progress__track" aria-hidden="true"><span className="finance-progress__fill" style={{ width: `${largeur}%` }} /></span>
    <span>{part === null ? 'cible non chiffrée' : `${part.toFixed(1).replace('.', ',')} %`}</span>
  </span>;
}
function List({ rows }: { rows: [string, string][] }) { return <ul className="finance-list">{rows.map(([left, right]) => <li key={`${left}-${right}`}><span>{left}</span><span>{right}</span></li>)}</ul>; }

const accountTypeLabel = { checking: 'Compte courant', savings: 'Épargne', cash: 'Espèces' } as const;
function Accounts({ data, balances }: { data: Data; balances: Map<string, number> }) {
  const date = `${data.period}-01`;
  const solde = (account: Data['accounts'][number]) => balances.get(account.id) ?? account.openingBalanceCents;
  const total = sumEuroCents(data.accounts.map((account) => euroCents(solde(account))));
  return <section className="finance-content finance-grid">
    <section className="finance-card"><h2>Entité économique</h2><p className="finance-help">Crée ton foyer personnel avant d’ajouter un compte.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createEntity" /><label>Nom<input name="name" required maxLength={100} /></label><label>Type<select name="type" defaultValue="personal"><option value="personal">Personnel</option><option value="business">Business</option></select></label><button className="finance-button">Ajouter l’entité</button></Form>{data.entities.length ? <List rows={data.entities.map((entity) => [entity.name, entity.type === 'personal' ? 'Personnel' : 'Business'])} /> : null}</section>
    <section className="finance-card"><h2>Compte et solde d’ouverture</h2>{data.entities.length === 0 ? <p>Ajoute d’abord une entité économique.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createAccount" /><label>Entité<select name="entityId">{data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><label>Type<select name="type" defaultValue="checking"><option value="checking">Compte courant</option><option value="savings">Épargne</option><option value="cash">Espèces</option></select></label><label>Solde d’ouverture (€)<input name="openingBalance" inputMode="decimal" placeholder="0,00" required /></label><label>Date d’ouverture<input name="openingDate" type="date" defaultValue={date} required /></label><button className="finance-button">Ajouter le compte</button></Form>}</section>
    <section className="finance-card finance-card--wide"><h2>Comptes enregistrés</h2>{data.accounts.length === 0 ? <p>Aucun compte saisi.</p> : <TableauDense
      legende={`Soldes à la fin de ${data.period}. Un compte archivé garde son historique.`}
      lignes={data.accounts}
      cle={(account) => account.id}
      colonnes={[
        { cle: 'nom', libelle: 'Compte', valeur: (account) => account.name, tri: (account) => account.name },
        { cle: 'type', libelle: 'Type', valeur: (account) => accountTypeLabel[account.type], tri: (account) => accountTypeLabel[account.type] },
        { cle: 'ouverture', libelle: 'Ouverture', valeur: (account) => <time dateTime={account.openingDate}>{dateAxe(account.openingDate)}</time>, tri: (account) => account.openingDate },
        { cle: 'etat', libelle: 'État', valeur: (account) => account.isActive ? 'actif' : 'archivé', tri: (account) => account.isActive ? 0 : 1 },
        { cle: 'solde', libelle: 'Solde', numerique: true, valeur: (account) => <Currency cents={solde(account)} />, tri: solde },
      ]}
      carte={{ titre: (account) => account.name, sousTitre: (account) => `${accountTypeLabel[account.type]}${account.isActive ? '' : ' · archivé'}`, montant: (account) => <Currency cents={solde(account)} /> }}
      total={{ libelle: 'Total', cellules: { solde: <Currency cents={total} /> }, carte: <Currency cents={total} /> }}
      detail={(account) => <Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateAccount" /><input type="hidden" name="id" value={account.id} /><input type="hidden" name="type" value={account.type} /><label>Nom<input name="name" defaultValue={account.name} required maxLength={100} /></label><label>Solde d’ouverture (€)<input name="openingBalance" defaultValue={decimalMoney(account.openingBalanceCents)} inputMode="decimal" required /></label><label>Date d’ouverture<input name="openingDate" type="date" defaultValue={account.openingDate} required /></label><label>État<select name="isActive" defaultValue={String(account.isActive)}><option value="true">Actif</option><option value="false">Archivé</option></select></label><button className="finance-button">Enregistrer</button></Form>}
    />}</section>
  </section>;
}

function Categories({ categories }: { categories: Data['categories'] }) {
  return <section className="finance-content finance-grid">
    <section className="finance-card"><h2>Nouvelle catégorie</h2><p className="finance-help">Les catégories séparent revenus et dépenses ; un transfert n’en utilise pas.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createCategory" /><label>Nom<input name="name" required maxLength={100} /></label><label>Nature<select name="kind" defaultValue="expense"><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><button className="finance-button">Ajouter la catégorie</button></Form></section>
    <section className="finance-card"><h2>Catégories enregistrées</h2>{categories.length === 0 ? <p>Crée les catégories utiles avant de saisir le journal.</p> : <TableauDense
      legende={`${categories.length} catégorie${categories.length > 1 ? 's' : ''}`}
      lignes={categories}
      cle={(category) => category.id}
      colonnes={[
        { cle: 'nom', libelle: 'Catégorie', valeur: (category) => category.name, tri: (category) => category.name },
        { cle: 'nature', libelle: 'Nature', valeur: (category) => category.kind === 'income' ? 'Revenu' : 'Dépense', tri: (category) => category.kind },
        { cle: 'etat', libelle: 'État', valeur: (category) => category.isActive ? 'active' : 'archivée', tri: (category) => category.isActive ? 0 : 1 },
      ]}
      carte={{ titre: (category) => category.name, sousTitre: (category) => `${category.kind === 'income' ? 'Revenu' : 'Dépense'}${category.isActive ? '' : ' · archivée'}` }}
      detail={(category) => <Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateCategory" /><input type="hidden" name="id" value={category.id} /><label>Nom<input name="name" defaultValue={category.name} required maxLength={100} /></label><label>Nature<select name="kind" defaultValue={category.kind}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>État<select name="isActive" defaultValue={String(category.isActive)}><option value="true">Active</option><option value="false">Archivée</option></select></label><button className="finance-button">Enregistrer</button></Form>}
    />}</section>
  </section>;
}

function AccountSelect({ accounts, name, selected }: { accounts: Data['accounts']; name: string; selected?: string }) { return <select name={name} defaultValue={selected} required>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select>; }
function CategorySelect({ categories, selected }: { categories: Data['categories']; selected?: string }) { return <label>Catégorie<select name="categoryId" defaultValue={selected} required>{categories.map((category) => <option key={category.id} value={category.id}>{category.kind === 'income' ? 'Revenu' : 'Dépense'} — {category.name}</option>)}</select></label>; }
function CommitmentSelect({ commitments, selected }: { commitments: Data['commitments']; selected?: string | null }) { return <label>Engagement payé (facultatif)<select name="recurringCommitmentId" defaultValue={selected ?? ''}><option value="">Aucun</option>{commitments.map(({ commitment, categoryName }) => <option key={commitment.id} value={commitment.id}>{commitment.name} — {categoryName}</option>)}</select></label>; }
function Delete({ intent, id, text }: { intent: 'deleteTransaction' | 'deleteBudget' | 'deleteSafetyReserve' | 'deleteCommitment' | 'deleteGoMiningScenario'; id?: string; text: string }) { return <Form method="post" className="finance-delete"><input type="hidden" name="intent" value={intent} />{id ? <input type="hidden" name="id" value={id} /> : null}<label><input type="checkbox" name="confirmDelete" value="delete" required /> {text}</label><button>Supprimer</button></Form>; }

function Transactions({ data, accounts, categories }: { data: Data; accounts: Data['accounts']; categories: Data['categories'] }) { const date = `${data.period}-01`; const ready = accounts.length > 0 && categories.length > 0; return <section className="finance-content finance-grid">{data.imports.count > 0 ? <ImportsAValider data={data} accounts={accounts} categories={categories} /> : null}<section className="finance-card"><h2>Revenu ou dépense</h2>{!ready ? <p>Il faut un compte actif et une catégorie active pour saisir une transaction.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createTransaction" /><label>Nature<select name="kind" defaultValue="expense"><option value="expense">Dépense</option><option value="income">Revenu</option></select></label><label>Compte<AccountSelect accounts={accounts} name="accountId" /></label><CategorySelect categories={categories} /><CommitmentSelect commitments={data.commitments} /><label>Montant (€)<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Date<input name="occurredOn" type="date" defaultValue={date} required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Ajouter au journal</button></Form>}</section><section className="finance-card"><h2>Transfert entre comptes</h2>{accounts.length < 2 ? <p>Ajoute deux comptes actifs pour enregistrer un transfert.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createTransfer" /><label>Depuis<AccountSelect accounts={accounts} name="fromAccountId" /></label><label>Vers<AccountSelect accounts={accounts} name="toAccountId" /></label><label>Montant (€)<input name="amount" inputMode="decimal" placeholder="0,00" required /></label><label>Date<input name="occurredOn" type="date" defaultValue={date} required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Enregistrer le transfert</button></Form>}</section><section className="finance-card finance-card--wide"><h2>Journal — {data.period}</h2><Journal data={data} accounts={accounts} categories={categories} /></section></section>; }

/**
 * Les lignes lues dans un relevé, à valider une par une.
 *
 * ⚠️ **Le texte lu reste affiché au-dessus du formulaire.** Les champs sont
 * pré-remplis par le lecteur mais corrigeables : sans la lecture d'origine sous
 * les yeux, une erreur de lecture corrigée de mémoire passerait inaperçue.
 *
 * ⚠️ **Deux boutons, deux intents, un seul formulaire.** « Ignorer » porte
 * `formNoValidate` : rejeter une ligne mal lue ne doit pas exiger qu'on la
 * corrige d'abord.
 */
function ImportsAValider({ data, accounts, categories }: { data: Data; accounts: Data['accounts']; categories: Data['categories'] }) {
  const { pending, count } = data.imports;
  return <section className="finance-card finance-card--wide">
    <h2>{count} écriture{count > 1 ? 's' : ''} à valider</h2>
    <p className="finance-help">Chaque ligne lue dans un relevé attend ta décision. Corrige ce qui a été mal lu, puis valide : la ligne entre alors au journal. Rien n’y entre automatiquement.</p>
    {pending.length < count ? <p className="finance-help">Les {pending.length} premières sont affichées ; les suivantes apparaîtront au fil des validations.</p> : null}
    <ul className="finance-records">{pending.map(({ line, batch, accountName, duplicate }) => {
      const kind = line.amountCents > 0 ? 'income' : 'expense';
      const autresComptes = accounts.filter((account) => account.id !== batch.accountId);
      return <li key={line.id}>
        <div>
          <strong>{line.label || 'Sans libellé'}</strong>
          <p>{accountName} · {batch.sourceName} · lu : « {line.rawDate} » « {line.rawLabel} » « {line.rawAmount} »</p>
          {duplicate ? <p className="finance-alert" role="status">{duplicate === 'imported'
            ? 'Doublon possible : la même opération figure déjà dans un autre relevé importé.'
            : 'Doublon possible : un mouvement du même montant existe déjà ce jour-là sur ce compte.'}</p> : null}
        </div>
        <Form method="post" className="finance-form">
          <input type="hidden" name="id" value={line.id} />
          <label>Nature<select name="kind" defaultValue={kind}><option value="expense">Dépense</option><option value="income">Revenu</option>{autresComptes.length > 0 ? <option value="transfer">Transfert</option> : null}</select></label>
          <CategorySelect categories={categories} selected={categories.find((category) => category.kind === kind)?.id} />
          {autresComptes.length > 0 ? <>
            <label>Autre compte (transfert)<select name="counterpartAccountId" defaultValue=""><option value="">—</option>{autresComptes.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
            <label>Sens (transfert)<select name="direction" defaultValue={line.amountCents < 0 ? 'out' : 'in'}><option value="out">Sortant de {accountName}</option><option value="in">Entrant sur {accountName}</option></select></label>
          </> : null}
          <label>Montant (€)<input name="amount" inputMode="decimal" defaultValue={decimalMoney(Math.abs(line.amountCents))} required /></label>
          <label>Date<input name="occurredOn" type="date" defaultValue={line.occurredOn} required /></label>
          <label>Note<input name="note" maxLength={240} defaultValue={line.label} /></label>
          <button className="finance-button" name="intent" value="acceptImportLine">Valider</button>
          <button className="finance-button finance-button--quiet" name="intent" value="rejectImportLine" formNoValidate>Ignorer</button>
        </Form>
      </li>;
    })}</ul>
  </section>;
}

/**
 * Le journal — tableau dense au-dessus de 680 px, lignes dépliables en dessous.
 *
 * ⚠️ **Le tri est un `<button>` DANS le `<th>`**, jamais un `onClick` posé sur
 * la cellule : un `onClick` sur un `<th>` n'existe pas au clavier, et une
 * colonne triable qu'on ne peut pas trier sans souris n'est pas triable.
 *
 * ⚠️ **`tabIndex` glissant** (une seule ligne atteignable par Tab, les flèches
 * font le reste). La passation écrivait `<tr tabindex="0">` sur chaque ligne :
 * sur 250 mouvements, cela met 250 arrêts de tabulation entre l'en-tête et le
 * pied de page. Tab entre dans le tableau, les flèches circulent, Tab en sort.
 *
 * ⚠️ **Aucune colonne « état ».** Le rapprochement bancaire existe par compte
 * et par mois (`listReconciliations`), pas par mouvement : une pastille
 * « rapproché » sur une ligne afficherait un état que la base ne connaît pas.
 * Les badges d'état servent là où l'état est réel — calendrier, règles.
 */
function Journal({ data, accounts, categories }: { data: Data; accounts: Data['accounts']; categories: Data['categories'] }) {
  const [tri, setTri] = useState<JournalSort>({ column: 'date', direction: 'desc' });
  const [selection, setSelection] = useState<number | null>(null);
  const [corrigee, setCorrigee] = useState<string | null>(null);
  const lignesRef = useRef<(HTMLTableRowElement | null)[]>([]);

  const parId = new Map(data.transactions.map((record) => [record.transaction.id, record]));
  const lignes = sortJournal(data.transactions.map(({ transaction, accountName, categoryName }) => ({
    id: transaction.id,
    date: transaction.occurredOn,
    label: transaction.note || (transaction.kind === 'transfer' ? 'Transfert' : categoryName ?? 'Sans libellé'),
    account: accountName,
    category: transaction.kind === 'transfer' ? 'Transfert' : categoryName ?? '—',
    amountCents: transaction.amountCents,
  })), tri);
  const total = sumEuroCents(lignes.map((ligne) => euroCents(ligne.amountCents)));

  // La ligne qui porte l'unique arrêt de tabulation du tableau.
  const courante = selection ?? 0;

  const basculer = (colonne: JournalColumn) => {
    setTri((actuel) => nextSort(actuel, colonne));
    // Le tri réordonne les lignes : garder l'index de sélection désignerait un
    // autre mouvement que celui qu'on regardait.
    setSelection(null);
    setCorrigee(null);
  };

  const surTouche = (evenement: React.KeyboardEvent<HTMLTableSectionElement>) => {
    if (evenement.key === 'Enter' && selection !== null) {
      const ligne = lignes[selection];
      evenement.preventDefault();
      setCorrigee((actuelle) => (actuelle === ligne.id ? null : ligne.id));
      return;
    }
    const suivante = moveSelection(selection, evenement.key, lignes.length);
    if (suivante === null || suivante === selection) return;
    evenement.preventDefault();
    setSelection(suivante);
    lignesRef.current[suivante]?.focus();
  };

  if (lignes.length === 0) {
    return <p className="finance-help">
      Aucun mouvement sur cette période. Saisis un revenu ou une dépense ci-dessus,
      ou appuie sur <kbd>N</kbd> depuis n’importe quel écran.
    </p>;
  }

  return <>
    <div className="finance-table-wrap" data-view="table">
      <div className="finance-table-scroll">
        <table className="finance-table">
          <caption>{lignes.length} mouvement{lignes.length > 1 ? 's' : ''} · flèches pour circuler, Entrée pour corriger</caption>
          <thead>
            <tr>
              <EnTete colonne="date" libelle="Date" tri={tri} onTri={basculer} />
              <EnTete colonne="label" libelle="Libellé" tri={tri} onTri={basculer} />
              <EnTete colonne="account" libelle="Compte" tri={tri} onTri={basculer} />
              <EnTete colonne="category" libelle="Catégorie" tri={tri} onTri={basculer} />
              <EnTete colonne="amount" libelle="Montant" tri={tri} onTri={basculer} numerique />
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody onKeyDown={surTouche}>
            {lignes.map((ligne, index) => {
              const record = parId.get(ligne.id);
              if (!record) return null;
              return <Fragment key={ligne.id}>
                <tr
                  ref={(element) => { lignesRef.current[index] = element; }}
                  tabIndex={index === courante ? 0 : -1}
                  aria-selected={selection === index}
                  onFocus={() => setSelection(index)}
                >
                  {/* `<time>` garde la date exacte dans le balisage : la colonne
                      dense n'affiche que « 1 sept. », le mois complet vit dans
                      l'en-tête. */}
                  <td><time dateTime={ligne.date}>{dateCourte(ligne.date)}</time></td>
                  {/* L'engagement payé était porté par l'ancienne liste ; il reste
                      lisible ici plutôt que de coûter une 7ᵉ colonne. */}
                  <td>{ligne.label}{record.commitmentName ? <span className="finance-table__aparte"> · {record.commitmentName}</span> : null}</td>
                  <td>{ligne.account}</td>
                  <td>{ligne.category}</td>
                  <td className={`num ${classeMontant(ligne.amountCents)}`}><Currency cents={ligne.amountCents} signe /></td>
                  <td className="num">
                    <button
                      type="button"
                      className="finance-button finance-button--quiet finance-button--mini"
                      aria-expanded={corrigee === ligne.id}
                      onClick={() => setCorrigee((actuelle) => (actuelle === ligne.id ? null : ligne.id))}
                    >Corriger</button>
                  </td>
                </tr>
                {corrigee === ligne.id ? <tr className="finance-table__edition">
                  <td colSpan={6}><Correction record={record} accounts={accounts} categories={categories} commitments={data.commitments} /></td>
                </tr> : null}
              </Fragment>;
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>Solde des mouvements</td>
              <td className={`num ${classeMontant(total)}`}><Currency cents={total} signe /></td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    {/* Sous 680 px : deux colonnes prioritaires (libellé, montant), le reste
        dans un `<details>`. Le défilement horizontal casserait la colonne de
        montants alignée à droite — donc la comparaison verticale, au moment
        précis où elle sert le plus. */}
    <ul className="finance-cards" data-view="cards">
      {lignes.map((ligne) => {
        const record = parId.get(ligne.id);
        if (!record) return null;
        return <li key={ligne.id}>
          <details>
            <summary>
              <span className="finance-cards__label">
                <strong>{ligne.label}</strong>
                <span>{dateCourte(ligne.date)} · {ligne.account}</span>
              </span>
              <span className="finance-cards__amount"><Currency cents={ligne.amountCents} signe /></span>
            </summary>
            <dl>
              <dt>Date</dt><dd>{ligne.date}</dd>
              <dt>Compte</dt><dd>{ligne.account}</dd>
              <dt>Catégorie</dt><dd>{ligne.category}</dd>
              {record.commitmentName ? <><dt>Engagement</dt><dd>{record.commitmentName}</dd></> : null}
            </dl>
            {/* La correction reste repliée : ouvrir une ligne sert d'abord à LIRE
                ce que les deux colonnes prioritaires ne montrent pas. Dérouler
                sept champs de formulaire par-dessus enterre l'information. */}
            <details className="finance-cards__corriger">
              <summary>Corriger</summary>
              <Correction record={record} accounts={accounts} categories={categories} commitments={data.commitments} />
            </details>
          </details>
        </li>;
      })}
    </ul>
  </>;
}

/** Un en-tête triable. `aria-sort` porte l'état pour qui n'en voit pas la flèche. */
function EnTete({ colonne, libelle, tri, onTri, numerique = false }: {
  colonne: JournalColumn; libelle: string; tri: JournalSort;
  onTri: (colonne: JournalColumn) => void; numerique?: boolean;
}) {
  const actif = tri.column === colonne;
  return <th scope="col" className={numerique ? 'num' : undefined}
    aria-sort={actif ? (tri.direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
    <button type="button" onClick={() => onTri(colonne)}>
      {libelle}<span aria-hidden="true">{actif ? (tri.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
    </button>
  </th>;
}

/** Le formulaire de correction, partagé par la ligne de tableau et la carte mobile. */
function Correction({ record, accounts, categories, commitments }: {
  record: Data['transactions'][number]; accounts: Data['accounts'];
  categories: Data['categories']; commitments: Data['commitments'];
}) {
  const { transaction } = record;
  if (transaction.kind === 'transfer') {
    return <Delete intent="deleteTransaction" id={transaction.id} text="Ce transfert supprimera ses deux écritures." />;
  }
  return <>
    <Form method="post" className="finance-form">
      <input type="hidden" name="intent" value="updateTransaction" />
      <input type="hidden" name="id" value={transaction.id} />
      <label>Nature<select name="kind" defaultValue={transaction.kind}><option value="expense">Dépense</option><option value="income">Revenu</option></select></label>
      <label>Compte<AccountSelect accounts={accounts} name="accountId" selected={transaction.accountId} /></label>
      <CategorySelect categories={categories} selected={transaction.categoryId ?? undefined} />
      <CommitmentSelect commitments={commitments} selected={transaction.recurringCommitmentId} />
      <label>Montant (€)<input name="amount" defaultValue={decimalMoney(Math.abs(transaction.amountCents))} inputMode="decimal" required /></label>
      <label>Date<input name="occurredOn" type="date" defaultValue={transaction.occurredOn} required /></label>
      <label>Note facultative<input name="note" defaultValue={transaction.note} maxLength={240} /></label>
      <button className="finance-button">Enregistrer</button>
    </Form>
    <Delete intent="deleteTransaction" id={transaction.id} text="Cette suppression est définitive." />
  </>;
}

/**
 * Le raccourci `N` — la saisie est le geste numéro un, elle mérite une touche.
 *
 * ⚠️ Il ne s'arme que si une saisie est **possible** (un compte actif et une
 * catégorie active) : une touche qui ne fait rien apprend à ne plus l'utiliser.
 * Et il ne se déclenche jamais depuis un champ, sinon taper « novembre » dans
 * une note ouvrirait la modale au premier « n ».
 */
function estUneSaisie(cible: EventTarget | null) {
  if (!(cible instanceof HTMLElement)) return false;
  if (cible.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName);
}

function useRaccourciSaisie(actif: boolean) {
  const [ouverte, setOuverte] = useState(false);
  const declencheur = useRef<HTMLElement | null>(null);

  const ouvrir = useCallback((depuis: HTMLElement | null) => {
    declencheur.current = depuis;
    setOuverte(true);
  }, []);

  // ⚠️ Le focus revient à l'élément qui a ouvert la modale. Sans ça, il repart
  // au début du document : après une saisie, on se retrouve en haut du rail.
  const fermer = useCallback(() => {
    setOuverte(false);
    declencheur.current?.focus();
    declencheur.current = null;
  }, []);

  useEffect(() => {
    if (!actif) return undefined;
    const surTouche = (evenement: KeyboardEvent) => {
      if (evenement.key !== 'n' && evenement.key !== 'N') return;
      if (evenement.metaKey || evenement.ctrlKey || evenement.altKey) return;
      if (estUneSaisie(evenement.target)) return;
      evenement.preventDefault();
      ouvrir(document.activeElement instanceof HTMLElement ? document.activeElement : null);
    };
    document.addEventListener('keydown', surTouche);
    return () => document.removeEventListener('keydown', surTouche);
  }, [actif, ouvrir]);

  return { ouverte, ouvrir, fermer };
}

const SELECTEUR_FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

/**
 * La modale de saisie rapide.
 *
 * Trois partis pris, tous au service de l'enchaînement :
 *
 * - **Le focus part sur Montant**, pas sur le premier champ. Compte, catégorie
 *   et date ont des valeurs par défaut utiles ; le montant est la seule donnée
 *   qu'on ne peut pas deviner.
 * - **`⌘↵` enregistre** sans quitter le clavier.
 * - **« Enchaîner les saisies »** garde la modale ouverte, vide le montant et
 *   la note, et rend le focus au montant. Compte, catégorie et date restent :
 *   c'est ce qui permet six mouvements d'affilée sans toucher la souris.
 *
 * ⚠️ Le clic sur le fond ne ferme PAS. Fermer un formulaire rempli sur un clic
 * à côté fait perdre la saisie sans confirmation ; `Échap` et le bouton
 * « Fermer » sont deux gestes délibérés, ce qui suffit.
 */
function ModaleSaisie({ data, accounts, categories, onFermer }: {
  data: Data; accounts: Data['accounts']; categories: Data['categories']; onFermer: () => void;
}) {
  const fetcher = useFetcher<ActionData>();
  const panneau = useRef<HTMLDivElement>(null);
  const formulaire = useRef<HTMLFormElement>(null);
  const montant = useRef<HTMLInputElement>(null);
  const traite = useRef<unknown>(null);
  const [erreurMontant, setErreurMontant] = useState<string | null>(null);
  const [enchainer, setEnchainer] = useState(true);
  const [enregistrees, setEnregistrees] = useState(0);

  useEffect(() => { montant.current?.focus(); }, []);

  useEffect(() => {
    if (fetcher.state !== 'idle' || !fetcher.data) return;
    // Une même réponse ne doit être traitée qu'une fois : sans ce garde-fou, un
    // rendu déclenché par autre chose reviderait le montant au milieu d'une
    // frappe.
    if (traite.current === fetcher.data) return;
    traite.current = fetcher.data;
    if (!('saved' in fetcher.data)) return;
    if (!enchainer) { onFermer(); return; }
    setEnregistrees((nombre) => nombre + 1);
    setErreurMontant(null);
    if (formulaire.current) {
      const note = formulaire.current.elements.namedItem('note');
      if (note instanceof HTMLInputElement) note.value = '';
    }
    if (montant.current) { montant.current.value = ''; montant.current.focus(); }
  }, [fetcher.state, fetcher.data, enchainer, onFermer]);

  const surTouche = (evenement: React.KeyboardEvent<HTMLDivElement>) => {
    if (evenement.key === 'Escape') { evenement.preventDefault(); onFermer(); return; }
    if (evenement.key === 'Enter' && (evenement.metaKey || evenement.ctrlKey)) {
      evenement.preventDefault();
      formulaire.current?.requestSubmit();
      return;
    }
    if (evenement.key !== 'Tab') return;
    // Piège de focus : sans lui, Tab sort de la modale et laisse tabuler la page
    // qui est derrière, pendant que le fond continue de la masquer.
    const focusables = panneau.current?.querySelectorAll<HTMLElement>(SELECTEUR_FOCUSABLE);
    if (!focusables || focusables.length === 0) return;
    const premier = focusables[0];
    const dernier = focusables[focusables.length - 1];
    if (evenement.shiftKey && document.activeElement === premier) { evenement.preventDefault(); dernier.focus(); }
    else if (!evenement.shiftKey && document.activeElement === dernier) { evenement.preventDefault(); premier.focus(); }
  };

  /**
   * Validation du montant AVANT l'envoi.
   *
   * ⚠️ Elle appelle `parseEuros`, c'est-à-dire exactement la fonction que le
   * serveur applique : le message affiché ne peut donc pas contredire ce que le
   * serveur acceptera. Le filet est écrit depuis ce que `parseEuros` LÈVE — un
   * `TypeError` sur un format refusé, un `RangeError` au-delà de deux décimales
   * ou hors entier sûr — et rien d'autre n'est avalé.
   */
  const surEnvoi = (evenement: React.FormEvent<HTMLFormElement>) => {
    const saisi = montant.current?.value ?? '';
    let message: string | null = null;
    try {
      if (parseEuros(saisi) <= 0) message = 'Saisir un montant supérieur à zéro.';
    } catch (erreur) {
      if (!(erreur instanceof TypeError || erreur instanceof RangeError)) throw erreur;
      message = erreur.message;
    }
    setErreurMontant(message);
    if (message) { evenement.preventDefault(); montant.current?.focus(); }
  };

  const erreurServeur = fetcher.data && 'error' in fetcher.data ? fetcher.data.error : null;

  return <div className="finance-modal" onKeyDown={surTouche}>
    <div className="finance-modal__panel" ref={panneau} role="dialog" aria-modal="true" aria-labelledby="saisie-titre">
      <div className="finance-modal__tete">
        <h2 id="saisie-titre">Saisie rapide</h2>
        <button type="button" className="finance-button finance-button--quiet finance-button--mini" onClick={onFermer}>
          Fermer <kbd>Échap</kbd>
        </button>
      </div>

      {/* L'erreur du serveur est générique : elle reste au niveau du
          formulaire. L'attribuer au champ Montant via `aria-describedby`
          annoncerait un défaut de ce champ qui n'est peut-être pas le sien. */}
      {erreurServeur ? <p className="finance-alert" role="alert"><span><strong>Erreur. </strong>{erreurServeur}</span></p> : null}

      <fetcher.Form method="post" className="finance-form" ref={formulaire} onSubmit={surEnvoi}>
        <input type="hidden" name="intent" value="createTransaction" />
        <input type="hidden" name="quick" value="1" />
        <label>Montant (€)
          <input
            ref={montant}
            name="amount"
            inputMode="decimal"
            placeholder="0,00"
            required
            aria-invalid={erreurMontant ? true : undefined}
            aria-describedby={erreurMontant ? 'saisie-montant-erreur' : undefined}
          />
        </label>
        {/* Sous le champ, pas dans un toast : le message doit survivre au temps
            qu'il faut pour le lire, et rester à côté de ce qu'il concerne. */}
        {erreurMontant ? <p className="finance-field-error" id="saisie-montant-erreur" role="alert">{erreurMontant}</p> : null}

        <label>Nature<select name="kind" defaultValue="expense"><option value="expense">Dépense</option><option value="income">Revenu</option></select></label>
        <label>Compte<AccountSelect accounts={accounts} name="accountId" /></label>
        <CategorySelect categories={categories} />
        <CommitmentSelect commitments={data.commitments} />
        <label>Date<input name="occurredOn" type="date" defaultValue={`${data.period}-01`} required /></label>
        <label>Note facultative<input name="note" maxLength={240} /></label>

        <label className="finance-inline">
          <input type="checkbox" checked={enchainer} onChange={(evenement) => setEnchainer(evenement.target.checked)} />
          Enchaîner les saisies
        </label>

        <div className="finance-modal__pied">
          <button className="finance-button" disabled={fetcher.state !== 'idle'}>
            {fetcher.state === 'idle' ? 'Enregistrer' : 'Enregistrement…'} <kbd>⌘↵</kbd>
          </button>
          {enregistrees > 0 ? <p className="finance-modal__compte" role="status">
            {enregistrees} mouvement{enregistrees > 1 ? 's' : ''} enregistré{enregistrees > 1 ? 's' : ''}.
          </p> : null}
        </div>
      </fetcher.Form>
    </div>
  </div>;
}

function Budget({ data }: { data: Data }) {
  const expenses = data.categories.filter((category) => category.isActive && category.kind === 'expense');
  const reserve = data.planning.reserve;
  return <section className="finance-content finance-grid">
    <section className="finance-card"><h2>Budget mensuel — {data.period}</h2>{expenses.length === 0 ? <p>Ajoute d’abord une catégorie de dépense.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setBudget" /><input type="hidden" name="period" value={data.period} /><label>Catégorie<select name="categoryId">{expenses.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Prévu (€)<input name="plannedAmount" inputMode="decimal" placeholder="0,00" required /></label><button className="finance-button">Définir le budget</button></Form>}</section>
    <section className="finance-card finance-card--wide"><h2>Prévu et réalisé</h2>{data.dashboard.budgets.length === 0 ? <p>Aucun budget de dépense à afficher pour ce mois.</p> : <PrevuRealise budgets={data.dashboard.budgets} detail={({ category, budget }) => <>
      <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setBudget" /><input type="hidden" name="period" value={data.period} /><input type="hidden" name="categoryId" value={category.id} /><label>Prévu pour {category.name} (€)<input name="plannedAmount" defaultValue={budget ? decimalMoney(budget.plannedAmountCents) : ''} inputMode="decimal" placeholder="0,00" required /></label><button className="finance-button">{budget ? 'Modifier le prévu' : 'Définir le prévu'}</button></Form>
      {budget ? <Delete intent="deleteBudget" id={budget.id} text="Retirer ce budget." /> : null}
    </>} />}<p className="finance-help">Le réalisé provient des dépenses du journal. Les transferts ne sont ni revenus ni dépenses.</p></section>
    <section className="finance-card finance-card--wide"><h2>Apports GoMining prévus — {data.period}</h2>{data.gominingBudgetPlans.length === 0 ? <p>Aucun apport GoMining lié à une catégorie de budget pour ce mois.</p> : <TableauDense
      legende="Indication de budget : aucun apport ne crée de transaction."
      lignes={data.gominingBudgetPlans}
      cle={(plan) => plan.scenarioId}
      colonnes={[
        { cle: 'scenario', libelle: 'Scénario', valeur: (plan) => plan.name, tri: (plan) => plan.name },
        { cle: 'categorie', libelle: 'Catégorie', valeur: (plan) => data.categories.find((item) => item.id === plan.categoryId)?.name ?? 'Catégorie indisponible' },
        { cle: 'prevu', libelle: 'Apport prévu', numerique: true, valeur: (plan) => <Currency cents={plan.contributionCents} />, tri: (plan) => plan.contributionCents },
      ]}
      carte={{ titre: (plan) => plan.name, montant: (plan) => <Currency cents={plan.contributionCents} /> }}
    />}<p className="finance-help">Cet apport est une indication de budget : il ne modifie pas le budget mensuel et ne crée aucune transaction réelle.</p></section>
    <section className="finance-card"><h2>Réserve de sécurité</h2><p className="finance-help">La réserve est calculée depuis les soldes des comptes cochés à la fin de cette période. Aucun solde n’est saisi deux fois.</p>{data.accounts.length === 0 ? <p>Ajoute un compte avant de configurer la réserve.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setSafetyReserve" /><label>Cible (€)<input name="targetAmount" defaultValue={reserve ? decimalMoney(reserve.targetAmountCents) : ''} inputMode="decimal" required /></label><fieldset className="finance-checklist"><legend>Comptes inclus</legend>{data.accounts.map((account) => <label key={account.id}><input type="checkbox" name="accountIds" value={account.id} defaultChecked={reserve?.accounts.some((selected) => selected.id === account.id) ?? false} /> {account.name}</label>)}</fieldset><button className="finance-button">Enregistrer la réserve</button></Form>}{reserve ? <><p>Constaté : {money(reserve.currentAmountCents)} · cible : {money(reserve.targetAmountCents)}.</p><Delete intent="deleteSafetyReserve" text="Retirer cette configuration de réserve." /></> : null}</section>
    <section className="finance-card"><h2>Nouvel engagement mensuel</h2>{expenses.length === 0 ? <p>Ajoute une catégorie de dépense avant de définir un engagement.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createCommitment" /><label>Nom<input name="name" required maxLength={100} /></label><label>Catégorie<select name="categoryId">{expenses.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Montant prévu (€)<input name="plannedAmount" inputMode="decimal" placeholder="0,00" required /></label><label>Jour prévu<input name="dueDay" type="number" min="1" max="31" defaultValue="1" required /></label><label>À partir de<input name="startPeriod" type="month" defaultValue={data.period} required /></label><label>Jusqu’à (facultatif)<input name="endPeriod" type="month" /></label><button className="finance-button">Ajouter l’engagement</button></Form>}</section>
    <section className="finance-card finance-card--wide"><h2>Engagements — {data.period}</h2>{data.planning.commitments.length === 0 ? <p>Aucun engagement planifié pour ce mois.</p> : <EngagementsDuMois commitments={data.planning.commitments} detail={({ commitment }) => <><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateCommitment" /><input type="hidden" name="id" value={commitment.id} /><label>Nom<input name="name" defaultValue={commitment.name} required maxLength={100} /></label><label>Catégorie<select name="categoryId" defaultValue={commitment.categoryId}>{expenses.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Montant prévu (€)<input name="plannedAmount" defaultValue={decimalMoney(commitment.plannedAmountCents)} inputMode="decimal" required /></label><label>Jour prévu<input name="dueDay" type="number" min="1" max="31" defaultValue={commitment.dueDay} required /></label><label>À partir de<input name="startPeriod" type="month" defaultValue={commitment.startPeriod} required /></label><label>Jusqu’à (facultatif)<input name="endPeriod" type="month" defaultValue={commitment.endPeriod ?? ''} /></label><button className="finance-button">Enregistrer</button></Form><Delete intent="deleteCommitment" id={commitment.id} text="Supprimer cet engagement sans paiement relié." /></>} />}<p className="finance-help">Un engagement est un prévu. Pour compter un paiement, relie explicitement la dépense correspondante depuis le journal, avec la même catégorie.</p></section>
  </section>;
}

const assetClassLabel = { securities: 'Titres et placements', crypto: 'Crypto-actifs', real_estate: 'Immobilier', business: 'Participation / business', other: 'Autre actif' } as const;
const allocationLabel = { liquidities: 'Liquidités', ...assetClassLabel } as const;

function Wealth({ data }: { data: Data }) {
  const wealth = data.wealth;
  const liquidCents = data.dashboard.accounts.reduce((total, account) => euroCents(total + account.balanceCents), 0);
  const grossCents = euroCents(liquidCents + wealth.manualAssetCents);
  const netCents = euroCents(grossCents - wealth.debtCents);
  const hasObservedGoMiningBtc = wealth.assets.some(({ asset }) => asset.source === 'gomining-observed-btc');
  if (data.entities.length === 0) return <section className="finance-empty"><h2>Commencer par une entité</h2><p>Le patrimoine reste rattaché à une entité personnelle ou business.</p><Link className="finance-button" to={path('accounts', data.period)}>Configurer les comptes</Link></section>;
  return <section className="finance-content finance-grid">
    <section className="finance-card finance-card--wide"><h2>Bilan au {wealth.asOfDate}</h2><p className="finance-help">Les liquidités sont recalculées depuis les comptes. GoMining est une projection et n’est pas compté comme valeur de revente.</p><section className="finance-metrics"><Metric label="Liquidités" cents={liquidCents} /><Metric label="Actifs valorisés" cents={wealth.manualAssetCents} /><Metric label="Dettes" cents={-wealth.debtCents} /><Metric label="Patrimoine net" cents={netCents} emphasis /></section><p>Patrimoine brut : {money(grossCents)}. Un actif ou une dette sans état à cette date est exclu du total.</p></section>
    <section className="finance-card"><h2>Allocation observée</h2>{wealth.allocation.totalCents === 0 ? <p>Aucune valeur d’actif à répartir pour cette date.</p> : <><List rows={wealth.allocation.rows.map((row) => [allocationLabel[row.assetClass], `${money(row.amountCents)} · ${((row.shareBasisPoints ?? 0) / 100).toFixed(2).replace('.', ',')} %`])} /><p className="finance-help">Répartition constatée des actifs bruts. Les dettes, objectifs et cibles d’allocation ne sont pas intégrés.</p></>}</section>
    <section className="finance-card"><h2>Nouvel actif</h2><p className="finance-help">Hors comptes liquides. Sa première valorisation est obligatoire et datée.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createWealthAsset" /><label>Entité<select name="entityId">{data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><label>Classe<select name="assetClass">{Object.entries(assetClassLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Quantité / unité (facultatif)<input name="quantityDescription" maxLength={80} placeholder="ex. 12 titres" /></label><label>Capital versé (€)<input name="contributedAmount" defaultValue="0,00" inputMode="decimal" required /></label><label>Valorisation au<input name="valuedOn" type="date" defaultValue={wealth.asOfDate} required /></label><label>Valeur estimée (€)<input name="valueAmount" inputMode="decimal" required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Ajouter l’actif</button></Form></section>
    <section className="finance-card"><h2>BTC GoMining observés</h2><p className="finance-help">Saisis seulement les BTC réellement détenus à cette date. La puissance TH et les scénarios restent exclus.</p>{hasObservedGoMiningBtc ? <p>La position BTC GoMining existe déjà ; ajoute une valorisation datée depuis sa fiche.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="createObservedGoMiningBtc" /><label>Entité<select name="entityId">{data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>BTC observés (<Satoshi />)<input name="observedBtcSats" type="number" min="0" required /></label><label>Valorisation au<input name="valuedOn" type="date" defaultValue={wealth.asOfDate} required /></label><label>Valeur estimée (€)<input name="valueAmount" inputMode="decimal" required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Ajouter les BTC observés</button></Form>}</section>
    <section className="finance-card finance-card--wide"><h2>Actifs et valorisations</h2>{wealth.assets.length === 0 ? <p>Aucun actif hors comptes n’est encore enregistré.</p> : <ul className="finance-records">{wealth.assets.map(({ asset, valuation, valuations }) => <li key={asset.id}><div><strong>{asset.name}</strong><p>{asset.source === 'gomining-observed-btc' ? `BTC réellement observés chez GoMining : ${asset.observedBtcSats} sats` : `${assetClassLabel[asset.assetClass]}${asset.quantityDescription ? ` · ${asset.quantityDescription}` : ''} · capital versé : ${money(asset.contributedCents)}`}</p><p>{valuation ? `Valeur retenue : ${money(valuation.valueCents)} au ${valuation.valuedOn}` : 'Aucune valorisation à cette date : actif exclu du bilan.'}</p><details><summary>Historique — {valuations.length} valorisation{valuations.length > 1 ? 's' : ''}</summary><Trend
    legende={`${asset.name} — valorisations relevées`}
    series={valuations.map((item) => ({ label: dateAxe(item.valuedOn), cents: item.valueCents, at: dayNumber(item.valuedOn) }))}
  /></details></div><details><summary>Ajouter une valorisation</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="addWealthValuation" /><input type="hidden" name="assetId" value={asset.id} /><label>Date<input name="valuedOn" type="date" defaultValue={wealth.asOfDate} required /></label><label>Valeur estimée (€)<input name="valueAmount" inputMode="decimal" required /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Enregistrer</button></Form></details></li>)}</ul>}</section>
    <section className="finance-card"><h2>Nouvelle dette</h2><p className="finance-help">Le capital restant dû, le taux et la mensualité constituent une photographie datée. L’échéancier est indicatif.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createWealthDebt" /><label>Entité<select name="entityId">{data.entities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><label>État au<input name="asOfDate" type="date" defaultValue={wealth.asOfDate} required /></label><label>Capital restant dû (€)<input name="outstandingAmount" inputMode="decimal" required /></label><label>Mensualité (€)<input name="monthlyPayment" inputMode="decimal" required /></label><label>Taux annuel (%)<input name="annualRate" defaultValue="0,00" inputMode="decimal" required /></label><label>Mois restants<input name="remainingMonths" type="number" min="1" max="600" required /></label><button className="finance-button">Ajouter la dette</button></Form></section>
    <section className="finance-card finance-card--wide"><h2>Dettes et échéanciers</h2>{wealth.debts.length === 0 ? <p>Aucune dette n’est encore enregistrée.</p> : <ul className="finance-records">{wealth.debts.map(({ debt, balance, balances }) => { const schedule = balance ? projectDebtSchedule(balance) : null; return <li key={debt.id}><div><strong>{debt.name}</strong><p>{balance ? `Capital retenu : ${money(balance.outstandingCents)} au ${balance.asOfDate} · mensualité : ${money(balance.monthlyPaymentCents)} · taux : ${(balance.annualRateBasisPoints / 100).toFixed(2).replace('.', ',')} %` : 'Aucun état de dette à cette date : dette exclue du bilan.'}</p>{schedule ? <details><summary>Échéancier indicatif</summary><p>{schedule.amortizes ? `Extinction projetée après ${schedule.rows.length} mensualité${schedule.rows.length > 1 ? 's' : ''}.` : `La mensualité ne rembourse pas le capital ; reste projeté : ${money(schedule.remainingCents)}.`}</p><div className="finance-table-wrap"><table className="finance-table"><caption>Douze premières échéances</caption><thead><tr><th>Mois</th><th>Intérêts</th><th>Capital</th><th>Restant dû</th></tr></thead><tbody>{schedule.rows.slice(0, 12).map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.interestCents)}</td><td>{money(row.principalCents)}</td><td>{money(row.remainingCents)}</td></tr>)}</tbody></table></div></details> : null}<details><summary>États enregistrés — {balances.length}</summary><List rows={balances.map((item) => [item.asOfDate, money(item.outstandingCents)])} /></details></div><details><summary>Ajouter un état daté</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="addWealthDebtBalance" /><input type="hidden" name="debtId" value={debt.id} /><label>État au<input name="asOfDate" type="date" defaultValue={wealth.asOfDate} required /></label><label>Capital restant dû (€)<input name="outstandingAmount" inputMode="decimal" required /></label><label>Mensualité (€)<input name="monthlyPayment" inputMode="decimal" required /></label><label>Taux annuel (%)<input name="annualRate" defaultValue="0,00" inputMode="decimal" required /></label><label>Mois restants<input name="remainingMonths" type="number" min="1" max="600" required /></label><button className="finance-button">Enregistrer</button></Form></details></li>; })}</ul>}</section>
  </section>;
}

function Business({ data }: { data: Data }) {
  const businessEntities = data.entities.filter((entity) => entity.type === 'business');
  const business = data.business;
  const surplusCents = euroCents(business.revenueCents - business.operatingExpenseCents);
  const entityName = new Map(businessEntities.map((entity) => [entity.id, entity.name]));
  if (businessEntities.length === 0) return <section className="finance-empty"><h2>Créer une entité business</h2><p>Les données business restent séparées du foyer. Crée une entité de type Business avant d’ajouter une activité.</p><Link className="finance-button" to={path('accounts', data.period)}>Gérer les entités</Link></section>;
  return <section className="finance-content finance-grid">
    <section className="finance-card finance-card--wide"><h2>Pilotage observé — {business.period}</h2><p className="finance-help">CA et charges sont des observations mensuelles. Le MRR est le revenu récurrent observé ; l’ARR indicatif est strictement MRR × 12, jamais du CA annualisé. Le cash conservé est un solde d’entité ; le distribué est un flux du mois. Aucun montant n’est copié dans le foyer, et aucune fiscalité n’est calculée.</p><section className="finance-metrics"><Metric label="CA" cents={business.revenueCents} /><Metric label="Charges" cents={business.operatingExpenseCents} /><Metric label="Résultat opérationnel" cents={surplusCents} emphasis /><Metric label="Cash conservé" cents={business.retainedCashCents} />{business.mrrActivityCount > 0 ? <><Metric label={`MRR observé (${business.mrrActivityCount}/${business.activeActivityCount})`} cents={business.mrrCents} /><Metric label="ARR indicatif" cents={business.annualRecurringRevenueCents} /></> : null}</section><p>Distribué ce mois : {money(business.distributedCents)}. {business.activeCustomerActivityCount > 0 ? `Clients actifs renseignés (${business.activeCustomerActivityCount}/${business.activeActivityCount}) : ${business.activeCustomerCount}.` : 'Nombre de clients actifs non renseigné.'} {business.maintenanceActivityCount > 0 ? `Maintenance renseignée (${business.maintenanceActivityCount}/${business.activeActivityCount}) : ${formatMaintenance(business.maintenanceMinutes)}.` : 'Temps de maintenance non renseigné.'}</p></section>
    <section className="finance-card"><h2>Nouvelle activité</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createBusinessActivity" /><label>Entité business<select name="entityId">{businessEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><button className="finance-button">Ajouter l’activité</button></Form></section>
    <section className="finance-card"><h2>Métriques SaaS — {business.period}</h2>{business.activities.length === 0 ? <p>Ajoute une activité avant de saisir ses métriques.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="setBusinessMetrics" /><input type="hidden" name="period" value={business.period} /><label>Activité<select name="activityId">{business.activities.filter(({ activity }) => activity.isActive).map(({ activity }) => <option key={activity.id} value={activity.id}>{activity.name}</option>)}</select></label><label>CA encaissé (€)<input name="revenueAmount" inputMode="decimal" required /></label><label>Charges opérationnelles (€)<input name="operatingExpenseAmount" inputMode="decimal" required /></label><label>MRR observé (€ — facultatif)<input name="mrrAmount" inputMode="decimal" /></label><label>Clients actifs (facultatif)<input name="activeCustomerCount" type="number" min="0" max="1000000000" step="1" /></label><label>Maintenance (minutes — facultatif)<input name="maintenanceMinutes" type="number" min="0" max="44640" step="1" /></label><p className="finance-help">Laisse un champ facultatif vide si la mesure est inconnue : il ne sera pas remplacé par zéro.</p><button className="finance-button">Enregistrer le mois</button></Form>}</section>
    <section className="finance-card"><h2>Cash business — {business.period}</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="setBusinessCash" /><input type="hidden" name="period" value={business.period} /><label>Entité business<select name="entityId">{businessEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Cash conservé fin de mois (€)<input name="retainedCashAmount" inputMode="decimal" required /></label><label>Distribué au foyer ce mois (€)<input name="distributedAmount" defaultValue="0,00" inputMode="decimal" required /></label><button className="finance-button">Enregistrer le cash</button></Form></section>
    <section className="finance-card"><h2>Nouvelle provision — {business.period}</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createBusinessProvision" /><input type="hidden" name="period" value={business.period} /><label>Entité business<select name="entityId">{businessEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Libellé<input name="name" required maxLength={100} /></label><label>Montant provisionné (€)<input name="amount" inputMode="decimal" required /></label><label>Note facultative<input name="note" maxLength={240} /></label><p className="finance-help">Déclaration manuelle distincte du cash et de toute fiscalité calculée.</p><button className="finance-button">Ajouter la provision</button></Form></section>
    <section className="finance-card finance-card--wide"><h2>Indice par application — {business.period}</h2><p className="finance-help">Indicateur exploratoire, ni prévision ni recommandation : il moyenne seulement la marge opérationnelle observée du mois (0 % → 0, 50 % ou plus → 100) et l’évolution du MRR sur trois mois (−20 % ou moins → 0, +20 % ou plus → 100). Il est normalisé sur les signaux calculables ; une donnée inconnue réduit la couverture, jamais le score.</p>{business.activities.length === 0 ? <p>Aucune activité à évaluer.</p> : <ul className="finance-records">{business.activities.filter(({ activity }) => activity.isActive).map(({ activity, score }) => <li key={activity.id}><div><strong>{activity.name}</strong>{score.scoreBasisPoints === null ? <p>Indice indisponible · couverture : {formatPercent(score.coverageBasisPoints)}.</p> : <p>Indice observé : {formatPercent(score.scoreBasisPoints)} · couverture : {formatPercent(score.coverageBasisPoints)}.</p>}{score.components.length > 0 ? <p>{score.components.map((component) => `${component.label} : ${component.key === 'mrr-trend' ? formatSignedPercent(component.observedBasisPoints) : formatPercent(component.observedBasisPoints)}`).join(' · ')}</p> : <p className="finance-help">Il faut un CA positif pour la marge et/ou quatre MRR mensuels consécutifs, avec un premier MRR positif, pour la tendance.</p>}</div></li>)}</ul>}</section>
    <section className="finance-card"><h2>Concentration MRR — {business.period}</h2>{business.concentration.length === 0 ? <p>Aucun MRR renseigné pour les activités actives.</p> : <><List rows={business.concentration.map((item) => [item.activity.name, `${money(item.mrrCents)} · ${item.shareBasisPoints === null ? 'part non calculable' : `${formatPercent(item.shareBasisPoints)} du MRR renseigné`}`])} />{business.mrrActivityCount < business.activeActivityCount ? <p className="finance-help">La couverture est incomplète : les parts portent seulement sur le MRR renseigné, jamais sur un zéro supposé.</p> : null}</>}</section>
    <section className="finance-card"><h2>Stabilité observée</h2>{business.stability ? <p>Variation du MRR entre {business.stability.fromPeriod} et {business.stability.toPeriod} : {money(business.stability.changeCents)}{business.stability.changeBasisPoints === null ? ' (pourcentage non calculable depuis un MRR initial nul).' : ` (${formatSignedPercent(business.stability.changeBasisPoints)}).`}</p> : <p>Il faut quatre mois calendaires consécutifs avec un MRR renseigné pour chaque activité active avant de comparer l’évolution.</p>}</section>
    <section className="finance-card finance-card--wide"><h2>Évolution MRR — six derniers mois</h2><p className="finance-help">Chaque ligne indique le MRR réellement renseigné et sa couverture ; une période incomplète n’est jamais assimilée à zéro.</p><TendanceMrr history={business.mrrHistory} /><div className="finance-table-wrap"><table className="finance-table"><caption>Historique MRR observé</caption><thead><tr><th>Période</th><th>MRR renseigné</th><th>Couverture</th></tr></thead><tbody>{business.mrrHistory.map((item) => <tr key={item.period}><td>{item.period}</td><td>{item.mrrActivityCount === 0 ? 'Non renseigné' : money(item.mrrCents)}</td><td>{item.mrrActivityCount}/{item.activeActivityCount} activité{item.activeActivityCount > 1 ? 's' : ''}{item.complete ? ' · complet' : ' · incomplet'}</td></tr>)}</tbody></table></div></section>
    <section className="finance-card finance-card--wide"><h2>Activités — {business.period}</h2>{business.activities.length === 0 ? <p>Aucune activité business enregistrée.</p> : <ul className="finance-records">{business.activities.map(({ activity, metric }) => <li key={activity.id}><div><strong>{activity.name}</strong><p>{metric ? `CA : ${money(metric.revenueCents)} · charges : ${money(metric.operatingExpenseCents)} · résultat opérationnel : ${money(metric.revenueCents - metric.operatingExpenseCents)}` : 'Aucune métrique saisie pour ce mois.'}</p>{metric ? <p>MRR : {metric.mrrCents === null ? 'non renseigné' : money(metric.mrrCents)}{metric.mrrCents === null ? '' : ` · ARR indicatif : ${money(euroCents(metric.mrrCents * 12))}`} · clients actifs : {metric.activeCustomerCount ?? 'non renseigné'} · maintenance : {metric.maintenanceMinutes === null ? 'non renseignée' : formatMaintenance(metric.maintenanceMinutes)}</p> : null}</div></li>)}</ul>}<h3>Provisions déclarées — {money(business.provisionCents)}</h3>{business.provisions.length === 0 ? <p>Aucune provision déclarée pour ce mois.</p> : <ul className="finance-records">{business.provisions.map((provision) => <li key={provision.id}><div><strong>{provision.name}</strong><p>{entityName.get(provision.entityId) ?? 'Entité indisponible'} · {money(provision.amountCents)}{provision.note ? ` · ${provision.note}` : ''}</p></div><details><summary>Modifier</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateBusinessProvision" /><input type="hidden" name="id" value={provision.id} /><input type="hidden" name="period" value={business.period} /><label>Entité business<select name="entityId" defaultValue={provision.entityId}>{businessEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name}</option>)}</select></label><label>Libellé<input name="name" defaultValue={provision.name} required maxLength={100} /></label><label>Montant provisionné (€)<input name="amount" defaultValue={decimalMoney(provision.amountCents)} inputMode="decimal" required /></label><label>Note facultative<input name="note" defaultValue={provision.note} maxLength={240} /></label><button className="finance-button">Enregistrer</button></Form></details></li>)}</ul>}<h3>Cash conservé par entité</h3>{business.cash.length === 0 ? <p>Aucun état de cash disponible.</p> : <List rows={business.cash.map((cash) => [`${entityName.get(cash.entityId) ?? 'Entité indisponible'} · ${cash.period}`, money(cash.retainedCashCents)])} />}</section>
  </section>;
}

function formatMaintenance(minutes: number) { return `${Math.floor(minutes / 60)} h ${minutes % 60} min`; }
function formatPercent(basisPoints: number) { return `${(basisPoints / 100).toFixed(2).replace('.', ',')} %`; }
function formatSignedPercent(basisPoints: number) { return `${basisPoints > 0 ? '+' : ''}${formatPercent(basisPoints)}`; }

const projectStatusLabel = { backlog: 'Backlog', active: 'En cours', paused: 'En pause', done: 'Terminé' } as const;
function Goals({ data }: { data: Data }) {
  const goals = data.goals;
  const goalName = new Map(goals.goals.map((goal) => [goal.id, goal.name]));
  const part = (goal: Data['goals']['goals'][number]) => goal.targetCents > 0 ? goal.progressCents / goal.targetCents : null;
  return <section className="finance-content finance-grid">
    <section className="finance-card finance-card--wide"><h2>Priorités manuelles</h2><p className="finance-help">Les objectifs et projets organisent les intentions ; leur progression, coût et charge sont saisis manuellement. Ils ne créent aucune transaction, n’allouent aucun cash et ne remplacent pas les sources budget, patrimoine ou business.</p></section>
    <section className="finance-card"><h2>Capacité mensuelle</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="setProjectCapacity" /><label>Minutes disponibles par mois<input name="monthlyCapacityMinutes" type="number" min="0" max="44640" step="1" defaultValue={goals.capacity?.monthlyCapacityMinutes ?? ''} required /></label><button className="finance-button">Enregistrer la capacité</button></Form></section>
    <section className="finance-card"><h2>Charge des projets en cours</h2>{goals.capacityStatus === 'compatible' ? <p>Compatible : {formatMaintenance(goals.activeEffortMinutes)} estimées pour {formatMaintenance(goals.capacity!.monthlyCapacityMinutes)} disponibles ({goals.activeEffortProjectCount}/{goals.activeProjectCount} projets renseignés).</p> : goals.capacityStatus === 'watch' ? <p>À surveiller : {formatMaintenance(goals.activeEffortMinutes)} estimées dépassent la capacité de {formatMaintenance(goals.capacity!.monthlyCapacityMinutes)} ({goals.activeProjectCount} projets en cours).</p> : <p>Charge inconnue : renseigne une capacité mensuelle et une charge pour chaque projet en cours ({goals.activeEffortProjectCount}/{goals.activeProjectCount} projets renseignés).</p>}<p className="finance-help">Cet indicateur informe seulement ; il ne bloque aucun projet et ne propose aucune allocation.</p></section>
    <section className="finance-card"><h2>Concentration</h2>{goals.activeProjectLimitStatus === 'within-limit' ? <p>{goals.activeProjectCount}/{goals.activeProjectLimit} projets en cours : limite souple respectée.</p> : <p>À surveiller : {goals.activeProjectCount} projets sont en cours, au-delà de la limite souple de {goals.activeProjectLimit}.</p>}<p className="finance-help">Tu peux toujours activer un autre projet : ce signal ne bloque aucune action.</p></section>
    <section className="finance-card"><h2>Nouvel objectif</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createGoal" /><label>Nom<input name="name" required maxLength={100} /></label><label>Montant cible (€)<input name="targetAmount" inputMode="decimal" required /></label><label>Progression observée (€)<input name="progressAmount" defaultValue="0,00" inputMode="decimal" required /></label><label>Échéance (facultative)<input name="targetDate" type="date" /></label><label>Priorité (1 = première)<input name="priority" type="number" min="1" max="999" step="1" defaultValue="1" required /></label><button className="finance-button">Ajouter l’objectif</button></Form></section>
    <section className="finance-card"><h2>Nouveau projet</h2><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createProject" /><label>Objectif lié (facultatif)<select name="goalId"><option value="">Aucun</option>{goals.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label><label>Nom<input name="name" required maxLength={100} /></label><label>Statut<select name="status" defaultValue="backlog"><option value="backlog">Backlog</option><option value="active">En cours</option><option value="paused">En pause</option><option value="done">Terminé</option></select></label><label>Priorité (1 = première)<input name="priority" type="number" min="1" max="999" step="1" defaultValue="1" required /></label><label>Coût estimé (€ — facultatif)<input name="estimatedCostAmount" inputMode="decimal" /></label><label>Charge estimée (minutes — facultatif)<input name="estimatedEffortMinutes" type="number" min="0" max="44640" step="1" /></label><label>Prochaine action<input name="nextAction" maxLength={240} /></label><button className="finance-button">Ajouter le projet</button></Form></section>
    <section className="finance-card finance-card--wide"><h2>Objectifs</h2>{goals.goals.length === 0 ? <p>Aucun objectif : commence par rendre une intention mesurable, sans la relier automatiquement à un compte.</p> : <TableauDense
      legende="Progression saisie à la main : elle n’est reliée à aucun compte."
      lignes={goals.goals}
      cle={(goal) => goal.id}
      colonnes={[
        { cle: 'priorite', libelle: 'Priorité', numerique: true, valeur: (goal) => goal.priority, tri: (goal) => goal.priority },
        { cle: 'nom', libelle: 'Objectif', valeur: (goal) => goal.name, tri: (goal) => goal.name },
        { cle: 'echeance', libelle: 'Échéance', valeur: (goal) => goal.targetDate ? <time dateTime={goal.targetDate}>{dateAxe(goal.targetDate)}</time> : 'sans échéance', tri: (goal) => goal.targetDate },
        { cle: 'avancement', libelle: 'Avancement', valeur: (goal) => <ProgressionCompacte atteint={goal.progressCents} cible={goal.targetCents} />, tri: part },
        { cle: 'atteint', libelle: 'Atteint', numerique: true, valeur: (goal) => <Currency cents={goal.progressCents} />, tri: (goal) => goal.progressCents },
        { cle: 'cible', libelle: 'Cible', numerique: true, valeur: (goal) => <Currency cents={goal.targetCents} />, tri: (goal) => goal.targetCents },
      ]}
      carte={{ titre: (goal) => goal.name, sousTitre: (goal) => `priorité ${goal.priority} · ${goal.targetDate ? `échéance ${dateAxe(goal.targetDate)}` : 'sans échéance'}`, montant: (goal) => <Currency cents={goal.targetCents} /> }}
      detail={(goal) => <Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateGoal" /><input type="hidden" name="id" value={goal.id} /><label>Nom<input name="name" defaultValue={goal.name} required maxLength={100} /></label><label>Montant cible (€)<input name="targetAmount" defaultValue={decimalMoney(goal.targetCents)} inputMode="decimal" required /></label><label>Progression observée (€)<input name="progressAmount" defaultValue={decimalMoney(goal.progressCents)} inputMode="decimal" required /></label><label>Échéance (facultative)<input name="targetDate" type="date" defaultValue={goal.targetDate ?? ''} /></label><label>Priorité (1 = première)<input name="priority" type="number" min="1" max="999" step="1" defaultValue={goal.priority} required /></label><button className="finance-button">Enregistrer</button></Form>}
    />}</section>
    <section className="finance-card finance-card--wide"><h2>Projets</h2>{goals.projects.length === 0 ? <p>Aucun projet dans le backlog.</p> : <TableauDense
      legende="Coût et charge sont des estimations saisies ; « — » signale une valeur non renseignée, jamais un zéro."
      lignes={goals.projects}
      cle={(project) => project.id}
      colonnes={[
        { cle: 'priorite', libelle: 'Priorité', numerique: true, valeur: (project) => project.priority, tri: (project) => project.priority },
        { cle: 'nom', libelle: 'Projet', valeur: (project) => <>{project.name}{project.nextAction ? <span className="finance-table__aparte"> · {project.nextAction}</span> : null}</>, tri: (project) => project.name },
        { cle: 'statut', libelle: 'Statut', valeur: (project) => projectStatusLabel[project.status], tri: (project) => projectStatusLabel[project.status] },
        { cle: 'objectif', libelle: 'Objectif', valeur: (project) => project.goalId ? goalName.get(project.goalId) ?? 'indisponible' : '—', tri: (project) => project.goalId ? goalName.get(project.goalId) ?? null : null },
        { cle: 'charge', libelle: 'Charge', numerique: true, valeur: (project) => project.estimatedEffortMinutes === null ? '—' : formatMaintenance(project.estimatedEffortMinutes), tri: (project) => project.estimatedEffortMinutes },
        { cle: 'cout', libelle: 'Coût', numerique: true, valeur: (project) => project.estimatedCostCents === null ? '—' : <Currency cents={project.estimatedCostCents} />, tri: (project) => project.estimatedCostCents },
      ]}
      carte={{ titre: (project) => project.name, sousTitre: (project) => `${projectStatusLabel[project.status]} · priorité ${project.priority}`, montant: (project) => project.estimatedCostCents === null ? '—' : <Currency cents={project.estimatedCostCents} /> }}
      detail={(project) => <Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateProject" /><input type="hidden" name="id" value={project.id} /><label>Objectif lié (facultatif)<select name="goalId" defaultValue={project.goalId ?? ''}><option value="">Aucun</option>{goals.goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.name}</option>)}</select></label><label>Nom<input name="name" defaultValue={project.name} required maxLength={100} /></label><label>Statut<select name="status" defaultValue={project.status}><option value="backlog">Backlog</option><option value="active">En cours</option><option value="paused">En pause</option><option value="done">Terminé</option></select></label><label>Priorité (1 = première)<input name="priority" type="number" min="1" max="999" step="1" defaultValue={project.priority} required /></label><label>Coût estimé (€ — facultatif)<input name="estimatedCostAmount" defaultValue={project.estimatedCostCents === null ? '' : decimalMoney(project.estimatedCostCents)} inputMode="decimal" /></label><label>Charge estimée (minutes — facultatif)<input name="estimatedEffortMinutes" type="number" min="0" max="44640" step="1" defaultValue={project.estimatedEffortMinutes ?? ''} /></label><label>Prochaine action<input name="nextAction" defaultValue={project.nextAction} maxLength={240} /></label><button className="finance-button">Enregistrer</button></Form>}
    />}</section>
  </section>;
}

const simulationBucketLabel = { placements: 'Placements', business: 'Business', material: 'Matériel', projects: 'Projets', opportunities: 'Opportunités', debt: 'Remboursement dette' } as const;
function SimulationBusinesses({ data, configured }: { data: Data; configured: Map<string, SimulationInput['businesses'][number]> }) {
  const [chargeCounts, setChargeCounts] = useState<Record<string, number>>(() => Object.fromEntries(data.business.activities.map(({ activity }) => [activity.id, Math.max(1, configured.get(activity.id)?.charges.length ?? 0)])));
  if (data.business.activities.length === 0) return <p className="finance-help">Aucune activité business suivie : la part « business » restera disponible dans le foyer jusqu’à ce qu’une activité soit renseignée.</p>;
  return <>{data.business.activities.map(({ activity, metric }) => { const business = configured.get(activity.id); const count = chargeCounts[activity.id] ?? 1; return <section key={activity.id} className="finance-card"><h3>{activity.name}</h3><label>Cash de départ (€)<input name={`businessCash-${activity.id}`} defaultValue={decimalMoney(business?.openingCashCents ?? 0)} inputMode="decimal" required /></label><label>CA mensuel (€)<input name={`businessRevenue-${activity.id}`} defaultValue={decimalMoney(business?.monthlyRevenueCents ?? metric?.revenueCents ?? 0)} inputMode="decimal" required /></label><label>Croissance mensuelle (%) — facultative<input name={`businessGrowth-${activity.id}`} defaultValue={business?.monthlyGrowthBasisPoints === undefined ? '' : (business.monthlyGrowthBasisPoints / 100).toFixed(2).replace('.', ',')} inputMode="decimal" placeholder="Utilise le profil" /></label><p className="finance-help">Laisse vide pour utiliser la croissance du profil ; une valeur saisie devient l’hypothèse propre à cette activité.</p><h4>Charges planifiées</h4>{Array.from({ length: count }, (_, index) => { const charge = business?.charges[index]; return <section key={index} className="finance-grid"><label>Nom<input name={`businessChargeName-${activity.id}-${index}`} maxLength={100} defaultValue={charge?.name ?? ''} /></label><label>Montant (€)<input name={`businessChargeAmount-${activity.id}-${index}`} inputMode="decimal" defaultValue={charge ? decimalMoney(charge.amountCents) : ''} /></label><label>Fréquence<select name={`businessChargeFrequency-${activity.id}-${index}`} defaultValue={charge?.frequency ?? 'monthly'}><option value="once">Ponctuelle</option><option value="monthly">Mensuelle</option><option value="quarterly">Trimestrielle</option><option value="annual">Annuelle</option></select></label><label>Mois de début<input name={`businessChargeStart-${activity.id}-${index}`} type="number" min="1" max="120" defaultValue={charge?.startMonth ?? 1} required /></label><label>Mois de fin (facultatif)<input name={`businessChargeEnd-${activity.id}-${index}`} type="number" min="1" max="120" defaultValue={charge?.endMonth ?? ''} /></label></section>; })}<button type="button" className="finance-button finance-button--quiet" onClick={() => setChargeCounts((previous: Record<string, number>) => ({ ...previous, [activity.id]: Math.min(60, count + 1) }))}>Ajouter une charge</button></section>; })}</>;
}
const simulationProfiles = {
  prudent: { label: 'Prudent', profile: { annualPlacementReturnBasisPoints: 300, businessMonthlyGrowthBasisPoints: 0, householdExpenseAnnualInflationBasisPoints: 300 } },
  central: { label: 'Central', profile: { annualPlacementReturnBasisPoints: 600, businessMonthlyGrowthBasisPoints: 200, householdExpenseAnnualInflationBasisPoints: 200 } },
  ambitious: { label: 'Ambitieux', profile: { annualPlacementReturnBasisPoints: 800, businessMonthlyGrowthBasisPoints: 500, householdExpenseAnnualInflationBasisPoints: 100 } },
} as const;

function SimulationProfileFields({ current }: { current: Data['simulations']['current'] }) {
  const [kind, setKind] = useState<SimulationProfileKind>(current?.snapshot.profileKind ?? (current ? 'custom' : 'central'));
  const profile = kind === 'custom' ? current?.snapshot.profile ?? simulationProfiles.central.profile : simulationProfiles[kind].profile;
  return <><label>Profil<select name="profileKind" value={kind} onChange={(event) => setKind(event.target.value as SimulationProfileKind)}><option value="prudent">Prudent</option><option value="central">Central</option><option value="ambitious">Ambitieux</option><option value="custom">Personnalisé</option></select></label><section key={kind} className="finance-grid"><label>Rendement placements annuel (%)<input name="placementReturn" defaultValue={(profile.annualPlacementReturnBasisPoints / 100).toFixed(2).replace('.', ',')} inputMode="decimal" required /></label><label>Croissance business mensuelle (%)<input name="businessGrowth" defaultValue={(profile.businessMonthlyGrowthBasisPoints / 100).toFixed(2).replace('.', ',')} inputMode="decimal" required /></label><label>Inflation dépenses foyer annuelle (%)<input name="expenseInflation" defaultValue={(profile.householdExpenseAnnualInflationBasisPoints / 100).toFixed(2).replace('.', ',')} inputMode="decimal" required /></label></section>{kind === 'custom' ? <p className="finance-help">Les trois taux restent entièrement modifiables et seront enregistrés dans une nouvelle révision.</p> : <p className="finance-help">Tu peux ajuster les taux avant l’enregistrement : la révision sera alors conservée avec ce profil et ses valeurs exactes.</p>}</>;
}

function SimulationConfiguration({ data, current, weights, configuredBusiness }: { data: Data; current: Data['simulations']['current']; weights: SimulationInput['weights']; configuredBusiness: Map<string, SimulationInput['businesses'][number]> }) {
  return <section className="finance-card finance-card--wide"><h2>Hypothèses de simulation</h2><p className="finance-help">Chaque enregistrement crée une nouvelle révision privée. Les simulations déjà lancées restent inchangées. Fiscalité non modélisée ; aucun mouvement réel n’est créé.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="saveSimulation" /><label>Horizon (mois)<input name="months" type="number" min="1" max="120" defaultValue={current?.snapshot.months ?? 120} required /></label><SimulationProfileFields current={current} /><section className="finance-grid"><label>Cash foyer de départ (€)<input name="openingHouseholdCash" defaultValue={decimalMoney(current?.snapshot.openingHouseholdCashCents ?? sumEuroCents(data.dashboard.accounts.map((account) => euroCents(Math.max(0, account.balanceCents)))))} inputMode="decimal" required /></label><label>Patrimoine observé figé (€)<input name="frozenObservedAssets" defaultValue={decimalMoney(current?.snapshot.frozenObservedAssetCents ?? data.wealth.manualAssetCents)} inputMode="decimal" required /></label><label>Revenus foyer mensuels (€)<input name="monthlyHouseholdIncome" defaultValue={decimalMoney(current?.snapshot.monthlyHouseholdIncomeCents ?? data.dashboard.incomeCents)} inputMode="decimal" required /></label><label>Dépenses foyer mensuelles (€)<input name="monthlyHouseholdExpense" defaultValue={decimalMoney(current?.snapshot.monthlyHouseholdExpenseCents ?? data.dashboard.expenseCents)} inputMode="decimal" required /></label></section><label>Scénario GoMining (un seul, facultatif)<select name="gominingScenarioId" defaultValue={current?.snapshot.gominingScenarioId ?? ''}><option value="">Aucun</option>{data.gomining.map(({ scenario }) => <option key={scenario.id} value={scenario.id}>{scenario.name}</option>)}</select></label><h3>Répartition mensuelle du surplus</h3>{simulationBuckets.map((bucket) => <label key={bucket}>{simulationBucketLabel[bucket]} (%)<input name={`${bucket}Weight`} defaultValue={(weights[bucket] / 100).toFixed(2).replace('.', ',')} inputMode="decimal" required /></label>)}<h3>Business — CA, cash et charges</h3><SimulationBusinesses data={data} configured={configuredBusiness} /><button className="finance-button">Créer une révision d’hypothèses</button></Form></section>;
}

function Simulations({ data }: { data: Data }) {
  const current = data.simulations.current?.snapshot;
  const weights = current?.weights ?? { placements: 5_000, business: 1_500, material: 500, projects: 1_000, opportunities: 500, debt: 1_500 };
  const configuredBusiness = new Map(current?.businesses.map((item) => [item.id, item]));
  return <section className="finance-content finance-grid">
    <SimulationConfiguration data={data} current={data.simulations.current} weights={weights} configuredBusiness={configuredBusiness} />
    {data.simulations.current ? <section className="finance-card"><h2>Lancer le calcul</h2><p>Révision active : {data.simulations.current.revision}. Le moteur calcule 120 mois maximum et conserve un instantané complet.</p><Form method="post"><input type="hidden" name="intent" value="runSimulation" /><input type="hidden" name="assumptionId" value={data.simulations.current.id} /><button className="finance-button">Lancer la simulation</button></Form></section> : null}
    <SimulationHistory runs={data.simulations.runs} />
  </section>;
}

function SimulationHistory({ runs }: { runs: Data['simulations']['runs'] }) {
  if (runs.length === 0) return <section className="finance-card finance-card--wide"><h2>Historique des simulations</h2><p>Aucune exécution enregistrée.</p><p className="finance-help">Les montants projetés sont des résultats d’hypothèses ; ils ne constituent ni une transaction ni une prévision garantie.</p></section>;
  const reference = runs[0]!;
  return <section className="finance-card finance-card--wide"><h2>Historique et comparaison</h2><p className="finance-help">La première ligne est la simulation la plus récente. Les écarts la comparent aux autres instantanés immuables ; aucune donnée réelle n’est modifiée.</p><div className="finance-table-wrap"><table className="finance-table"><caption>Comparaison des hypothèses exécutées</caption><thead><tr><th>Exécution</th><th>Profil</th><th>Patrimoine final</th><th>Écart</th><th>Cash min.</th><th>Dette finale</th><th>Liberté</th></tr></thead><tbody>{runs.map((run) => { const delta = run.result.finalNetWealthCents - reference.result.finalNetWealthCents; return <tr key={run.id}><td>{run.createdAt.slice(0, 16).replace('T', ' ')}</td><td>{run.input.profileKind === 'prudent' ? 'Prudent' : run.input.profileKind === 'ambitious' ? 'Ambitieux' : run.input.profileKind === 'custom' ? 'Personnalisé' : 'Central'}</td><td>{money(run.result.finalNetWealthCents)}</td><td>{delta === 0 ? 'Référence' : `${delta > 0 ? '+' : '−'}${money(Math.abs(delta))}`}</td><td>{money(run.result.minimumHouseholdCashCents)}</td><td>{money(run.result.finalDebtCents)}</td><td>{run.result.freedomRateBasisPoints === null ? '—' : formatPercent(run.result.freedomRateBasisPoints)}</td></tr>; })}</tbody></table></div><ul className="finance-records">{runs.map((run) => <li key={run.id}><SimulationRunDetails run={run} /></li>)}</ul><p className="finance-help">Les montants projetés sont des résultats d’hypothèses ; ils ne constituent ni une transaction ni une prévision garantie.</p></section>;
}
function SimulationRunDetails({ run }: { run: Data['simulations']['runs'][number] }) { const milestones = run.result.months.filter((row) => [1, 12, 36, 60, 120].includes(row.month)); return <div>{/* Les jalons 1/12/36/60/120 donnent cinq chiffres exacts ; ils ne disent
         rien de ce qui se passe entre deux. La courbe couvre tous les mois
         projetés — un creux au mois 40 est invisible dans le tableau. */}
  <Trend
    legende="Patrimoine net projeté"
    note={`${run.result.months.length} mois projetés. Résultat d’hypothèses, jamais une prévision garantie.`}
    series={run.result.months.map((row) => ({ label: `M${row.month}`, cents: row.netWealthCents, at: row.month }))}
  /><strong>{run.createdAt.slice(0, 16).replace('T', ' ')} UTC · révision {run.assumption?.revision ?? 'archivée'}</strong><p>Patrimoine net final : {money(run.result.finalNetWealthCents)} · cash minimum : {money(run.result.minimumHouseholdCashCents)} · dette finale : {money(run.result.finalDebtCents)}.</p><p>Intérêts : {money(run.result.totalInterestCents)} · taux de liberté : {run.result.freedomRateBasisPoints === null ? 'non calculable' : formatPercent(run.result.freedomRateBasisPoints)}.</p><details><summary>Hypothèses et jalons</summary><p>Horizon {run.input.months} mois · placements {formatPercent(run.input.profile.annualPlacementReturnBasisPoints)} annuel · business {formatPercent(run.input.profile.businessMonthlyGrowthBasisPoints)} mensuel · dépenses foyer {formatPercent(run.input.profile.householdExpenseAnnualInflationBasisPoints)} annuel. Fiscalité non modélisée.</p><div className="finance-table-wrap"><table className="finance-table"><caption>Jalons simulés</caption><thead><tr><th>Mois</th><th>Cash foyer</th><th>Placements</th><th>Business</th><th>Dette</th><th>Patrimoine net</th></tr></thead><tbody>{milestones.map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.householdCashCents)}</td><td>{money(row.placementCents)}</td><td>{money(row.businessCashCents)}</td><td>{money(row.debtCents)}</td><td>{money(row.netWealthCents)}</td></tr>)}</tbody></table></div>{run.result.goals.length > 0 ? <p>Objectifs simulés : {run.result.goals.map((goal) => `${money(goal.projectedProgressCents)} / ${money(goal.targetCents)}`).join(' · ')}.</p> : null}</details></div>; }

function Cfo({ data }: { data: Data }) {
  const { context, history } = data.cfo;
  const latestEvaluation = history[0];
  const latest = latestEvaluation?.result;
  return <section className="finance-content finance-grid">
    <section className="finance-card finance-card--wide"><h2>Évaluer le contexte — {context.period}</h2><p className="finance-help">Cette évaluation enregistre un instantané privé et immuable des données actuellement suivies. Elle ne crée aucun paiement, transfert, ordre ni transaction.</p><section className="finance-metrics"><Metric label="Liquidités suivies" cents={context.liquidCashCents} /><Metric label="Engagements non réglés" cents={context.unpaidCommitmentCents} /><Metric label="Mensualités de dette" cents={context.debtPaymentCents} /><Metric label="Provisions business" cents={context.businessProvisionCents} /><Metric label="Apports GoMining budgétés" cents={context.gominingContributionCents} /><Metric label="Réserve constatée" cents={context.reserveCurrentCents} /><Metric label="Cash potentiellement allouable" cents={Math.max(0, context.liquidCashCents - context.unpaidCommitmentCents - context.debtPaymentCents - context.businessProvisionCents - context.gominingContributionCents - Math.max(0, (context.reserveTargetCents ?? context.reserveCurrentCents) - context.reserveCurrentCents))} emphasis /></section><Form method="post"><input type="hidden" name="intent" value="evaluateCfo" /><button className="finance-button">Évaluer et historiser</button></Form></section>
    <CfoWeights rules={data.cfo.rules} />
    {latest ? <section className="finance-card finance-card--wide"><h2>Dernière meilleure action</h2><p><strong>{latest.title}</strong></p><p>{latest.explanation}</p><p>Priorité : {latest.priority} · cash allouable calculé : {money(latest.allocableCashCents)}.</p>{latest.speculativeShareBasisPoints === null ? <p>Part spéculative : non calculable sans patrimoine valorisé.</p> : <p>Part spéculative observée : {formatPercent(latest.speculativeShareBasisPoints)}.</p>}{latest.warnings.length > 0 ? <ul className="finance-records">{latest.warnings.map((warning) => <li key={warning}><p>{warning}</p></li>)}</ul> : null}{latest.allocation ? <><div className="finance-table-wrap"><table className="finance-table"><caption>Allocation indicative — sans écriture réelle</caption><thead><tr><th>Destination</th><th>Poids</th><th>Proposition</th></tr></thead><tbody>{latest.allocation.map((item) => <tr key={item.bucket}><td>{({ placements: 'Placements', business: 'Business', material: 'Matériel', projects: 'Projets', opportunities: 'Cash / opportunités' })[item.bucket]}</td><td>{formatPercent(item.weightBasisPoints)}</td><td>{money(item.amountCents)}</td></tr>)}</tbody></table></div><section className="finance-grid"><Form method="post" className="finance-form"><input type="hidden" name="intent" value="decideCfo" /><input type="hidden" name="evaluationId" value={latestEvaluation!.id} /><input type="hidden" name="outcome" value="accepted" /><label>Note sur le plan (facultative)<input name="note" maxLength={240} /></label><button className="finance-button">Accepter comme plan interne</button></Form><Form method="post" className="finance-form"><input type="hidden" name="intent" value="decideCfo" /><input type="hidden" name="evaluationId" value={latestEvaluation!.id} /><input type="hidden" name="outcome" value="ignored" /><label>Pourquoi ignorer ? (facultatif)<input name="note" maxLength={240} /></label><button className="finance-button finance-button--quiet">Ignorer la proposition</button></Form></section></> : <p className="finance-help">Aucune allocation n’est proposée tant qu’une priorité ou un avertissement bloquant reste présent.</p>}</section> : <section className="finance-empty"><h2>Pas encore d’évaluation</h2><p>Le moteur utilisera seulement les données déjà saisies dans les modules privés. Commence par l’évaluation ci-dessus.</p></section>}
    {latestEvaluation?.result.allocation ? <><CfoModifiedPlan evaluation={latestEvaluation} /><CfoComparison evaluation={latestEvaluation} /></> : null}
    <section className="finance-card finance-card--wide"><h2>Historique immuable</h2>{history.length === 0 ? <p>Aucune évaluation enregistrée.</p> : <ul className="finance-records">{history.map((evaluation) => <li key={evaluation.id}><div><strong>{evaluation.createdAt.slice(0, 16).replace('T', ' ')} UTC · {evaluation.period}</strong><p>{evaluation.result.title} · règle {evaluation.ruleVersion} · cash allouable : {money(evaluation.result.allocableCashCents)}</p><p>{evaluation.result.explanation}</p>{evaluation.decisions.map((decision) => <p key={decision.id}>Décision : {({ accepted: 'plan interne accepté', modified: 'plan interne adapté', ignored: 'proposition ignorée' })[decision.outcome]} le {decision.createdAt.slice(0, 16).replace('T', ' ')} UTC{decision.note ? ` · ${decision.note}` : ''}.</p>)}{evaluation.comparisons.map((comparison) => <p key={comparison.id}>Comparaison « {comparison.name} » enregistrée le {comparison.createdAt.slice(0, 16).replace('T', ' ')} UTC.</p>)}</div></li>)}</ul>}<p className="finance-help">Une évaluation, ses décisions et ses comparaisons ne peuvent être ni modifiées ni supprimées : un nouveau calcul ou une nouvelle hypothèse crée toujours un nouvel instantané.</p></section>
  </section>;
}

const cfoBucketLabel = { placements: 'Placements', business: 'Business', material: 'Matériel', projects: 'Projets', opportunities: 'Cash / opportunités' } as const;
function CfoWeights({ rules }: { rules: Data['cfo']['rules'] }) { return <section className="finance-card"><h2>Poids pour les prochaines évaluations</h2><p className="finance-help">Règle active : {rules.version}. Les cinq poids doivent totaliser 100 %. Enregistrer crée une nouvelle révision ; les évaluations déjà produites restent inchangées.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="setCfoWeights" />{cfoBuckets.map((bucket) => <label key={bucket}>{cfoBucketLabel[bucket]} (%)<input name={`${bucket}Weight`} defaultValue={(rules.weights[bucket] / 100).toFixed(2).replace('.', ',')} inputMode="decimal" required /></label>)}<button className="finance-button">Créer une nouvelle règle</button></Form></section>; }
function CfoModifiedPlan({ evaluation }: { evaluation: Data['cfo']['history'][number] }) { const allocation = new Map(evaluation.result.allocation!.map((item) => [item.bucket, item.amountCents])); return <section className="finance-card"><h2>Adapter cette proposition</h2><p className="finance-help">Modification ponctuelle : répartis exactement {money(evaluation.result.allocableCashCents)}. Elle crée un plan interne distinct et ne modifie pas les poids futurs.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="decideCfo" /><input type="hidden" name="evaluationId" value={evaluation.id} /><input type="hidden" name="outcome" value="modified" />{cfoBuckets.map((bucket) => <label key={bucket}>{cfoBucketLabel[bucket]} (€)<input name={`${bucket}Amount`} defaultValue={decimalMoney(allocation.get(bucket) ?? 0)} inputMode="decimal" required /></label>)}<label>Note sur l’adaptation (facultative)<input name="note" maxLength={240} /></label><button className="finance-button">Enregistrer le plan adapté</button></Form></section>; }
function CfoComparison({ evaluation }: { evaluation: Data['cfo']['history'][number] }) { const allocation = new Map(evaluation.result.allocation!.map((item) => [item.bucket, item.amountCents])); const latest = evaluation.comparisons.at(-1); const alternative = latest ? new Map(latest.allocation.map((item) => [item.bucket, item.amountCents])) : null; return <section className="finance-card finance-card--wide"><h2>Comparer une autre répartition</h2><p className="finance-help">Hypothèse ponctuelle, sans modifier la proposition ni les poids récurrents. Elle répartit exactement {money(evaluation.result.allocableCashCents)} et ne prédit pas encore les rendements.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="compareCfo" /><input type="hidden" name="evaluationId" value={evaluation.id} /><label>Nom de l’hypothèse<input name="name" maxLength={100} required placeholder="Ex. Priorité placements" /></label>{cfoBuckets.map((bucket) => <label key={bucket}>{cfoBucketLabel[bucket]} (€)<input name={`${bucket}Amount`} defaultValue={decimalMoney(allocation.get(bucket) ?? 0)} inputMode="decimal" required /></label>)}<button className="finance-button finance-button--quiet">Comparer sans modifier</button></Form>{alternative ? <div className="finance-table-wrap"><table className="finance-table"><caption>Dernière comparaison : {latest!.name}</caption><thead><tr><th>Destination</th><th>Proposition</th><th>Hypothèse</th><th>Écart</th></tr></thead><tbody>{cfoBuckets.map((bucket) => { const base = allocation.get(bucket) ?? 0; const value = alternative.get(bucket) ?? 0; return <tr key={bucket}><td>{cfoBucketLabel[bucket]}</td><td>{money(base)}</td><td>{money(value)}</td><td>{value === base ? '—' : `${value > base ? '+' : '−'}${money(Math.abs(value - base))}`}</td></tr>; })}</tbody></table></div> : null}</section>; }

function Regulations({ data }: { data: Data }) {
  const actionData = useActionData<ActionData>();
  const resolution = actionData && 'regulationResolution' in actionData ? actionData.regulationResolution : undefined;
  const names = [...new Map(data.regulations.rules.map((rule) => [rule.name.normalize('NFKC').trim().toLocaleLowerCase('fr-FR'), rule.name])).values()];
  const status = (value: RegulatoryResolution['status']) => ({ applicable: 'applicable', missing: 'indisponible', overlap: 'chevauchement à corriger' })[value];
  const validite = (rule: Data['regulations']['rules'][number]) => `du ${dateAxe(rule.validFrom)}${rule.validTo ? ` au ${dateAxe(rule.validTo)}` : ''}`;
  return <section className="finance-content finance-grid">
    <section className="finance-card"><h2>Nouvelle règle</h2><p className="finance-help">Registre manuel : vérifier la source avant toute utilisation. Aucune valeur ne déclenche un calcul fiscal automatique.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createRegulatoryRule" /><label>Nom<input name="name" required maxLength={100} /></label><label>Valeur / règle<input name="value" required maxLength={120} /></label><label>Source<input name="source" required maxLength={500} /></label><label>Vérifiée le<input name="verifiedOn" type="date" required /></label><label>Valable à partir du<input name="validFrom" type="date" required /></label><label>Valable jusqu’au (facultatif)<input name="validTo" type="date" /></label><label>Note facultative<input name="note" maxLength={240} /></label><button className="finance-button">Enregistrer la règle</button></Form></section>
    <section className="finance-card"><h2>Résoudre à une date</h2><p className="finance-help">La recherche reste privée : nom et date sont envoyés par POST, jamais dans l’URL.</p>{names.length === 0 ? <p>Aucune règle à résoudre.</p> : <Form method="post" className="finance-form"><input type="hidden" name="intent" value="resolveRegulatoryRule" /><label>Règle<select name="name">{names.map((name) => <option key={name} value={name}>{name}</option>)}</select></label><label>Date d’application<input name="asOf" type="date" defaultValue={data.regulations.asOf} required /></label><button className="finance-button">Vérifier l’application</button></Form>}{resolution ? <div className="finance-alert" role="status"><p><strong>{resolution.name}</strong> au {resolution.asOf} : {status(resolution.status)}.</p>{resolution.status === 'applicable' ? <p>Valeur retenue : {resolution.rules[0]?.value}</p> : <p>Aucune valeur n’est retenue automatiquement.</p>}</div> : null}</section>
    <section className="finance-card finance-card--wide"><h2>Couverture au {data.regulations.asOf}</h2>{data.regulations.coverage.length === 0 ? <p>Aucune règle vérifiée.</p> : <TableauDense
      legende="Une règle en chevauchement n’est jamais appliquée : aucune valeur n’est choisie à ta place."
      lignes={data.regulations.coverage}
      cle={(item) => item.name}
      colonnes={[
        { cle: 'nom', libelle: 'Règle', valeur: (item) => item.name, tri: (item) => item.name },
        { cle: 'etat', libelle: 'État', valeur: (item) => `${status(item.status)}${item.status === 'overlap' ? ` (${item.rules.length} règles)` : ''}`, tri: (item) => status(item.status) },
      ]}
      carte={{ titre: (item) => item.name, sousTitre: (item) => status(item.status) }}
    />}</section>
    <section className="finance-card finance-card--wide"><h2>Règles enregistrées</h2>{data.regulations.rules.length === 0 ? <p>Aucune règle vérifiée.</p> : <TableauDense
      legende="Corriger une règle crée une révision : l’historique reste consultable et immuable."
      lignes={data.regulations.rules}
      cle={(rule) => rule.id}
      colonnes={[
        { cle: 'nom', libelle: 'Règle', valeur: (rule) => rule.name, tri: (rule) => rule.name },
        { cle: 'valeur', libelle: 'Valeur', valeur: (rule) => rule.value },
        { cle: 'validite', libelle: 'Validité', valeur: validite, tri: (rule) => rule.validFrom },
        { cle: 'verifiee', libelle: 'Vérifiée le', valeur: (rule) => <time dateTime={rule.verifiedOn}>{dateAxe(rule.verifiedOn)}</time>, tri: (rule) => rule.verifiedOn },
        { cle: 'revision', libelle: 'Révision', numerique: true, valeur: (rule) => rule.revision, tri: (rule) => rule.revision },
      ]}
      carte={{ titre: (rule) => rule.name, sousTitre: (rule) => `${rule.value} · ${validite(rule)}` }}
      libelleDetail="Détail"
      detail={(rule) => <>
        <p className="finance-help">Source : {rule.source}{rule.note ? ` · ${rule.note}` : ''}</p>
        <RegulatoryHistory versions={rule.versions} />
        <details><summary>Créer une nouvelle révision</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateRegulatoryRule" /><input type="hidden" name="id" value={rule.id} /><label>Nom<input name="name" defaultValue={rule.name} required maxLength={100} /></label><label>Valeur / règle<input name="value" defaultValue={rule.value} required maxLength={120} /></label><label>Source<input name="source" defaultValue={rule.source} required maxLength={500} /></label><label>Vérifiée le<input name="verifiedOn" type="date" defaultValue={rule.verifiedOn} required /></label><label>Valable à partir du<input name="validFrom" type="date" defaultValue={rule.validFrom} required /></label><label>Valable jusqu’au (facultatif)<input name="validTo" type="date" defaultValue={rule.validTo ?? ''} /></label><label>Note facultative<input name="note" defaultValue={rule.note} maxLength={240} /></label><button className="finance-button">Créer la révision</button></Form></details>
      </>}
    />}</section>
  </section>;
}

function StatusComparisons({ data }: { data: Data }) {
  const latest = data.statusComparisons[0];
  const horodatage = (iso: string) => `${iso.slice(0, 16).replace('T', ' ')} UTC`;
  return <section className="finance-content finance-grid">
    <RegulatorySourceChecks sources={data.regulatorySources} />
    <section className="finance-card finance-card--wide"><h2>France — prestation de services BIC</h2><p className="finance-help">Micro-entreprise contre SASU sans rémunération, donc 100 % dividendes potentiels. Le comparateur ne choisit jamais un statut et exclut l’impôt personnel sur le revenu et sur les dividendes.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="compareMicroToSasu" /><label>CA annuel HT (€)<input name="annualRevenue" defaultValue={decimalMoney(data.business.revenueCents * 12)} inputMode="decimal" required /></label><label>Charges opérationnelles annuelles (€)<input name="annualOperatingExpense" defaultValue={decimalMoney(data.business.operatingExpenseCents * 12)} inputMode="decimal" required /></label><label>Taux de cotisations micro BIC services (%)<input name="microSocialRate" inputMode="decimal" required /></label><label>Taux d’IS SASU (%)<input name="sasuCorporateTaxRate" inputMode="decimal" required /></label><p className="finance-help">Recopie uniquement des taux que tu as vérifiés dans « Règles ». Ces quatre valeurs exactes sont figées avec le résultat.</p><button className="finance-button">Comparer et conserver</button></Form></section>
    <section className="finance-card finance-card--wide"><h2>Comparaisons enregistrées</h2>{data.statusComparisons.length === 0 ? <p>Aucune comparaison enregistrée.</p> : <TableauDense
      legende="Montants avant impôt personnel. L’écart compare les dividendes bruts potentiels de la SASU au net micro."
      lignes={data.statusComparisons}
      cle={(comparison) => comparison.id}
      colonnes={[
        { cle: 'date', libelle: 'Enregistrée', valeur: (comparison) => horodatage(comparison.createdAt), tri: (comparison) => comparison.createdAt },
        { cle: 'ca', libelle: 'CA annuel', numerique: true, valeur: (comparison) => <Currency cents={comparison.input.annualRevenueCents} />, tri: (comparison) => comparison.input.annualRevenueCents },
        { cle: 'micro', libelle: 'Micro', numerique: true, valeur: (comparison) => <Currency cents={comparison.result.microCashBeforePersonalTaxCents} />, tri: (comparison) => comparison.result.microCashBeforePersonalTaxCents },
        { cle: 'sasu', libelle: 'SASU', numerique: true, valeur: (comparison) => <Currency cents={comparison.result.sasuPotentialGrossDividendsCents} />, tri: (comparison) => comparison.result.sasuPotentialGrossDividendsCents },
        { cle: 'ecart', libelle: 'SASU − micro', numerique: true, valeur: (comparison) => <Currency cents={comparison.result.differenceCents} signe />, tri: (comparison) => comparison.result.differenceCents, classe: (comparison) => classeMontant(comparison.result.differenceCents) },
      ]}
      carte={{ titre: (comparison) => horodatage(comparison.createdAt), sousTitre: (comparison) => `micro ${money(comparison.result.microCashBeforePersonalTaxCents)} · SASU ${money(comparison.result.sasuPotentialGrossDividendsCents)}`, montant: (comparison) => <Currency cents={comparison.result.differenceCents} signe /> }}
      libelleDetail="Détail"
      detail={(comparison) => <>
        <List rows={[
          ['Cotisations micro', money(comparison.result.microSocialContributionsCents)],
          ['Résultat SASU', money(comparison.result.sasuOperatingResultCents)],
          ['IS SASU', money(comparison.result.sasuCorporateTaxCents)],
          ['Taux micro figé', formatPercent(comparison.input.microBicServiceSocialRateBasisPoints)],
          ['Taux d’IS figé', formatPercent(comparison.input.sasuCorporateTaxRateBasisPoints)],
          ['Charges annuelles', money(comparison.input.annualOperatingExpenseCents)],
        ]} />
        <details><summary>Limites du calcul</summary><ul>{comparison.result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></details>
      </>}
    />}{latest ? <p className="finance-help">Dernier instantané : CA {money(latest.input.annualRevenueCents)} et charges {money(latest.input.annualOperatingExpenseCents)}.</p> : null}</section>
  </section>;
}

function RegulatorySourceChecks({ sources }: { sources: Data['regulatorySources'] }) {
  const etat = (source: Data['regulatorySources'][number]) => source.latest === null ? 'jamais vérifiée' : ({ review: 'à revoir manuellement', unchanged: 'inchangée depuis le dernier contrôle', changed: 'modifiée : revue requise', unavailable: 'indisponible lors du contrôle' })[source.latest.state];
  return <section className="finance-card finance-card--wide"><h2>Vérification manuelle des sources</h2>
    <p className="finance-help">Le bouton consulte uniquement une URL officielle prédéfinie, avec délai et taille limités. Un changement ne met aucune règle à jour : relis la source puis crée une nouvelle révision dans « Règles ».</p>
    <TableauDense
      legende={`${sources.length} source${sources.length > 1 ? 's' : ''} officielle${sources.length > 1 ? 's' : ''}`}
      lignes={sources}
      cle={(source) => source.sourceKey}
      colonnes={[
        { cle: 'source', libelle: 'Source', valeur: (source) => <a className="finance-text-link" href={source.url} target="_blank" rel="noreferrer">{source.label}</a>, tri: (source) => source.label },
        { cle: 'etat', libelle: 'État', valeur: etat, tri: etat },
        { cle: 'controle', libelle: 'Dernier contrôle', valeur: (source) => source.latest ? `${source.latest.checkedAt.slice(0, 16).replace('T', ' ')} UTC` : '—', tri: (source) => source.latest?.checkedAt ?? null },
        { cle: 'action', libelle: 'Action', valeur: (source) => <Form method="post"><input type="hidden" name="intent" value="checkRegulatorySource" /><input type="hidden" name="sourceKey" value={source.sourceKey} /><button className="finance-button finance-button--quiet finance-button--mini">Vérifier maintenant</button></Form> },
      ]}
      carte={{ titre: (source) => source.label, sousTitre: etat }}
    />
  </section>;
}

function RegulatoryHistory({ versions }: { versions: Data['regulations']['rules'][number]['versions'] }) { return <details className="finance-details"><summary>Historique immuable — {versions.length} révision{versions.length > 1 ? 's' : ''}</summary><ul className="finance-records">{versions.map((rule) => <li key={rule.id}><div><strong>Révision {rule.revision} · enregistrée le {rule.createdAt.slice(0, 16).replace('T', ' ')} UTC</strong><p>{rule.value} · valide du {rule.validFrom}{rule.validTo ? ` au ${rule.validTo}` : ''} · vérifiée le {rule.verifiedOn}</p><p>Source : {rule.source}{rule.note ? ` · ${rule.note}` : ''}</p></div>{rule.revision === versions[0]?.revision ? <p className="finance-help">Révision courante</p> : null}</li>)}</ul><p className="finance-help">Une révision historique ne peut pas être modifiée ni supprimée.</p></details>; }

function GoMining({ data }: { data: Data }) { return <section className="finance-content finance-grid"><section className="finance-card"><h2>Nouveau scénario mensuel</h2><p className="finance-help">Hypothèses privées datées, sans transaction automatique. Les récompenses nettes sont saisies après frais ; aucune donnée ne vient de GoMining automatiquement.</p><Form method="post" className="finance-form"><input type="hidden" name="intent" value="createGoMiningScenario" /><label>Nom<input name="name" required maxLength={100} /></label><label>Début<input name="startPeriod" type="month" defaultValue={data.period} required /></label><label>Horizon (mois)<input name="horizonMonths" type="number" min="1" max="600" defaultValue="60" required /></label><label>Puissance initiale (milli-TH)<input name="initialHashrateMilliTh" type="number" min="1" required /></label><label>BTC déjà accumulés (<Satoshi />)<input name="initialAccumulatedSats" type="number" min="0" defaultValue="0" required /></label><label>Efficacité (milli-W/TH)<input name="efficiencyMilliWattsPerTh" type="number" min="1" required /></label><label>Récompense nette mensuelle (<Satoshi /> / TH)<input name="monthlyNetRewardSatsPerTh" type="number" min="0" required /></label><label>Prix de 0,001 TH (€)<input name="pricePerMilliTh" inputMode="decimal" placeholder="0,00000" required /></label><label>Cours BTC (€ / BTC)<input name="btcPrice" inputMode="decimal" placeholder="0,00" required /></label><label>Catégorie budget (facultatif)<select name="budgetCategoryId"><option value="">Aucune</option>{data.categories.filter((category) => category.isActive && category.kind === "expense").map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Apport mois 1–12 (€)<input name="phaseOne" inputMode="decimal" placeholder="0,00" required /></label><label>Apport mois 13–36 (€)<input name="phaseTwo" inputMode="decimal" placeholder="0,00" required /></label><label>Apport à partir du mois 37 (€)<input name="phaseThree" inputMode="decimal" placeholder="0,00" required /></label><label className="finance-inline"><input name="reinvestAccumulated" type="checkbox" /> Réinvestir aussi le stock BTC accumulé au franchissement de 10 TH</label><p className="finance-help">Prix au 1/100 000 € près, sans arrondi automatique. Sinon, le stock reste conservé ; apports et réinvestissements prennent effet en fin de mois.</p><button className="finance-button">Enregistrer le scénario</button></Form></section><section className="finance-card finance-card--wide"><h2>Scénarios enregistrés</h2>{data.gomining.length === 0 ? <p>Aucun scénario : renseigne des hypothèses réelles privées pour commencer une projection.</p> : <ul className="finance-records">{data.gomining.map(({ scenario, phases, versions, projection, historyIncomplete }) => <li key={scenario.id}><div><strong>{scenario.name}</strong><p>Projection — début {scenario.startPeriod} · {scenario.horizonMonths} mois · {scenario.accumulatedBtcPolicy === 'reinvest-at-threshold' ? 'stock BTC réinvesti au seuil' : 'stock BTC conservé'}</p><p>Hypothèses : {(scenario.initialHashrateMilliTh / 1000).toFixed(3)} TH · {(scenario.efficiencyMilliWattsPerTh / 1000).toFixed(3)} W/TH · {scenario.monthlyNetRewardSatsPerTh} sats nets/TH/mois · {preciseMoney(scenario.priceMilliCentsPerMilliTh)} pour 0,001 TH</p><p>Apports configurés : {phases.map((phase) => `mois ${phase.startMonth}${phase.endMonth === null ? '+' : `–${phase.endMonth}`} : ${money(phase.amountCents)}`).join(' · ')}</p><p>Seuil 10 TH : {projection.thresholdReachedMonth === null ? 'non atteint sur cet horizon' : `mois ${projection.thresholdReachedMonth}`} · puissance finale : {(projection.finalHashrateMilliTh / 1000).toFixed(3)} TH</p><p>Apports : {money(projection.totalContributionCents)} · TH par apports : {(projection.contributionHashrateMilliTh / 1000).toFixed(3)} · TH par réinvestissement : {(projection.reinvestedHashrateMilliTh / 1000).toFixed(3)}</p><p>BTC générés : {projection.totalRewardSats} sats · conservés : {projection.retainedBtcSats} sats · réinvestis : {projection.reinvestedBtcSats} sats</p>{historyIncomplete ? <p className="finance-help">Une ancienne version incomplète est masquée ; les hypothèses courantes ne sont pas modifiées.</p> : null}<GoMiningMilestones projection={projection} /><GoMiningHistory scenarioId={scenario.id} versions={versions} /></div><GoMiningEditor scenario={scenario} phases={phases} categories={data.categories} /></li>)}</ul>}<p className="finance-help">Les données observées et les projections restent séparées. Ce module exclut cashback, Platinum+, Simple Earn, parrainage, Miner Wars et bonus.</p></section></section>; }

function GoMiningMilestones({ projection }: { projection: Data['gomining'][number]['projection'] }) { const months = [12, 36, 60, 120].filter((month) => month <= projection.months.length); const rows = months.map((month) => projection.months[month - 1]!); return rows.length === 0 ? null : <><GoMiningPowerChart rows={rows} initialHashrateMilliTh={projection.months[0]?.startHashrateMilliTh ?? 0} /><div className="finance-table-wrap"><table className="finance-table"><caption>Jalons de projection</caption><thead><tr><th>Mois</th><th>Puissance</th><th>TH apports</th><th>TH réinvestis</th><th>BTC conservés</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month}><td>{row.month}</td><td>{(row.endHashrateMilliTh / 1000).toFixed(3)} TH</td><td>{(row.contributionHashrateMilliTh / 1000).toFixed(3)} TH</td><td>{(row.reinvestedHashrateMilliTh / 1000).toFixed(3)} TH</td><td>{row.accumulatedBtcSats} sats</td></tr>)}</tbody></table></div><GoMiningMonthlyDetails rows={projection.months} /></>; }

function GoMiningPowerChart({ rows, initialHashrateMilliTh }: { rows: Data['gomining'][number]['projection']['months']; initialHashrateMilliTh: number }) { const maximum = Math.max(...rows.map((row) => row.endHashrateMilliTh), 1); return <figure className="finance-chart"><figcaption>Puissance projetée par origine</figcaption><div className="finance-chart__legend"><span><i className="finance-chart__serie-3" /> Initiale</span><span><i className="finance-chart__serie-2" /> Apports</span><span><i className="finance-chart__serie-1" /> Réinvestissement</span></div><div className="finance-chart__bars" role="img" aria-label="Graphique de puissance projetée distinguant la puissance initiale, les apports et le réinvestissement.">{rows.map((row) => { const initial = Math.min(initialHashrateMilliTh, row.endHashrateMilliTh); const contribution = Math.min(row.contributionHashrateMilliTh, row.endHashrateMilliTh - initial); const reinvestment = Math.max(0, row.endHashrateMilliTh - initial - contribution); return <div className="finance-chart__bar" key={row.month}><div className="finance-chart__stack" style={{ height: `${Math.max(2, row.endHashrateMilliTh / maximum * 100)}%` }}><i className="finance-chart__serie-3" style={{ height: `${initial / row.endHashrateMilliTh * 100}%` }} /><i className="finance-chart__serie-2" style={{ height: `${contribution / row.endHashrateMilliTh * 100}%` }} /><i className="finance-chart__serie-1" style={{ height: `${reinvestment / row.endHashrateMilliTh * 100}%` }} /></div><span>M{row.month}</span></div>; })}</div></figure>; }

function GoMiningMonthlyDetails({ rows }: { rows: Data['gomining'][number]['projection']['months'] }) { return <details className="finance-details"><summary>Voir les {rows.length} mois calculés</summary><div className="finance-table-wrap"><table className="finance-table"><caption>Détail mensuel de la projection</caption><thead><tr><th>Mois</th><th>Apport</th><th>Récompense nette</th><th>Puissance fin de mois</th><th>BTC conservés</th><th>BTC réinvestis cumulés</th></tr></thead><tbody>{rows.map((row) => <tr key={row.month}><td>{row.month}</td><td>{money(row.contributionCents)}</td><td>{row.rewardSats} sats</td><td>{(row.endHashrateMilliTh / 1000).toFixed(3)} TH</td><td>{row.accumulatedBtcSats} sats</td><td>{row.reinvestedBtcSats} sats</td></tr>)}</tbody></table></div></details>; }

function GoMiningHistory({ scenarioId, versions }: { scenarioId: string; versions: Data['gomining'][number]['versions'] }) { const currentRevision = versions[0]?.revision; return <details className="finance-details"><summary>Historique immuable — {versions.length} version{versions.length > 1 ? 's' : ''}</summary><ul className="finance-records">{versions.map(({ id, revision, createdAt, snapshot }) => <li key={id}><div><strong>Version {revision} · enregistrée le {createdAt.slice(0, 16).replace('T', ' ')} UTC</strong><p>{snapshot.startPeriod} · {snapshot.horizonMonths} mois · {(snapshot.initialHashrateMilliTh / 1000).toFixed(3)} TH · {snapshot.accumulatedBtcPolicy === 'reinvest-at-threshold' ? 'stock BTC réinvesti au seuil' : 'stock BTC conservé'}</p><p>Apports : {snapshot.phases.map((phase) => `mois ${phase.startMonth}${phase.endMonth === null ? '+' : `–${phase.endMonth}`} : ${money(phase.amountCents)}`).join(' · ')}</p></div>{revision === currentRevision ? <p className="finance-help">Version courante</p> : <Form method="post"><input type="hidden" name="intent" value="restoreGoMiningVersion" /><input type="hidden" name="scenarioId" value={scenarioId} /><input type="hidden" name="versionId" value={id} /><button className="finance-button">Appliquer comme nouvelle version</button></Form>}</li>)}</ul><p className="finance-help">La restauration crée une nouvelle version : elle ne modifie jamais l’ancienne.</p></details>; }

function GoMiningEditor({ scenario, phases, categories }: { scenario: Data['gomining'][number]['scenario']; phases: Data['gomining'][number]['phases']; categories: Data['categories'] }) { const phase = (startMonth: number) => phases.find((item) => item.startMonth === startMonth)?.amountCents ?? 0; const expenses = categories.filter((category) => category.isActive && category.kind === 'expense'); return <details><summary>Modifier le scénario</summary><Form method="post" className="finance-form"><input type="hidden" name="intent" value="updateGoMiningScenario" /><input type="hidden" name="id" value={scenario.id} /><label>Nom<input name="name" defaultValue={scenario.name} required maxLength={100} /></label><label>Début<input name="startPeriod" type="month" defaultValue={scenario.startPeriod} required /></label><label>Horizon (mois)<input name="horizonMonths" type="number" min="1" max="600" defaultValue={scenario.horizonMonths} required /></label><label>Puissance initiale (milli-TH)<input name="initialHashrateMilliTh" type="number" min="1" defaultValue={scenario.initialHashrateMilliTh} required /></label><label>BTC déjà accumulés (<Satoshi />)<input name="initialAccumulatedSats" type="number" min="0" defaultValue={scenario.initialAccumulatedSats} required /></label><label>Efficacité (milli-W/TH)<input name="efficiencyMilliWattsPerTh" type="number" min="1" defaultValue={scenario.efficiencyMilliWattsPerTh} required /></label><label>Récompense nette mensuelle (<Satoshi /> / TH)<input name="monthlyNetRewardSatsPerTh" type="number" min="0" defaultValue={scenario.monthlyNetRewardSatsPerTh} required /></label><label>Prix de 0,001 TH (€)<input name="pricePerMilliTh" inputMode="decimal" defaultValue={(scenario.priceMilliCentsPerMilliTh / 100_000).toFixed(5)} required /></label><label>Cours BTC (€ / BTC)<input name="btcPrice" inputMode="decimal" defaultValue={decimalMoney(scenario.btcPriceCents)} required /></label><label>Catégorie budget (facultatif)<select name="budgetCategoryId" defaultValue={scenario.budgetCategoryId ?? ''}><option value="">Aucune</option>{expenses.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Apport mois 1–12 (€)<input name="phaseOne" inputMode="decimal" defaultValue={decimalMoney(phase(1))} required /></label><label>Apport mois 13–36 (€)<input name="phaseTwo" inputMode="decimal" defaultValue={decimalMoney(phase(13))} required /></label><label>Apport à partir du mois 37 (€)<input name="phaseThree" inputMode="decimal" defaultValue={decimalMoney(phase(37))} required /></label><label className="finance-inline"><input name="reinvestAccumulated" type="checkbox" defaultChecked={scenario.accumulatedBtcPolicy === 'reinvest-at-threshold'} /> Réinvestir le stock BTC accumulé au seuil</label><button className="finance-button">Enregistrer les hypothèses</button></Form><p className="finance-help">Le scénario et ses versions sont conservés pour préserver l’historique.</p></details>; }

export function ErrorBoundary() { return <main className="status-page"><h1>Espace privé indisponible</h1><p>L’accès nécessite une connexion personnelle.</p><a href="/">Revenir au portfolio</a></main>; }
