CREATE TABLE `recovery_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`sleep_hours` real,
	`soreness` integer,
	`notes` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workout_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `strava_tokens` ADD `last_sync_at` text;