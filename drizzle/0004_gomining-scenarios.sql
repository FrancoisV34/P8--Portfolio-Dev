CREATE TABLE `finance_gomining_contribution_phases` (
	`id` text PRIMARY KEY NOT NULL,
	`scenario_id` text NOT NULL,
	`start_month` integer NOT NULL,
	`end_month` integer,
	`amount_cents` integer NOT NULL,
	FOREIGN KEY (`scenario_id`) REFERENCES `finance_gomining_scenarios`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_gomining_phases_months" CHECK("finance_gomining_contribution_phases"."start_month" >= 1 and ("finance_gomining_contribution_phases"."end_month" is null or "finance_gomining_contribution_phases"."end_month" >= "finance_gomining_contribution_phases"."start_month")),
	CONSTRAINT "finance_gomining_phases_amount" CHECK("finance_gomining_contribution_phases"."amount_cents" >= 0 and "finance_gomining_contribution_phases"."amount_cents" <= 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `finance_gomining_phases_scenario_idx` ON `finance_gomining_contribution_phases` (`scenario_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_gomining_phases_scenario_start_unique` ON `finance_gomining_contribution_phases` (`scenario_id`,`start_month`);--> statement-breakpoint
CREATE TABLE `finance_gomining_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`start_period` text NOT NULL,
	`horizon_months` integer NOT NULL,
	`initial_hashrate_milli_th` integer NOT NULL,
	`initial_accumulated_sats` integer NOT NULL,
	`efficiency_milli_watts_per_th` integer NOT NULL,
	`monthly_net_reward_sats_per_th` integer NOT NULL,
	`price_cents_per_milli_th` integer NOT NULL,
	`btc_price_cents` integer NOT NULL,
	`accumulated_btc_policy` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_gomining_scenarios_name" CHECK(length(trim("finance_gomining_scenarios"."name")) between 1 and 100),
	CONSTRAINT "finance_gomining_scenarios_horizon" CHECK("finance_gomining_scenarios"."horizon_months" between 1 and 600),
	CONSTRAINT "finance_gomining_scenarios_hashrate" CHECK(typeof("finance_gomining_scenarios"."initial_hashrate_milli_th") = 'integer' and "finance_gomining_scenarios"."initial_hashrate_milli_th" > 0 and "finance_gomining_scenarios"."initial_hashrate_milli_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_sats" CHECK(typeof("finance_gomining_scenarios"."initial_accumulated_sats") = 'integer' and "finance_gomining_scenarios"."initial_accumulated_sats" >= 0 and "finance_gomining_scenarios"."initial_accumulated_sats" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_efficiency" CHECK("finance_gomining_scenarios"."efficiency_milli_watts_per_th" > 0 and "finance_gomining_scenarios"."efficiency_milli_watts_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_reward" CHECK("finance_gomining_scenarios"."monthly_net_reward_sats_per_th" >= 0 and "finance_gomining_scenarios"."monthly_net_reward_sats_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_prices" CHECK("finance_gomining_scenarios"."price_cents_per_milli_th" > 0 and "finance_gomining_scenarios"."btc_price_cents" > 0 and "finance_gomining_scenarios"."price_cents_per_milli_th" <= 9007199254740991 and "finance_gomining_scenarios"."btc_price_cents" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_policy" CHECK("finance_gomining_scenarios"."accumulated_btc_policy" in ('keep', 'reinvest-at-threshold')),
	CONSTRAINT "finance_gomining_scenarios_period" CHECK(length("finance_gomining_scenarios"."start_period") = 7 and "finance_gomining_scenarios"."start_period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_gomining_scenarios"."start_period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_gomining_scenarios"."start_period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `finance_gomining_scenarios_owner_idx` ON `finance_gomining_scenarios` (`owner_id`);