CREATE TABLE `event_subscriptions` (
	`user_id` text NOT NULL,
	`event_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `event_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `user_events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_events` ADD `visibility` text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_events` ADD `share_token` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_events_share_token_unique` ON `user_events` (`share_token`);--> statement-breakpoint
CREATE INDEX `user_events_public` ON `user_events` (`visibility`);