CREATE TABLE `finance_account_reconciliations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`period` text NOT NULL,
	`statement_date` text NOT NULL,
	`statement_balance_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_account_reconciliations_period" CHECK(length("finance_account_reconciliations"."period") = 7 and "finance_account_reconciliations"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_account_reconciliations"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_account_reconciliations"."period", 6, 2) as integer) between 1 and 12),
	CONSTRAINT "finance_account_reconciliations_date" CHECK(length("finance_account_reconciliations"."statement_date") = 10 and date("finance_account_reconciliations"."statement_date", '+0 days') = "finance_account_reconciliations"."statement_date" and substr("finance_account_reconciliations"."statement_date", 1, 7) = "finance_account_reconciliations"."period"),
	CONSTRAINT "finance_account_reconciliations_balance" CHECK(typeof("finance_account_reconciliations"."statement_balance_cents") = 'integer' and "finance_account_reconciliations"."statement_balance_cents" between -9007199254740991 and 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_account_reconciliations_owner_account_period_unique` ON `finance_account_reconciliations` (`owner_id`,`account_id`,`period`);--> statement-breakpoint
CREATE INDEX `finance_account_reconciliations_owner_period_idx` ON `finance_account_reconciliations` (`owner_id`,`period`);