-- Relationship lifecycle, onboarding forms, configuration versions, subscriptions.
-- Applied after 0000–0012. Does not rewrite those migrations.

-- Onboarding forms (formerly intake definitions and submissions).
ALTER TABLE `intake_definitions` RENAME TO `onboarding_form_versions`;
ALTER TABLE `intake_submissions` RENAME TO `onboarding_form_responses`;
ALTER TABLE `onboarding_form_responses` RENAME COLUMN `intake_definition_id` TO `onboarding_form_version_id`;
ALTER TABLE `onboarding_reviews` RENAME COLUMN `intake_submission_id` TO `onboarding_form_response_id`;

DROP INDEX `intake_definitions_key_version_uidx`;
CREATE UNIQUE INDEX `onboarding_form_versions_global_key_version_uidx`
  ON `onboarding_form_versions` (`key`, `version`)
  WHERE `scope` = 'global';
CREATE UNIQUE INDEX `onboarding_form_versions_trainer_key_version_uidx`
  ON `onboarding_form_versions` (`trainer_user_id`, `key`, `version`)
  WHERE `scope` = 'trainer';

DROP INDEX `intake_submissions_relationship_uidx`;
CREATE UNIQUE INDEX `onboarding_form_responses_relationship_uidx`
  ON `onboarding_form_responses` (`coaching_relationship_id`);
DROP INDEX `intake_submissions_trainee_idx`;
CREATE INDEX `onboarding_form_responses_trainee_idx`
  ON `onboarding_form_responses` (`trainee_user_id`);

DROP INDEX `onboarding_reviews_submission_uidx`;
CREATE UNIQUE INDEX `onboarding_reviews_response_uidx`
  ON `onboarding_reviews` (`onboarding_form_response_id`);

-- Canonical invitation link is coaching_relationships.invitation_id.
UPDATE `coaching_relationships`
SET `invitation_id` = (
  SELECT `id` FROM `client_invitations`
  WHERE `client_invitations`.`coaching_relationship_id` = `coaching_relationships`.`id`
  LIMIT 1
)
WHERE `invitation_id` IS NULL
  AND EXISTS (
    SELECT 1 FROM `client_invitations`
    WHERE `client_invitations`.`coaching_relationship_id` = `coaching_relationships`.`id`
  );

ALTER TABLE `client_invitations` DROP COLUMN `coaching_relationship_id`;

-- Persisted relationship status is only active or ended.
UPDATE `coaching_relationships`
SET `status` = 'active'
WHERE `status` != 'ended';

-- Configuration business version is separate from optimistic-concurrency record version.
DROP INDEX `coaching_configurations_relationship_uidx`;
ALTER TABLE `coaching_configurations` RENAME COLUMN `version` TO `record_version`;
ALTER TABLE `coaching_configurations` ADD COLUMN `version_number` integer NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX `coaching_configurations_relationship_version_uidx`
  ON `coaching_configurations` (`coaching_relationship_id`, `version_number`);
CREATE UNIQUE INDEX `coaching_configurations_one_active_uidx`
  ON `coaching_configurations` (`coaching_relationship_id`)
  WHERE `status` = 'active';
CREATE UNIQUE INDEX `coaching_configurations_one_open_uidx`
  ON `coaching_configurations` (`coaching_relationship_id`)
  WHERE `status` IN ('draft', 'configured');

-- Append-only subscription revisions. No amounts or payment records.
CREATE TABLE `subscription_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `coaching_relationship_id` text NOT NULL,
  `version_number` integer NOT NULL,
  `plan_name` text NOT NULL,
  `payment_frequency` text NOT NULL,
  `starts_on` text NOT NULL,
  `renews_on` text NOT NULL,
  `created_at` text NOT NULL,
  FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`)
);
CREATE UNIQUE INDEX `subscription_versions_relationship_version_uidx`
  ON `subscription_versions` (`coaching_relationship_id`, `version_number`);
CREATE INDEX `subscription_versions_relationship_idx`
  ON `subscription_versions` (`coaching_relationship_id`);

ALTER TABLE `notification_preferences`
  ADD COLUMN `subscription_renewal_reminder` integer NOT NULL DEFAULT 1;
