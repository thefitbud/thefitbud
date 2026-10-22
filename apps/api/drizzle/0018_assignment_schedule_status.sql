-- Assignment reconciliation. Applied after 0000–0017. Does not edit those migrations.
-- Existing rows stay scheduled. Unstarted future rows are superseded in place, not deleted.

ALTER TABLE `workout_assignments` ADD COLUMN `schedule_status` text NOT NULL DEFAULT 'scheduled';
ALTER TABLE `workout_assignments` ADD COLUMN `superseded_at` text;
ALTER TABLE `workout_assignments` ADD COLUMN `superseded_by_plan_version_id` text;

ALTER TABLE `meal_assignments` ADD COLUMN `schedule_status` text NOT NULL DEFAULT 'scheduled';
ALTER TABLE `meal_assignments` ADD COLUMN `superseded_at` text;
ALTER TABLE `meal_assignments` ADD COLUMN `superseded_by_plan_version_id` text;

CREATE TABLE `plan_assignment_policies` (
	`plan_version_id` text PRIMARY KEY NOT NULL,
	`diet_adjustment_scope` text,
	`diet_scope_local_date` text,
	`future_meal_plan_version_id` text,
	`consistency_ack_fingerprint` text,
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`),
	FOREIGN KEY (`future_meal_plan_version_id`) REFERENCES `plan_versions`(`id`)
);
