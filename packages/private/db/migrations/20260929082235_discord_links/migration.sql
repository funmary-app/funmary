CREATE TABLE `discord_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`discord_user_id` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`token_expires_at` integer NOT NULL,
	`destination` text NOT NULL,
	`channel_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discord_links_discord_user_id_unique` ON `discord_links` (`discord_user_id`);