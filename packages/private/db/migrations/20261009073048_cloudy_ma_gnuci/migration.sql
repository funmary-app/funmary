CREATE TABLE `terms_acceptances` (
	`user_id` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `version`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_version` text;--> statement-breakpoint
ALTER TABLE `users` ADD `terms_accepted_at` integer;