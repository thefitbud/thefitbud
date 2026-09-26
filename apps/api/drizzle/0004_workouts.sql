-- Migration: workout assignments and executions
CREATE TABLE `workout_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`workout_day_id` text NOT NULL,
	`workout_day_name` text NOT NULL,
	`workout_day_json` text NOT NULL,
	`local_date` text NOT NULL,
	`window_starts_at` text NOT NULL,
	`window_ends_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`),
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`)
);
CREATE UNIQUE INDEX `workout_assignments_rel_version_day_date_uidx` ON `workout_assignments` (`coaching_relationship_id`, `plan_version_id`, `workout_day_id`, `local_date`);
CREATE INDEX `workout_assignments_relationship_date_idx` ON `workout_assignments` (`coaching_relationship_id`, `local_date`);
CREATE INDEX `workout_assignments_window_ends_idx` ON `workout_assignments` (`window_ends_at`);

CREATE TABLE `workout_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`assignment_id` text NOT NULL,
	`coaching_relationship_id` text NOT NULL,
	`plan_version_id` text NOT NULL,
	`trainee_user_id` text NOT NULL,
	`status` text NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`started_at` text NOT NULL,
	`paused_at` text,
	`completed_at` text,
	`session_rpe` integer,
	`require_session_rpe` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`assignment_id`) REFERENCES `workout_assignments`(`id`),
	FOREIGN KEY (`coaching_relationship_id`) REFERENCES `coaching_relationships`(`id`),
	FOREIGN KEY (`plan_version_id`) REFERENCES `plan_versions`(`id`),
	FOREIGN KEY (`trainee_user_id`) REFERENCES `users`(`id`)
);
CREATE UNIQUE INDEX `workout_executions_assignment_uidx` ON `workout_executions` (`assignment_id`);
CREATE INDEX `workout_executions_relationship_idx` ON `workout_executions` (`coaching_relationship_id`);
CREATE INDEX `workout_executions_trainee_idx` ON `workout_executions` (`trainee_user_id`);

CREATE TABLE `exercise_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`workout_execution_id` text NOT NULL,
	`exercise_id` text NOT NULL,
	`name` text NOT NULL,
	`order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`workout_execution_id`) REFERENCES `workout_executions`(`id`)
);
CREATE INDEX `exercise_executions_workout_idx` ON `exercise_executions` (`workout_execution_id`);

CREATE TABLE `set_executions` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise_execution_id` text NOT NULL,
	`set_target_id` text NOT NULL,
	`order` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`prescribed_reps` integer,
	`prescribed_load_label` text,
	`actual_reps` integer,
	`actual_load_label` text,
	`completed_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`exercise_execution_id`) REFERENCES `exercise_executions`(`id`)
);
CREATE INDEX `set_executions_exercise_idx` ON `set_executions` (`exercise_execution_id`);
