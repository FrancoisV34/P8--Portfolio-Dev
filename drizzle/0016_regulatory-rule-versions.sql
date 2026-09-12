ALTER TABLE `finance_regulatory_rules` ADD `series_id` text;--> statement-breakpoint
ALTER TABLE `finance_regulatory_rules` ADD `revision` integer NOT NULL DEFAULT 1;--> statement-breakpoint
UPDATE `finance_regulatory_rules` SET `series_id` = `id` WHERE `series_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `finance_regulatory_rules_series_revision_idx` ON `finance_regulatory_rules` (`owner_id`,`series_id`,`revision`);--> statement-breakpoint
CREATE TRIGGER `finance_regulatory_rules_valid_revision_insert` BEFORE INSERT ON `finance_regulatory_rules` WHEN NEW.`series_id` IS NULL OR length(trim(NEW.`series_id`)) = 0 OR NEW.`revision` < 1 BEGIN SELECT RAISE(ABORT, 'Invalid regulatory rule revision'); END;--> statement-breakpoint
CREATE TRIGGER `finance_regulatory_rules_immutable_update` BEFORE UPDATE ON `finance_regulatory_rules` BEGIN SELECT RAISE(ABORT, 'Regulatory rule revision is immutable'); END;--> statement-breakpoint
CREATE TRIGGER `finance_regulatory_rules_immutable_delete` BEFORE DELETE ON `finance_regulatory_rules` BEGIN SELECT RAISE(ABORT, 'Regulatory rule revision is immutable'); END;
