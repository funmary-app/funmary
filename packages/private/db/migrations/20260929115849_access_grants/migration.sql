CREATE TABLE `access_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` integer NOT NULL,
	`grantee_email` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `access_grants_unique` ON `access_grants` (`resource_type`,`resource_id`,`grantee_email`);--> statement-breakpoint
CREATE INDEX `access_grants_email` ON `access_grants` (`grantee_email`);