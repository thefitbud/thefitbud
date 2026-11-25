-- Z14-31 (D-W14-34): the trainee's note on a finished workout. One additive,
-- nullable column: no default, no index, no backfill. Set and changed only with
-- the session rating (PATCH /workouts/executions/:id/feedback and the
-- `workout.feedback` sync mutation), editable for 48 h after the finish.
ALTER TABLE `workout_executions` ADD `session_note` text;
