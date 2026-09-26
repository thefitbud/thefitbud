-- Migration: trainee offline sync change_log + sync_mutations (D3)
CREATE TABLE `change_log` (
	`id` text PRIMARY KEY NOT NULL,
	`sequence` integer NOT NULL,
	`entity_type` text NOT NULL,
	`record_id` text NOT NULL,
	`change_kind` text NOT NULL,
	`server_version` integer,
	`coaching_relationship_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`changed_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `change_log_sequence_uidx` ON `change_log` (`sequence`);
CREATE INDEX `change_log_trainee_seq_idx` ON `change_log` (`trainee_user_id`, `sequence`);
CREATE INDEX `change_log_relationship_seq_idx` ON `change_log` (`coaching_relationship_id`, `sequence`);

CREATE TABLE `sync_mutations` (
	`id` text PRIMARY KEY NOT NULL,
	`mutation_id` text NOT NULL,
	`actor_user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`operation` text NOT NULL,
	`entity_type` text NOT NULL,
	`record_id` text,
	`result_status` text NOT NULL,
	`server_version` integer,
	`result_body` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `sync_mutations_actor_mutation_uidx` ON `sync_mutations` (`actor_user_id`, `mutation_id`);
CREATE UNIQUE INDEX `sync_mutations_actor_idempotency_uidx` ON `sync_mutations` (`actor_user_id`, `idempotency_key`);
CREATE INDEX `sync_mutations_actor_created_idx` ON `sync_mutations` (`actor_user_id`, `created_at`);
