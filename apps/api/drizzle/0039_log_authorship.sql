-- Z6-18 (PLAN-v2 D-P2-21, D-W6-IP): who logged and who last edited a client log entry,
-- the audit table for trainer creates and edits, and the coach-updates push setting.
--
-- Additive: every change is an ADD COLUMN with a constant or NULL default, or a new
-- table, so no table is rebuilt and no row is rewritten. Existing workout, meal and
-- measurement rows read logged_by_role = 'trainee' through the column default.
-- SQLite cannot add a table CHECK with ALTER, so each role column carries a named
-- column CHECK. The user columns reference users with the default NO ACTION (a
-- nullable REFERENCES column is allowed by ADD COLUMN because its default is NULL).
-- notifications.notification_type has no CHECK (its values live in schema.ts only);
-- the coach_log_updated value is added with its sender in Z6-19 (D-W6-30).

ALTER TABLE `workout_executions` ADD COLUMN `logged_by_role` text NOT NULL DEFAULT 'trainee'
  CONSTRAINT `workout_executions_logged_by_role_chk` CHECK (`logged_by_role` IN ('trainee', 'coach'));
ALTER TABLE `workout_executions` ADD COLUMN `logged_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `workout_executions` ADD COLUMN `last_edited_by_role` text
  CONSTRAINT `workout_executions_last_edited_by_role_chk` CHECK (`last_edited_by_role` IS NULL OR `last_edited_by_role` IN ('trainee', 'coach'));
ALTER TABLE `workout_executions` ADD COLUMN `last_edited_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `workout_executions` ADD COLUMN `last_edited_at` text;

ALTER TABLE `meal_compliance` ADD COLUMN `logged_by_role` text NOT NULL DEFAULT 'trainee'
  CONSTRAINT `meal_compliance_logged_by_role_chk` CHECK (`logged_by_role` IN ('trainee', 'coach'));
ALTER TABLE `meal_compliance` ADD COLUMN `logged_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `meal_compliance` ADD COLUMN `last_edited_by_role` text
  CONSTRAINT `meal_compliance_last_edited_by_role_chk` CHECK (`last_edited_by_role` IS NULL OR `last_edited_by_role` IN ('trainee', 'coach'));
ALTER TABLE `meal_compliance` ADD COLUMN `last_edited_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `meal_compliance` ADD COLUMN `last_edited_at` text;

ALTER TABLE `measurements` ADD COLUMN `logged_by_role` text NOT NULL DEFAULT 'trainee'
  CONSTRAINT `measurements_logged_by_role_chk` CHECK (`logged_by_role` IN ('trainee', 'coach'));
ALTER TABLE `measurements` ADD COLUMN `logged_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `measurements` ADD COLUMN `last_edited_by_role` text
  CONSTRAINT `measurements_last_edited_by_role_chk` CHECK (`last_edited_by_role` IS NULL OR `last_edited_by_role` IN ('trainee', 'coach'));
ALTER TABLE `measurements` ADD COLUMN `last_edited_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `measurements` ADD COLUMN `last_edited_at` text;

-- "Coach updates to my logs" (R5): on for every existing and new user.
ALTER TABLE `notification_preferences` ADD COLUMN `coach_log_updates` integer NOT NULL DEFAULT 1;

-- One row per trainer create or edit, with before and after. The relationship owns
-- the rows (ON DELETE CASCADE), so wiping or purging a relationship needs no
-- separate delete. entity_id names a row in one of three tables, so it has no FK.
CREATE TABLE `log_edit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `coaching_relationship_id` text NOT NULL,
  `trainee_user_id` text NOT NULL,
  `actor_user_id` text NOT NULL,
  `actor_role` text NOT NULL,
  `entity_type` text NOT NULL,
  `entity_id` text NOT NULL,
  `action` text NOT NULL,
  `before_json` text,
  `after_json` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`),
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`),
  CONSTRAINT `log_edit_events_actor_role_chk`
    CHECK (`actor_role` IN ('trainee', 'coach')),
  CONSTRAINT `log_edit_events_entity_type_chk`
    CHECK (`entity_type` IN ('workout_execution', 'meal_compliance', 'measurement')),
  CONSTRAINT `log_edit_events_action_chk`
    CHECK (`action` IN ('create', 'edit')),
  CONSTRAINT `log_edit_events_before_json_chk`
    CHECK ((`action` = 'create') = (`before_json` IS NULL))
);
CREATE INDEX `log_edit_events_relationship_created_idx`
  ON `log_edit_events` (`coaching_relationship_id`, `created_at`);
