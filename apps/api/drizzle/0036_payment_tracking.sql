-- Z6-3 (v13 B3a): subscription amount, type and coaching mode, and payment records.
--
-- Tracking only (D-W6-5): FitBud records what a client owes and whether the
-- trainer marked it paid, never a collection. No gateway, invoice, transaction
-- or session-count column exists, and none may be added.
--
-- Additive: subscription_versions gains three nullable columns. Existing rows
-- keep NULL (no amount, type or mode is invented). No table is rebuilt.
ALTER TABLE `subscription_versions` ADD COLUMN `amount_paise` integer
  CONSTRAINT `subscription_versions_amount_paise_chk`
  CHECK (`amount_paise` IS NULL OR (typeof(`amount_paise`) = 'integer' AND `amount_paise` >= 0));
ALTER TABLE `subscription_versions` ADD COLUMN `subscription_type` text
  CONSTRAINT `subscription_versions_subscription_type_chk`
  CHECK (`subscription_type` IS NULL OR `subscription_type` IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom'));
ALTER TABLE `subscription_versions` ADD COLUMN `coaching_mode` text
  CONSTRAINT `subscription_versions_coaching_mode_chk`
  CHECK (`coaching_mode` IS NULL OR `coaching_mode` IN ('online', 'in_person', 'hybrid'));

-- Parent key for the same-relationship foreign key below. id is already unique,
-- so every existing row satisfies it.
CREATE UNIQUE INDEX `subscription_versions_relationship_id_uidx`
  ON `subscription_versions` (`coaching_relationship_id`, `id`);

-- due_on and paid_on are civil dates (YYYY-MM-DD). paid_on is set exactly when
-- status is paid, and an unpaid row carries no method.
CREATE TABLE `payment_records` (
  `id` text PRIMARY KEY NOT NULL,
  `coaching_relationship_id` text NOT NULL,
  `subscription_version_id` text NOT NULL,
  `amount_paise` integer NOT NULL,
  `due_on` text NOT NULL,
  `paid_on` text,
  `status` text NOT NULL,
  `method` text,
  `note` text,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
  CONSTRAINT `payment_records_subscription_version_fk`
    FOREIGN KEY (`coaching_relationship_id`, `subscription_version_id`)
    REFERENCES `subscription_versions`(`coaching_relationship_id`, `id`),
  CONSTRAINT `payment_records_amount_paise_chk`
    CHECK (typeof(`amount_paise`) = 'integer' AND `amount_paise` > 0),
  CONSTRAINT `payment_records_due_on_chk`
    CHECK (`due_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  CONSTRAINT `payment_records_paid_on_chk`
    CHECK (`paid_on` IS NULL OR `paid_on` GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]-[0-3][0-9]'),
  CONSTRAINT `payment_records_status_chk`
    CHECK ((`status` = 'paid' AND `paid_on` IS NOT NULL)
      OR (`status` = 'unpaid' AND `paid_on` IS NULL AND `method` IS NULL)),
  CONSTRAINT `payment_records_method_chk`
    CHECK (`method` IS NULL OR `method` IN ('cash', 'upi', 'bank'))
);
CREATE INDEX `payment_records_relationship_due_idx`
  ON `payment_records` (`coaching_relationship_id`, `due_on`);
