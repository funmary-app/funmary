CREATE TABLE `bus_catalog` (
	`id` integer PRIMARY KEY NOT NULL,
	`body` text NOT NULL,
	`etag` text,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bus_stop_timetables` (
	`stop_id` text NOT NULL,
	`generation` integer NOT NULL,
	`body` text NOT NULL,
	`etag` text,
	`checked_at` integer NOT NULL,
	PRIMARY KEY(`stop_id`, `generation`)
);
