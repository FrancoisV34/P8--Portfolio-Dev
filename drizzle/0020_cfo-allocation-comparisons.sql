CREATE TABLE `finance_cfo_comparisons` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`name` text NOT NULL,
	`allocation` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `finance_cfo_evaluations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_cfo_comparisons_name" CHECK(length(trim("finance_cfo_comparisons"."name")) between 1 and 100),
	CONSTRAINT "finance_cfo_comparisons_allocation" CHECK(length("finance_cfo_comparisons"."allocation") between 2 and 10000 and json_valid("finance_cfo_comparisons"."allocation"))
);
--> statement-breakpoint
CREATE INDEX `finance_cfo_comparisons_owner_evaluation_idx` ON `finance_cfo_comparisons` (`owner_id`,`evaluation_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_comparisons_owner_insert` BEFORE INSERT ON `finance_cfo_comparisons` WHEN NOT EXISTS (SELECT 1 FROM `finance_cfo_evaluations` WHERE `id` = NEW.`evaluation_id` AND `owner_id` = NEW.`owner_id`) BEGIN SELECT RAISE(ABORT, 'Invalid CFO comparison evaluation'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_comparisons_immutable_update` BEFORE UPDATE ON `finance_cfo_comparisons` BEGIN SELECT RAISE(ABORT, 'CFO comparison is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_comparisons_immutable_delete` BEFORE DELETE ON `finance_cfo_comparisons` BEGIN SELECT RAISE(ABORT, 'CFO comparison is immutable'); END;
