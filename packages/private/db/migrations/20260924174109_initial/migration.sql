CREATE TABLE `absences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`subject_id` integer NOT NULL,
	`date` text NOT NULL,
	`period` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `absences_unique` ON `absences` (`user_id`,`subject_id`,`date`,`period`);--> statement-breakpoint
CREATE TABLE `academic_days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`weekday` integer,
	`label` text,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `academic_days_unique` ON `academic_days` (`date`,`kind`);--> statement-breakpoint
CREATE TABLE `academic_terms` (
	`academic_year` integer NOT NULL,
	`term` text NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`source` text NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`academic_year`, `term`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`config_encrypted` text NOT NULL,
	`label` text,
	`notification_kinds` text,
	`status` text DEFAULT 'active' NOT NULL,
	`disabled_reason` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `channels_user` ON `channels` (`user_id`);--> statement-breakpoint
CREATE TABLE `class_changes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`subject_id` integer,
	`lesson_name` text NOT NULL,
	`date` text NOT NULL,
	`period` integer NOT NULL,
	`teacher` text,
	`campus` text,
	`room` text,
	`from_room` text,
	`comment` text,
	`makeup_plan` text,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`missing_count` integer DEFAULT 0 NOT NULL,
	`withdrawn_at` integer,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `class_changes_unique` ON `class_changes` (`kind`,`date`,`period`,`lesson_name`);--> statement-breakpoint
CREATE INDEX `class_changes_subject_date` ON `class_changes` (`subject_id`,`date`);--> statement-breakpoint
CREATE TABLE `course_registrations` (
	`user_id` text NOT NULL,
	`subject_id` integer NOT NULL,
	`hope_course_url` text,
	`absence_limit` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `subject_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `course_registrations_subject` ON `course_registrations` (`subject_id`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`notification_id` integer NOT NULL,
	`channel_id` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`sent_at` integer,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_unique` ON `deliveries` (`notification_id`,`channel_id`);--> statement-breakpoint
CREATE INDEX `deliveries_pending` ON `deliveries` (`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `feed_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`token_hash` text NOT NULL,
	`options` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `feed_tokens_token_hash_unique` ON `feed_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `feed_tokens_user` ON `feed_tokens` (`user_id`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`date` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hope_calendars` (
	`user_id` text PRIMARY KEY NOT NULL,
	`url_encrypted` text NOT NULL,
	`etag` text,
	`last_modified` text,
	`last_fetched_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hope_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`uid` text NOT NULL,
	`title` text NOT NULL,
	`due_at` integer NOT NULL,
	`course_name` text,
	`url` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hope_events_unique` ON `hope_events` (`user_id`,`uid`);--> statement-breakpoint
CREATE TABLE `invite_codes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_hash` text NOT NULL,
	`max_uses` integer DEFAULT 1 NOT NULL,
	`used_count` integer DEFAULT 0 NOT NULL,
	`expires_at` integer,
	`created_by` text,
	`note` text,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invite_codes_code_hash_unique` ON `invite_codes` (`code_hash`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_started` ON `job_runs` (`job`,`started_at`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`body` text,
	`link` text,
	`subject_id` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_used_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`visibility` text NOT NULL,
	`show_rooms` integer DEFAULT true NOT NULL,
	`show_changes` integer DEFAULT true NOT NULL,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shares_token_hash_unique` ON `shares` (`token_hash`);--> statement-breakpoint
CREATE INDEX `shares_user` ON `shares` (`user_id`);--> statement-breakpoint
CREATE TABLE `source_status` (
	`source` text PRIMARY KEY NOT NULL,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`last_error` text,
	`content_hash` text
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`academic_year` integer NOT NULL,
	`syllabus_id` text NOT NULL,
	`name` text NOT NULL,
	`teacher` text,
	`credits` integer,
	`term` text NOT NULL,
	`attributes` text,
	`syllabus` text,
	`syllabus_url` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subjects_year_syllabus` ON `subjects` (`academic_year`,`syllabus_id`);--> statement-breakpoint
CREATE TABLE `timetable_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`weekday` integer NOT NULL,
	`period` integer NOT NULL,
	`room` text,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timetable_slots_unique` ON `timetable_slots` (`subject_id`,`weekday`,`period`);--> statement-breakpoint
CREATE TABLE `unmatched_lessons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`academic_year` integer NOT NULL,
	`lesson_name` text NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`resolved_subject_id` integer,
	FOREIGN KEY (`resolved_subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `unmatched_lessons_unique` ON `unmatched_lessons` (`academic_year`,`lesson_name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`google_sub` text NOT NULL,
	`name` text,
	`role` text DEFAULT 'user' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`invited_by` text,
	`invite_code_id` integer,
	`created_at` integer DEFAULT (unixepoch('subsec') * 1000) NOT NULL,
	`last_login_at` integer,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`invite_code_id`) REFERENCES `invite_codes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_google_sub_unique` ON `users` (`google_sub`);