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
	`accumulated_btc_policy` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_gomining_scenarios_name" CHECK(length(trim("__new_finance_gomining_scenarios"."name")) between 1 and 100),
	CONSTRAINT "finance_gomining_scenarios_horizon" CHECK("__new_finance_gomining_scenarios"."horizon_months" between 1 and 600),
	CONSTRAINT "finance_gomining_scenarios_hashrate" CHECK(typeof("__new_finance_gomining_scenarios"."initial_hashrate_milli_th") = 'integer' and "__new_finance_gomining_scenarios"."initial_hashrate_milli_th" > 0 and "__new_finance_gomining_scenarios"."initial_hashrate_milli_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_sats" CHECK(typeof("__new_finance_gomining_scenarios"."initial_accumulated_sats") = 'integer' and "__new_finance_gomining_scenarios"."initial_accumulated_sats" >= 0 and "__new_finance_gomining_scenarios"."initial_accumulated_sats" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_efficiency" CHECK("__new_finance_gomining_scenarios"."efficiency_milli_watts_per_th" > 0 and "__new_finance_gomining_scenarios"."efficiency_milli_watts_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_reward" CHECK("__new_finance_gomining_scenarios"."monthly_net_reward_sats_per_th" >= 0 and "__new_finance_gomining_scenarios"."monthly_net_reward_sats_per_th" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_prices" CHECK("__new_finance_gomining_scenarios"."price_milli_cents_per_milli_th" > 0 and "__new_finance_gomining_scenarios"."btc_price_cents" > 0 and "__new_finance_gomining_scenarios"."price_milli_cents_per_milli_th" <= 9007199254740991 and "__new_finance_gomining_scenarios"."btc_price_cents" <= 9007199254740991),
	CONSTRAINT "finance_gomining_scenarios_policy" CHECK("__new_finance_gomining_scenarios"."accumulated_btc_policy" in ('keep', 'reinvest-at-threshold')),
	CONSTRAINT "finance_gomining_scenarios_period" CHECK(length("__new_finance_gomining_scenarios"."start_period") = 7 and "__new_finance_gomining_scenarios"."start_period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("__new_finance_gomining_scenarios"."start_period", 1, 4) as integer) between 1 and 9999 and cast(substr("__new_finance_gomining_scenarios"."start_period", 6, 2) as integer) between 1 and 12)
);--> statement-breakpoint
INSERT INTO `__new_finance_gomining_scenarios`("id", "owner_id", "name", "start_period", "horizon_months", "initial_hashrate_milli_th", "initial_accumulated_sats", "efficiency_milli_watts_per_th", "monthly_net_reward_sats_per_th", "price_milli_cents_per_milli_th", "btc_price_cents", "accumulated_btc_policy", "created_at", "updated_at") SELECT "id", "owner_id", "name", "start_period", "horizon_months", "initial_hashrate_milli_th", "initial_accumulated_sats", "efficiency_milli_watts_per_th", "monthly_net_reward_sats_per_th", "price_cents_per_milli_th" * 1000, "btc_price_cents", "accumulated_btc_policy", "created_at", "updated_at" FROM `finance_gomining_scenarios`;--> statement-breakpoint
DROP TABLE `finance_gomining_scenarios`;--> statement-breakpoint
ALTER TABLE `__new_finance_gomining_scenarios` RENAME TO `finance_gomining_scenarios`;--> statement-breakpoint
CREATE INDEX `finance_gomining_scenarios_owner_idx` ON `finance_gomining_scenarios` (`owner_id`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
