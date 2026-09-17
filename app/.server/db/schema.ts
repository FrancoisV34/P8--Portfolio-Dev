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

// Journal minimal des opérations sensibles. Il ne conserve aucun montant, URL,
// navigateur ni contenu de sauvegarde.
export const securityEvents = sqliteTable('finance_security_events', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  kind: text('kind', { enum: ['backup-download'] }).notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_security_events_owner_kind_created_idx').on(table.ownerId, table.kind, table.createdAt),
  check('finance_security_events_kind', sql`${table.kind} = 'backup-download'`),
  check('finance_security_events_created', sql`length(${table.createdAt}) between 20 and 30`),
]);

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

// Le patrimoine ne duplique jamais les liquidités du journal. Les actifs
// manuels représentent donc uniquement des positions hors comptes, avec une
// valorisation datée. Une seule position BTC réellement observée chez GoMining
// peut être déclarée ; elle reste indépendante de tout scénario de projection.
export const wealthAssets = sqliteTable('finance_wealth_assets', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  assetClass: text('asset_class', { enum: ['securities', 'crypto', 'real_estate', 'business', 'other'] }).notNull(),
  source: text('source', { enum: ['manual', 'gomining-observed-btc'] }).notNull().default('manual'),
  observedBtcSats: integer('observed_btc_sats'),
  quantityDescription: text('quantity_description').notNull().default(''),
  contributedCents: integer('contributed_cents').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_wealth_assets_owner_idx').on(table.ownerId),
  index('finance_wealth_assets_entity_idx').on(table.entityId),
  uniqueIndex('finance_wealth_assets_owner_gomining_btc_unique').on(table.ownerId).where(sql`${table.source} = 'gomining-observed-btc'`),
  check('finance_wealth_assets_class', sql`${table.assetClass} in ('securities', 'crypto', 'real_estate', 'business', 'other')`),
  check('finance_wealth_assets_source', sql`${table.source} in ('manual', 'gomining-observed-btc')`),
  check('finance_wealth_assets_observed_btc', sql`(${table.source} = 'manual' and ${table.observedBtcSats} is null) or (${table.source} = 'gomining-observed-btc' and ${table.assetClass} = 'crypto' and typeof(${table.observedBtcSats}) = 'integer' and ${table.observedBtcSats} >= 0 and ${table.observedBtcSats} <= 9007199254740991)`),
  check('finance_wealth_assets_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_wealth_assets_quantity', sql`length(trim(${table.quantityDescription})) <= 80`),
  check('finance_wealth_assets_contributed', sql`typeof(${table.contributedCents}) = 'integer' and ${table.contributedCents} between 0 and 9007199254740991`),
]);

export const wealthAssetValuations = sqliteTable('finance_wealth_asset_valuations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  assetId: text('asset_id').notNull().references(() => wealthAssets.id, { onDelete: 'restrict' }),
  valuedOn: text('valued_on').notNull(),
  valueCents: integer('value_cents').notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_wealth_valuations_owner_date_idx').on(table.ownerId, table.valuedOn),
  uniqueIndex('finance_wealth_valuations_asset_date_unique').on(table.assetId, table.valuedOn),
  check('finance_wealth_valuations_value', sql`typeof(${table.valueCents}) = 'integer' and ${table.valueCents} between 0 and 9007199254740991`),
  check('finance_wealth_valuations_note', sql`length(trim(${table.note})) <= 240`),
  check('finance_wealth_valuations_date', sql`length(${table.valuedOn}) = 10 and ${table.valuedOn} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr(${table.valuedOn}, 1, 4) as integer) between 1 and 9999 and date(${table.valuedOn}, '+0 days') is not null and date(${table.valuedOn}, '+0 days') = ${table.valuedOn}`),
]);

export const wealthDebts = sqliteTable('finance_wealth_debts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_wealth_debts_owner_idx').on(table.ownerId),
  index('finance_wealth_debts_entity_idx').on(table.entityId),
  check('finance_wealth_debts_name', sql`length(trim(${table.name})) between 1 and 100`),
]);

// Un état de dette est daté : l'échéancier est calculé à partir de ce capital
// restant dû, sans le faire passer pour un relevé bancaire ou un paiement réel.
export const wealthDebtBalances = sqliteTable('finance_wealth_debt_balances', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  debtId: text('debt_id').notNull().references(() => wealthDebts.id, { onDelete: 'restrict' }),
  asOfDate: text('as_of_date').notNull(),
  outstandingCents: integer('outstanding_cents').notNull(),
  monthlyPaymentCents: integer('monthly_payment_cents').notNull(),
  annualRateBasisPoints: integer('annual_rate_basis_points').notNull(),
  remainingMonths: integer('remaining_months').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_wealth_debt_balances_owner_date_idx').on(table.ownerId, table.asOfDate),
  uniqueIndex('finance_wealth_debt_balances_debt_date_unique').on(table.debtId, table.asOfDate),
  check('finance_wealth_debt_balances_outstanding', sql`typeof(${table.outstandingCents}) = 'integer' and ${table.outstandingCents} >= 0 and ${table.outstandingCents} <= 9007199254740991`),
  check('finance_wealth_debt_balances_payment', sql`typeof(${table.monthlyPaymentCents}) = 'integer' and ${table.monthlyPaymentCents} > 0 and ${table.monthlyPaymentCents} <= 9007199254740991`),
  check('finance_wealth_debt_balances_rate', sql`${table.annualRateBasisPoints} between 0 and 100000`),
  check('finance_wealth_debt_balances_months', sql`${table.remainingMonths} between 1 and 600`),
  check('finance_wealth_debt_balances_date', sql`length(${table.asOfDate}) = 10 and ${table.asOfDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr(${table.asOfDate}, 1, 4) as integer) between 1 and 9999 and date(${table.asOfDate}, '+0 days') is not null and date(${table.asOfDate}, '+0 days') = ${table.asOfDate}`),
]);

// Les objectifs et projets sont des intentions manuelles. Ils n'écrivent
// aucune transaction et ne déduisent aucun montant disponible ou fiscalité.
export const goals = sqliteTable('finance_goals', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  name: text('name').notNull(),
  targetCents: integer('target_cents').notNull(),
  progressCents: integer('progress_cents').notNull().default(0),
  targetDate: text('target_date'),
  priority: integer('priority').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_goals_owner_priority_idx').on(table.ownerId, table.priority),
  check('finance_goals_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_goals_target', sql`typeof(${table.targetCents}) = 'integer' and ${table.targetCents} > 0 and ${table.targetCents} <= 9007199254740991`),
  check('finance_goals_progress', sql`typeof(${table.progressCents}) = 'integer' and ${table.progressCents} between 0 and 9007199254740991`),
  check('finance_goals_priority', sql`${table.priority} between 1 and 999`),
  check('finance_goals_target_date', sql`${table.targetDate} is null or (length(${table.targetDate}) = 10 and ${table.targetDate} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr(${table.targetDate}, 1, 4) as integer) between 1 and 9999 and date(${table.targetDate}, '+0 days') is not null and date(${table.targetDate}, '+0 days') = ${table.targetDate})`),
]);

export const projects = sqliteTable('finance_projects', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  goalId: text('goal_id').references(() => goals.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  status: text('status', { enum: ['backlog', 'active', 'paused', 'done'] }).notNull().default('backlog'),
  priority: integer('priority').notNull(),
  estimatedCostCents: integer('estimated_cost_cents'),
  estimatedEffortMinutes: integer('estimated_effort_minutes'),
  nextAction: text('next_action').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_projects_owner_status_priority_idx').on(table.ownerId, table.status, table.priority),
  index('finance_projects_goal_idx').on(table.goalId),
  check('finance_projects_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_projects_status', sql`${table.status} in ('backlog', 'active', 'paused', 'done')`),
  check('finance_projects_priority', sql`${table.priority} between 1 and 999`),
  check('finance_projects_cost', sql`${table.estimatedCostCents} is null or (typeof(${table.estimatedCostCents}) = 'integer' and ${table.estimatedCostCents} between 0 and 9007199254740991)`),
  check('finance_projects_effort', sql`${table.estimatedEffortMinutes} is null or (typeof(${table.estimatedEffortMinutes}) = 'integer' and ${table.estimatedEffortMinutes} between 0 and 44640)`),
  check('finance_projects_next_action', sql`length(trim(${table.nextAction})) <= 240`),
]);

export const projectCapacity = sqliteTable('finance_project_capacity', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull().unique(),
  monthlyCapacityMinutes: integer('monthly_capacity_minutes').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  check('finance_project_capacity_minutes', sql`typeof(${table.monthlyCapacityMinutes}) = 'integer' and ${table.monthlyCapacityMinutes} between 0 and 44640`),
]);

export const businessMonthlyProvisions = sqliteTable('finance_business_monthly_provisions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  period: text('period').notNull(),
  name: text('name').notNull(),
  amountCents: integer('amount_cents').notNull(),
  note: text('note').notNull().default(''),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_business_provisions_owner_period_idx').on(table.ownerId, table.period),
  index('finance_business_provisions_entity_period_idx').on(table.entityId, table.period),
  check('finance_business_provisions_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_business_provisions_amount', sql`typeof(${table.amountCents}) = 'integer' and ${table.amountCents} >= 0 and ${table.amountCents} <= 9007199254740991`),
  check('finance_business_provisions_note', sql`length(trim(${table.note})) <= 240`),
  check('finance_business_provisions_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
]);

export const regulatoryRules = sqliteTable('finance_regulatory_rules', {
  id: text('id').primaryKey(), seriesId: text('series_id').notNull(), revision: integer('revision').notNull(), ownerId: text('owner_id').notNull(), name: text('name').notNull(), value: text('value').notNull(), source: text('source').notNull(), verifiedOn: text('verified_on').notNull(), validFrom: text('valid_from').notNull(), validTo: text('valid_to'), note: text('note').notNull().default(''), createdAt: text('created_at').notNull(), updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_regulatory_rules_owner_validity_idx').on(table.ownerId, table.validFrom, table.validTo), uniqueIndex('finance_regulatory_rules_series_revision_idx').on(table.ownerId, table.seriesId, table.revision),
  check('finance_regulatory_rules_name', sql`length(trim(${table.name})) between 1 and 100`), check('finance_regulatory_rules_value', sql`length(trim(${table.value})) between 1 and 120`), check('finance_regulatory_rules_source', sql`length(trim(${table.source})) between 1 and 500`), check('finance_regulatory_rules_note', sql`length(trim(${table.note})) <= 240`),
  check('finance_regulatory_rules_revision', sql`${table.revision} >= 1`), check('finance_regulatory_rules_dates', sql`length(${table.verifiedOn}) = 10 and date(${table.verifiedOn}, '+0 days') = ${table.verifiedOn} and length(${table.validFrom}) = 10 and date(${table.validFrom}, '+0 days') = ${table.validFrom} and (${table.validTo} is null or (length(${table.validTo}) = 10 and date(${table.validTo}, '+0 days') = ${table.validTo} and ${table.validTo} >= ${table.validFrom}))`),
]);

// Le pilotage business distingue l'activité économique de l'argent du foyer.
// Les métriques mensuelles observées ne créent jamais de transaction et aucun
// calcul fiscal ou montant distribuable n'est déduit automatiquement.
export const businessActivities = sqliteTable('finance_business_activities', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_business_activities_owner_idx').on(table.ownerId),
  index('finance_business_activities_entity_idx').on(table.entityId),
  uniqueIndex('finance_business_activities_owner_name_unique').on(table.ownerId, table.name),
  check('finance_business_activities_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_business_activities_active', sql`${table.isActive} in (0, 1)`),
]);

export const businessMonthlyMetrics = sqliteTable('finance_business_monthly_metrics', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  activityId: text('activity_id').notNull().references(() => businessActivities.id, { onDelete: 'restrict' }),
  period: text('period').notNull(),
  revenueCents: integer('revenue_cents').notNull(),
  operatingExpenseCents: integer('operating_expense_cents').notNull(),
  mrrCents: integer('mrr_cents'),
  activeCustomerCount: integer('active_customer_count'),
  maintenanceMinutes: integer('maintenance_minutes'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_business_metrics_owner_period_idx').on(table.ownerId, table.period),
  uniqueIndex('finance_business_metrics_owner_activity_period_unique').on(table.ownerId, table.activityId, table.period),
  check('finance_business_metrics_revenue', sql`typeof(${table.revenueCents}) = 'integer' and ${table.revenueCents} >= 0 and ${table.revenueCents} <= 9007199254740991`),
  check('finance_business_metrics_expenses', sql`typeof(${table.operatingExpenseCents}) = 'integer' and ${table.operatingExpenseCents} >= 0 and ${table.operatingExpenseCents} <= 9007199254740991`),
  // Le MRR est borné pour que son ARR (MRR × 12) reste un montant entier sûr.
  check('finance_business_metrics_mrr', sql`${table.mrrCents} is null or (typeof(${table.mrrCents}) = 'integer' and ${table.mrrCents} >= 0 and ${table.mrrCents} <= 750599937895082)`),
  check('finance_business_metrics_customers', sql`${table.activeCustomerCount} is null or (typeof(${table.activeCustomerCount}) = 'integer' and ${table.activeCustomerCount} between 0 and 1000000000)`),
  check('finance_business_metrics_maintenance', sql`${table.maintenanceMinutes} is null or (typeof(${table.maintenanceMinutes}) = 'integer' and ${table.maintenanceMinutes} between 0 and 44640)`),
  check('finance_business_metrics_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
]);

export const businessEntityMonthlyCash = sqliteTable('finance_business_entity_monthly_cash', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  entityId: text('entity_id').notNull().references(() => economicEntities.id, { onDelete: 'restrict' }),
  period: text('period').notNull(),
  retainedCashCents: integer('retained_cash_cents').notNull(),
  distributedCents: integer('distributed_cents').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  index('finance_business_cash_owner_period_idx').on(table.ownerId, table.period),
  uniqueIndex('finance_business_cash_owner_entity_period_unique').on(table.ownerId, table.entityId, table.period),
  check('finance_business_cash_retained', sql`typeof(${table.retainedCashCents}) = 'integer' and ${table.retainedCashCents} >= 0 and ${table.retainedCashCents} <= 9007199254740991`),
  check('finance_business_cash_distributed', sql`typeof(${table.distributedCents}) = 'integer' and ${table.distributedCents} >= 0 and ${table.distributedCents} <= 9007199254740991`),
  check('finance_business_cash_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
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

// Une clôture conserve un instantané explicable des mouvements et des soldes
// d'un mois. Elle n'empêche pas une correction ultérieure : celle-ci produira
// une nouvelle révision, sans réécrire l'instantané déjà enregistré.
export const monthlyClosures = sqliteTable('finance_monthly_closures', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  period: text('period').notNull(),
  revision: integer('revision').notNull(),
  snapshotJson: text('snapshot_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_monthly_closures_owner_period_idx').on(table.ownerId, table.period),
  uniqueIndex('finance_monthly_closures_owner_period_revision_unique').on(table.ownerId, table.period, table.revision),
  check('finance_monthly_closures_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
  check('finance_monthly_closures_revision', sql`${table.revision} between 1 and 1000`),
  check('finance_monthly_closures_snapshot', sql`length(${table.snapshotJson}) between 2 and 100000 and json_valid(${table.snapshotJson})`),
]);

// Solde relevé explicitement saisi pour rapprocher un compte du journal. Il ne
// modifie jamais le solde calculé ni les transactions de la période.
export const accountReconciliations = sqliteTable('finance_account_reconciliations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  accountId: text('account_id').notNull().references(() => accounts.id, { onDelete: 'restrict' }),
  period: text('period').notNull(),
  statementDate: text('statement_date').notNull(),
  statementBalanceCents: integer('statement_balance_cents').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (table) => [
  uniqueIndex('finance_account_reconciliations_owner_account_period_unique').on(table.ownerId, table.accountId, table.period),
  index('finance_account_reconciliations_owner_period_idx').on(table.ownerId, table.period),
  check('finance_account_reconciliations_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
  check('finance_account_reconciliations_date', sql`length(${table.statementDate}) = 10 and date(${table.statementDate}, '+0 days') = ${table.statementDate} and substr(${table.statementDate}, 1, 7) = ${table.period}`),
  check('finance_account_reconciliations_balance', sql`typeof(${table.statementBalanceCents}) = 'integer' and ${table.statementBalanceCents} between -9007199254740991 and 9007199254740991`),
]);

// Une évaluation CFO est un constat versionné : elle conserve son contexte et
// son résultat sans modifier les comptes, transactions ou placements sources.
export const cfoEvaluations = sqliteTable('finance_cfo_evaluations', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  period: text('period').notNull(),
  ruleVersion: text('rule_version').notNull(),
  input: text('input').notNull(),
  result: text('result').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_cfo_evaluations_owner_created_idx').on(table.ownerId, table.createdAt),
  check('finance_cfo_evaluations_period', sql`length(${table.period}) = 7 and ${table.period} glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr(${table.period}, 1, 4) as integer) between 1 and 9999 and cast(substr(${table.period}, 6, 2) as integer) between 1 and 12`),
  check('finance_cfo_evaluations_rule_version', sql`length(trim(${table.ruleVersion})) between 1 and 80`),
  check('finance_cfo_evaluations_input', sql`length(${table.input}) between 2 and 10000 and json_valid(${table.input})`),
  check('finance_cfo_evaluations_result', sql`length(${table.result}) between 2 and 10000 and json_valid(${table.result})`),
]);

// Chaque jeu de poids est une révision complète. La règle active est la plus
// récente, tandis qu'une évaluation conserve déjà son résultat et sa version.
export const cfoRuleSets = sqliteTable('finance_cfo_rule_sets', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull(),
  placementsBasisPoints: integer('placements_basis_points').notNull(),
  businessBasisPoints: integer('business_basis_points').notNull(),
  materialBasisPoints: integer('material_basis_points').notNull(),
  projectsBasisPoints: integer('projects_basis_points').notNull(),
  opportunitiesBasisPoints: integer('opportunities_basis_points').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('finance_cfo_rule_sets_owner_revision_idx').on(table.ownerId, table.revision),
  check('finance_cfo_rule_sets_revision', sql`${table.revision} >= 2`),
  check('finance_cfo_rule_sets_weights', sql`${table.placementsBasisPoints} between 0 and 10000 and ${table.businessBasisPoints} between 0 and 10000 and ${table.materialBasisPoints} between 0 and 10000 and ${table.projectsBasisPoints} between 0 and 10000 and ${table.opportunitiesBasisPoints} between 0 and 10000 and ${table.placementsBasisPoints} + ${table.businessBasisPoints} + ${table.materialBasisPoints} + ${table.projectsBasisPoints} + ${table.opportunitiesBasisPoints} = 10000`),
]);

// Les décisions restent des plans internes : elles ne déclenchent jamais une
// écriture financière. Plusieurs décisions peuvent documenter une révision de
// jugement sur la même évaluation, sans réécrire le passé.
export const cfoDecisions = sqliteTable('finance_cfo_decisions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  evaluationId: text('evaluation_id').notNull().references(() => cfoEvaluations.id, { onDelete: 'restrict' }),
  outcome: text('outcome', { enum: ['accepted', 'modified', 'ignored'] }).notNull(),
  note: text('note').notNull().default(''),
  plan: text('plan'),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_cfo_decisions_owner_evaluation_idx').on(table.ownerId, table.evaluationId, table.createdAt),
  check('finance_cfo_decisions_outcome', sql`${table.outcome} in ('accepted', 'modified', 'ignored')`),
  check('finance_cfo_decisions_note', sql`length(trim(${table.note})) <= 240`),
  check('finance_cfo_decisions_plan', sql`${table.plan} is null or (length(${table.plan}) between 2 and 10000 and json_valid(${table.plan}))`),
]);

// Une comparaison conserve une hypothèse d'allocation parallèle. Elle sert à
// éclairer le choix, sans modifier la proposition, les poids ou les données
// financières qui ont produit l'évaluation.
export const cfoComparisons = sqliteTable('finance_cfo_comparisons', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  evaluationId: text('evaluation_id').notNull().references(() => cfoEvaluations.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  allocation: text('allocation').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_cfo_comparisons_owner_evaluation_idx').on(table.ownerId, table.evaluationId, table.createdAt),
  check('finance_cfo_comparisons_name', sql`length(trim(${table.name})) between 1 and 100`),
  check('finance_cfo_comparisons_allocation', sql`length(${table.allocation}) between 2 and 10000 and json_valid(${table.allocation})`),
]);

// Les hypothèses et résultats de simulation sont des instantanés privés. Une
// nouvelle saisie crée une révision ; elle ne réécrit jamais une projection.
export const simulationAssumptions = sqliteTable('finance_simulation_assumptions', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  revision: integer('revision').notNull(),
  snapshot: text('snapshot').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  uniqueIndex('finance_simulation_assumptions_owner_revision_idx').on(table.ownerId, table.revision),
  check('finance_simulation_assumptions_revision', sql`${table.revision} >= 1`),
  check('finance_simulation_assumptions_snapshot', sql`length(${table.snapshot}) between 2 and 50000 and json_valid(${table.snapshot})`),
]);

export const simulationRuns = sqliteTable('finance_simulation_runs', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  assumptionId: text('assumption_id').notNull().references(() => simulationAssumptions.id, { onDelete: 'restrict' }),
  input: text('input').notNull(),
  result: text('result').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_simulation_runs_owner_created_idx').on(table.ownerId, table.createdAt),
  check('finance_simulation_runs_input', sql`length(${table.input}) between 2 and 50000 and json_valid(${table.input})`),
  check('finance_simulation_runs_result', sql`length(${table.result}) between 2 and 200000 and json_valid(${table.result})`),
]);

// Le comparateur de statuts fige les hypothèses et son résultat. Il ne décide
// jamais d'un statut ni ne crée une écriture financière ou fiscale.
export const statusComparisons = sqliteTable('finance_status_comparisons', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  input: text('input').notNull(),
  result: text('result').notNull(),
  createdAt: text('created_at').notNull(),
}, (table) => [
  index('finance_status_comparisons_owner_created_idx').on(table.ownerId, table.createdAt),
  check('finance_status_comparisons_input', sql`length(${table.input}) between 2 and 10000 and json_valid(${table.input})`),
  check('finance_status_comparisons_result', sql`length(${table.result}) between 2 and 10000 and json_valid(${table.result})`),
]);

// Les contrôles de sources officielles sont eux aussi append-only : une source
// détectée modifiée exige une revue humaine avant toute nouvelle règle.
export const regulatorySourceChecks = sqliteTable('finance_regulatory_source_checks', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  sourceKey: text('source_key').notNull(),
  sourceUrl: text('source_url').notNull(),
  contentHash: text('content_hash'),
  state: text('state', { enum: ['review', 'unchanged', 'changed', 'unavailable'] }).notNull(),
  statusCode: integer('status_code'),
  checkedAt: text('checked_at').notNull(),
}, (table) => [
  index('finance_regulatory_source_checks_owner_key_checked_idx').on(table.ownerId, table.sourceKey, table.checkedAt),
  check('finance_regulatory_source_checks_key', sql`length(trim(${table.sourceKey})) between 1 and 80`),
  check('finance_regulatory_source_checks_url', sql`length(${table.sourceUrl}) between 1 and 500`),
  check('finance_regulatory_source_checks_hash', sql`${table.contentHash} is null or length(${table.contentHash}) = 64`),
  check('finance_regulatory_source_checks_state', sql`${table.state} in ('review', 'unchanged', 'changed', 'unavailable')`),
  check('finance_regulatory_source_checks_status', sql`${table.statusCode} is null or ${table.statusCode} between 100 and 599`),
]);
