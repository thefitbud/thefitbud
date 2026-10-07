-- Migration: invitations, coaching relationships, intake, onboarding review
CREATE TABLE `client_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_user_id` text NOT NULL,
	`recipient_email` text NOT NULL,
	`recipient_display_name` text,
	`token_hash` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_user_id` text,
	`coaching_relationship_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`accepted_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `client_invitations_token_hash_uidx` ON `client_invitations` (`token_hash`);
CREATE INDEX `client_invitations_trainer_idx` ON `client_invitations` (`trainer_user_id`);
CREATE INDEX `client_invitations_trainer_email_idx` ON `client_invitations` (`trainer_user_id`,`recipient_email`);

CREATE TABLE `coaching_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_user_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`status` text DEFAULT 'onboarding_pending' NOT NULL,
	`invitation_id` text,
	`started_at` text NOT NULL,
	`ended_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`),
	FOREIGN KEY (`invitation_id`) REFERENCES `client_invitations`(`id`)
);
CREATE UNIQUE INDEX `coaching_relationships_trainer_trainee_uidx` ON `coaching_relationships` (`trainer_user_id`,`trainee_user_id`);
CREATE INDEX `coaching_relationships_trainer_idx` ON `coaching_relationships` (`trainer_user_id`);
CREATE INDEX `coaching_relationships_trainee_idx` ON `coaching_relationships` (`trainee_user_id`);

CREATE TABLE `intake_definitions` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`version` integer NOT NULL,
	`scope` text DEFAULT 'global' NOT NULL,
	`trainer_user_id` text,
	`schema_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `intake_definitions_key_version_uidx` ON `intake_definitions` (`key`,`version`);

CREATE TABLE `intake_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`intake_definition_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`answers_json` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`submitted_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`intake_definition_id`) REFERENCES `intake_definitions`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `intake_submissions_relationship_uidx` ON `intake_submissions` (`coaching_relationship_id`);
CREATE INDEX `intake_submissions_trainee_idx` ON `intake_submissions` (`trainee_user_id`);

CREATE TABLE `onboarding_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`intake_submission_id` text NOT NULL,
	`trainer_user_id` text NOT NULL,
	`outcome` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`intake_submission_id`) REFERENCES `intake_submissions`(`id`),
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `onboarding_reviews_submission_uidx` ON `onboarding_reviews` (`intake_submission_id`);
CREATE INDEX `onboarding_reviews_relationship_idx` ON `onboarding_reviews` (`coaching_relationship_id`);

-- Seeded versioned MVP intake definition (goals, history, preferences, schedule, limitations).
INSERT INTO `intake_definitions` (
	`id`,
	`key`,
	`version`,
	`scope`,
	`trainer_user_id`,
	`schema_json`,
	`created_at`
) VALUES (
	'11111111-1111-4111-8111-111111111111',
	'mvp',
	1,
	'global',
	NULL,
	'{"fields":[{"id":"goals","type":"textarea","label":"Goals","required":true,"maxLength":2000},{"id":"relevant_history","type":"textarea","label":"Relevant history","required":false,"maxLength":4000},{"id":"preferences","type":"textarea","label":"Preferences","required":false,"maxLength":2000},{"id":"schedule","type":"textarea","label":"Schedule","required":true,"maxLength":2000},{"id":"limitations","type":"textarea","label":"Limitations","required":false,"maxLength":2000}]}',
	'2026-09-26T00:00:00.000Z'
);
