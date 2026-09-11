CREATE TABLE `finance_project_capacity` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`monthly_capacity_minutes` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_project_capacity_minutes" CHECK(typeof("finance_project_capacity"."monthly_capacity_minutes") = 'integer' and "finance_project_capacity"."monthly_capacity_minutes" between 0 and 44640)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_project_capacity_owner_id_unique` ON `finance_project_capacity` (`owner_id`);