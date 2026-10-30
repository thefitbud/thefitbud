-- Copy the assignment civil date onto meal_compliance so directory adherence
-- can filter the window on this table. SQLite ADD COLUMN has no IF NOT EXISTS;
-- wrangler applies each migration once. The column stays nullable because
-- ADD COLUMN NOT NULL requires a constant default.
ALTER TABLE `meal_compliance` ADD COLUMN `local_date` text;

UPDATE `meal_compliance`
SET `local_date` = (
  SELECT `meal_assignments`.`local_date`
  FROM `meal_assignments`
  WHERE `meal_assignments`.`id` = `meal_compliance`.`assignment_id`
)
WHERE `local_date` IS NULL;

CREATE INDEX IF NOT EXISTS `meal_compliance_relationship_local_date_idx`
  ON `meal_compliance` (`coaching_relationship_id`, `local_date`);
