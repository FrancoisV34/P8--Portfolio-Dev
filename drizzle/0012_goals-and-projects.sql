CREATE TABLE `finance_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`target_cents` integer NOT NULL,
	`progress_cents` integer DEFAULT 0 NOT NULL,
	`target_date` text,
	`priority` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_goals_name" CHECK(length(trim("finance_goals"."name")) between 1 and 100),
	CONSTRAINT "finance_goals_target" CHECK(typeof("finance_goals"."target_cents") = 'integer' and "finance_goals"."target_cents" > 0 and "finance_goals"."target_cents" <= 9007199254740991),
	CONSTRAINT "finance_goals_progress" CHECK(typeof("finance_goals"."progress_cents") = 'integer' and "finance_goals"."progress_cents" between 0 and 9007199254740991),
	CONSTRAINT "finance_goals_priority" CHECK("finance_goals"."priority" between 1 and 999),
	CONSTRAINT "finance_goals_target_date" CHECK("finance_goals"."target_date" is null or (length("finance_goals"."target_date") = 10 and "finance_goals"."target_date" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("finance_goals"."target_date", 1, 4) as integer) between 1 and 9999 and date("finance_goals"."target_date", '+0 days') is not null and date("finance_goals"."target_date", '+0 days') = "finance_goals"."target_date"))
);
--> statement-breakpoint
CREATE INDEX `finance_goals_owner_priority_idx` ON `finance_goals` (`owner_id`,`priority`);--> statement-breakpoint
CREATE TABLE `finance_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`goal_id` text,
	`name` text NOT NULL,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` integer NOT NULL,
	`estimated_cost_cents` integer,
	`estimated_effort_minutes` integer,
	`next_action` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `finance_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_projects_name" CHECK(length(trim("finance_projects"."name")) between 1 and 100),
	CONSTRAINT "finance_projects_status" CHECK("finance_projects"."status" in ('backlog', 'active', 'paused', 'done')),
	CONSTRAINT "finance_projects_priority" CHECK("finance_projects"."priority" between 1 and 999),
	CONSTRAINT "finance_projects_cost" CHECK("finance_projects"."estimated_cost_cents" is null or (typeof("finance_projects"."estimated_cost_cents") = 'integer' and "finance_projects"."estimated_cost_cents" between 0 and 9007199254740991)),
	CONSTRAINT "finance_projects_effort" CHECK("finance_projects"."estimated_effort_minutes" is null or (typeof("finance_projects"."estimated_effort_minutes") = 'integer' and "finance_projects"."estimated_effort_minutes" between 0 and 44640)),
	CONSTRAINT "finance_projects_next_action" CHECK(length(trim("finance_projects"."next_action")) <= 240)
);
--> statement-breakpoint
CREATE INDEX `finance_projects_owner_status_priority_idx` ON `finance_projects` (`owner_id`,`status`,`priority`);--> statement-breakpoint
CREATE INDEX `finance_projects_goal_idx` ON `finance_projects` (`goal_id`);--> statement-breakpoint
CREATE TRIGGER `finance_projects_goal_owner_insert`
BEFORE INSERT ON `finance_projects`
FOR EACH ROW WHEN NEW.goal_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_goals` goal WHERE goal.id = NEW.goal_id AND goal.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid project goal') END;
END;--> statement-breakpoint
CREATE TRIGGER `finance_projects_goal_owner_update`
BEFORE UPDATE OF `owner_id`, `goal_id` ON `finance_projects`
FOR EACH ROW WHEN NEW.goal_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_goals` goal WHERE goal.id = NEW.goal_id AND goal.owner_id = NEW.owner_id
  ) THEN RAISE(ABORT, 'invalid project goal') END;
END;
