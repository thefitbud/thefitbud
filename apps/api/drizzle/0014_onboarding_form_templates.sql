-- Onboarding form templates and invitation version pins.
-- Applied after 0000–0013. Does not rewrite those migrations.
-- Versions stay insert-only. Each invitation stores the exact version id.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE `onboarding_form_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`ownership` text NOT NULL,
	`trainer_user_id` text,
	`name` text NOT NULL,
	`description` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	CHECK (
		(`ownership` = 'global' AND `trainer_user_id` IS NULL)
		OR (`ownership` = 'trainer' AND `trainer_user_id` IS NOT NULL)
	)
);
CREATE INDEX `onboarding_form_templates_ownership_idx`
	ON `onboarding_form_templates` (`ownership`, `trainer_user_id`);

-- One template per existing (scope, trainer_user_id, key) group.
-- The seeded global mvp form becomes the global default template.
INSERT INTO `onboarding_form_templates` (
	`id`,
	`ownership`,
	`trainer_user_id`,
	`name`,
	`description`,
	`created_at`,
	`updated_at`
)
SELECT
	CASE
		WHEN `scope` = 'global' AND `trainer_user_id` IS NULL AND `key` = 'mvp'
			THEN '10111111-1111-4111-8111-111111111111'
		ELSE
			substr(min(`id`), 1, 19)
			|| CASE substr(min(`id`), 20, 1) WHEN 'a' THEN 'b' ELSE 'a' END
			|| substr(min(`id`), 21)
	END,
	`scope`,
	`trainer_user_id`,
	`key`,
	NULL,
	min(`created_at`),
	min(`created_at`)
FROM `onboarding_form_versions`
GROUP BY `scope`, `trainer_user_id`, `key`;

CREATE TABLE `onboarding_form_versions_next` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`trainer_user_id` text,
	`schema_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `onboarding_form_templates`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);

INSERT INTO `onboarding_form_versions_next` (
	`id`,
	`template_id`,
	`key`,
	`version`,
	`scope`,
	`trainer_user_id`,
	`schema_json`,
	`created_at`
)
SELECT
	`versions`.`id`,
	`templates`.`id`,
	`versions`.`key`,
	`versions`.`version`,
	`versions`.`scope`,
	`versions`.`trainer_user_id`,
	`versions`.`schema_json`,
	`versions`.`created_at`
FROM `onboarding_form_versions` AS `versions`
INNER JOIN `onboarding_form_templates` AS `templates`
	ON `templates`.`ownership` = `versions`.`scope`
	AND ifnull(`templates`.`trainer_user_id`, '') = ifnull(`versions`.`trainer_user_id`, '')
	AND `templates`.`name` = `versions`.`key`;

DROP TABLE `onboarding_form_versions`;
ALTER TABLE `onboarding_form_versions_next` RENAME TO `onboarding_form_versions`;

CREATE UNIQUE INDEX `onboarding_form_versions_template_version_uidx`
	ON `onboarding_form_versions` (`template_id`, `version`);
CREATE UNIQUE INDEX `onboarding_form_versions_global_key_version_uidx`
	ON `onboarding_form_versions` (`key`, `version`)
	WHERE `scope` = 'global';
CREATE UNIQUE INDEX `onboarding_form_versions_trainer_key_version_uidx`
	ON `onboarding_form_versions` (`trainer_user_id`, `key`, `version`)
	WHERE `scope` = 'trainer';

CREATE TRIGGER `onboarding_form_versions_insert_only`
BEFORE UPDATE ON `onboarding_form_versions`
BEGIN
	SELECT RAISE(ABORT, 'onboarding form versions are insert-only');
END;

UPDATE `onboarding_form_templates`
SET `name` = 'Default onboarding',
	`updated_at` = `created_at`
WHERE `id` = '10111111-1111-4111-8111-111111111111';

CREATE TABLE `client_invitations_next` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_user_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`recipient_display_name` text,
	`recipient_whatsapp_e164` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_user_id` text,
	`onboarding_form_template_version_id` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`onboarding_form_template_version_id`) REFERENCES `onboarding_form_versions`(`id`)
);

-- Response version wins when one exists. Otherwise the resolver result:
-- highest trainer-scoped version for that trainer, else highest global version.
INSERT INTO `client_invitations_next` (
	`id`,
	`trainer_user_id`,
	`recipient_email`,
	`recipient_display_name`,
	`recipient_whatsapp_e164`,
	`token_hash`,
	`status`,
	`expires_at`,
	`accepted_user_id`,
	`onboarding_form_template_version_id`,
	`created_at`,
	`updated_at`
)
SELECT
	`invitations`.`id`,
	`invitations`.`trainer_user_id`,
	`invitations`.`recipient_email`,
	`invitations`.`recipient_display_name`,
	`invitations`.`recipient_whatsapp_e164`,
	`invitations`.`token_hash`,
	`invitations`.`status`,
	`invitations`.`expires_at`,
	`invitations`.`accepted_user_id`,
	COALESCE(
		(
			SELECT `responses`.`onboarding_form_version_id`
			FROM `coaching_relationships` AS `relationships`
			INNER JOIN `onboarding_form_responses` AS `responses`
				ON `responses`.`coaching_relationship_id` = `relationships`.`id`
			WHERE `relationships`.`invitation_id` = `invitations`.`id`
			ORDER BY `responses`.`created_at` ASC, `responses`.`id` ASC
			LIMIT 1
		),
		(
			SELECT `versions`.`id`
			FROM `onboarding_form_versions` AS `versions`
			WHERE `versions`.`scope` = 'trainer'
				AND `versions`.`trainer_user_id` = `invitations`.`trainer_user_id`
			ORDER BY `versions`.`version` DESC, `versions`.`created_at` ASC, `versions`.`id` ASC
			LIMIT 1
		),
		(
			SELECT `versions`.`id`
			FROM `onboarding_form_versions` AS `versions`
			WHERE `versions`.`scope` = 'global'
				AND `versions`.`trainer_user_id` IS NULL
			ORDER BY `versions`.`version` DESC, `versions`.`created_at` ASC, `versions`.`id` ASC
			LIMIT 1
		)
	),
	`invitations`.`created_at`,
	`invitations`.`updated_at`
FROM `client_invitations` AS `invitations`;

DROP TABLE `client_invitations`;
ALTER TABLE `client_invitations_next` RENAME TO `client_invitations`;

CREATE UNIQUE INDEX `client_invitations_token_hash_uidx`
	ON `client_invitations` (`token_hash`);
CREATE INDEX `client_invitations_trainer_idx`
	ON `client_invitations` (`trainer_user_id`);
CREATE INDEX `client_invitations_trainer_email_idx`
	ON `client_invitations` (`trainer_user_id`, `recipient_email`);
CREATE INDEX `client_invitations_form_version_idx`
	ON `client_invitations` (`onboarding_form_template_version_id`);

COMMIT;
PRAGMA foreign_keys = ON;
