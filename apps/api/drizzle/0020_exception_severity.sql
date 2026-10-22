-- Exception severity. Applied after 0000–0018. Does not edit those migrations.
-- 0019 is reserved for check-in forms and is not part of this migration.
-- Existing missed workouts and unlogged meals are Critical. Other stored
-- exceptions, including overdue check-ins, stay Attention.

ALTER TABLE `exceptions` ADD COLUMN `severity` text NOT NULL DEFAULT 'attention';

UPDATE `exceptions`
SET `severity` = 'critical'
WHERE `type` IN ('missed_workout', 'overdue_meal');
