CREATE TABLE `finance_cfo_rule_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`placements_basis_points` integer NOT NULL,
	`business_basis_points` integer NOT NULL,
	`material_basis_points` integer NOT NULL,
	`projects_basis_points` integer NOT NULL,
	`opportunities_basis_points` integer NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_cfo_rule_sets_revision" CHECK("finance_cfo_rule_sets"."revision" >= 2),
	CONSTRAINT "finance_cfo_rule_sets_weights" CHECK("finance_cfo_rule_sets"."placements_basis_points" between 0 and 10000 and "finance_cfo_rule_sets"."business_basis_points" between 0 and 10000 and "finance_cfo_rule_sets"."material_basis_points" between 0 and 10000 and "finance_cfo_rule_sets"."projects_basis_points" between 0 and 10000 and "finance_cfo_rule_sets"."opportunities_basis_points" between 0 and 10000 and "finance_cfo_rule_sets"."placements_basis_points" + "finance_cfo_rule_sets"."business_basis_points" + "finance_cfo_rule_sets"."material_basis_points" + "finance_cfo_rule_sets"."projects_basis_points" + "finance_cfo_rule_sets"."opportunities_basis_points" = 10000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_cfo_rule_sets_owner_revision_idx` ON `finance_cfo_rule_sets` (`owner_id`,`revision`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_cfo_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`evaluation_id` text NOT NULL,
	`outcome` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`plan` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`evaluation_id`) REFERENCES `finance_cfo_evaluations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_cfo_decisions_outcome" CHECK("__new_finance_cfo_decisions"."outcome" in ('accepted', 'modified', 'ignored')),
	CONSTRAINT "finance_cfo_decisions_note" CHECK(length(trim("__new_finance_cfo_decisions"."note")) <= 240),
	CONSTRAINT "finance_cfo_decisions_plan" CHECK("__new_finance_cfo_decisions"."plan" is null or (length("__new_finance_cfo_decisions"."plan") between 2 and 10000 and json_valid("__new_finance_cfo_decisions"."plan")))
);
--> statement-breakpoint
INSERT INTO `__new_finance_cfo_decisions`("id", "owner_id", "evaluation_id", "outcome", "note", "plan", "created_at") SELECT "id", "owner_id", "evaluation_id", "outcome", "note", "plan", "created_at" FROM `finance_cfo_decisions`;--> statement-breakpoint
DROP TABLE `finance_cfo_decisions`;--> statement-breakpoint
ALTER TABLE `__new_finance_cfo_decisions` RENAME TO `finance_cfo_decisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `finance_cfo_decisions_owner_evaluation_idx` ON `finance_cfo_decisions` (`owner_id`,`evaluation_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_rule_sets_immutable_update` BEFORE UPDATE ON `finance_cfo_rule_sets` BEGIN SELECT RAISE(ABORT, 'CFO rule set is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_rule_sets_immutable_delete` BEFORE DELETE ON `finance_cfo_rule_sets` BEGIN SELECT RAISE(ABORT, 'CFO rule set is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_owner_insert` BEFORE INSERT ON `finance_cfo_decisions` WHEN NOT EXISTS (SELECT 1 FROM `finance_cfo_evaluations` WHERE `id` = NEW.`evaluation_id` AND `owner_id` = NEW.`owner_id`) BEGIN SELECT RAISE(ABORT, 'Invalid CFO decision evaluation'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_immutable_update` BEFORE UPDATE ON `finance_cfo_decisions` BEGIN SELECT RAISE(ABORT, 'CFO decision is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_cfo_decisions_immutable_delete` BEFORE DELETE ON `finance_cfo_decisions` BEGIN SELECT RAISE(ABORT, 'CFO decision is immutable'); END;
