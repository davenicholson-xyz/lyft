CREATE TABLE `equipment` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`weight_type` text DEFAULT 'none' NOT NULL,
	`weight_min` real,
	`weight_max` real
);
