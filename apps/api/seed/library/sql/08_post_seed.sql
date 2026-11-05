-- Post-seed corrections to the locked release, loaded after 07_post_wipe_dev.sql. Not in manifest.json.

-- I2f (D18): dal-lentil-curry-generic is not Jain. Drop only the "jain" entry from its diet
-- tags and keep the rest in order. The EXISTS guard makes a second run a no-op.
UPDATE `food_library_items`
SET
  `diet_tags_json` = (
    SELECT json_group_array(t.`value`)
    FROM (SELECT `value` FROM json_each(`food_library_items`.`diet_tags_json`) ORDER BY `key`) t
    WHERE t.`value` <> 'jain'
  ),
  `updated_at` = '2026-10-31T00:00:00.000Z'
WHERE `ownership` = 'global'
  AND `slug` = 'dal-lentil-curry-generic'
  AND EXISTS (
    SELECT 1 FROM json_each(`food_library_items`.`diet_tags_json`) WHERE `value` = 'jain'
  );
