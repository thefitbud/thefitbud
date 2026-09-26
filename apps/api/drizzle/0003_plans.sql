-- Migration: plans and immutable plan versions (JSON snapshots)
CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE INDEX `plans_relationship_idx` ON `plans` (`coaching_relationship_id`);

CREATE TABLE `plan_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`version_number` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`content_json` text NOT NULL,
	`creation_source` text DEFAULT 'blank' NOT NULL,
	`published_at` text,
	`effective_from` text,
	`effective_to` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`)
);
CREATE UNIQUE INDEX `plan_versions_plan_version_number_uidx` ON `plan_versions` (`plan_id`, `version_number`);
CREATE INDEX `plan_versions_plan_status_idx` ON `plan_versions` (`plan_id`, `status`);
CREATE INDEX `plan_versions_status_effective_idx` ON `plan_versions` (`status`, `effective_from`);
