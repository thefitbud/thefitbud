-- Plan template ownership.
-- Applied after 0000-0016. Does not rewrite those migrations.
-- Existing trainer templates stay editable in place.
-- Global bases are read-only. source_template_id is provenance only, with no live join.

PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

CREATE TABLE `plan_templates__next` (
	`id` text PRIMARY KEY NOT NULL,
	`ownership` text NOT NULL,
	`trainer_user_id` text,
	`title` text NOT NULL,
	`template_type` text NOT NULL,
	`content_json` text NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`),
	CHECK (
		(`ownership` = 'global' AND `trainer_user_id` IS NULL)
		OR (`ownership` = 'trainer' AND `trainer_user_id` IS NOT NULL)
	)
);

INSERT INTO `plan_templates__next` (
	`id`,
	`ownership`,
	`trainer_user_id`,
	`title`,
	`template_type`,
	`content_json`,
	`record_version`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	'trainer',
	`trainer_user_id`,
	`title`,
	`template_type`,
	`content_json`,
	`record_version`,
	`created_at`,
	`updated_at`
FROM `plan_templates`;

DROP TABLE `plan_templates`;
ALTER TABLE `plan_templates__next` RENAME TO `plan_templates`;

CREATE INDEX `plan_templates_ownership_idx`
	ON `plan_templates` (`ownership`, `trainer_user_id`);
CREATE INDEX `plan_templates_trainer_idx` ON `plan_templates` (`trainer_user_id`);
CREATE INDEX `plan_templates_trainer_updated_idx`
	ON `plan_templates` (`trainer_user_id`, `updated_at`);

INSERT INTO `plan_templates` (
	`id`,
	`ownership`,
	`trainer_user_id`,
	`title`,
	`template_type`,
	`content_json`,
	`record_version`,
	`created_at`,
	`updated_at`
) VALUES
(
	'a1000001-0000-4000-8000-000000000001',
	'global',
	NULL,
	'Base full-body workout',
	'workout',
	'{"workoutDays":[{"id":"d1000001-0000-4000-8000-000000000001","order":1,"name":"Full body","exercises":[{"id":"d1000001-0000-4000-8000-000000000011","order":1,"name":"Back Squat","instructions":"Depth to parallel; brace core.","primaryMuscles":["quads"],"secondaryMuscles":["glutes","core"],"equipment":["barbell"],"difficulty":"intermediate","sourceExerciseLibraryItemId":"e1000001-0000-4000-8000-000000000001","setTargets":[{"id":"d1000001-0000-4000-8000-000000000021","order":1,"reps":5,"loadLabel":"RPE 7","rpe":7}]}]}],"mealPrescriptions":[]}',
	1,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
),
(
	'a1000001-0000-4000-8000-000000000002',
	'global',
	NULL,
	'Base daily meals',
	'nutrition',
	'{"workoutDays":[],"mealPrescriptions":[{"id":"d1000001-0000-4000-8000-000000000002","order":1,"name":"Breakfast","scheduleHint":null,"instructions":null,"photoRequired":false,"items":[{"snapshotKind":"calculated","name":"Roti / Chapati","classification":"prepared_food","basis":"per_100_g","canonical":{"energyKcalScaled":297000000,"proteinScaled":9400000,"carbsScaled":46000000,"fatScaled":7500000},"serving":{"label":"100 g","unit":"g","conversionScaled":100000000},"quantityScaled":1000000,"calculated":{"energyKcalScaled":297000000,"proteinScaled":9400000,"carbsScaled":46000000,"fatScaled":7500000,"partial":false},"sourceFoodLibraryItemId":"f1000001-0000-4000-8000-000000000001","sourceServingId":"c1000001-0000-4000-8000-000000000001"}]}]}',
	1,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
),
(
	'a1000001-0000-4000-8000-000000000003',
	'global',
	NULL,
	'Base training and meals',
	'combined',
	'{"workoutDays":[{"id":"d1000001-0000-4000-8000-000000000003","order":1,"name":"Full body","exercises":[{"id":"d1000001-0000-4000-8000-000000000013","order":1,"name":"Back Squat","instructions":"Depth to parallel; brace core.","primaryMuscles":["quads"],"secondaryMuscles":["glutes","core"],"equipment":["barbell"],"difficulty":"intermediate","sourceExerciseLibraryItemId":"e1000001-0000-4000-8000-000000000001","setTargets":[{"id":"d1000001-0000-4000-8000-000000000023","order":1,"reps":5,"loadLabel":"RPE 7","rpe":7}]}]}],"mealPrescriptions":[{"id":"d1000001-0000-4000-8000-000000000004","order":1,"name":"Breakfast","scheduleHint":null,"instructions":null,"photoRequired":false,"items":[{"snapshotKind":"calculated","name":"Roti / Chapati","classification":"prepared_food","basis":"per_100_g","canonical":{"energyKcalScaled":297000000,"proteinScaled":9400000,"carbsScaled":46000000,"fatScaled":7500000},"serving":{"label":"100 g","unit":"g","conversionScaled":100000000},"quantityScaled":1000000,"calculated":{"energyKcalScaled":297000000,"proteinScaled":9400000,"carbsScaled":46000000,"fatScaled":7500000,"partial":false},"sourceFoodLibraryItemId":"f1000001-0000-4000-8000-000000000001","sourceServingId":"c1000001-0000-4000-8000-000000000001"}]}]}',
	1,
	'2026-01-01T00:00:00.000Z',
	'2026-01-01T00:00:00.000Z'
);

ALTER TABLE `plan_versions` ADD COLUMN `source_template_id` text;

COMMIT;
PRAGMA foreign_keys = ON;
