PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_discord_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`discord_user_id` text NOT NULL,
	`access_token_encrypted` text NOT NULL,
	`refresh_token_encrypted` text NOT NULL,
	`token_expires_at` integer NOT NULL,
	`destination` text NOT NULL,
	`channel_id` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_discord_links`("user_id", "discord_user_id", "access_token_encrypted", "refresh_token_encrypted", "token_expires_at", "destination", "channel_id", "created_at") SELECT "user_id", "discord_user_id", "access_token_encrypted", "refresh_token_encrypted", "token_expires_at", "destination", "channel_id", "created_at" FROM `discord_links`;--> statement-breakpoint
DROP TABLE `discord_links`;--> statement-breakpoint
ALTER TABLE `__new_discord_links` RENAME TO `discord_links`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `discord_links_discord_user_id_unique` ON `discord_links` (`discord_user_id`);