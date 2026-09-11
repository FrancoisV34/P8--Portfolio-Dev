PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER `finance_wealth_valuations_asset_owner_update`;--> statement-breakpoint
DROP TRIGGER `finance_wealth_valuations_asset_owner_insert`;--> statement-breakpoint
DROP TRIGGER `finance_wealth_assets_entity_owner_update`;--> statement-breakpoint
DROP TRIGGER `finance_wealth_assets_entity_owner_insert`;--> statement-breakpoint
CREATE TABLE `__new_finance_wealth_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`asset_class` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`observed_btc_sats` integer,
	`quantity_description` text DEFAULT '' NOT NULL,
	`contributed_cents` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_wealth_assets_class" CHECK("__new_finance_wealth_assets"."asset_class" in ('securities', 'crypto', 'real_estate', 'business', 'other')),
	CONSTRAINT "finance_wealth_assets_source" CHECK("__new_finance_wealth_assets"."source" in ('manual', 'gomining-observed-btc')),
	CONSTRAINT "finance_wealth_assets_observed_btc" CHECK(("__new_finance_wealth_assets"."source" = 'manual' and "__new_finance_wealth_assets"."observed_btc_sats" is null) or ("__new_finance_wealth_assets"."source" = 'gomining-observed-btc' and "__new_finance_wealth_assets"."asset_class" = 'crypto' and typeof("__new_finance_wealth_assets"."observed_btc_sats") = 'integer' and "__new_finance_wealth_assets"."observed_btc_sats" >= 0 and "__new_finance_wealth_assets"."observed_btc_sats" <= 9007199254740991)),
	CONSTRAINT "finance_wealth_assets_name" CHECK(length(trim("__new_finance_wealth_assets"."name")) between 1 and 100),
	CONSTRAINT "finance_wealth_assets_quantity" CHECK(length(trim("__new_finance_wealth_assets"."quantity_description")) <= 80),
	CONSTRAINT "finance_wealth_assets_contributed" CHECK(typeof("__new_finance_wealth_assets"."contributed_cents") = 'integer' and "__new_finance_wealth_assets"."contributed_cents" between 0 and 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `__new_finance_wealth_assets`("id", "owner_id", "entity_id", "name", "asset_class", "source", "observed_btc_sats", "quantity_description", "contributed_cents", "created_at", "updated_at") SELECT "id", "owner_id", "entity_id", "name", "asset_class", 'manual', NULL, "quantity_description", "contributed_cents", "created_at", "updated_at" FROM `finance_wealth_assets`;--> statement-breakpoint
DROP TABLE `finance_wealth_assets`;--> statement-breakpoint
ALTER TABLE `__new_finance_wealth_assets` RENAME TO `finance_wealth_assets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `finance_wealth_assets_owner_idx` ON `finance_wealth_assets` (`owner_id`);--> statement-breakpoint
CREATE INDEX `finance_wealth_assets_entity_idx` ON `finance_wealth_assets` (`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_wealth_assets_owner_gomining_btc_unique` ON `finance_wealth_assets` (`owner_id`) WHERE "finance_wealth_assets"."source" = 'gomining-observed-btc';--> statement-breakpoint
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
END;
