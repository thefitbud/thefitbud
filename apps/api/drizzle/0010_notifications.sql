-- Migration: push tokens, preferences, reminders, deliveries (D4)
CREATE TABLE `device_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`platform` text NOT NULL,
	`provider` text NOT NULL,
	`token` text NOT NULL,
	`installation_id` text NOT NULL,
	`status` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `device_tokens_token_uidx` ON `device_tokens` (`token`);
CREATE UNIQUE INDEX `device_tokens_user_installation_uidx` ON `device_tokens` (`user_id`, `installation_id`);
CREATE INDEX `device_tokens_user_status_idx` ON `device_tokens` (`user_id`, `status`);

CREATE TABLE `notification_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`push_enabled` integer NOT NULL DEFAULT 1,
	`workout_reminder` integer NOT NULL DEFAULT 1,
	`meal_reminder` integer NOT NULL DEFAULT 1,
	`checkin_reminder` integer NOT NULL DEFAULT 1,
	`quiet_hours_start` text,
	`quiet_hours_end` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);

CREATE TABLE `reminder_rules` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`reminder_type` text NOT NULL,
	`enabled` integer NOT NULL DEFAULT 1,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE UNIQUE INDEX `reminder_rules_relationship_type_uidx` ON `reminder_rules` (`coaching_relationship_id`, `reminder_type`);
CREATE INDEX `reminder_rules_relationship_idx` ON `reminder_rules` (`coaching_relationship_id`);

CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient_user_id` text NOT NULL,
	`coaching_relationship_id` text,
	`notification_type` text NOT NULL,
	`domain_entity_type` text NOT NULL,
	`domain_entity_id` text NOT NULL,
	`state` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`created_at` text NOT NULL,
	`read_at` text,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE UNIQUE INDEX `notifications_dedupe_key_uidx` ON `notifications` (`dedupe_key`);
CREATE INDEX `notifications_recipient_created_idx` ON `notifications` (`recipient_user_id`, `created_at`);
CREATE INDEX `notifications_recipient_state_idx` ON `notifications` (`recipient_user_id`, `state`);

CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`notification_id` text NOT NULL,
	`device_token_id` text,
	`channel` text NOT NULL,
	`provider_status` text NOT NULL,
	`provider_message_id` text,
	`failure_category` text,
	`attempt_number` integer NOT NULL,
	`accepted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`notification_id`) REFERENCES `notifications`(`id`),
	FOREIGN KEY (`device_token_id`) REFERENCES `device_tokens`(`id`)
);
CREATE INDEX `notification_deliveries_notification_idx` ON `notification_deliveries` (`notification_id`);
CREATE INDEX `notification_deliveries_provider_status_idx` ON `notification_deliveries` (`provider_status`);

CREATE TABLE `scheduled_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_type` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`due_at` text NOT NULL,
	`state` text NOT NULL,
	`domain_entity_type` text,
	`domain_entity_id` text,
	`attempt_count` integer NOT NULL DEFAULT 0,
	`last_error_category` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `scheduled_jobs_dedupe_key_uidx` ON `scheduled_jobs` (`dedupe_key`);
CREATE INDEX `scheduled_jobs_due_state_idx` ON `scheduled_jobs` (`due_at`, `state`);
