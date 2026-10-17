PRAGMA defer_foreign_keys = true;

ALTER TABLE `coaching_relationships` ADD COLUMN `ended_by_user_id` text REFERENCES `users`(`id`);
ALTER TABLE `coaching_relationships` ADD COLUMN `end_reason` text;
ALTER TABLE `coaching_relationships` ADD COLUMN `reactivated_at` text;

CREATE TABLE IF NOT EXISTS `reactivation_requests` (
  `id` text PRIMARY KEY NOT NULL,
  `relationship_id` text NOT NULL REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  `trainer_user_id` text NOT NULL REFERENCES `users`(`id`),
  `status` text NOT NULL CHECK (`status` IN ('pending', 'confirmed', 'cancelled', 'expired')),
  `intake_update_requested` integer NOT NULL DEFAULT 0,
  `expires_at` text NOT NULL,
  `created_at` text NOT NULL,
  `resolved_at` text
);
CREATE INDEX IF NOT EXISTS `reactivation_requests_rel_idx` ON `reactivation_requests` (`relationship_id`, `status`);

ALTER TABLE `trainer_notes` ADD COLUMN `visibility` text NOT NULL DEFAULT 'private';
ALTER TABLE `trainer_notes` ADD COLUMN `subject_type` text;
ALTER TABLE `trainer_notes` ADD COLUMN `subject_id` text;
ALTER TABLE `trainer_notes` ADD COLUMN `shared_at` text;
ALTER TABLE `trainer_notes` ADD COLUMN `unshared_at` text;
ALTER TABLE `trainer_notes` ADD COLUMN `seen_at` text;

CREATE TABLE IF NOT EXISTS `coach_asks` (
  `id` text PRIMARY KEY NOT NULL,
  `relationship_id` text NOT NULL REFERENCES `coaching_relationships`(`id`) ON DELETE CASCADE,
  `trainee_user_id` text NOT NULL REFERENCES `users`(`id`),
  `item_type` text NOT NULL CHECK (`item_type` IN ('meal_assignment', 'workout_assignment', 'exercise_execution', 'checkin', 'plan_version')),
  `item_id` text NOT NULL,
  `topic` text NOT NULL,
  `asked_at` text NOT NULL,
  `last_asked_at` text NOT NULL,
  `ask_count` integer NOT NULL DEFAULT 1,
  `status` text NOT NULL CHECK (`status` IN ('open', 'answered', 'expired')),
  `answered_at` text,
  `answered_by` text REFERENCES `users`(`id`),
  `trainer_note_id` text REFERENCES `trainer_notes`(`id`)
);
CREATE INDEX IF NOT EXISTS `coach_asks_rel_status_idx` ON `coach_asks` (`relationship_id`, `status`);

ALTER TABLE `trainer_profiles` ADD COLUMN `whatsapp_e164` text;

ALTER TABLE `client_invitations` ADD COLUMN `reissued_from_id` text REFERENCES `client_invitations`(`id`);
ALTER TABLE `client_invitations` ADD COLUMN `revoked_at` text;
ALTER TABLE `client_invitations` ADD COLUMN `email_sent_at` text;

ALTER TABLE `exceptions` ADD COLUMN `resolution_outcome` text;
ALTER TABLE `exceptions` ADD COLUMN `resolution_note` text;
ALTER TABLE `exceptions` ADD COLUMN `closed_reason` text;
ALTER TABLE `exceptions` ADD COLUMN `source_logged_late_at` text;
