import { sql } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Schéma Better Auth. Ces tables utilisent les noms attendus par l'adaptateur,
// tandis que les tables financières restent préfixées `finance_`.
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
}, (table) => [index('session_user_idx').on(table.userId)]);

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [
  index('account_user_idx').on(table.userId),
  uniqueIndex('account_provider_account_unique').on(table.providerId, table.accountId),
]);

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('verification_identifier_idx').on(table.identifier)]);

// Les tables métier appartiennent au seul propriétaire autorisé. Le lien vers
// les tables d'auth sera ajouté avec L04 ; aucun endpoint ne les expose avant.
export const economicEntities = sqliteTable('finance_economic_entities', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  type: text('type', { enum: ['personal', 'business'] }).notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_entities_owner_idx').on(table.ownerId),
  check('finance_entities_type', sql`${table.type} in ('personal', 'business')`),
  check('finance_entities_name', sql`length(trim(${table.name})) between 1 and 100`),
]);

export const accounts = sqliteTable('finance_accounts', {
  id: text('id').primaryKey(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  type: text('type', { enum: ['checking', 'savings', 'cash'] }).notNull(),
  currency: text('currency', { enum: ['EUR'] }).notNull().default('EUR'),
  openingBalanceCents: integer('opening_balance_cents').notNull(),
  openingDate: text('opening_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_accounts_entity_idx').on(table.entityId),
  check('finance_accounts_type', sql`${table.type} in ('checking', 'savings', 'cash')`),
  check('finance_accounts_currency', sql`${table.currency} = 'EUR'`),
  check('finance_accounts_balance', sql`typeof(${table.openingBalanceCents}) = 'integer' and ${table.openingBalanceCents} between -9007199254740991 and 9007199254740991`),
  check('finance_accounts_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_accounts_active', sql`${table.isActive} in (0, 1)`),
  check('finance_accounts_opening_date', sql`length(${table.openingDate}) = 10 and ${table.openingDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr(${table.openingDate}, 1, 4) as integer) between 1 and 9999 and date(${table.openingDate}, '+0 days') is not null and date(${table.openingDate}, '+0 days') = ${table.openingDate}`),
]);

export const categories = sqliteTable('finance_categories', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['income', 'expense'] }).notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_categories_owner_idx').on(table.ownerId),
  uniqueIndex('finance_categories_owner_name_kind_unique').on(table.ownerId, table.name, table.kind),
  check('finance_categories_kind', sql`${table.kind} in ('income', 'expense')`),
  check('finance_categories_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_categories_active', sql`${table.isActive} in (0, 1)`),
]);

export const transactions = sqliteTable('finance_transactions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  categoryId: text('category_id').references(() => categories.id, { onDelete: 'restrict' }),
  kind: text('kind', { enum: ['income', 'expense', 'transfer'] }).notNull(),
  amountCents: integer('amount_cents').notNull(),
  occurredOn: text('occurred_on').notNull(),
  note: text('note').notNull().default(''),
  transferGroupId: text('transfer_group_id'),
  recurringCommitmentId: text('recurring_commitment_id').references(() => recurringCommitments.id, { onDelete: 'restrict' }),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_transactions_owner_date_idx').on(table.ownerId, table.occurredOn),
  index('finance_transactions_account_date_idx').on(table.accountId, table.occurredOn),
  index('finance_transactions_category_idx').on(table.categoryId),
  index('finance_transactions_transfer_group_idx').on(table.transferGroupId),
  check('finance_transactions_kind', sql`${table.kind} in ('income', 'expense', 'transfer')`),
  check('finance_transactions_amount', sql`typeof(${table.amountCents}) = 'integer' and ${table.amountCents} between -9007199254740991 and 9007199254740991 and (((${table.kind} = 'income') and ${table.amountCents} > 0) or ((${table.kind} = 'expense') and ${table.amountCents} < 0) or ((${table.kind} = 'transfer') and ${table.amountCents} != 0))`),
  check('finance_transactions_category', sql`((${table.kind} in ('income', 'expense')) and ${table.categoryId} is not null and ${table.transferGroupId} is null) or ((${table.kind} = 'transfer') and ${table.categoryId} is null and ${table.transferGroupId} is not null)`),
  check('finance_transactions_commitment', sql`${table.recurringCommitmentId} is null or ${table.kind} = 'expense'`),
  check('finance_transactions_note', sql`length(trim(${table.note})) <= 240`),
  check('finance_transactions_occurred_on', sql`length(${table.occurredOn}) = 10 and ${table.occurredOn} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr(${table.occurredOn}, 1, 4) as integer) between 1 and 9999 and date(${table.occurredOn}, '+0 days') is not null and date(${table.occurredOn}, '+0 days') = ${table.occurredOn}`),
]);

// Une seule réserve est configurée par propriétaire. Son montant courant est
// toujours recalculé depuis les comptes sélectionnés : aucune valeur de solde
// n'est dupliquée dans cette table.
export const safetyReserves = sqliteTable('finance_safety_reserves', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().unique(),
  targetAmountCents: integer('target_amount_cents').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  check('finance_safety_reserves_target', sql`typeof(${table.targetAmountCents}) = 'integer' and ${table.targetAmountCents} > 0 and ${table.targetAmountCents} <= 9007199254740991`),
]);

export const safetyReserveAccounts = sqliteTable('finance_safety_reserve_accounts', {
  reserveId: text('reserve_id').notNull().references(() => safetyReserves.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
}, (table) => [
  uniqueIndex('finance_safety_reserve_account_unique').on(table.reserveId, table.accountId),
  index('finance_safety_reserve_accounts_account_idx').on(table.accountId),
]);

// Les engagements décrivent un prévu mensuel ; ils ne créent jamais de
// transaction. Un paiement réel est un mouvement de dépense qui les référence.
export const recurringCommitments = sqliteTable('finance_recurring_commitments', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  plannedAmountCents: integer('planned_amount_cents').notNull(),
  dueDay: integer('due_day').notNull(),
  startPeriod: text('start_period').notNull(),
  endPeriod: text('end_period'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_commitments_owner_period_idx').on(table.ownerId, table.startPeriod, table.endPeriod),
  index('finance_commitments_category_idx').on(table.categoryId),
  check('finance_commitments_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_commitments_amount', sql`typeof(${table.plannedAmountCents}) = 'integer' and ${table.plannedAmountCents} > 0 and ${table.plannedAmountCents} <= 9007199254740991`),
  check('finance_commitments_due_day', sql`${table.dueDay} between 1 and 31`),
  check('finance_commitments_start_period', sql`length(${table.startPeriod}) = 7 and ${table.startPeriod} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.startPeriod}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.startPeriod}, 6, 2) as integer) between 1 and 12`),
  check('finance_commitments_end_period', sql`${table.endPeriod} is null or (length(${table.endPeriod}) = 7 and ${table.endPeriod} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.endPeriod}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.endPeriod}, 6, 2) as integer) between 1 and 12 and ${table.endPeriod} >= ${table.startPeriod})`),
]);

// Un scénario est une hypothèse privée, distincte des transactions observées.
// Les montants sont volontairement vides jusqu'à leur saisie locale.
export const gominingScenarios = sqliteTable('finance_gomining_scenarios', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  startPeriod: text('start_period').notNull(),
  horizonMonths: integer('horizon_months').notNull(),
  initialHashrateMilliTh: integer('initial_hashrate_milli_th').notNull(),
  initialAccumulatedSats: integer('initial_accumulated_sats').notNull(),
  efficiencyMilliWattsPerTh: integer('efficiency_milli_watts_per_th').notNull(),
  monthlyNetRewardSatsPerTh: integer('monthly_net_reward_sats_per_th').notNull(),
  priceMilliCentsPerMilliTh: integer('price_milli_cents_per_milli_th').notNull(),
  btcPriceCents: integer('btc_price_cents').notNull(),
  budgetCategoryId: text('budget_category_id').references(() => categories.id, { onDelete: 'restrict' }),
  accumulatedBtcPolicy: text('accumulated_btc_policy', { enum: ['keep', 'reinvest-at-threshold'] }).notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_gomining_scenarios_owner_idx').on(table.ownerId),
  index('finance_gomining_scenarios_budget_category_idx').on(table.budgetCategoryId),
  check('finance_gomining_scenarios_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_gomining_scenarios_horizon', sql`${table.horizonMonths} between 1 and 600`),
  check('finance_gomining_scenarios_hashrate', sql`typeof(${table.initialHashrateMilliTh}) = 'integer' and ${table.initialHashrateMilliTh} > 0 and ${table.initialHashrateMilliTh} <= 9007199254740991`),
  check('finance_gomining_scenarios_sats', sql`typeof(${table.initialAccumulatedSats}) = 'integer' and ${table.initialAccumulatedSats} >= 0 and ${table.initialAccumulatedSats} <= 9007199254740991`),
  check('finance_gomining_scenarios_efficiency', sql`${table.efficiencyMilliWattsPerTh} > 0 and ${table.efficiencyMilliWattsPerTh} <= 9007199254740991`),
  check('finance_gomining_scenarios_reward', sql`${table.monthlyNetRewardSatsPerTh} >= 0 and ${table.monthlyNetRewardSatsPerTh} <= 9007199254740991`),
  check('finance_gomining_scenarios_prices', sql`${table.priceMilliCentsPerMilliTh} > 0 and ${table.btcPriceCents} > 0 and ${table.priceMilliCentsPerMilliTh} <= 9007199254740991 and ${table.btcPriceCents} <= 9007199254740991`),
  check('finance_gomining_scenarios_policy', sql`${table.accumulatedBtcPolicy} in ('keep', 'reinvest-at-threshold')`),
  check('finance_gomining_scenarios_revision', sql`${table.revision} >= 1 and ${table.revision} <= 9007199254740991`),
  check('finance_gomining_scenarios_period', sql`length(${table.startPeriod}) = 7 and ${table.startPeriod} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.startPeriod}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.startPeriod}, 6, 2) as integer) between 1 and 12`),
]);

export const gominingContributionPhases = sqliteTable('finance_gomining_contribution_phases', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull().references(() => gominingScenarios.id, { onDelete: 'cascade' }),
  startMonth: integer('start_month').notNull(),
  endMonth: integer('end_month'),
  amountCents: integer('amount_cents').notNull(),
}, (table) => [
  index('finance_gomining_phases_scenario_idx').on(table.scenarioId),
  uniqueIndex('finance_gomining_phases_scenario_start_unique').on(table.scenarioId, table.startMonth),
  check('finance_gomining_phases_months', sql`${table.startMonth} >= 1 and (${table.endMonth} is null or ${table.endMonth} >= ${table.startMonth})`),
  check('finance_gomining_phases_amount', sql`${table.amountCents} >= 0 and ${table.amountCents} <= 9007199254740991`),
]);

// Une révision est un instantané immuable d'hypothèses, séparé du scénario
// courant afin qu'une correction ne réécrive jamais l'historique.
export const gominingScenarioVersions = sqliteTable('finance_gomining_scenario_versions', {
  id: text('id').primaryKey(),
  scenarioId: text('scenario_id').notNull().references(() => gominingScenarios.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('finance_gomining_versions_scenario_revision_unique').on(table.scenarioId, table.revision),
  index('finance_gomining_versions_scenario_idx').on(table.scenarioId),
  check('finance_gomining_versions_revision', sql`${table.revision} >= 1 and ${table.revision} <= 9007199254740991`),
  check('finance_gomining_versions_snapshot', sql`length(${table.snapshot}) between 2 and 10_000 and json_valid(${table.snapshot})`),
]);

export const monthlyBudgets = sqliteTable('finance_monthly_budgets', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  categoryId: text('category_id').notNull().references(() => categories.id, { onDelete: 'restrict' }),
  period: text('period').notNull(),
  plannedAmountCents: integer('planned_amount_cents').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_budgets_owner_period_idx').on(table.ownerId, table.period),
  uniqueIndex('finance_budgets_owner_category_period_unique').on(table.ownerId, table.categoryId, table.period),
  check('finance_budgets_amount', sql`typeof(${table.plannedAmountCents}) = 'integer' and ${table.plannedAmountCents} > 0 and ${table.plannedAmountCents} <= 9007199254740991`),
  check('finance_budgets_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
]);
