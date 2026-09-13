CREATE TABLE `finance_simulation_assumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`snapshot` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_simulation_assumptions_revision" CHECK("finance_simulation_assumptions"."revision" >= 1),
	CONSTRAINT "finance_simulation_assumptions_snapshot" CHECK(length("finance_simulation_assumptions"."snapshot") between 2 and 50000 and json_valid("finance_simulation_assumptions"."snapshot"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_simulation_assumptions_owner_revision_idx` ON `finance_simulation_assumptions` (`owner_id`,`revision`);--> statement-breakpoint
CREATE TABLE `finance_simulation_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`assumption_id` text NOT NULL,
	`input` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`assumption_id`) REFERENCES `finance_simulation_assumptions`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_simulation_runs_input" CHECK(length("finance_simulation_runs"."input") between 2 and 50000 and json_valid("finance_simulation_runs"."input")),
	CONSTRAINT "finance_simulation_runs_result" CHECK(length("finance_simulation_runs"."result") between 2 and 200000 and json_valid("finance_simulation_runs"."result"))
);
--> statement-breakpoint
CREATE INDEX `finance_simulation_runs_owner_created_idx` ON `finance_simulation_runs` (`owner_id`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_simulation_assumptions_immutable_update` BEFORE UPDATE ON `finance_simulation_assumptions` BEGIN SELECT RAISE(ABORT, 'Simulation assumption is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_simulation_assumptions_immutable_delete` BEFORE DELETE ON `finance_simulation_assumptions` BEGIN SELECT RAISE(ABORT, 'Simulation assumption is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_simulation_runs_owner_insert` BEFORE INSERT ON `finance_simulation_runs` WHEN NOT EXISTS (SELECT 1 FROM `finance_simulation_assumptions` WHERE `id` = NEW.`assumption_id` AND `owner_id` = NEW.`owner_id`) BEGIN SELECT RAISE(ABORT, 'Invalid simulation assumption'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_simulation_runs_immutable_update` BEFORE UPDATE ON `finance_simulation_runs` BEGIN SELECT RAISE(ABORT, 'Simulation run is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_simulation_runs_immutable_delete` BEFORE DELETE ON `finance_simulation_runs` BEGIN SELECT RAISE(ABORT, 'Simulation run is immutable'); END;
