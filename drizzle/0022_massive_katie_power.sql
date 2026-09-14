CREATE TABLE `finance_status_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`input` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_status_comparisons_input" CHECK(length("finance_status_comparisons"."input") between 2 and 10000 and json_valid("finance_status_comparisons"."input")),
	CONSTRAINT "finance_status_comparisons_result" CHECK(length("finance_status_comparisons"."result") between 2 and 10000 and json_valid("finance_status_comparisons"."result"))
);
--> statement-breakpoint
CREATE INDEX `finance_status_comparisons_owner_created_idx` ON `finance_status_comparisons` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_status_comparisons_immutable_update` BEFORE UPDATE ON `finance_status_comparisons` BEGIN SELECT RAISE(ABORT, 'immutable status comparison'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_status_comparisons_immutable_delete` BEFORE DELETE ON `finance_status_comparisons` BEGIN SELECT RAISE(ABORT, 'immutable status comparison'); END;
