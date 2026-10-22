PRAGMA defer_foreign_keys = true;

ALTER TABLE `notification_preferences` ADD COLUMN `channel_preference` text NOT NULL DEFAULT 'app';
ALTER TABLE `notification_preferences` ADD COLUMN `whatsapp_opt_in_granted` integer NOT NULL DEFAULT 0;
ALTER TABLE `notification_preferences` ADD COLUMN `whatsapp_opt_in_at` text;
ALTER TABLE `notification_preferences` ADD COLUMN `whatsapp_opt_in_source` text;
ALTER TABLE `notification_preferences` ADD COLUMN `whatsapp_opt_in_text_version` text;
ALTER TABLE `notification_preferences` ADD COLUMN `preferred_workout_time` text;
ALTER TABLE `notification_preferences` ADD COLUMN `locale` text;
ALTER TABLE `notification_preferences` ADD COLUMN `trainer_categories_json` text NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS `reminder_states` (
  `trainee_user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
  `consecutive_ignores` integer NOT NULL DEFAULT 0,
  `mode` text NOT NULL DEFAULT 'normal',
  `paused_until` text,
  `last_evaluated_at` text,
  `updated_at` text NOT NULL
);

ALTER TABLE `notifications` ADD COLUMN `opened_at` text;
ALTER TABLE `notifications` ADD COLUMN `priority` integer;
ALTER TABLE `notifications` ADD COLUMN `merge_group` text;
ALTER TABLE `notifications` ADD COLUMN `payload_json` text;
ALTER TABLE `notifications` ADD COLUMN `expires_at` text;
