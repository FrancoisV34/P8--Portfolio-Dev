CREATE TABLE `finance_business_monthly_provisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`period` text NOT NULL,
	`name` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_business_provisions_name" CHECK(length(trim("finance_business_monthly_provisions"."name")) between 1 and 100),
	CONSTRAINT "finance_business_provisions_amount" CHECK(typeof("finance_business_monthly_provisions"."amount_cents") = 'integer' and "finance_business_monthly_provisions"."amount_cents" >= 0 and "finance_business_monthly_provisions"."amount_cents" <= 9007199254740991),
	CONSTRAINT "finance_business_provisions_note" CHECK(length(trim("finance_business_monthly_provisions"."note")) <= 240),
	CONSTRAINT "finance_business_provisions_period" CHECK(length("finance_business_monthly_provisions"."period") = 7 and "finance_business_monthly_provisions"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_business_monthly_provisions"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_business_monthly_provisions"."period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `finance_business_provisions_owner_period_idx` ON `finance_business_monthly_provisions` (`owner_id`,`period`);--> statement-breakpoint
CREATE INDEX `finance_business_provisions_entity_period_idx` ON `finance_business_monthly_provisions` (`entity_id`,`period`);--> statement-breakpoint
CREATE TRIGGER `finance_business_provisions_entity_owner_insert`
BEFORE INSERT ON `finance_business_monthly_provisions`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business provision entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_provisions_entity_owner_update`
BEFORE UPDATE OF `owner_id`, `entity_id` ON `finance_business_monthly_provisions`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business provision entity') END;
END;
