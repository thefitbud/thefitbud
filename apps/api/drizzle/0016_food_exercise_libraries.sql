-- Food and exercise library identity.
-- Applied after 0000-0015. Does not rewrite those migrations.
-- Does not rewrite plan or template JSON.
-- Existing portion calories are cleared, not treated as per 100 g.
-- Global foods are re-entered here with an explicit basis, scaled nutrients, and food-specific servings.
-- Trainer-owned foods keep their identity and previous portion label as a serving, with null nutrients and no conversion.

ALTER TABLE `exercise_library_items` ADD COLUMN `primary_muscles_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `exercise_library_items` ADD COLUMN `secondary_muscles_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `exercise_library_items` ADD COLUMN `status` text NOT NULL DEFAULT 'active';

UPDATE `exercise_library_items`
SET `primary_muscles_json` = COALESCE(`muscle_groups_json`, '[]');

UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["glutes","core"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000001';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["core","upper back"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000002';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["hamstrings"]',
    `secondary_muscles_json` = '["glutes","lower back"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000003';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["hamstrings","glutes"]',
    `secondary_muscles_json` = '["back","core"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'advanced'
WHERE `id` = 'e1000001-0000-4000-8000-000000000004';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["chest"]',
    `secondary_muscles_json` = '["triceps","shoulders"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000005';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["chest"]',
    `secondary_muscles_json` = '["shoulders","triceps"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000006';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["chest"]',
    `secondary_muscles_json` = '["triceps","core"]',
    `equipment_json` = '["bodyweight"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000007';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["shoulders"]',
    `secondary_muscles_json` = '["triceps","core"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000008';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["shoulders"]',
    `secondary_muscles_json` = '["triceps"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000009';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["shoulders"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000a';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["lats"]',
    `secondary_muscles_json` = '["biceps","upper back"]',
    `equipment_json` = '["pull-up bar"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000b';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["lats"]',
    `secondary_muscles_json` = '["biceps"]',
    `equipment_json` = '["cable"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000c';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["upper back"]',
    `secondary_muscles_json` = '["biceps","lats"]',
    `equipment_json` = '["cable"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000d';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["upper back"]',
    `secondary_muscles_json` = '["lats","biceps"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000e';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["lats"]',
    `secondary_muscles_json` = '["biceps","upper back"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000000f';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["rear delts"]',
    `secondary_muscles_json` = '["upper back"]',
    `equipment_json` = '["cable"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000010';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["biceps"]',
    `secondary_muscles_json` = '["forearms"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000011';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["triceps"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["cable"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000012';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["triceps"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000013';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["glutes","hamstrings"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000014';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["glutes"]',
    `equipment_json` = '["dumbbell","bench"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-000000000015';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["glutes"]',
    `equipment_json` = '["machine"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000016';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["hamstrings"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["machine"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000017';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["machine"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000018';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["calves"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["machine"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000019';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["glutes"]',
    `secondary_muscles_json` = '["hamstrings"]',
    `equipment_json` = '["barbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001a';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["core"]',
    `secondary_muscles_json` = '["shoulders"]',
    `equipment_json` = '["bodyweight"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001b';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["core"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["bodyweight"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001c';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["core"]',
    `secondary_muscles_json` = '["glutes"]',
    `equipment_json` = '["bodyweight"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001d';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["grip"]',
    `secondary_muscles_json` = '["core","traps"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001e';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["glutes"]',
    `secondary_muscles_json` = '["hamstrings","core"]',
    `equipment_json` = '["kettlebell"]',
    `difficulty` = 'intermediate'
WHERE `id` = 'e1000001-0000-4000-8000-00000000001f';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["quads"]',
    `secondary_muscles_json` = '["core"]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000020';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["chest"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["dumbbell"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000021';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["chest"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["cable"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000022';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["cardio"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["treadmill"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000023';
UPDATE `exercise_library_items`
SET `primary_muscles_json` = '["cardio"]',
    `secondary_muscles_json` = '[]',
    `equipment_json` = '["bike"]',
    `difficulty` = 'beginner'
WHERE `id` = 'e1000001-0000-4000-8000-000000000024';

ALTER TABLE `exercise_library_items` DROP COLUMN `default_load_label`;
ALTER TABLE `exercise_library_items` DROP COLUMN `default_reps`;
ALTER TABLE `exercise_library_items` DROP COLUMN `muscle_groups_json`;
CREATE INDEX `exercise_library_status_idx` ON `exercise_library_items` (`status`);

ALTER TABLE `food_library_items` ADD COLUMN `classification` text;
ALTER TABLE `food_library_items` ADD COLUMN `nutrition_basis` text;
ALTER TABLE `food_library_items` ADD COLUMN `energy_kcal_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `protein_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `carbs_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `fat_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `status` text NOT NULL DEFAULT 'active';

UPDATE `food_library_items`
SET `calories` = NULL,
    `protein_grams` = NULL,
    `carbs_grams` = NULL,
    `fat_grams` = NULL;

CREATE TABLE `food_library_servings` (
  `id` text PRIMARY KEY NOT NULL,
  `food_library_item_id` text NOT NULL,
  `label` text NOT NULL,
  `unit` text NOT NULL,
  `conversion_scaled` integer,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  FOREIGN KEY (`food_library_item_id`) REFERENCES `food_library_items`(`id`)
);
CREATE INDEX `food_library_servings_food_idx` ON `food_library_servings` (`food_library_item_id`);

INSERT INTO `food_library_servings` (
  `id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`
)
SELECT
  lower(
    substr(hex(randomblob(4)), 1, 8) || '-' ||
    substr(hex(randomblob(2)), 1, 4) || '-4' ||
    substr(hex(randomblob(2)), 1, 3) || '-a' ||
    substr(hex(randomblob(2)), 1, 3) || '-' ||
    substr(hex(randomblob(6)), 1, 12)
  ),
  `id`,
  `portion_label`,
  'portion',
  NULL,
  `created_at`,
  `updated_at`
FROM `food_library_items`
WHERE `ownership` = 'trainer';

UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 297000000,
    `protein_grams_scaled` = 9400000,
    `carbs_grams_scaled` = 46000000,
    `fat_grams_scaled` = 7500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000001' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000001', 'f1000001-0000-4000-8000-000000000001', '1 medium roti', 'piece', 35000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000001', 'f1000001-0000-4000-8000-000000000001', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 270000000,
    `protein_grams_scaled` = 8500000,
    `carbs_grams_scaled` = 48000000,
    `fat_grams_scaled` = 4000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000002' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000002', 'f1000001-0000-4000-8000-000000000002', '1 piece', 'piece', 25000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000002', 'f1000001-0000-4000-8000-000000000002', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 130000000,
    `protein_grams_scaled` = 2700000,
    `carbs_grams_scaled` = 28000000,
    `fat_grams_scaled` = 300000
WHERE `id` = 'f1000001-0000-4000-8000-000000000003' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000003', 'f1000001-0000-4000-8000-000000000003', '1 katori cooked', 'katori', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000003', 'f1000001-0000-4000-8000-000000000003', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 160000000,
    `protein_grams_scaled` = 2800000,
    `carbs_grams_scaled` = 30000000,
    `fat_grams_scaled` = 3500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000004' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000004', 'f1000001-0000-4000-8000-000000000004', '1 katori cooked', 'katori', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000004', 'f1000001-0000-4000-8000-000000000004', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 8000000,
    `carbs_grams_scaled` = 18000000,
    `fat_grams_scaled` = 4000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000005' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000005', 'f1000001-0000-4000-8000-000000000005', '1 katori', 'katori', 180000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000005', 'f1000001-0000-4000-8000-000000000005', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 155000000,
    `protein_grams_scaled` = 8200000,
    `carbs_grams_scaled` = 17000000,
    `fat_grams_scaled` = 5500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000006' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000006', 'f1000001-0000-4000-8000-000000000006', '1 katori', 'katori', 180000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000006', 'f1000001-0000-4000-8000-000000000006', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 80000000,
    `protein_grams_scaled` = 4000000,
    `carbs_grams_scaled` = 10000000,
    `fat_grams_scaled` = 2500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000007' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000007', 'f1000001-0000-4000-8000-000000000007', '1 katori', 'katori', 200000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000007', 'f1000001-0000-4000-8000-000000000007', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 8000000,
    `carbs_grams_scaled` = 20000000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000008' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000008', 'f1000001-0000-4000-8000-000000000008', '1 katori', 'katori', 180000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000008', 'f1000001-0000-4000-8000-000000000008', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 160000000,
    `protein_grams_scaled` = 8500000,
    `carbs_grams_scaled` = 22000000,
    `fat_grams_scaled` = 4500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000009' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000009', 'f1000001-0000-4000-8000-000000000009', '1 katori', 'katori', 180000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000009', 'f1000001-0000-4000-8000-000000000009', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 265000000,
    `protein_grams_scaled` = 18000000,
    `carbs_grams_scaled` = 4000000,
    `fat_grams_scaled` = 20000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000a' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000a', 'f1000001-0000-4000-8000-00000000000a', '100 g paneer', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000a', 'f1000001-0000-4000-8000-00000000000a', '150 g paneer', 'g', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 280000000,
    `protein_grams_scaled` = 20000000,
    `carbs_grams_scaled` = 5000000,
    `fat_grams_scaled` = 19000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000b' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000b', 'f1000001-0000-4000-8000-00000000000b', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000b', 'f1000001-0000-4000-8000-00000000000b', '120 g', 'g', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 180000000,
    `protein_grams_scaled` = 22000000,
    `carbs_grams_scaled` = 3000000,
    `fat_grams_scaled` = 9000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000c' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000c', 'f1000001-0000-4000-8000-00000000000c', '120 g cooked chicken', 'g', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000c', 'f1000001-0000-4000-8000-00000000000c', '150 g cooked chicken', 'g', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 170000000,
    `protein_grams_scaled` = 13000000,
    `carbs_grams_scaled` = 2000000,
    `fat_grams_scaled` = 12000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000d' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000d', 'f1000001-0000-4000-8000-00000000000d', '2 eggs', 'piece', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000d', 'f1000001-0000-4000-8000-00000000000d', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 155000000,
    `protein_grams_scaled` = 13000000,
    `carbs_grams_scaled` = 1100000,
    `fat_grams_scaled` = 11000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000e' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000e', 'f1000001-0000-4000-8000-00000000000e', '1 egg', 'piece', 50000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000e', 'f1000001-0000-4000-8000-00000000000e', '2 eggs', 'piece', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'generic_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 60000000,
    `protein_grams_scaled` = 3500000,
    `carbs_grams_scaled` = 4500000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000000f' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000000f', 'f1000001-0000-4000-8000-00000000000f', '1 katori', 'katori', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000000f', 'f1000001-0000-4000-8000-00000000000f', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'generic_food',
    `nutrition_basis` = 'per_100_ml',
    `energy_kcal_scaled` = 25000000,
    `protein_grams_scaled` = 1500000,
    `carbs_grams_scaled` = 2500000,
    `fat_grams_scaled` = 1000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000010' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000010', 'f1000001-0000-4000-8000-000000000010', '1 glass', 'glass', 200000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000010', 'f1000001-0000-4000-8000-000000000010', '100 ml', 'ml', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 4000000,
    `carbs_grams_scaled` = 28000000,
    `fat_grams_scaled` = 1000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000011' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000011', 'f1000001-0000-4000-8000-000000000011', '1 piece', 'piece', 40000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000011', 'f1000001-0000-4000-8000-000000000011', '3 pieces', 'piece', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 168000000,
    `protein_grams_scaled` = 4000000,
    `carbs_grams_scaled` = 28000000,
    `fat_grams_scaled` = 4500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000012' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000012', 'f1000001-0000-4000-8000-000000000012', '1 medium', 'piece', 80000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000012', 'f1000001-0000-4000-8000-000000000012', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 150000000,
    `protein_grams_scaled` = 3000000,
    `carbs_grams_scaled` = 28000000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000013' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000013', 'f1000001-0000-4000-8000-000000000013', '1 plate', 'plate', 200000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000013', 'f1000001-0000-4000-8000-000000000013', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 3500000,
    `carbs_grams_scaled` = 24000000,
    `fat_grams_scaled` = 3500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000014' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000014', 'f1000001-0000-4000-8000-000000000014', '1 plate', 'plate', 200000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000014', 'f1000001-0000-4000-8000-000000000014', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 110000000,
    `protein_grams_scaled` = 3500000,
    `carbs_grams_scaled` = 16000000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000015' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000015', 'f1000001-0000-4000-8000-000000000015', '1 bowl cooked', 'bowl', 250000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000015', 'f1000001-0000-4000-8000-000000000015', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 80000000,
    `protein_grams_scaled` = 2000000,
    `carbs_grams_scaled` = 8000000,
    `fat_grams_scaled` = 4000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000016' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000016', 'f1000001-0000-4000-8000-000000000016', '1 katori', 'katori', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000016', 'f1000001-0000-4000-8000-000000000016', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 7000000,
    `carbs_grams_scaled` = 6000000,
    `fat_grams_scaled` = 10000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000017' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000017', 'f1000001-0000-4000-8000-000000000017', '1 katori', 'katori', 180000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000017', 'f1000001-0000-4000-8000-000000000017', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 90000000,
    `protein_grams_scaled` = 2500000,
    `carbs_grams_scaled` = 8000000,
    `fat_grams_scaled` = 5000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000018' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000018', 'f1000001-0000-4000-8000-000000000018', '1 katori', 'katori', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000018', 'f1000001-0000-4000-8000-000000000018', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'raw_ingredient',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 25000000,
    `protein_grams_scaled` = 1000000,
    `carbs_grams_scaled` = 4000000,
    `fat_grams_scaled` = 0
WHERE `id` = 'f1000001-0000-4000-8000-000000000019' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000019', 'f1000001-0000-4000-8000-000000000019', '1 bowl', 'bowl', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000019', 'f1000001-0000-4000-8000-000000000019', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 90000000,
    `protein_grams_scaled` = 6000000,
    `carbs_grams_scaled` = 14000000,
    `fat_grams_scaled` = 1500000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001a' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001a', 'f1000001-0000-4000-8000-00000000001a', '1 katori', 'katori', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001a', 'f1000001-0000-4000-8000-00000000001a', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'generic_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 55000000,
    `protein_grams_scaled` = 600000,
    `carbs_grams_scaled` = 13000000,
    `fat_grams_scaled` = 200000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001b' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001b', 'f1000001-0000-4000-8000-00000000001b', '1 bowl cut', 'bowl', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001b', 'f1000001-0000-4000-8000-00000000001b', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'raw_ingredient',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 89000000,
    `protein_grams_scaled` = 1100000,
    `carbs_grams_scaled` = 23000000,
    `fat_grams_scaled` = 300000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001c' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001c', 'f1000001-0000-4000-8000-00000000001c', '1 medium', 'piece', 118000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001c', 'f1000001-0000-4000-8000-00000000001c', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'raw_ingredient',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 607000000,
    `protein_grams_scaled` = 21000000,
    `carbs_grams_scaled` = 16000000,
    `fat_grams_scaled` = 54000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001d' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001d', 'f1000001-0000-4000-8000-00000000001d', '1 small handful', 'handful', 25000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001d', 'f1000001-0000-4000-8000-00000000001d', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 180000000,
    `protein_grams_scaled` = 6000000,
    `carbs_grams_scaled` = 8000000,
    `fat_grams_scaled` = 14000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001e' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001e', 'f1000001-0000-4000-8000-00000000001e', '1 tbsp', 'tbsp', 15000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001e', 'f1000001-0000-4000-8000-00000000001e', '2 tbsp', 'tbsp', 30000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 160000000,
    `protein_grams_scaled` = 2000000,
    `carbs_grams_scaled` = 6000000,
    `fat_grams_scaled` = 14000000
WHERE `id` = 'f1000001-0000-4000-8000-00000000001f' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-00000000001f', 'f1000001-0000-4000-8000-00000000001f', '1 tbsp', 'tbsp', 15000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-00000000001f', 'f1000001-0000-4000-8000-00000000001f', '2 tbsp', 'tbsp', 30000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'branded_product',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 400000000,
    `protein_grams_scaled` = 80000000,
    `carbs_grams_scaled` = 8000000,
    `fat_grams_scaled` = 5000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000020' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000020', 'f1000001-0000-4000-8000-000000000020', '1 scoop', 'scoop', 30000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000020', 'f1000001-0000-4000-8000-000000000020', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 180000000,
    `protein_grams_scaled` = 12000000,
    `carbs_grams_scaled` = 2000000,
    `fat_grams_scaled` = 14000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000021' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000021', 'f1000001-0000-4000-8000-000000000021', '2 eggs', 'piece', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000021', 'f1000001-0000-4000-8000-000000000021', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 130000000,
    `protein_grams_scaled` = 4500000,
    `carbs_grams_scaled` = 22000000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000022' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000022', 'f1000001-0000-4000-8000-000000000022', '1.5 katori', 'katori', 250000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000022', 'f1000001-0000-4000-8000-000000000022', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_ml',
    `energy_kcal_scaled` = 30000000,
    `protein_grams_scaled` = 1200000,
    `carbs_grams_scaled` = 5000000,
    `fat_grams_scaled` = 500000
WHERE `id` = 'f1000001-0000-4000-8000-000000000023' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000023', 'f1000001-0000-4000-8000-000000000023', '1 bowl', 'bowl', 250000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000023', 'f1000001-0000-4000-8000-000000000023', '100 ml', 'ml', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 140000000,
    `protein_grams_scaled` = 18000000,
    `carbs_grams_scaled` = 3000000,
    `fat_grams_scaled` = 6000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000024' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000024', 'f1000001-0000-4000-8000-000000000024', '120 g fish', 'g', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000024', 'f1000001-0000-4000-8000-000000000024', '150 g fish', 'g', 150000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 120000000,
    `protein_grams_scaled` = 10000000,
    `carbs_grams_scaled` = 5000000,
    `fat_grams_scaled` = 7000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000025' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000025', 'f1000001-0000-4000-8000-000000000025', '100 g', 'g', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000025', 'f1000001-0000-4000-8000-000000000025', '120 g', 'g', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'generic_food',
    `nutrition_basis` = 'per_100_ml',
    `energy_kcal_scaled` = 58000000,
    `protein_grams_scaled` = 3100000,
    `carbs_grams_scaled` = 4800000,
    `fat_grams_scaled` = 3000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000026' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000026', 'f1000001-0000-4000-8000-000000000026', '1 glass', 'glass', 200000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000026', 'f1000001-0000-4000-8000-000000000026', '100 ml', 'ml', 100000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 180000000,
    `protein_grams_scaled` = 8000000,
    `carbs_grams_scaled` = 22000000,
    `fat_grams_scaled` = 7000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000027' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000027', 'f1000001-0000-4000-8000-000000000027', '1 medium', 'piece', 60000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000027', 'f1000001-0000-4000-8000-000000000027', '2 medium', 'piece', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
UPDATE `food_library_items`
SET `classification` = 'prepared_food',
    `nutrition_basis` = 'per_100_g',
    `energy_kcal_scaled` = 160000000,
    `protein_grams_scaled` = 10000000,
    `carbs_grams_scaled` = 18000000,
    `fat_grams_scaled` = 5000000
WHERE `id` = 'f1000001-0000-4000-8000-000000000028' AND `ownership` = 'global';
INSERT INTO `food_library_servings` (`id`, `food_library_item_id`, `label`, `unit`, `conversion_scaled`, `created_at`, `updated_at`)
VALUES
('b1000001-0000-4000-8000-000000000028', 'f1000001-0000-4000-8000-000000000028', '1 medium', 'piece', 60000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('c1000001-0000-4000-8000-000000000028', 'f1000001-0000-4000-8000-000000000028', '2 medium', 'piece', 120000000, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

ALTER TABLE `food_library_items` DROP COLUMN `portion_label`;
ALTER TABLE `food_library_items` DROP COLUMN `calories`;
ALTER TABLE `food_library_items` DROP COLUMN `protein_grams`;
ALTER TABLE `food_library_items` DROP COLUMN `carbs_grams`;
ALTER TABLE `food_library_items` DROP COLUMN `fat_grams`;
CREATE INDEX `food_library_status_idx` ON `food_library_items` (`status`);

