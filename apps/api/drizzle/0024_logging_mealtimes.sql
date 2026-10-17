PRAGMA defer_foreign_keys = true;

CREATE TABLE IF NOT EXISTS `meal_time_overrides` (
  `relationship_id` text NOT NULL REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  `slot_key` text NOT NULL,
  `day_pattern` text NOT NULL CHECK (`day_pattern` IN ('all', 'weekdays', 'weekends')),
  `time` text NOT NULL,
  `updated_at` text NOT NULL,
  PRIMARY KEY (`relationship_id`, `slot_key`, `day_pattern`)
);

ALTER TABLE `meal_compliance` ADD COLUMN `items_json` text;
ALTER TABLE `meal_compliance` ADD COLUMN `kcal_scaled` integer;
ALTER TABLE `meal_compliance` ADD COLUMN `protein_scaled` integer;
ALTER TABLE `meal_compliance` ADD COLUMN `carbs_scaled` integer;
ALTER TABLE `meal_compliance` ADD COLUMN `fat_scaled` integer;
ALTER TABLE `meal_compliance` ADD COLUMN `logged_late` integer NOT NULL DEFAULT 0;
ALTER TABLE `meal_compliance` ADD COLUMN `logged_after_resolve` integer NOT NULL DEFAULT 0;
ALTER TABLE `meal_compliance` ADD COLUMN `client_logged_at` text;

CREATE TABLE IF NOT EXISTS `trainee_custom_foods` (
  `id` text PRIMARY KEY NOT NULL,
  `trainee_user_id` text NOT NULL REFERENCES `users`(`id`),
  `relationship_id` text NOT NULL REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  `name` text NOT NULL,
  `kcal_scaled` integer NOT NULL,
  `protein_scaled` integer,
  `carbs_scaled` integer,
  `fat_scaled` integer,
  `serving_label` text NOT NULL,
  `created_at` text NOT NULL
);
CREATE INDEX IF NOT EXISTS `trainee_custom_foods_rel_idx` ON `trainee_custom_foods` (`relationship_id`);

ALTER TABLE `workout_executions` ADD COLUMN `logged_late` integer NOT NULL DEFAULT 0;
ALTER TABLE `workout_executions` ADD COLUMN `client_logged_at` text;
