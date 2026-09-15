CREATE TABLE `finance_security_events` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "finance_security_events_kind" CHECK("finance_security_events"."kind" = 'backup-download'),
	CONSTRAINT "finance_security_events_created" CHECK(length("finance_security_events"."created_at") between 20 and 30)
);
--> statement-breakpoint
CREATE INDEX `finance_security_events_owner_kind_created_idx` ON `finance_security_events` (`owner_id`,`kind`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER `finance_security_events_immutable_update` BEFORE UPDATE ON `finance_security_events` BEGIN SELECT RAISE(ABORT, 'immutable security event'); END;
--> statement-breakpoint
CREATE TRIGGER `finance_security_events_immutable_delete` BEFORE DELETE ON `finance_security_events` BEGIN SELECT RAISE(ABORT, 'immutable security event'); END;
