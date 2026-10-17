PRAGMA defer_foreign_keys = true;

INSERT OR IGNORE INTO library_id_redirects (old_id, entity, new_id, reason, seed_version)
VALUES
  (
    'f1000001-0000-4000-8000-000000000002',
    'food',
    'f1000001-0000-4000-8000-000000000001',
    'dev_wipe',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-000000000005',
    'food',
    (SELECT id FROM food_library_items WHERE ownership = 'global' AND slug = 'moong-dal-dhuli' LIMIT 1),
    'dev_wipe_low_confidence',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-000000000006',
    'food',
    (SELECT id FROM food_library_items WHERE ownership = 'global' AND slug = 'moong-dal-dhuli' LIMIT 1),
    'dev_wipe_low_confidence',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-00000000000a',
    'food',
    (SELECT id FROM food_library_items WHERE ownership = 'global' AND slug = 'palak-paneer' LIMIT 1),
    'dev_wipe_low_confidence',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-000000000015',
    'food',
    (SELECT id FROM food_library_items WHERE ownership = 'global' AND slug = 'oatmeal-cooked-with-water' LIMIT 1),
    'dev_wipe_low_confidence',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-000000000016',
    'food',
    (SELECT id FROM food_library_items WHERE ownership = 'global' AND slug = 'bhindi-sabzi-dry' LIMIT 1),
    'dev_wipe_low_confidence',
    '2026.10.2'
  ),
  (
    'f1000001-0000-4000-8000-000000000025',
    'food',
    (
      SELECT id FROM food_library_items
      WHERE ownership = 'global' AND name LIKE 'Tofu%'
      ORDER BY name
      LIMIT 1
    ),
    'dev_wipe_low_confidence',
    '2026.10.2'
  );

DELETE FROM food_library_items
WHERE ownership = 'global'
  AND seed_version IS NULL;

INSERT OR IGNORE INTO library_id_redirects (old_id, entity, new_id, reason, seed_version)
SELECT
  scratch.legacy_serving_id,
  'food_serving',
  COALESCE(
    target.default_serving_id,
    (
      SELECT s.id
      FROM food_library_servings s
      WHERE s.food_library_item_id = target.id
      ORDER BY s.is_default DESC, s.sort_order
      LIMIT 1
    )
  ),
  'dev_wipe',
  '2026.10.2'
FROM library_wipe_scratch scratch
INNER JOIN food_library_items target ON target.id = COALESCE(
  (SELECT r.new_id FROM library_id_redirects r WHERE r.old_id = scratch.food_library_item_id),
  scratch.food_library_item_id
);

DROP TABLE IF EXISTS library_wipe_scratch;
