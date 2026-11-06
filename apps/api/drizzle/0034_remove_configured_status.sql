-- Retire the configured status. Open rows are drafts only.
-- configured_at stays nullable and unused; this migration does not rebuild the table.
-- Update while the previous one-open index is still in place so a relationship
-- cannot gain a second open row during the rewrite.
UPDATE `coaching_configurations`
SET `status` = 'draft'
WHERE `status` = 'configured';

DROP INDEX `coaching_configurations_one_open_uidx`;
CREATE UNIQUE INDEX `coaching_configurations_one_open_uidx`
  ON `coaching_configurations` (`coaching_relationship_id`)
  WHERE `status` = 'draft';
