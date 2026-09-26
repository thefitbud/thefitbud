-- Migration: measurements, progress entries, and R2 media_assets metadata for D1
CREATE TABLE `media_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`uploader_user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text NOT NULL,
	`object_key` text NOT NULL,
	`content_type` text NOT NULL,
	`byte_size` integer,
	`original_filename` text,
	`domain_entity_type` text,
	`domain_entity_id` text,
	`record_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`uploaded_at` text,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`uploader_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `media_assets_object_key_uidx` ON `media_assets` (`object_key`);
CREATE INDEX `media_assets_relationship_idx` ON `media_assets` (`coaching_relationship_id`, `created_at`);
CREATE INDEX `media_assets_status_idx` ON `media_assets` (`status`);
CREATE INDEX `media_assets_domain_idx` ON `media_assets` (`domain_entity_type`, `domain_entity_id`);

CREATE TABLE `measurements` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`type` text NOT NULL,
	`value` real NOT NULL,
	`unit` text NOT NULL,
	`observed_at` text NOT NULL,
	`source` text NOT NULL,
	`checkin_id` text,
	`media_asset_id` text,
	`record_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`checkin_id`) REFERENCES `checkins`(`id`),
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`)
);
CREATE INDEX `measurements_relationship_observed_idx` ON `measurements` (`coaching_relationship_id`, `observed_at`);
CREATE INDEX `measurements_trainee_idx` ON `measurements` (`trainee_user_id`);
CREATE INDEX `measurements_checkin_idx` ON `measurements` (`checkin_id`);

CREATE TABLE `progress_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`entry_type` text NOT NULL,
	`title` text,
	`body` text,
	`observed_at` text NOT NULL,
	`media_asset_id` text,
	`record_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`media_asset_id`) REFERENCES `media_assets`(`id`)
);
CREATE INDEX `progress_entries_relationship_observed_idx` ON `progress_entries` (`coaching_relationship_id`, `observed_at`);
CREATE INDEX `progress_entries_trainee_idx` ON `progress_entries` (`trainee_user_id`);

ALTER TABLE `meal_compliance` ADD `media_asset_id` text;
