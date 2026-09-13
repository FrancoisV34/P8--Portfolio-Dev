CREATE TABLE `finance_cfo_evaluations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`period` text NOT NULL,
	`rule_version` text NOT NULL,
	`input` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_cfo_evaluations_period" CHECK(length("finance_cfo_evaluations"."period") = 7 and "finance_cfo_evaluations"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_cfo_evaluations"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_cfo_evaluations"."period", 6, 2) as integer) between 1 and 12),
	CONSTRAINT "finance_cfo_evaluations_rule_version" CHECK(length(trim("finance_cfo_evaluations"."rule_version")) between 1 and 80),
	CONSTRAINT "finance_cfo_evaluations_input" CHECK(length("finance_cfo_evaluations"."input") between 2 and 10000 and json_valid("finance_cfo_evaluations"."input")),
	CONSTRAINT "finance_cfo_evaluations_result" CHECK(length("finance_cfo_evaluations"."result") between 2 and 10000 and json_valid("finance_cfo_evaluations"."result"))
);
--> statement-breakpoint
CREATE INDEX `finance_cfo_evaluations_owner_created_idx` ON `finance_cfo_evaluations` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_evaluations_immutable_update` BEFORE UPDATE ON `finance_cfo_evaluations` BEGIN SELECT RAISE(ABORT, 'CFO evaluation is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_evaluations_immutable_delete` BEFORE DELETE ON `finance_cfo_evaluations` BEGIN SELECT RAISE(ABORT, 'CFO evaluation is immutable'); END;
