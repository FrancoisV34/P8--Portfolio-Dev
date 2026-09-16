CREATE TABLE `finance_monthly_closures` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`period` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_monthly_closures_period" CHECK(length("finance_monthly_closures"."period") = 7 and "finance_monthly_closures"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_monthly_closures"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_monthly_closures"."period", 6, 2) as integer) between 1 and 12),
	CONSTRAINT "finance_monthly_closures_revision" CHECK("finance_monthly_closures"."revision" between 1 and 1000),
	CONSTRAINT "finance_monthly_closures_snapshot" CHECK(length("finance_monthly_closures"."snapshot_json") between 2 and 100000 and json_valid("finance_monthly_closures"."snapshot_json"))
);
--> statement-breakpoint
CREATE INDEX `finance_monthly_closures_owner_period_idx` ON `finance_monthly_closures` (`owner_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_monthly_closures_owner_period_revision_unique` ON `finance_monthly_closures` (`owner_id`,`period`,`revision`);--> statement-breakpoint
CREATE TRIGGER `finance_monthly_closures_immutable_update` BEFORE UPDATE ON `finance_monthly_closures` BEGIN SELECT RAISE(ABORT, 'immutable monthly closure'); END;--> statement-breakpoint
CREATE TRIGGER `finance_monthly_closures_immutable_delete` BEFORE DELETE ON `finance_monthly_closures` BEGIN SELECT RAISE(ABORT, 'immutable monthly closure'); END;
