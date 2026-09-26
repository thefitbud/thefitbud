-- Migration: coaching configuration expectations
CREATE TABLE `coaching_configurations` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`primary_goal` text,
	`notes` text,
	`configured_at` text,
	`activated_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE UNIQUE INDEX `coaching_configurations_relationship_uidx` ON `coaching_configurations` (`coaching_relationship_id`);
CREATE INDEX `coaching_configurations_status_idx` ON `coaching_configurations` (`status`);

CREATE TABLE `workout_expectations` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_configuration_id` text NOT NULL,
	`sessions_per_week` integer NOT NULL,
	`completion_window_hours` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_configuration_id`) REFERENCES `coaching_configurations`(`id`)
);
CREATE UNIQUE INDEX `workout_expectations_configuration_uidx` ON `workout_expectations` (`coaching_configuration_id`);

CREATE TABLE `nutrition_expectations` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_configuration_id` text NOT NULL,
	`meals_per_day` integer NOT NULL,
	`confirmation_window_hours` integer NOT NULL,
	`photo_requirement` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_configuration_id`) REFERENCES `coaching_configurations`(`id`)
);
CREATE UNIQUE INDEX `nutrition_expectations_configuration_uidx` ON `nutrition_expectations` (`coaching_configuration_id`);

CREATE TABLE `checkin_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_configuration_id` text NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`cadence` text NOT NULL,
	`due_window_hours` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_configuration_id`) REFERENCES `coaching_configurations`(`id`),
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE UNIQUE INDEX `checkin_schedules_configuration_uidx` ON `checkin_schedules` (`coaching_configuration_id`);
CREATE INDEX `checkin_schedules_relationship_idx` ON `checkin_schedules` (`coaching_relationship_id`);

CREATE TABLE `tracking_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_configuration_id` text NOT NULL,
	`require_body_weight` integer DEFAULT false NOT NULL,
	`require_progress_photos` integer DEFAULT false NOT NULL,
	`require_session_rpe` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_configuration_id`) REFERENCES `coaching_configurations`(`id`)
);
CREATE UNIQUE INDEX `tracking_requirements_configuration_uidx` ON `tracking_requirements` (`coaching_configuration_id`);
