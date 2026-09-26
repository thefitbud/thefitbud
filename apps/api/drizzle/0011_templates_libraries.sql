-- Migration: trainer plan templates + exercise/food libraries (copy-sources)
CREATE TABLE `plan_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`trainer_user_id` text NOT NULL,
	`title` text NOT NULL,
	`template_type` text NOT NULL,
	`content_json` text NOT NULL,
	`record_version` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `plan_templates_trainer_idx` ON `plan_templates` (`trainer_user_id`);
CREATE INDEX `plan_templates_trainer_updated_idx` ON `plan_templates` (`trainer_user_id`, `updated_at`);

CREATE TABLE `exercise_library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ownership` text NOT NULL,
	`trainer_user_id` text,
	`name` text NOT NULL,
	`instructions` text,
	`default_load_label` text,
	`default_reps` integer,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `exercise_library_ownership_idx` ON `exercise_library_items` (`ownership`);
CREATE INDEX `exercise_library_trainer_idx` ON `exercise_library_items` (`trainer_user_id`);

CREATE TABLE `food_library_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ownership` text NOT NULL,
	`trainer_user_id` text,
	`name` text NOT NULL,
	`cuisine_region` text NOT NULL,
	`portion_label` text NOT NULL,
	`notes` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`trainer_user_id`) REFERENCES `users`(`id`)
);
CREATE INDEX `food_library_ownership_idx` ON `food_library_items` (`ownership`);
CREATE INDEX `food_library_cuisine_idx` ON `food_library_items` (`cuisine_region`);
CREATE INDEX `food_library_trainer_idx` ON `food_library_items` (`trainer_user_id`);

-- Practical MVP exercise seed (global curated)
INSERT INTO `exercise_library_items` (`id`, `ownership`, `trainer_user_id`, `name`, `instructions`, `default_load_label`, `default_reps`, `created_at`, `updated_at`) VALUES
('e1000001-0000-4000-8000-000000000001', 'global', NULL, 'Back Squat', 'Depth to parallel; brace core.', 'RPE 7', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000002', 'global', NULL, 'Front Squat', 'Elbows high; upright torso.', 'RPE 7', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000003', 'global', NULL, 'Romanian Deadlift', 'Hinge; soft knees; bar close to legs.', 'RPE 7', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000004', 'global', NULL, 'Conventional Deadlift', 'Neutral spine; drive floor away.', 'RPE 7', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000005', 'global', NULL, 'Bench Press', 'Touch chest; controlled tempo.', 'RPE 7', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000006', 'global', NULL, 'Incline Dumbbell Press', '30–45° bench; full range.', 'RPE 7', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000007', 'global', NULL, 'Push-up', 'Body line straight; chest to floor.', NULL, 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000008', 'global', NULL, 'Overhead Press', 'Brace; press overhead without leaning.', 'RPE 7', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000009', 'global', NULL, 'Dumbbell Shoulder Press', 'Seated or standing; controlled path.', 'RPE 7', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000a', 'global', NULL, 'Lateral Raise', 'Slight elbow bend; stop at shoulder height.', 'Light', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000b', 'global', NULL, 'Pull-up', 'Full hang to chin over bar.', 'Bodyweight', 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000c', 'global', NULL, 'Lat Pulldown', 'Pull to upper chest; control return.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000d', 'global', NULL, 'Seated Cable Row', 'Squeeze scapulae; avoid shrugging.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000e', 'global', NULL, 'Barbell Row', 'Hinge torso; pull to lower ribs.', 'RPE 7', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000000f', 'global', NULL, 'Dumbbell Row', 'One-arm; support on bench.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000010', 'global', NULL, 'Face Pull', 'Pull to face; external rotate.', 'Light', 15, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000011', 'global', NULL, 'Barbell Curl', 'Elbows fixed; no swing.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000012', 'global', NULL, 'Triceps Pushdown', 'Elbows tucked; full extension.', 'RPE 7', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000013', 'global', NULL, 'Skull Crusher', 'Lower to forehead; elbows stable.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000014', 'global', NULL, 'Walking Lunge', 'Long stride; knee tracks toes.', 'Dumbbells', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000015', 'global', NULL, 'Bulgarian Split Squat', 'Rear foot elevated; upright torso.', 'Dumbbells', 8, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000016', 'global', NULL, 'Leg Press', 'Full range without lumbar rounding.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000017', 'global', NULL, 'Leg Curl', 'Control both phases.', 'RPE 7', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000018', 'global', NULL, 'Leg Extension', 'Smooth extension; avoid locking hard.', 'RPE 7', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000019', 'global', NULL, 'Calf Raise', 'Full stretch and pause at top.', NULL, 15, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001a', 'global', NULL, 'Hip Thrust', 'Chin tucked; full hip extension.', 'RPE 7', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001b', 'global', NULL, 'Plank', 'Hold straight line; breathe.', 'Hold', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001c', 'global', NULL, 'Dead Bug', 'Opposite arm/leg; low back down.', NULL, 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001d', 'global', NULL, 'Bird Dog', 'Reach opposite limbs; stable hips.', NULL, 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001e', 'global', NULL, 'Farmer Carry', 'Tall posture; short controlled steps.', 'Heavy', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-00000000001f', 'global', NULL, 'Kettlebell Swing', 'Hinge; snap hips; arms relaxed.', 'Kettlebell', 15, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000020', 'global', NULL, 'Goblet Squat', 'Elbows inside knees; upright chest.', 'Dumbbell', 10, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000021', 'global', NULL, 'Dumbbell Fly', 'Slight elbow bend; stretch carefully.', 'Light', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000022', 'global', NULL, 'Cable Fly', 'Hug motion; soft elbows.', 'Light', 12, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000023', 'global', NULL, 'Treadmill Walk', 'Brisk pace; upright posture.', 'Steady', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('e1000001-0000-4000-8000-000000000024', 'global', NULL, 'Stationary Bike', 'Steady cadence; controlled resistance.', 'Steady', NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');

-- Practical MVP Indian food seed (household portions)
INSERT INTO `food_library_items` (`id`, `ownership`, `trainer_user_id`, `name`, `cuisine_region`, `portion_label`, `notes`, `created_at`, `updated_at`) VALUES
('f1000001-0000-4000-8000-000000000001', 'global', NULL, 'Roti / Chapati', 'indian', '1 medium (approx 30–40g atta)', 'Whole wheat preferred.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000002', 'global', NULL, 'Phulka', 'indian', '1 piece', 'Light oil optional.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000003', 'global', NULL, 'Steamed Rice', 'indian', '1 katori cooked (approx 150g)', 'Prefer brown or hand-pounded if available.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000004', 'global', NULL, 'Jeera Rice', 'indian', '1 katori cooked', 'Moderate oil/ghee.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000005', 'global', NULL, 'Dal Tadka', 'indian', '1 katori', 'Moong/toor; light tadka.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000006', 'global', NULL, 'Dal Fry', 'indian', '1 katori', 'Pair with roti or rice.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000007', 'global', NULL, 'Sambar', 'indian', '1 katori', 'Vegetable-forward.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000008', 'global', NULL, 'Rajma', 'indian', '1 katori', 'With rice; control oil.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000009', 'global', NULL, 'Chole', 'indian', '1 katori', 'Prefer home-cooked over fried.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000a', 'global', NULL, 'Paneer Bhurji', 'indian', '100g paneer', 'Minimal oil; add veggies.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000b', 'global', NULL, 'Paneer Tikka (grilled)', 'indian', '100–120g', 'Prefer grilled over creamy gravies.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000c', 'global', NULL, 'Chicken Curry (home)', 'indian', '120–150g cooked chicken', 'Skim excess oil from gravy.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000d', 'global', NULL, 'Egg Bhurji', 'indian', '2 eggs', 'Onion/tomato base; light oil.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000e', 'global', NULL, 'Boiled Eggs', 'indian', '2 eggs', 'Salt/pepper to taste.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000000f', 'global', NULL, 'Curd / Dahi', 'indian', '1 katori (100–150g)', 'Prefer plain unsweetened.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000010', 'global', NULL, 'Buttermilk / Chaas', 'indian', '1 glass (200–250ml)', 'Low salt; no fresh cream.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000011', 'global', NULL, 'Idli', 'indian', '2–3 pieces', 'With sambar/chutney.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000012', 'global', NULL, 'Dosa (plain)', 'indian', '1 medium', 'Prefer less oil on tawa.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000013', 'global', NULL, 'Poha', 'indian', '1 plate (approx 1.5 katori)', 'Add peanuts/veggies.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000014', 'global', NULL, 'Upma', 'indian', '1 plate', 'Vegetable-heavy.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000015', 'global', NULL, 'Oats (savory)', 'indian', '1 bowl cooked', 'Milk or water; add veggies optional.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000016', 'global', NULL, 'Vegetable Sabzi', 'indian', '1–1.5 katori', 'Seasonal mix; light oil.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000017', 'global', NULL, 'Palak Paneer (light)', 'indian', '1 katori', 'Prefer less cream.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000018', 'global', NULL, 'Bhindi Sabzi', 'indian', '1 katori', 'Avoid deep-fried versions.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000019', 'global', NULL, 'Salad (kheera-tamatar)', 'indian', '1 bowl', 'Lemon + spice; no creamy dressing.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001a', 'global', NULL, 'Sprouts Chaat', 'indian', '1 katori', 'Minimal sev/chutney.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001b', 'global', NULL, 'Fruit Bowl', 'indian', '1 medium fruit or 1 bowl cut', 'Seasonal; no syrup.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001c', 'global', NULL, 'Banana', 'indian', '1 medium', 'Good post-workout carb.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001d', 'global', NULL, 'Handful of Nuts', 'indian', '1 small handful (approx 20–25g)', 'Almonds/walnuts; unsalted.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001e', 'global', NULL, 'Peanut Chutney', 'indian', '1–2 tbsp', 'Use sparingly.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-00000000001f', 'global', NULL, 'Coconut Chutney', 'indian', '1–2 tbsp', 'Pair with idli/dosa.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000020', 'global', NULL, 'Whey Protein Shake', 'indian', '1 scoop + water/milk', 'As prescribed by trainer.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000021', 'global', NULL, 'Masala Omelette', 'indian', '2 eggs', 'Veggies; light oil pan.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000022', 'global', NULL, 'Khichdi', 'indian', '1.5 katori', 'Moong + rice; light ghee.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000023', 'global', NULL, 'Vegetable Soup', 'indian', '1 bowl', 'Clear or lightly blended.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000024', 'global', NULL, 'Fish Curry (home)', 'indian', '120–150g fish', 'Prefer non-fried preparations.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000025', 'global', NULL, 'Tofu Stir-fry', 'indian', '100–120g', 'Indian-Chinese style ok with less oil.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000026', 'global', NULL, 'Milk (toned)', 'indian', '1 glass (200ml)', 'Prefer toned/skim as configured.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000027', 'global', NULL, 'Besan Chilla', 'indian', '1–2 medium', 'Veg-loaded; light oil.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
('f1000001-0000-4000-8000-000000000028', 'global', NULL, 'Moong Dal Chilla', 'indian', '1–2 medium', 'Protein-forward breakfast.', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
