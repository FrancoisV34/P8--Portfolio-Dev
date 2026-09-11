CREATE TABLE `finance_regulatory_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`value` text NOT NULL,
	`source` text NOT NULL,
	`verified_on` text NOT NULL,
	`valid_from` text NOT NULL,
	`valid_to` text,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "finance_regulatory_rules_name" CHECK(length(trim("finance_regulatory_rules"."name")) between 1 and 100),
	CONSTRAINT "finance_regulatory_rules_value" CHECK(length(trim("finance_regulatory_rules"."value")) between 1 and 120),
	CONSTRAINT "finance_regulatory_rules_source" CHECK(length(trim("finance_regulatory_rules"."source")) between 1 and 500),
	CONSTRAINT "finance_regulatory_rules_note" CHECK(length(trim("finance_regulatory_rules"."note")) <= 240),
	CONSTRAINT "finance_regulatory_rules_dates" CHECK(length("finance_regulatory_rules"."verified_on") = 10 and date("finance_regulatory_rules"."verified_on", '+0 days') = "finance_regulatory_rules"."verified_on" and length("finance_regulatory_rules"."valid_from") = 10 and date("finance_regulatory_rules"."valid_from", '+0 days') = "finance_regulatory_rules"."valid_from" and ("finance_regulatory_rules"."valid_to" is null or (length("finance_regulatory_rules"."valid_to") = 10 and date("finance_regulatory_rules"."valid_to", '+0 days') = "finance_regulatory_rules"."valid_to" and "finance_regulatory_rules"."valid_to" >= "finance_regulatory_rules"."valid_from")))
);
--> statement-breakpoint
CREATE INDEX `finance_regulatory_rules_owner_validity_idx` ON `finance_regulatory_rules` (`owner_id`,`valid_from`,`valid_to`);