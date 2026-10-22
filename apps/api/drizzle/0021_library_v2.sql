-- 0021_library_v2.sql — FitBud food & exercise library v2 (reference data + search).
-- Additive only: extends the existing tables from 0011/0015/0016 in place (so ids, ownership,
-- trainer-owned rows and snapshot code keep working) and adds normalised child tables.
-- D1-safe: no BEGIN/COMMIT, no PRAGMA foreign_keys (wrangler runs each file atomically).
-- Nutrient convention follows 0016: integers scaled x1,000,000 (*_scaled), basis per_100_g / per_100_ml.

-- ---------------------------------------------------------------- provenance
CREATE TABLE IF NOT EXISTS `library_sources` (
  `id` text PRIMARY KEY NOT NULL,              -- 'indb', 'usda_fdc_sr_legacy', 'usda_fdc_foundation', 'free_exercise_db', 'everkinetic', 'fitbud'
  `name` text NOT NULL,
  `version` text NOT NULL,                     -- commit sha or release date
  `url` text NOT NULL,
  `licence` text NOT NULL,                     -- SPDX where possible
  `licence_url` text,
  `attribution` text NOT NULL,                 -- text shown in-app / ATTRIBUTION.md
  `checksum_sha256` text,
  `notes` text,
  `updated_at` text NOT NULL
);
CREATE TABLE IF NOT EXISTS `library_seed_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `version` text NOT NULL UNIQUE,              -- e.g. 2026.10.0
  `content_sha256` text NOT NULL,
  `food_count` integer NOT NULL,
  `exercise_count` integer NOT NULL,
  `template_count` integer NOT NULL,
  `applied_at` text NOT NULL,
  `notes` text
);
-- Old id -> surviving id (merged duplicates, retired legacy rows). Plan snapshots keep old ids; the API resolves through this.
CREATE TABLE IF NOT EXISTS `library_id_redirects` (
  `old_id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('food', 'exercise', 'food_serving')),
  `new_id` text NOT NULL,
  `reason` text NOT NULL,
  `seed_version` text NOT NULL
);

-- ---------------------------------------------------------------- nutrients
CREATE TABLE IF NOT EXISTS `nutrients` (
  `code` text PRIMARY KEY NOT NULL,            -- 'protein_g', 'iron_mg' ...
  `name` text NOT NULL,
  `unit` text NOT NULL CHECK (`unit` IN ('kcal', 'g', 'mg', 'ug')),
  `category` text NOT NULL,                    -- energy | macro | fat | mineral | vitamin | other
  `is_core` integer NOT NULL DEFAULT 0,        -- also stored as a column on food_library_items
  `usda_nutrient_ids` text,                    -- JSON array of FDC nutrient ids used
  `sort_order` integer NOT NULL
);

-- ---------------------------------------------------------------- foods (extend 0011/0016)
ALTER TABLE `food_library_items` ADD COLUMN `slug` text;
ALTER TABLE `food_library_items` ADD COLUMN `food_type` text;          -- ingredient | dish | beverage | supplement
ALTER TABLE `food_library_items` ADD COLUMN `food_group` text;         -- cereals_grains, pulses_legumes, ... mixed_dishes
ALTER TABLE `food_library_items` ADD COLUMN `dish_category` text;      -- bread, dal_legume, curry_veg ... (dishes only)
ALTER TABLE `food_library_items` ADD COLUMN `cuisine` text;            -- indian | indian_pantry | global
ALTER TABLE `food_library_items` ADD COLUMN `region` text;             -- north_indian | south_indian | ... | NULL
ALTER TABLE `food_library_items` ADD COLUMN `cooking_state` text;      -- raw | cooked | ready_to_eat
ALTER TABLE `food_library_items` ADD COLUMN `cooking_method` text;
ALTER TABLE `food_library_items` ADD COLUMN `diet_tags_json` text NOT NULL DEFAULT '[]';   -- vegetarian, vegan, jain, eggetarian, non_veg
ALTER TABLE `food_library_items` ADD COLUMN `meal_types_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `food_library_items` ADD COLUMN `carbs_available_grams_scaled` integer;          -- INDB 'available' carbohydrate
ALTER TABLE `food_library_items` ADD COLUMN `fibre_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `sugars_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `sat_fat_grams_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `sodium_mg_scaled` integer;
ALTER TABLE `food_library_items` ADD COLUMN `source_id` text REFERENCES `library_sources`(`id`);
ALTER TABLE `food_library_items` ADD COLUMN `source_ref` text;         -- INDB food_code / FDC id
ALTER TABLE `food_library_items` ADD COLUMN `source_name` text;        -- verbatim source name
ALTER TABLE `food_library_items` ADD COLUMN `default_serving_id` text;
ALTER TABLE `food_library_items` ADD COLUMN `review_status` text;      -- approve | approve_with_flags | needs_human | human_approved
ALTER TABLE `food_library_items` ADD COLUMN `seed_version` text;       -- NULL for trainer-created rows
CREATE UNIQUE INDEX IF NOT EXISTS `food_library_global_slug_uidx` ON `food_library_items` (`slug`) WHERE `ownership` = 'global';
CREATE INDEX IF NOT EXISTS `food_library_group_idx` ON `food_library_items` (`food_group`, `dish_category`);
CREATE INDEX IF NOT EXISTS `food_library_source_idx` ON `food_library_items` (`source_id`, `source_ref`);

CREATE TABLE IF NOT EXISTS `food_library_nutrients` (    -- long table: absent row = not reported by the source (never 0)
  `food_library_item_id` text NOT NULL REFERENCES `food_library_items`(`id`) ON DELETE CASCADE,
  `nutrient_code` text NOT NULL REFERENCES `nutrients`(`code`),
  `amount_scaled` integer NOT NULL,
  `provenance` text NOT NULL,                  -- 'source:indb', 'usda:SR Legacy:171287:1003', 'derived:zero_animal_or_pure_fat', 'derived:avail+fibre'
  PRIMARY KEY (`food_library_item_id`, `nutrient_code`)
);
CREATE TABLE IF NOT EXISTS `serving_units` (
  `code` text PRIMARY KEY NOT NULL,            -- g, ml, katori, bowl, plate, glass, cup, tsp, tbsp, piece, handful ...
  `name` text NOT NULL,
  `kind` text NOT NULL CHECK (`kind` IN ('mass', 'volume', 'household', 'count')),
  `typical_grams_scaled` integer,              -- guidance only; per-food grams live on food_library_servings
  `notes` text
);
ALTER TABLE `food_library_servings` ADD COLUMN `quantity_scaled` integer NOT NULL DEFAULT 1000000;
ALTER TABLE `food_library_servings` ADD COLUMN `is_default` integer NOT NULL DEFAULT 0;
ALTER TABLE `food_library_servings` ADD COLUMN `provenance` text;      -- source:indb_serving_size | source:usda_portion | ai_derived:household_convention | standard
ALTER TABLE `food_library_servings` ADD COLUMN `plausible` integer NOT NULL DEFAULT 1;
ALTER TABLE `food_library_servings` ADD COLUMN `sort_order` integer NOT NULL DEFAULT 0;
ALTER TABLE `food_library_servings` ADD COLUMN `seed_version` text;
-- existing columns kept: label, unit (-> serving_units.code), conversion_scaled (= grams for `quantity` units)

CREATE TABLE IF NOT EXISTS `food_library_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `food_library_item_id` text NOT NULL REFERENCES `food_library_items`(`id`) ON DELETE CASCADE,
  `alias` text NOT NULL,
  `alias_norm` text NOT NULL,                  -- lowercase/ascii-folded for Latin; NFC for Indic scripts
  `lang` text NOT NULL,                        -- BCP-47: en, hi-Deva, hi-Latn, te-Telu, te-Latn
  `provenance` text NOT NULL,                  -- source | ai_derived:lexicon | ai_review:previous_name | merged_duplicate | human
  `confidence` text NOT NULL CHECK (`confidence` IN ('high', 'medium', 'low')),
  `seed_version` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `food_library_aliases_uidx` ON `food_library_aliases` (`food_library_item_id`, `lang`, `alias_norm`);
CREATE INDEX IF NOT EXISTS `food_library_aliases_norm_idx` ON `food_library_aliases` (`alias_norm`);

CREATE TABLE IF NOT EXISTS `food_library_recipe_ingredients` (   -- source recipe (INDB) for dishes; informational + diet-tag provenance
  `id` text PRIMARY KEY NOT NULL,
  `food_library_item_id` text NOT NULL REFERENCES `food_library_items`(`id`) ON DELETE CASCADE,
  `position` integer NOT NULL,
  `ingredient_name` text NOT NULL,
  `source_ingredient_name` text,
  `amount_scaled` integer,
  `unit` text,
  `source_food_code` text,                     -- IFCT/UK/US code as listed by INDB
  `ingredient_food_id` text REFERENCES `food_library_items`(`id`),   -- optional link to a library ingredient
  UNIQUE (`food_library_item_id`, `position`)
);

-- ---------------------------------------------------------------- exercise lookups
CREATE TABLE IF NOT EXISTS `muscles` (`code` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `region` text NOT NULL, `sort_order` integer NOT NULL);
CREATE TABLE IF NOT EXISTS `equipment` (`code` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `home_friendly` integer NOT NULL DEFAULT 0, `sort_order` integer NOT NULL);
CREATE TABLE IF NOT EXISTS `movement_patterns` (`code` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `sort_order` integer NOT NULL);
CREATE TABLE IF NOT EXISTS `exercise_categories` (`code` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `sort_order` integer NOT NULL);
CREATE TABLE IF NOT EXISTS `logging_types` (`code` text PRIMARY KEY NOT NULL, `name` text NOT NULL, `fields_json` text NOT NULL);

-- ---------------------------------------------------------------- exercises (extend 0011/0015/0016)
ALTER TABLE `exercise_library_items` ADD COLUMN `slug` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `category_code` text REFERENCES `exercise_categories`(`code`);
ALTER TABLE `exercise_library_items` ADD COLUMN `movement_pattern_code` text REFERENCES `movement_patterns`(`code`);
ALTER TABLE `exercise_library_items` ADD COLUMN `logging_type_code` text REFERENCES `logging_types`(`code`);
ALTER TABLE `exercise_library_items` ADD COLUMN `setting` text;         -- gym | home | both | cardio | mobility
ALTER TABLE `exercise_library_items` ADD COLUMN `mechanic` text;        -- compound | isolation
ALTER TABLE `exercise_library_items` ADD COLUMN `force` text;           -- push | pull | static
ALTER TABLE `exercise_library_items` ADD COLUMN `laterality` text;      -- bilateral | unilateral | alternating
ALTER TABLE `exercise_library_items` ADD COLUMN `safety_note` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `source_id` text REFERENCES `library_sources`(`id`);
ALTER TABLE `exercise_library_items` ADD COLUMN `source_ref` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `source_name` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `review_status` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `seed_version` text;
-- existing JSON columns (primary/secondary_muscles_json, equipment_json, instructions) are kept in sync by the seed for old readers.
CREATE UNIQUE INDEX IF NOT EXISTS `exercise_library_global_slug_uidx` ON `exercise_library_items` (`slug`) WHERE `ownership` = 'global';
CREATE INDEX IF NOT EXISTS `exercise_library_pattern_idx` ON `exercise_library_items` (`movement_pattern_code`, `setting`);

CREATE TABLE IF NOT EXISTS `exercise_library_muscles` (
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `muscle_code` text NOT NULL REFERENCES `muscles`(`code`),
  `role` text NOT NULL CHECK (`role` IN ('primary', 'secondary')),
  PRIMARY KEY (`exercise_library_item_id`, `muscle_code`)
);
CREATE INDEX IF NOT EXISTS `exercise_library_muscles_muscle_idx` ON `exercise_library_muscles` (`muscle_code`, `role`);
CREATE TABLE IF NOT EXISTS `exercise_library_equipment` (
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `equipment_code` text NOT NULL REFERENCES `equipment`(`code`),
  PRIMARY KEY (`exercise_library_item_id`, `equipment_code`)
);
CREATE TABLE IF NOT EXISTS `exercise_library_aliases` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `alias` text NOT NULL, `alias_norm` text NOT NULL, `lang` text NOT NULL,
  `provenance` text NOT NULL, `confidence` text NOT NULL CHECK (`confidence` IN ('high', 'medium', 'low')), `seed_version` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `exercise_library_aliases_uidx` ON `exercise_library_aliases` (`exercise_library_item_id`, `lang`, `alias_norm`);
CREATE TABLE IF NOT EXISTS `exercise_library_instructions` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL CHECK (`kind` IN ('step', 'cue', 'mistake')),
  `position` integer NOT NULL,
  `text` text NOT NULL,
  `lang` text NOT NULL DEFAULT 'en',
  `provenance` text NOT NULL,                  -- source:free_exercise_db | ai_authored:pattern | ai_authored:specific | human
  UNIQUE (`exercise_library_item_id`, `kind`, `lang`, `position`)
);
CREATE TABLE IF NOT EXISTS `exercise_library_relations` (
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `related_exercise_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL CHECK (`kind` IN ('alternative', 'home_alternative', 'gym_alternative', 'progression', 'regression')),
  `method` text NOT NULL,                      -- curated_chain | rule:* | human
  `confidence` text NOT NULL,
  PRIMARY KEY (`exercise_library_item_id`, `related_exercise_id`, `kind`)
);
CREATE TABLE IF NOT EXISTS `exercise_library_media` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE CASCADE,
  `kind` text NOT NULL CHECK (`kind` IN ('illustration', 'photo', 'video')),
  `frame` text,                                -- start | end
  `storage_key` text NOT NULL,                 -- R2 key, e.g. library/exercises/everkinetic/0042-relaxation.png
  `source_id` text NOT NULL REFERENCES `library_sources`(`id`),
  `source_ref` text,
  `licence` text NOT NULL,
  `attribution` text NOT NULL,
  `sort_order` integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS `exercise_library_media_ex_idx` ON `exercise_library_media` (`exercise_library_item_id`, `sort_order`);

-- ---------------------------------------------------------------- full-text search (FTS5; module name must be lowercase on D1)
-- Contentless-style standalone tables rebuilt by the seed (and by app code when trainer rows change).
-- tokenchars = every Devanagari + Telugu combining mark (Mn/Mc, U+0900-097F, U+0C00-0C7F). Without it unicode61 splits words at
-- vowel signs/virama, so 'रोटी' would match 'प्रोटीन'. Verify on D1 (local + remote) before release.
-- NOTE: `wrangler d1 export` cannot export virtual tables; drop/recreate around exports (see MIGRATION_PLAN.md).
CREATE VIRTUAL TABLE IF NOT EXISTS `food_search_fts` USING fts5(
  `food_id` UNINDEXED, `name`, `aliases`, `tags`,
  tokenize = "unicode61 remove_diacritics 2 tokenchars 'ऀँंःऺऻ़ािीुूृॄॅॆेैॉॊोौ्ॎॏ॒॑॓॔ॕॖॗॢॣఀఁంఃఄ఼ాిీుూృౄెేైొోౌ్ౕౖౢౣ'", prefix = '2 3'
);
CREATE VIRTUAL TABLE IF NOT EXISTS `exercise_search_fts` USING fts5(
  `exercise_id` UNINDEXED, `name`, `aliases`, `tags`,
  tokenize = "unicode61 remove_diacritics 2 tokenchars 'ऀँंःऺऻ़ािीुूृॄॅॆेैॉॊोौ्ॎॏ॒॑॓॔ॕॖॗॢॣఀఁంఃఄ఼ాిీుూృౄెేైొోౌ్ౕౖౢౣ'", prefix = '2 3'
);
