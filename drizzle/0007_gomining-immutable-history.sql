CREATE TABLE `finance_gomining_scenario_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `finance_gomining_scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_gomining_versions_revision" CHECK("finance_gomining_scenario_versions"."revision" >= 1 and "finance_gomining_scenario_versions"."revision" <= 9007199254740991),
	CONSTRAINT "finance_gomining_versions_snapshot" CHECK(length("finance_gomining_scenario_versions"."snapshot") between 2 and 10_000 and json_valid("finance_gomining_scenario_versions"."snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_gomining_versions_scenario_revision_unique` ON `finance_gomining_scenario_versions` (`scenario_id`,`revision`);--> statement-breakpoint
CREATE INDEX `finance_gomining_versions_scenario_idx` ON `finance_gomining_scenario_versions` (`scenario_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_gomining_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`start_period` text NOT NULL,
	`horizon_months` integer NOT NULL,
	`initial_hashrate_milli_th` integer NOT NULL,
	`initial_accumulated_sats` integer NOT NULL,
	`efficiency_milli_watts_per_th` integer NOT NULL,
	`monthly_net_reward_sats_per_th` integer NOT NULL,
	`price_milli_cents_per_milli_th` integer NOT NULL,
	`btc_price_cents` integer NOT NULL,
	`budget_category_id` text,
	`accumulated_btc_policy` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`budget_category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_gomining_scenarios_name" CHECK(length(trim("__new_finance_gomining_scenarios"."name")) between 1 and 100),
	CONSTRAINT "finance_gomining_scenarios_horizon" CHECK("__new_finance_gomining_scenarios"."horizon_months" between 1 and 600),
	CONSTRAINT "finance_gomining_scenarios_hashrate" CHECK(typeof("__new_finance_gomining_scenarios"."initial_hashrate_milli_th") = 'integer' and "__new_finance_gomining_scenarios"."initial_hashrate_milli_th" > 0 and "__new_finance_gomining_scenarios"."initial_hashrate_milli_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_sats" CHECK(typeof("__new_finance_gomining_scenarios"."initial_accumulated_sats") = 'integer' and "__new_finance_gomining_scenarios"."initial_accumulated_sats" >= 0 and "__new_finance_gomining_scenarios"."initial_accumulated_sats" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_efficiency" CHECK("__new_finance_gomining_scenarios"."efficiency_milli_watts_per_th" > 0 and "__new_finance_gomining_scenarios"."efficiency_milli_watts_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_reward" CHECK("__new_finance_gomining_scenarios"."monthly_net_reward_sats_per_th" >= 0 and "__new_finance_gomining_scenarios"."monthly_net_reward_sats_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_prices" CHECK("__new_finance_gomining_scenarios"."price_milli_cents_per_milli_th" > 0 and "__new_finance_gomining_scenarios"."btc_price_cents" > 0 and "__new_finance_gomining_scenarios"."price_milli_cents_per_milli_th" <= 9007199254740991 and "__new_finance_gomining_scenarios"."btc_price_cents" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_policy" CHECK("__new_finance_gomining_scenarios"."accumulated_btc_policy" in ('keep', 'reinvest-at-threshold')),
	CONSTRAINT "finance_gomining_scenarios_revision" CHECK("__new_finance_gomining_scenarios"."revision" >= 1 and "__new_finance_gomining_scenarios"."revision" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_period" CHECK(length("__new_finance_gomining_scenarios"."start_period") = 7 and "__new_finance_gomining_scenarios"."start_period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("__new_finance_gomining_scenarios"."start_period", 1, 4) as integer) between 1 and 9999 and cast(substr("__new_finance_gomining_scenarios"."start_period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
INSERT INTO `__new_finance_gomining_scenarios`("id", "owner_id", "name", "start_period", "horizon_months", "initial_hashrate_milli_th", "initial_accumulated_sats", "efficiency_milli_watts_per_th", "monthly_net_reward_sats_per_th", "price_milli_cents_per_milli_th", "btc_price_cents", "budget_category_id", "accumulated_btc_policy", "revision", "created_at", "updated_at") SELECT "id", "owner_id", "name", "start_period", "horizon_months", "initial_hashrate_milli_th", "initial_accumulated_sats", "efficiency_milli_watts_per_th", "monthly_net_reward_sats_per_th", "price_milli_cents_per_milli_th", "btc_price_cents", "budget_category_id", "accumulated_btc_policy", 1, "created_at", "updated_at" FROM `finance_gomining_scenarios`;--> statement-breakpoint
DROP TABLE `finance_gomining_scenarios`;--> statement-breakpoint
ALTER TABLE `__new_finance_gomining_scenarios` RENAME TO `finance_gomining_scenarios`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `finance_gomining_scenarios_owner_idx` ON `finance_gomining_scenarios` (`owner_id`);--> statement-breakpoint
CREATE INDEX `finance_gomining_scenarios_budget_category_idx` ON `finance_gomining_scenarios` (`budget_category_id`);--> statement-breakpoint
INSERT INTO `finance_gomining_scenario_versions` (`id`, `scenario_id`, `revision`, `snapshot`, `created_at`)
SELECT scenario.`id`, scenario.`id`, 1,
  json_object(
    'name', scenario.`name`,
    'startPeriod', scenario.`start_period`,
    'horizonMonths', scenario.`horizon_months`,
    'initialHashrateMilliTh', scenario.`initial_hashrate_milli_th`,
    'initialAccumulatedSats', scenario.`initial_accumulated_sats`,
    'efficiencyMilliWattsPerTh', scenario.`efficiency_milli_watts_per_th`,
    'monthlyNetRewardSatsPerTh', scenario.`monthly_net_reward_sats_per_th`,
    'priceMilliCentsPerMilliTh', scenario.`price_milli_cents_per_milli_th`,
    'btcPriceCents', scenario.`btc_price_cents`,
    'budgetCategoryId', scenario.`budget_category_id`,
    'accumulatedBtcPolicy', scenario.`accumulated_btc_policy`,
    'phases', json(coalesce((
      SELECT json_group_array(json_object(
        'startMonth', phase.`start_month`,
        'endMonth', phase.`end_month`,
        'amountCents', phase.`amount_cents`
      )) FROM (
        SELECT `start_month`, `end_month`, `amount_cents`
        FROM `finance_gomining_contribution_phases`
        WHERE `scenario_id` = scenario.`id`
        ORDER BY `start_month`
      ) AS phase
    ), '[]'))
  ),
  scenario.`updated_at`
FROM `finance_gomining_scenarios` AS scenario;--> statement-breakpoint
CREATE TRIGGER `finance_gomining_scenarios_category_owner_insert`
BEFORE INSERT ON `finance_gomining_scenarios`
FOR EACH ROW WHEN NEW.budget_category_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.budget_category_id
      AND category.owner_id = NEW.owner_id
      AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid GoMining budget category') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_gomining_scenarios_category_owner_update`
BEFORE UPDATE OF `owner_id`, `budget_category_id` ON `finance_gomining_scenarios`
FOR EACH ROW WHEN NEW.budget_category_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.budget_category_id
      AND category.owner_id = NEW.owner_id
      AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid GoMining budget category') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_gomining_versions_immutable_update`
BEFORE UPDATE ON `finance_gomining_scenario_versions`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'GoMining version is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `finance_gomining_versions_immutable_delete`
BEFORE DELETE ON `finance_gomining_scenario_versions`
FOR EACH ROW BEGIN
  SELECT RAISE(ABORT, 'GoMining version is immutable');
END;
