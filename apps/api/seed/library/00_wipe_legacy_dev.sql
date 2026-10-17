PRAGMA defer_foreign_keys = true;

-- Legacy global plan templates from migration 0017 (replaced by v2 seed).
DELETE FROM plan_templates
WHERE ownership = 'global'
  AND id IN (
    'a1000001-0000-4000-8000-000000000001',
    'a1000001-0000-4000-8000-000000000002',
    'a1000001-0000-4000-8000-000000000003'
  );

-- Persist legacy serving ids for post-wipe redirects (wrangler runs one file per call).
CREATE TABLE IF NOT EXISTS library_wipe_scratch (
  legacy_serving_id text PRIMARY KEY NOT NULL,
  food_library_item_id text NOT NULL
);

DELETE FROM library_wipe_scratch;

INSERT INTO library_wipe_scratch (legacy_serving_id, food_library_item_id)
SELECT s.id, s.food_library_item_id
FROM food_library_servings s
INNER JOIN food_library_items f ON f.id = s.food_library_item_id
WHERE f.ownership = 'global'
  AND s.seed_version IS NULL;

DELETE FROM food_library_servings
WHERE id IN (SELECT legacy_serving_id FROM library_wipe_scratch);
