CREATE TABLE `finance_import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_name` text NOT NULL,
	`source_sha256` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_import_batches_kind" CHECK("finance_import_batches"."source_kind" in ('csv', 'pdf')),
	CONSTRAINT "finance_import_batches_name" CHECK(length(trim("finance_import_batches"."source_name")) between 1 and 120),
	CONSTRAINT "finance_import_batches_sha256" CHECK(length("finance_import_batches"."source_sha256") = 64 and "finance_import_batches"."source_sha256" not glob '*[^0-9a-f]*')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_import_batches_owner_account_source_unique` ON `finance_import_batches` (`owner_id`,`account_id`,`source_sha256`);--> statement-breakpoint
CREATE INDEX `finance_import_batches_owner_idx` ON `finance_import_batches` (`owner_id`);--> statement-breakpoint
CREATE TABLE `finance_import_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`position` integer NOT NULL,
	`raw_date` text NOT NULL,
	`raw_label` text NOT NULL,
	`raw_amount` text NOT NULL,
	`occurred_on` text NOT NULL,
	`label` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`fingerprint` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transaction_id` text,
	`decided_at` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `finance_import_batches`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`transaction_id`) REFERENCES `finance_transactions`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "finance_import_lines_position" CHECK("finance_import_lines"."position" between 0 and 4999),
	CONSTRAINT "finance_import_lines_raw" CHECK(length("finance_import_lines"."raw_date") <= 40 and length("finance_import_lines"."raw_label") <= 240 and length("finance_import_lines"."raw_amount") <= 40),
	CONSTRAINT "finance_import_lines_label" CHECK(length(trim("finance_import_lines"."label")) <= 240),
	CONSTRAINT "finance_import_lines_amount" CHECK(typeof("finance_import_lines"."amount_cents") = 'integer' and "finance_import_lines"."amount_cents" != 0 and "finance_import_lines"."amount_cents" between -9007199254740991 and 9007199254740991),
	CONSTRAINT "finance_import_lines_fingerprint" CHECK(length("finance_import_lines"."fingerprint") = 64 and "finance_import_lines"."fingerprint" not glob '*[^0-9a-f]*'),
	CONSTRAINT "finance_import_lines_status" CHECK("finance_import_lines"."status" in ('pending', 'accepted', 'rejected')),
	CONSTRAINT "finance_import_lines_decision" CHECK(("finance_import_lines"."status" = 'pending' and "finance_import_lines"."decided_at" is null and "finance_import_lines"."transaction_id" is null) or ("finance_import_lines"."status" = 'rejected' and "finance_import_lines"."decided_at" is not null and "finance_import_lines"."transaction_id" is null) or ("finance_import_lines"."status" = 'accepted' and "finance_import_lines"."decided_at" is not null)),
	CONSTRAINT "finance_import_lines_occurred_on" CHECK(length("finance_import_lines"."occurred_on") = 10 and "finance_import_lines"."occurred_on" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and date("finance_import_lines"."occurred_on", '+0 days') = "finance_import_lines"."occurred_on")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_import_lines_batch_position_unique` ON `finance_import_lines` (`batch_id`,`position`);--> statement-breakpoint
CREATE INDEX `finance_import_lines_owner_status_idx` ON `finance_import_lines` (`owner_id`,`status`);--> statement-breakpoint
CREATE INDEX `finance_import_lines_owner_fingerprint_idx` ON `finance_import_lines` (`owner_id`,`fingerprint`);