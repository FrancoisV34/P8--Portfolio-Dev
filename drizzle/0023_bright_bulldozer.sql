CREATE TABLE `finance_regulatory_source_checks` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_key` text NOT NULL,
	`source_url` text NOT NULL,
	`content_hash` text,
	`state` text NOT NULL,
	`status_code` integer,
	`checked_at` text NOT NULL,
	CONSTRAINT "finance_regulatory_source_checks_key" CHECK(length(trim("finance_regulatory_source_checks"."source_key")) between 1 and 80),
	CONSTRAINT "finance_regulatory_source_checks_url" CHECK(length("finance_regulatory_source_checks"."source_url") between 1 and 500),
	CONSTRAINT "finance_regulatory_source_checks_hash" CHECK("finance_regulatory_source_checks"."content_hash" is null or length("finance_regulatory_source_checks"."content_hash") = 64),
	CONSTRAINT "finance_regulatory_source_checks_state" CHECK("finance_regulatory_source_checks"."state" in ('review', 'unchanged', 'changed', 'unavailable')),
	CONSTRAINT "finance_regulatory_source_checks_status" CHECK("finance_regulatory_source_checks"."status_code" is null or "finance_regulatory_source_checks"."status_code" between 100 and 599)
);
--> statement-breakpoint
CREATE INDEX `finance_regulatory_source_checks_owner_key_checked_idx` ON `finance_regulatory_source_checks` (`owner_id`,`source_key`,`checked_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_regulatory_source_checks_immutable_update` BEFORE UPDATE ON `finance_regulatory_source_checks` BEGIN SELECT RAISE(ABORT, 'immutable regulatory source check'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_regulatory_source_checks_immutable_delete` BEFORE DELETE ON `finance_regulatory_source_checks` BEGIN SELECT RAISE(ABORT, 'immutable regulatory source check'); END;
