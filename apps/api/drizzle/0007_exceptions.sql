-- Migration: exceptions, exception actions, and interventions for C6
CREATE TABLE `exceptions` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`rule_version` text NOT NULL,
	`source_entity_type` text NOT NULL,
	`source_entity_id` text NOT NULL,
	`summary` text NOT NULL,
	`details_json` text,
	`detected_at` text NOT NULL,
	`activated_at` text,
	`acknowledged_at` text,
	`resolved_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE INDEX `exceptions_relationship_status_idx` ON `exceptions` (`coaching_relationship_id`, `status`);
CREATE INDEX `exceptions_status_detected_idx` ON `exceptions` (`status`, `detected_at`);
CREATE INDEX `exceptions_source_idx` ON `exceptions` (`source_entity_type`, `source_entity_id`, `type`);

CREATE TABLE `exception_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`exception_id` text NOT NULL,
	`trainer_user_id` text NOT NULL,
	`action` text NOT NULL,
	`note` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`exception_id`) REFERENCES `exceptions`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `exception_actions_exception_idx` ON `exception_actions` (`exception_id`);

CREATE TABLE `interventions` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`trainer_user_id` text NOT NULL,
	`exception_id` text,
	`checkin_id` text,
	`kind` text NOT NULL,
	`summary` text NOT NULL,
	`resulting_plan_version_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`exception_id`) REFERENCES `exceptions`(`id`),
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`),
	FOREIGN KEY (`resulting_plan_version_id`) REFERENCES `plan_versions`(`id`)
);
CREATE INDEX `interventions_relationship_idx` ON `interventions` (`coaching_relationship_id`, `created_at`);
CREATE INDEX `interventions_exception_idx` ON `interventions` (`exception_id`);
