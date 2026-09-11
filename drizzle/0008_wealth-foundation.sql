CREATE TABLE `finance_wealth_asset_valuations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`valued_on` text NOT NULL,
	`value_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`asset_id`) REFERENCES `finance_wealth_assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_wealth_valuations_value" CHECK(typeof("finance_wealth_asset_valuations"."value_cents") = 'integer' and "finance_wealth_asset_valuations"."value_cents" between 0 and 9007199254740991),
	CONSTRAINT "finance_wealth_valuations_note" CHECK(length(trim("finance_wealth_asset_valuations"."note")) <= 240),
	CONSTRAINT "finance_wealth_valuations_date" CHECK(length("finance_wealth_asset_valuations"."valued_on") = 10 and "finance_wealth_asset_valuations"."valued_on" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("finance_wealth_asset_valuations"."valued_on", 1, 4) as integer) between 1 and 9999 and date("finance_wealth_asset_valuations"."valued_on", '+0 days') is not null and date("finance_wealth_asset_valuations"."valued_on", '+0 days') = "finance_wealth_asset_valuations"."valued_on")
);
--> statement-breakpoint
CREATE INDEX `finance_wealth_valuations_owner_date_idx` ON `finance_wealth_asset_valuations` (`owner_id`,`valued_on`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_wealth_valuations_asset_date_unique` ON `finance_wealth_asset_valuations` (`asset_id`,`valued_on`);--> statement-breakpoint
CREATE TABLE `finance_wealth_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`asset_class` text NOT NULL,
	`quantity_description` text DEFAULT '' NOT NULL,
	`contributed_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_wealth_assets_class" CHECK("finance_wealth_assets"."asset_class" in ('securities', 'crypto', 'real_estate', 'business', 'other')),
	CONSTRAINT "finance_wealth_assets_name" CHECK(length(trim("finance_wealth_assets"."name")) between 1 and 100),
	CONSTRAINT "finance_wealth_assets_quantity" CHECK(length(trim("finance_wealth_assets"."quantity_description")) <= 80),
	CONSTRAINT "finance_wealth_assets_contributed" CHECK(typeof("finance_wealth_assets"."contributed_cents") = 'integer' and "finance_wealth_assets"."contributed_cents" between 0 and 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `finance_wealth_assets_owner_idx` ON `finance_wealth_assets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `finance_wealth_assets_entity_idx` ON `finance_wealth_assets` (`entity_id`);--> statement-breakpoint
CREATE TABLE `finance_wealth_debt_balances` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`debt_id` text NOT NULL,
	`as_of_date` text NOT NULL,
	`outstanding_cents` integer NOT NULL,
	`monthly_payment_cents` integer NOT NULL,
	`annual_rate_basis_points` integer NOT NULL,
	`remaining_months` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`debt_id`) REFERENCES `finance_wealth_debts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_wealth_debt_balances_outstanding" CHECK(typeof("finance_wealth_debt_balances"."outstanding_cents") = 'integer' and "finance_wealth_debt_balances"."outstanding_cents" >= 0 and "finance_wealth_debt_balances"."outstanding_cents" <= 9007199254740991),
	CONSTRAINT "finance_wealth_debt_balances_payment" CHECK(typeof("finance_wealth_debt_balances"."monthly_payment_cents") = 'integer' and "finance_wealth_debt_balances"."monthly_payment_cents" > 0 and "finance_wealth_debt_balances"."monthly_payment_cents" <= 9007199254740991),
	CONSTRAINT "finance_wealth_debt_balances_rate" CHECK("finance_wealth_debt_balances"."annual_rate_basis_points" between 0 and 100000),
	CONSTRAINT "finance_wealth_debt_balances_months" CHECK("finance_wealth_debt_balances"."remaining_months" between 1 and 600),
	CONSTRAINT "finance_wealth_debt_balances_date" CHECK(length("finance_wealth_debt_balances"."as_of_date") = 10 and "finance_wealth_debt_balances"."as_of_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("finance_wealth_debt_balances"."as_of_date", 1, 4) as integer) between 1 and 9999 and date("finance_wealth_debt_balances"."as_of_date", '+0 days') is not null and date("finance_wealth_debt_balances"."as_of_date", '+0 days') = "finance_wealth_debt_balances"."as_of_date")
);
--> statement-breakpoint
CREATE INDEX `finance_wealth_debt_balances_owner_date_idx` ON `finance_wealth_debt_balances` (`owner_id`,`as_of_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_wealth_debt_balances_debt_date_unique` ON `finance_wealth_debt_balances` (`debt_id`,`as_of_date`);--> statement-breakpoint
CREATE TABLE `finance_wealth_debts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_wealth_debts_name" CHECK(length(trim("finance_wealth_debts"."name")) between 1 and 100)
);
--> statement-breakpoint
CREATE INDEX `finance_wealth_debts_owner_idx` ON `finance_wealth_debts` (`owner_id`);--> statement-breakpoint
CREATE INDEX `finance_wealth_debts_entity_idx` ON `finance_wealth_debts` (`entity_id`);--> statement-breakpoint
CREATE TRIGGER `finance_wealth_assets_entity_owner_insert`
BEFORE INSERT ON `finance_wealth_assets`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth asset entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_assets_entity_owner_update`
BEFORE UPDATE OF `owner_id`, `entity_id` ON `finance_wealth_assets`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth asset entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_valuations_asset_owner_insert`
BEFORE INSERT ON `finance_wealth_asset_valuations`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_wealth_assets` asset
    WHERE asset.id = NEW.asset_id AND asset.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth asset valuation') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_valuations_asset_owner_update`
BEFORE UPDATE OF `owner_id`, `asset_id` ON `finance_wealth_asset_valuations`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_wealth_assets` asset
    WHERE asset.id = NEW.asset_id AND asset.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth asset valuation') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_debts_entity_owner_insert`
BEFORE INSERT ON `finance_wealth_debts`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth debt entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_debts_entity_owner_update`
BEFORE UPDATE OF `owner_id`, `entity_id` ON `finance_wealth_debts`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth debt entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_debt_balances_debt_owner_insert`
BEFORE INSERT ON `finance_wealth_debt_balances`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_wealth_debts` debt
    WHERE debt.id = NEW.debt_id AND debt.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth debt balance') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_wealth_debt_balances_debt_owner_update`
BEFORE UPDATE OF `owner_id`, `debt_id` ON `finance_wealth_debt_balances`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_wealth_debts` debt
    WHERE debt.id = NEW.debt_id AND debt.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid wealth debt balance') END;
END;
