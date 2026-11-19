CREATE TABLE `user_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`location` text,
	`notes` text,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`time_kind` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`start_period` integer,
	`end_period` integer,
	`rrule` text,
	`excluded_dates` text DEFAULT '[]' NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_events_owner` ON `user_events` (`owner_id`,`start_date`);