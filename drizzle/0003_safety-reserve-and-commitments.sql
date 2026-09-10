CREATE TABLE `finance_recurring_commitments` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`category_id` text NOT NULL,
	`planned_amount_cents` integer NOT NULL,
	`due_day` integer NOT NULL,
	`start_period` text NOT NULL,
	`end_period` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_commitments_name" CHECK(length(trim("finance_recurring_commitments"."name")) between 1 and 100),
	CONSTRAINT "finance_commitments_amount" CHECK(typeof("finance_recurring_commitments"."planned_amount_cents") = 'integer' and "finance_recurring_commitments"."planned_amount_cents" > 0 and "finance_recurring_commitments"."planned_amount_cents" <= 9007199254740991),
	CONSTRAINT "finance_commitments_due_day" CHECK("finance_recurring_commitments"."due_day" between 1 and 31),
	CONSTRAINT "finance_commitments_start_period" CHECK(length("finance_recurring_commitments"."start_period") = 7 and "finance_recurring_commitments"."start_period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_recurring_commitments"."start_period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_recurring_commitments"."start_period", 6, 2) as integer) between 1 and 12),
	CONSTRAINT "finance_commitments_end_period" CHECK("finance_recurring_commitments"."end_period" is null or (length("finance_recurring_commitments"."end_period") = 7 and "finance_recurring_commitments"."end_period" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]' and cast(substr("finance_recurring_commitments"."end_period", 1, 4) as integer) between 1 and 9999 and cast(substr("finance_recurring_commitments"."end_period", 6, 2) as integer) between 1 and 12 and "finance_recurring_commitments"."end_period" >= "finance_recurring_commitments"."start_period"))
);
--> statement-breakpoint
CREATE INDEX `finance_commitments_owner_period_idx` ON `finance_recurring_commitments` (`owner_id`,`start_period`,`end_period`);--> statement-breakpoint
CREATE INDEX `finance_commitments_category_idx` ON `finance_recurring_commitments` (`category_id`);--> statement-breakpoint
CREATE TABLE `finance_safety_reserve_accounts` (
	`reserve_id` text NOT NULL,
	`account_id` text NOT NULL,
	FOREIGN KEY (`reserve_id`) REFERENCES `finance_safety_reserves`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_safety_reserve_account_unique` ON `finance_safety_reserve_accounts` (`reserve_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `finance_safety_reserve_accounts_account_idx` ON `finance_safety_reserve_accounts` (`account_id`);--> statement-breakpoint
CREATE TABLE `finance_safety_reserves` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`target_amount_cents` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_safety_reserves_target" CHECK(typeof("finance_safety_reserves"."target_amount_cents") = 'integer' and "finance_safety_reserves"."target_amount_cents" > 0 and "finance_safety_reserves"."target_amount_cents" <= 9007199254740991)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `finance_safety_reserves_owner_id_unique` ON `finance_safety_reserves` (`owner_id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_finance_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`account_id` text NOT NULL,
	`category_id` text,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`occurred_on` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`transfer_group_id` text,
	`recurring_commitment_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `finance_accounts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`category_id`) REFERENCES `finance_categories`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`recurring_commitment_id`) REFERENCES `finance_recurring_commitments`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "finance_transactions_kind" CHECK("__new_finance_transactions"."kind" in ('income', 'expense', 'transfer')),
	CONSTRAINT "finance_transactions_amount" CHECK(typeof("__new_finance_transactions"."amount_cents") = 'integer' and "__new_finance_transactions"."amount_cents" between -9007199254740991 and 9007199254740991 and ((("__new_finance_transactions"."kind" = 'income') and "__new_finance_transactions"."amount_cents" > 0) or (("__new_finance_transactions"."kind" = 'expense') and "__new_finance_transactions"."amount_cents" < 0) or (("__new_finance_transactions"."kind" = 'transfer') and "__new_finance_transactions"."amount_cents" != 0))),
	CONSTRAINT "finance_transactions_category" CHECK((("__new_finance_transactions"."kind" in ('income', 'expense')) and "__new_finance_transactions"."category_id" is not null and "__new_finance_transactions"."transfer_group_id" is null) or (("__new_finance_transactions"."kind" = 'transfer') and "__new_finance_transactions"."category_id" is null and "__new_finance_transactions"."transfer_group_id" is not null)),
	CONSTRAINT "finance_transactions_commitment" CHECK("__new_finance_transactions"."recurring_commitment_id" is null or "__new_finance_transactions"."kind" = 'expense'),
	CONSTRAINT "finance_transactions_note" CHECK(length(trim("__new_finance_transactions"."note")) <= 240),
	CONSTRAINT "finance_transactions_occurred_on" CHECK(length("__new_finance_transactions"."occurred_on") = 10 and "__new_finance_transactions"."occurred_on" glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' and cast(substr("__new_finance_transactions"."occurred_on", 1, 4) as integer) between 1 and 9999 and date("__new_finance_transactions"."occurred_on", '+0 days') is not null and date("__new_finance_transactions"."occurred_on", '+0 days') = "__new_finance_transactions"."occurred_on")
);
--> statement-breakpoint
INSERT INTO `__new_finance_transactions`("id", "owner_id", "account_id", "category_id", "kind", "amount_cents", "occurred_on", "note", "transfer_group_id", "recurring_commitment_id", "created_at", "updated_at") SELECT "id", "owner_id", "account_id", "category_id", "kind", "amount_cents", "occurred_on", "note", "transfer_group_id", NULL, "created_at", "updated_at" FROM `finance_transactions`;--> statement-breakpoint
DROP TABLE `finance_transactions`;--> statement-breakpoint
ALTER TABLE `__new_finance_transactions` RENAME TO `finance_transactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `finance_transactions_owner_date_idx` ON `finance_transactions` (`owner_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `finance_transactions_account_date_idx` ON `finance_transactions` (`account_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `finance_transactions_category_idx` ON `finance_transactions` (`category_id`);--> statement-breakpoint
CREATE INDEX `finance_transactions_transfer_group_idx` ON `finance_transactions` (`transfer_group_id`);
--> statement-breakpoint
CREATE TRIGGER `finance_safety_reserve_accounts_owner_insert`
BEFORE INSERT ON `finance_safety_reserve_accounts`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_safety_reserves` reserve
    JOIN `finance_accounts` account ON account.id = NEW.account_id
    JOIN `finance_economic_entities` entity ON entity.id = account.entity_id
    WHERE reserve.id = NEW.reserve_id AND entity.owner_id = reserve.owner_id
  ) THEN RAISE(ABORT, 'invalid reserve account') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_safety_reserve_accounts_owner_update`
BEFORE UPDATE ON `finance_safety_reserve_accounts`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_safety_reserves` reserve
    JOIN `finance_accounts` account ON account.id = NEW.account_id
    JOIN `finance_economic_entities` entity ON entity.id = account.entity_id
    WHERE reserve.id = NEW.reserve_id AND entity.owner_id = reserve.owner_id
  ) THEN RAISE(ABORT, 'invalid reserve account') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_recurring_commitments_category_owner_insert`
BEFORE INSERT ON `finance_recurring_commitments`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.category_id AND category.owner_id = NEW.owner_id AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid commitment category') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_recurring_commitments_category_owner_update`
BEFORE UPDATE OF `owner_id`, `category_id` ON `finance_recurring_commitments`
FOR EACH ROW BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_categories` category
    WHERE category.id = NEW.category_id AND category.owner_id = NEW.owner_id AND category.kind = 'expense'
  ) THEN RAISE(ABORT, 'invalid commitment category') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_transactions_commitment_owner_insert`
BEFORE INSERT ON `finance_transactions`
FOR EACH ROW WHEN NEW.recurring_commitment_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_recurring_commitments` commitment
    WHERE commitment.id = NEW.recurring_commitment_id
      AND commitment.owner_id = NEW.owner_id
      AND commitment.category_id = NEW.category_id
      AND commitment.start_period <= substr(NEW.occurred_on, 1, 7)
      AND (commitment.end_period IS NULL OR commitment.end_period >= substr(NEW.occurred_on, 1, 7))
  ) THEN RAISE(ABORT, 'invalid commitment payment') END;
END;
--> statement-breakpoint
CREATE TRIGGER `finance_transactions_commitment_owner_update`
BEFORE UPDATE OF `owner_id`, `category_id`, `occurred_on`, `recurring_commitment_id` ON `finance_transactions`
FOR EACH ROW WHEN NEW.recurring_commitment_id IS NOT NULL BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `finance_recurring_commitments` commitment
    WHERE commitment.id = NEW.recurring_commitment_id
      AND commitment.owner_id = NEW.owner_id
      AND commitment.category_id = NEW.category_id
      AND commitment.start_period <= substr(NEW.occurred_on, 1, 7)
      AND (commitment.end_period IS NULL OR commitment.end_period >= substr(NEW.occurred_on, 1, 7))
  ) THEN RAISE(ABORT, 'invalid commitment payment') END;
END;
