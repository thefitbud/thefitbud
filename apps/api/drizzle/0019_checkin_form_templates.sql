-- Check-in form templates. Applied after 0000–0018. Does not edit those migrations.
-- Separate from onboarding forms. Versions are insert-only.
-- A scheduled check-in pins checkin_form_version_id.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE `checkin_form_templates` (
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
CREATE INDEX `checkin_form_templates_ownership_idx`
	ON `checkin_form_templates` (`ownership`, `trainer_user_id`);

CREATE TABLE `checkin_form_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`template_id` text NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`trainer_user_id` text,
	`schema_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`template_id`) REFERENCES `checkin_form_templates`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `checkin_form_versions_template_version_uidx`
	ON `checkin_form_versions` (`template_id`, `version`);
CREATE UNIQUE INDEX `checkin_form_versions_global_key_version_uidx`
	ON `checkin_form_versions` (`key`, `version`)
	WHERE `scope` = 'global';
CREATE UNIQUE INDEX `checkin_form_versions_trainer_key_version_uidx`
	ON `checkin_form_versions` (`trainer_user_id`, `key`, `version`)
	WHERE `scope` = 'trainer';

CREATE TRIGGER `checkin_form_versions_insert_only`
BEFORE UPDATE ON `checkin_form_versions`
BEGIN
	SELECT RAISE(ABORT, 'check-in form versions are insert-only');
END;

INSERT INTO `checkin_form_templates` (
	`id`,
	`ownership`,
	`trainer_user_id`,
	`name`,
	`description`,
	`created_at`,
	`updated_at`
) VALUES (
	'c1000001-0000-4000-8000-000000000001',
	'global',
	NULL,
	'Weekly check-in',
	'Wellbeing, notes, body weight, and an optional progress photo.',
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);

INSERT INTO `checkin_form_versions` (
	`id`,
	`template_id`,
	`key`,
	`version`,
	`scope`,
	`trainer_user_id`,
	`schema_json`,
	`created_at`
) VALUES (
	'c1000001-0000-4000-8000-000000000011',
	'c1000001-0000-4000-8000-000000000001',
	'mvp',
	1,
	'global',
	NULL,
	'{"fields":[{"id":"wellbeing","label":"Wellbeing","type":"short_text","required":true,"maxLength":1000},{"id":"notes","label":"Notes","type":"long_text","required":false,"maxLength":2000},{"id":"body_weight","label":"Body weight","type":"measurement","measurementType":"body_weight_kg","required":false},{"id":"photo","label":"Progress photo","type":"photo_intent","required":false}]}',
	'2026-01-01T00:00:00.000Z'
);

-- D1 rejects ADD COLUMN that combines REFERENCES with a non-NULL default, and it
-- keeps foreign keys enabled, so checkins cannot be rebuilt while reviews and
-- notes still reference it. Existing rows pin the global form version via the
-- default. Application writes always store a real checkin_form_versions id.
ALTER TABLE `checkins` ADD COLUMN `checkin_form_version_id` text NOT NULL DEFAULT 'c1000001-0000-4000-8000-000000000011';
CREATE INDEX `checkins_form_version_idx` ON `checkins` (`checkin_form_version_id`);

COMMIT;
PRAGMA foreign_keys = ON;
