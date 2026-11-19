CREATE TABLE `user_permissions` (
	`user_id` text NOT NULL,
	`permission` text NOT NULL,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `permission`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
