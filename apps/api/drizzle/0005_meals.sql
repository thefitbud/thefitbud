-- Migration: meal assignments and compliance
CREATE TABLE `meal_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`meal_prescription_id` text NOT NULL,
	`meal_name` text NOT NULL,
	`meal_prescription_json` text NOT NULL,
	`local_date` text NOT NULL,
	`window_starts_at` text NOT NULL,
	`window_ends_at` text NOT NULL,
	`photo_required` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`),
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`)
);
CREATE UNIQUE INDEX `meal_assignments_rel_version_meal_date_uidx` ON `meal_assignments` (`coaching_relationship_id`, `plan_version_id`, `meal_prescription_id`, `local_date`);
CREATE INDEX `meal_assignments_relationship_date_idx` ON `meal_assignments` (`coaching_relationship_id`, `local_date`);
CREATE INDEX `meal_assignments_window_ends_idx` ON `meal_assignments` (`window_ends_at`);

CREATE TABLE `meal_compliance` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`outcome` text NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`logged_at` text NOT NULL,
	`deviation_kind` text,
	`notes` text,
	`photo_required` integer DEFAULT 0 NOT NULL,
	`photo_intent_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `meal_assignments`(`id`),
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `meal_compliance_assignment_uidx` ON `meal_compliance` (`assignment_id`);
CREATE INDEX `meal_compliance_relationship_idx` ON `meal_compliance` (`coaching_relationship_id`);
CREATE INDEX `meal_compliance_trainee_idx` ON `meal_compliance` (`trainee_user_id`);
