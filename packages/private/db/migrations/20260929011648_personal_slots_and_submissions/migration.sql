CREATE TABLE `personal_timetable_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`subject_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`period` integer NOT NULL,
	`room` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `personal_timetable_slots_unique` ON `personal_timetable_slots` (`user_id`,`subject_id`,`weekday`,`period`);--> statement-breakpoint
CREATE TABLE `slot_submissions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`period` integer NOT NULL,
	`room` text,
	`submitted_by` text,
	`submitted_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` text,
	`decided_at` integer,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`submitted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `slot_submissions_status` ON `slot_submissions` (`status`,`submitted_at`);