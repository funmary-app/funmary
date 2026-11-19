ALTER TABLE `notifications` ADD `dedupe_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_user_dedupe` ON `notifications` (`user_id`,`dedupe_key`);