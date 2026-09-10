CREATE TABLE `finance_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "finance_categories_kind" CHECK("finance_categories"."kind" in ('income', 'expense')),
	CONSTRAINT "finance_categories_name" CHECK(length(trim("finance_categories"."name")) between 1 and 100),
	CONSTRAINT "finance_categories_active" CHECK("finance_categories"."is_active" in (0, 1))
);
--> statement-breakpoint
CREATE INDEX `finance_categories_owner_idx` ON `finance_categories` (`owner_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_categories_owner_name_kind_unique` ON `finance_categories` (`owner_id`,`name`,`kind`);--> statement-breakpoint
CREATE TABLE `finance_monthly_budgets` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`category_id` text NOT NULL,
	`period` text NOT NULL,
	`planned_amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_budgets_amount" CHECK(typeof("finance_monthly_budgets"."planned_amount_cents") = 'integer' and "finance_monthly_budgets"."planned_amount_cents" > 0 and "finance_monthly_budgets"."planned_amount_cents" <= 9007199254740991),
	CONSTRAINT "finance_budgets_period" CHECK(length("finance_monthly_budgets"."period") = 7 and "finance_monthly_budgets"."period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_monthly_budgets"."period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_monthly_budgets"."period", 6, 2) as integer) between 1 and 12)
);
--> statement-breakpoint
CREATE INDEX `finance_budgets_owner_period_idx` ON `finance_monthly_budgets` (`owner_id`,`period`);--> statement-breakpoint
CREATE UNIQUE INDEX `finance_budgets_owner_category_period_unique` ON `finance_monthly_budgets` (`owner_id`,`category_id`,`period`);--> statement-breakpoint
CREATE TABLE `finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`transfer_group_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_transactions_kind" CHECK("finance_transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "finance_transactions_amount" CHECK(typeof("finance_transactions"."amount_cents") = 'integer' and "finance_transactions"."amount_cents" between -9007199254740991 and 9007199254740991 and ((("finance_transactions"."kind" = 'income') and "finance_transactions"."amount_cents" > 0) or (("finance_transactions"."kind" = 'expense') and "finance_transactions"."amount_cents" < 0) or (("finance_transactions"."kind" = 'transfer') and "finance_transactions"."amount_cents" != 0))),
	CONSTRAINT "finance_transactions_category" CHECK((("finance_transactions"."kind" in ('income', 'expense')) and "finance_transactions"."category_id" is not null and "finance_transactions"."transfer_group_id" is null) or (("finance_transactions"."kind" = 'transfer') and "finance_transactions"."category_id" is null and "finance_transactions"."transfer_group_id" is not null)),
	CONSTRAINT "finance_transactions_note" CHECK(length(trim("finance_transactions"."note")) <= 240),
	CONSTRAINT "finance_transactions_occurred_on" CHECK(length("finance_transactions"."occurred_on") = 10 and "finance_transactions"."occurred_on" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("finance_transactions"."occurred_on", 1, 4) as integer) between 1 and 9999 and date("finance_transactions"."occurred_on", '+0 days') is not null and date("finance_transactions"."occurred_on", '+0 days') = "finance_transactions"."occurred_on")
);
--> statement-breakpoint
CREATE INDEX `finance_transactions_owner_date_idx` ON `finance_transactions` (`owner_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `finance_transactions_account_date_idx` ON `finance_transactions` (`account_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `finance_transactions_category_idx` ON `finance_transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_transfer_group_idx` ON `finance_transactions` (`transfer_group_id`);