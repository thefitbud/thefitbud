-- Performance indexes from local trace analysis (Oct 22, 2026)
CREATE INDEX IF NOT EXISTS `notifications_relationship_created_idx` ON `notifications` (`coaching_relationship_id`, `created_at`);
CREATE INDEX IF NOT EXISTS `meal_compliance_relationship_logged_idx` ON `meal_compliance` (`coaching_relationship_id`, `logged_at`);
CREATE INDEX IF NOT EXISTS `workout_executions_relationship_completed_idx` ON `workout_executions` (`coaching_relationship_id`, `completed_at`);
CREATE INDEX IF NOT EXISTS `checkins_relationship_submitted_idx` ON `checkins` (`coaching_relationship_id`, `submitted_at`);
CREATE INDEX IF NOT EXISTS `exceptions_relationship_status_detected_idx` ON `exceptions` (`coaching_relationship_id`, `status`, `detected_at`);
DROP INDEX IF EXISTS `exceptions_relationship_status_idx`;
