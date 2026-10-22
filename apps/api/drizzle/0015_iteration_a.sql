-- Iteration A profile, goal, and library metadata.
-- Applied after 0000–0014. Does not rewrite those migrations.
-- Existing primary_goal text is copied into goal_description.
-- It is not truncated into goal_short. Short goals stay null until the next save.

ALTER TABLE `coaching_configurations` ADD COLUMN `goal_short` text;
ALTER TABLE `coaching_configurations` ADD COLUMN `goal_description` text;
UPDATE `coaching_configurations` SET `goal_description` = `primary_goal`;
ALTER TABLE `coaching_configurations` DROP COLUMN `primary_goal`;

ALTER TABLE `trainee_profiles` ADD COLUMN `date_of_birth` text;
ALTER TABLE `trainee_profiles` ADD COLUMN `gender` text;

ALTER TABLE `exercise_library_items` ADD COLUMN `muscle_groups_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `exercise_library_items` ADD COLUMN `equipment_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `exercise_library_items` ADD COLUMN `difficulty` text;

ALTER TABLE `food_library_items` ADD COLUMN `description` text;
ALTER TABLE `food_library_items` ADD COLUMN `calories` integer;
ALTER TABLE `food_library_items` ADD COLUMN `protein_grams` real;
ALTER TABLE `food_library_items` ADD COLUMN `carbs_grams` real;
ALTER TABLE `food_library_items` ADD COLUMN `fat_grams` real;
