ALTER TABLE `subjects` ADD `source` text DEFAULT 'syllabus' NOT NULL;--> statement-breakpoint
ALTER TABLE `subjects` ADD `created_by` text REFERENCES users(id) ON DELETE set null;