CREATE TABLE `finance_import_agent_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`run_id` text NOT NULL,
	`line_id` text NOT NULL,
	`action` text NOT NULL,
	`transaction_id` text NOT NULL,
	`previous_occurred_on` text,
	`created_at` text NOT NULL,
	`undone_at` text,
	FOREIGN KEY (`line_id`) REFERENCES `finance_import_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_import_agent_decisions_action" CHECK("finance_import_agent_decisions"."action" in ('create', 'link')),
	CONSTRAINT "finance_import_agent_decisions_previous" CHECK("finance_import_agent_decisions"."previous_occurred_on" is null or ("finance_import_agent_decisions"."action" = 'link' and length("finance_import_agent_decisions"."previous_occurred_on") = 10))
);
--> statement-breakpoint
CREATE INDEX `finance_import_agent_decisions_owner_run_idx` ON `finance_import_agent_decisions` (`owner_id`,`run_id`);--> statement-breakpoint
CREATE INDEX `finance_import_agent_decisions_line_idx` ON `finance_import_agent_decisions` (`line_id`);