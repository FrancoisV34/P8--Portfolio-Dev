CREATE TABLE `finance_business_activities` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_business_activities_name" CHECK(length(trim("finance_business_activities"."name")) between 1 and 100),
	CONSTRAINT "finance_business_activities_active" CHECK("finance_business_activities"."is_active" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `finance_business_activities_owner_idx` ON `finance_business_activities` (`owner_id`);--> statement-breakpoint
CREATE INDEX `finance_business_activities_entity_idx` ON `finance_business_activities` (`entity_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_business_activities_owner_name_unique` ON `finance_business_activities` (`owner_id`,`name`);--> statement-breakpoint
CREATE TABLE `finance_business_entity_monthly_cash` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`entity_id` text NOT NULL,
	`period` text NOT NULL,
	`retained_cash_cents` integer NOT NULL,
	`distributed_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `finance_economic_entities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_business_cash_retained" CHECK(typeof("finance_business_entity_monthly_cash"."retained_cash_cents") = 'integer' and "finance_business_entity_monthly_cash"."retained_cash_cents" >= 0 and "finance_business_entity_monthly_cash"."retained_cash_cents" <= 9007199254740991),
	CONSTRAINT "finance_business_cash_distributed" CHECK(typeof("finance_business_entity_monthly_cash"."distributed_cents") = 'integer' and "finance_business_entity_monthly_cash"."distributed_cents" >= 0 and "finance_business_entity_monthly_cash"."distributed_cents" <= 9007199254740991),
	CONSTRAINT "finance_business_cash_period" CHECK(length("finance_business_entity_monthly_cash"."period") = 7 and "finance_business_entity_monthly_cash"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_business_entity_monthly_cash"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_business_entity_monthly_cash"."period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `finance_business_cash_owner_period_idx` ON `finance_business_entity_monthly_cash` (`owner_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_business_cash_owner_entity_period_unique` ON `finance_business_entity_monthly_cash` (`owner_id`,`entity_id`,`period`);--> statement-breakpoint
CREATE TABLE `finance_business_monthly_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`activity_id` text NOT NULL,
	`period` text NOT NULL,
	`revenue_cents` integer NOT NULL,
	`operating_expense_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`activity_id`) REFERENCES `finance_business_activities`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_business_metrics_revenue" CHECK(typeof("finance_business_monthly_metrics"."revenue_cents") = 'integer' and "finance_business_monthly_metrics"."revenue_cents" >= 0 and "finance_business_monthly_metrics"."revenue_cents" <= 9007199254740991),
	CONSTRAINT "finance_business_metrics_expenses" CHECK(typeof("finance_business_monthly_metrics"."operating_expense_cents") = 'integer' and "finance_business_monthly_metrics"."operating_expense_cents" >= 0 and "finance_business_monthly_metrics"."operating_expense_cents" <= 9007199254740991),
	CONSTRAINT "finance_business_metrics_period" CHECK(length("finance_business_monthly_metrics"."period") = 7 and "finance_business_monthly_metrics"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_business_monthly_metrics"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_business_monthly_metrics"."period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `finance_business_metrics_owner_period_idx` ON `finance_business_monthly_metrics` (`owner_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_business_metrics_owner_activity_period_unique` ON `finance_business_monthly_metrics` (`owner_id`,`activity_id`,`period`);--> statement-breakpoint
CREATE TRIGGER `finance_business_activities_entity_owner_insert`
BEFORE INSERT ON `finance_business_activities`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business activity entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_activities_entity_owner_update`
BEFORE UPDATE OF `owner_id`, `entity_id` ON `finance_business_activities`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business activity entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_metrics_activity_owner_insert`
BEFORE INSERT ON `finance_business_monthly_metrics`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_business_activities` activity
    WHERE activity.id = NEW.activity_id AND activity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid business activity metric') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_metrics_activity_owner_update`
BEFORE UPDATE OF `owner_id`, `activity_id` ON `finance_business_monthly_metrics`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_business_activities` activity
    WHERE activity.id = NEW.activity_id AND activity.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid business activity metric') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_cash_entity_owner_insert`
BEFORE INSERT ON `finance_business_entity_monthly_cash`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business cash entity') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_business_cash_entity_owner_update`
BEFORE UPDATE OF `owner_id`, `entity_id` ON `finance_business_entity_monthly_cash`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_economic_entities` entity
    WHERE entity.id = NEW.entity_id AND entity.owner_id = NEW.owner_id AND entity.type = 'business'
  ) THEN RAISE(ABORT, 'invalid business cash entity') END;
END;
