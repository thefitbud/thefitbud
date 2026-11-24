-- Z14-4 (D-W14-18): index hygiene. Indexes only; no table or row changes.
--
-- 1. The reminder cron retries deferred reminders with `WHERE state = 'deferred'`
--    every 5 minutes, which scanned the whole notifications table. The same
--    index serves the daily cleanup of read notifications older than 90 days
--    (`state = 'read' AND created_at < ?`).
CREATE INDEX IF NOT EXISTS `notifications_state_created_idx` ON `notifications` (`state`, `created_at`);
--> statement-breakpoint
-- 2. Duplicate indexes. Each one below indexes exactly the leading column of a
--    wider index on the same table that stays, so that index answers every
--    lookup this one answered (SQLite uses any leftmost prefix of an index).
--    Dropping them only saves write work and space.
--    user_roles_user_idx (user_id)                         -> user_roles_user_role_uidx (user_id, role)
--    client_invitations_trainer_idx (trainer_user_id)      -> client_invitations_trainer_email_idx (trainer_user_id, recipient_email)
--    coaching_relationships_trainer_idx (trainer_user_id)  -> coaching_relationships_trainer_trainee_uidx (trainer_user_id, trainee_user_id)
--    subscription_versions_relationship_idx (rel)          -> subscription_versions_relationship_version_uidx (rel, version_number)
--    workout_executions_relationship_idx (rel)             -> workout_executions_relationship_completed_idx (rel, completed_at)
--    meal_compliance_relationship_idx (rel)                -> meal_compliance_relationship_logged_idx (rel, logged_at)
--    reminder_rules_relationship_idx (rel)                 -> reminder_rules_relationship_type_uidx (rel, reminder_type)
--    plan_templates_trainer_idx (trainer_user_id)          -> plan_templates_trainer_updated_idx (trainer_user_id, updated_at)
DROP INDEX IF EXISTS `user_roles_user_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `client_invitations_trainer_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `coaching_relationships_trainer_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `subscription_versions_relationship_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `workout_executions_relationship_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `meal_compliance_relationship_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `reminder_rules_relationship_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `plan_templates_trainer_idx`;
--> statement-breakpoint
-- 3. schema.ts declared trainer_notes_relationship_idx on (coaching_relationship_id,
--    created_at) but 0006 created it on coaching_relationship_id alone. Every
--    notes list reads `WHERE coaching_relationship_id = ? ORDER BY created_at DESC`,
--    so the two-column index (the one schema.ts always described) also removes the sort.
DROP INDEX IF EXISTS `trainer_notes_relationship_idx`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `trainer_notes_relationship_idx` ON `trainer_notes` (`coaching_relationship_id`, `created_at`);
