CREATE TABLE `finance_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`opening_balance_cents` integer NOT NULL,
	`opening_date` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_accounts_type" CHECK("finance_accounts"."type" in ('checking', 'savings', 'cash')),
	CONSTRAINT "finance_accounts_currency" CHECK("finance_accounts"."currency" = 'EUR'),
	CONSTRAINT "finance_accounts_balance" CHECK(typeof("finance_accounts"."opening_balance_cents") = 'integer' and "finance_accounts"."opening_balance_cents" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "finance_accounts_name" CHECK(length(trim("finance_accounts"."name")) between 1 and 100),
	CONSTRAINT "finance_accounts_active" CHECK("finance_accounts"."is_active" in (0, 1)),
	CONSTRAINT "finance_accounts_opening_date" CHECK(length("finance_accounts"."opening_date") = 10 and "finance_accounts"."opening_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("finance_accounts"."opening_date", 1, 4) as integer) between 1 and 9999 and date("finance_accounts"."opening_date", '+0 days') is not null and date("finance_accounts"."opening_date", '+0 days') = "finance_accounts"."opening_date")
);
--> statement-breakpoint
CREATE INDEX `finance_accounts_entity_idx` ON `finance_accounts` (`entity_id`);--> statement-breakpoint
CREATE TABLE `finance_economic_entities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_entities_type" CHECK("finance_economic_entities"."type" in ('personal', 'business')),
	CONSTRAINT "finance_entities_name" CHECK(length(trim("finance_economic_entities"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE INDEX `finance_entities_owner_idx` ON `finance_economic_entities` (`owner_id`);