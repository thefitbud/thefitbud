-- Migration: check-ins, reviews, and trainer notes for review context
CREATE TABLE `checkins` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`checkin_schedule_id` text,
	`local_date` text NOT NULL,
	`window_starts_at` text NOT NULL,
	`window_ends_at` text NOT NULL,
	`record_status` text NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`definition_version` integer NOT NULL,
	`answers_json` text,
	`submitted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`checkin_schedule_id`) REFERENCES `checkin_schedules`(`id`)
);
CREATE UNIQUE INDEX `checkins_relationship_local_date_uidx` ON `checkins` (`coaching_relationship_id`, `local_date`);
CREATE INDEX `checkins_relationship_status_idx` ON `checkins` (`coaching_relationship_id`, `record_status`);
CREATE INDEX `checkins_window_ends_idx` ON `checkins` (`window_ends_at`);

CREATE TABLE `checkin_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`checkin_id` text NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`trainer_user_id` text NOT NULL,
	`outcome` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`),
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `checkin_reviews_checkin_uidx` ON `checkin_reviews` (`checkin_id`);
CREATE INDEX `checkin_reviews_relationship_idx` ON `checkin_reviews` (`coaching_relationship_id`);

CREATE TABLE `trainer_notes` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`trainer_user_id` text NOT NULL,
	`checkin_id` text,
	`body` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`)
);
CREATE INDEX `trainer_notes_relationship_idx` ON `trainer_notes` (`coaching_relationship_id`);
CREATE INDEX `trainer_notes_checkin_idx` ON `trainer_notes` (`checkin_id`);
