CREATE TABLE `daily_digest_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`timing` text DEFAULT 'evening' NOT NULL,
	`custom_time` text DEFAULT '20:30' NOT NULL,
	`custom_day` text DEFAULT 'tomorrow' NOT NULL,
	`send_when_empty` integer DEFAULT true NOT NULL,
	`last_sent_for` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
