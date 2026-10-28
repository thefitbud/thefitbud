-- 0031_library_schema.sql — lock library schema to the 2026.10.9 food seed + 2026.10.20-v2 exercise base.
-- Additive only: ADD COLUMN / new tables / indexes. No user (trainer-owned / plan / log) rows are changed,
-- except demoting duplicate is_default servings (keeps lowest sort_order) so the one-default index can be built.
-- SQLite/D1: ALTER TABLE ADD COLUMN has no IF NOT EXISTS; wrangler's d1_migrations table guarantees single apply.
-- CHECK constraints are not added via ALTER (unsupported); enums are enforced in Drizzle/zod.
PRAGMA defer_foreign_keys = true;

-- ---------- foods ----------
-- food_type: 'ingredient' | 'dish' | 'beverage' | 'packaged_or_prepared' (product: raw ingredient | dish; see notes)
-- cooking_state: 'raw' | 'cooked' | 'ready_to_eat' | 'as_purchased'           (columns already exist since 0021)
ALTER TABLE `food_library_items` ADD COLUMN `name_norm` text;                         -- lower/ascii-folded name for prefix search
ALTER TABLE `food_library_items` ADD COLUMN `main_ingredients_json` text NOT NULL DEFAULT '[]';   -- required by seed 02_foods.sql
ALTER TABLE `food_library_items` ADD COLUMN `description_provenance_json` text;        -- required by seed 02_foods.sql {source,confidence,urls,review_flag}
ALTER TABLE `food_library_items` ADD COLUMN `instructions` text;                       -- preparation steps where available
ALTER TABLE `food_library_items` ADD COLUMN `density_g_per_ml_scaled` integer;         -- x1e6; liquids (per_100_ml basis)
ALTER TABLE `food_library_items` ADD COLUMN `density_source` text;
ALTER TABLE `food_library_items` ADD COLUMN `density_assumed` integer NOT NULL DEFAULT 0;
ALTER TABLE `food_library_items` ADD COLUMN `source_reason` text;                      -- source_choice.reason (why this source/value)
ALTER TABLE `food_library_items` ADD COLUMN `source_refs_json` text NOT NULL DEFAULT '[]'; -- [{label,urls[],kcal..}] web/ref sources
ALTER TABLE `food_library_items` ADD COLUMN `review_confidence_scaled` integer;        -- review.confidence x1e6 (0.45/0.7/0.9)
ALTER TABLE `food_library_items` ADD COLUMN `low_confidence` integer NOT NULL DEFAULT 0; -- 1 when confidence < 0.8 or source is recipe-computed
ALTER TABLE `food_library_items` ADD COLUMN `review_flags_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `food_library_items` ADD COLUMN `legacy_id` text;

UPDATE `food_library_items` SET `name_norm` = lower(trim(`name`)) WHERE `name_norm` IS NULL;

CREATE INDEX IF NOT EXISTS `food_library_name_norm_idx` ON `food_library_items` (`name_norm`);
CREATE INDEX IF NOT EXISTS `food_library_type_state_idx` ON `food_library_items` (`food_type`, `cooking_state`);
CREATE INDEX IF NOT EXISTS `food_library_low_conf_idx` ON `food_library_items` (`low_confidence`) WHERE `low_confidence` = 1;

-- servings: one default serving = quantity + unit + grams/ml. `label` stays as a display string
-- (e.g. "1 katori (150 g)") but is derived, never a source-portion label.
ALTER TABLE `food_library_servings` ADD COLUMN `amount_scaled` integer;   -- grams or ml for `quantity` units, x1e6
ALTER TABLE `food_library_servings` ADD COLUMN `amount_unit` text;        -- 'g' | 'ml'
ALTER TABLE `food_library_servings` ADD COLUMN `grams_scaled` integer;    -- mass equivalent x1e6 (via density for ml)
ALTER TABLE `food_library_servings` ADD COLUMN `descriptor` text;         -- cup|glass|katori|piece|slice|tbsp...

UPDATE `food_library_servings` SET `is_default` = 0
WHERE `is_default` = 1 AND `id` NOT IN (
  SELECT s.`id` FROM `food_library_servings` s
  WHERE s.`is_default` = 1 AND s.`id` = (
    SELECT s2.`id` FROM `food_library_servings` s2
    WHERE s2.`food_library_item_id` = s.`food_library_item_id` AND s2.`is_default` = 1
    ORDER BY s2.`sort_order`, s2.`id` LIMIT 1));
CREATE UNIQUE INDEX IF NOT EXISTS `food_library_servings_one_default_uidx`
  ON `food_library_servings` (`food_library_item_id`) WHERE `is_default` = 1;

-- serving unit defaults (cup=150 ml, glass=250 ml, katori=150 g). Upsert keeps existing rows' names.
INSERT INTO `serving_units` (`code`,`name`,`kind`,`typical_grams_scaled`,`notes`) VALUES
  ('cup','Cup','household',150000000,'FitBud decision: 1 cup = 150 ml'),
  ('glass','Glass','household',250000000,'FitBud decision: 1 glass = 250 ml'),
  ('katori','Katori','household',150000000,'FitBud decision: 1 katori = 150 g/ml'),
  ('piece','Piece','count',NULL,'Food-specific grams per piece')
ON CONFLICT(`code`) DO UPDATE SET `typical_grams_scaled` = excluded.`typical_grams_scaled`, `notes` = excluded.`notes`;

-- ---------- exercises ----------
ALTER TABLE `exercise_library_items` ADD COLUMN `name_norm` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `name_source` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `description` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `description_provenance` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `youtube_search_url` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `steps_source` text;                -- free_exercise_db | wger | fitbud_written
ALTER TABLE `exercise_library_items` ADD COLUMN `steps_licence_json` text;          -- {licence,licence_url,source_url,author,modified}
ALTER TABLE `exercise_library_items` ADD COLUMN `steps_review_required` integer NOT NULL DEFAULT 0;
ALTER TABLE `exercise_library_items` ADD COLUMN `coaching_provenance` text;
ALTER TABLE `exercise_library_items` ADD COLUMN `needs_human_review` integer NOT NULL DEFAULT 0;
ALTER TABLE `exercise_library_items` ADD COLUMN `review_flags_json` text NOT NULL DEFAULT '[]';
ALTER TABLE `exercise_library_items` ADD COLUMN `origin` text;

UPDATE `exercise_library_items` SET `name_norm` = lower(trim(`name`)) WHERE `name_norm` IS NULL;
UPDATE `exercise_library_items`
   SET `youtube_search_url` = 'https://www.youtube.com/results?search_query=' || replace(trim(`name`), ' ', '+') || '+exercise+form'
 WHERE `youtube_search_url` IS NULL AND `ownership` = 'global';

CREATE INDEX IF NOT EXISTS `exercise_library_name_norm_idx` ON `exercise_library_items` (`name_norm`);
CREATE INDEX IF NOT EXISTS `exercise_library_aliases_norm_idx` ON `exercise_library_aliases` (`alias_norm`);
CREATE INDEX IF NOT EXISTS `exercise_library_equipment_code_idx` ON `exercise_library_equipment` (`equipment_code`);
CREATE INDEX IF NOT EXISTS `exercise_library_instructions_ex_idx` ON `exercise_library_instructions` (`exercise_library_item_id`, `kind`, `position`);

-- media attribution (Everkinetic CC BY-SA 4.0, Wikimedia Commons, wger)
ALTER TABLE `exercise_library_media` ADD COLUMN `source_title` text;
ALTER TABLE `exercise_library_media` ADD COLUMN `source_url` text;
ALTER TABLE `exercise_library_media` ADD COLUMN `author` text;
ALTER TABLE `exercise_library_media` ADD COLUMN `licence_url` text;
ALTER TABLE `exercise_library_media` ADD COLUMN `match_confidence` text;
ALTER TABLE `exercise_library_media` ADD COLUMN `modified` integer NOT NULL DEFAULT 0;

-- external links (YouTube search etc.) — matches exercise-base/exercise_links.csv
CREATE TABLE IF NOT EXISTS `exercise_library_links` (
  `id` text PRIMARY KEY NOT NULL,
  `exercise_library_item_id` text NOT NULL REFERENCES `exercise_library_items`(`id`) ON DELETE cascade,
  `kind` text NOT NULL,            -- 'video_search_link'
  `url` text NOT NULL,
  `label` text,
  `seed_version` text
);
CREATE UNIQUE INDEX IF NOT EXISTS `exercise_library_links_uidx` ON `exercise_library_links` (`exercise_library_item_id`, `kind`, `url`);

-- sources used by the exercise base but missing from 01_lookups.sql
INSERT OR IGNORE INTO `library_sources` (`id`,`name`,`version`,`url`,`licence`,`licence_url`,`attribution`,`notes`,`updated_at`) VALUES
  ('wger','wger Workout Manager exercise DB','2026-10','https://wger.de','CC-BY-SA-4.0','https://creativecommons.org/licenses/by-sa/4.0/','wger.de contributors, CC BY-SA 4.0',NULL,'2026-10-22T00:00:00.000Z'),
  ('wikimedia_commons','Wikimedia Commons','2026-10','https://commons.wikimedia.org','per-file','https://commons.wikimedia.org/wiki/Commons:Licensing','Per-file author/licence in exercise_library_media.attribution',NULL,'2026-10-22T00:00:00.000Z'),
  ('user_csv','FitBud curated exercise list','2026.10.20-v2','internal','proprietary',NULL,'FitBud','Steps fitbud_written; review required',  '2026-10-22T00:00:00.000Z');
