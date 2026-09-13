CREATE TABLE `finance_cfo_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`outcome` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`plan` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `finance_cfo_evaluations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_cfo_decisions_outcome" CHECK("finance_cfo_decisions"."outcome" in ('accepted', 'ignored')),
	CONSTRAINT "finance_cfo_decisions_note" CHECK(length(trim("finance_cfo_decisions"."note")) <= 240),
	CONSTRAINT "finance_cfo_decisions_plan" CHECK("finance_cfo_decisions"."plan" is null or (length("finance_cfo_decisions"."plan") between 2 and 10000 and json_valid("finance_cfo_decisions"."plan")))
);
--> statement-breakpoint
CREATE INDEX `finance_cfo_decisions_owner_evaluation_idx` ON `finance_cfo_decisions` (`owner_id`,`evaluation_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_owner_insert` BEFORE INSERT ON `finance_cfo_decisions` WHEN NOT EXISTS (SELECT 1 FROM `finance_cfo_evaluations` WHERE `id` = NEW.`evaluation_id` AND `owner_id` = NEW.`owner_id`) BEGIN SELECT RAISE(ABORT, 'Invalid CFO decision evaluation'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_immutable_update` BEFORE UPDATE ON `finance_cfo_decisions` BEGIN SELECT RAISE(ABORT, 'CFO decision is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_immutable_delete` BEFORE DELETE ON `finance_cfo_decisions` BEGIN SELECT RAISE(ABORT, 'CFO decision is immutable'); END;
