CREATE TABLE `api_activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`token_id` integer,
	`token_name` text NOT NULL,
	`action` text NOT NULL,
	`target_id` integer,
	`summary` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `api_activity_user` ON `api_activity` (`user_id`,`id`);