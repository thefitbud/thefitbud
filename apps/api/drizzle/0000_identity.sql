-- Migration: identity domain + idempotency primitive
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`firebase_uid` text NOT NULL,
	`account_state` text DEFAULT 'active' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
CREATE UNIQUE INDEX `users_firebase_uid_uidx` ON `users` (`firebase_uid`);

CREATE TABLE `user_roles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `user_roles_user_role_uidx` ON `user_roles` (`user_id`,`role`);
CREATE INDEX `user_roles_user_idx` ON `user_roles` (`user_id`);

CREATE TABLE `trainer_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `trainer_profiles_user_uidx` ON `trainer_profiles` (`user_id`);

CREATE TABLE `trainee_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `trainee_profiles_user_uidx` ON `trainee_profiles` (`user_id`);

CREATE TABLE `web_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`revoked_at` text,
	`created_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `web_sessions_token_hash_uidx` ON `web_sessions` (`token_hash`);
CREATE INDEX `web_sessions_user_idx` ON `web_sessions` (`user_id`);

CREATE TABLE `idempotency_records` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_user_id` text NOT NULL,
	`operation` text NOT NULL,
	`key_hash` text NOT NULL,
	`request_fingerprint` text NOT NULL,
	`response_status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` text NOT NULL,
	`expires_at` text NOT NULL
);
CREATE UNIQUE INDEX `idempotency_actor_op_key_uidx` ON `idempotency_records` (`actor_user_id`,`operation`,`key_hash`);
