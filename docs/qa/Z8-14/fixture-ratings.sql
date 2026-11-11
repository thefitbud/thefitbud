-- Z8-14 QA fixture (LOCAL demo seed only, never remote).
-- The demo seed pins every submitted check-in to forms without standard question keys,
-- so no client has 1 to 5 ratings on the Progress chart and the ratings compare state
-- (weight compared with a rating, frame 160d) never shows. This repins Siddharth Jain's
-- submitted check-ins to the global v2 form (keyed questions, migration 0041); his
-- stored answers already use the v2 ids `energy` and `stress`, so those two chart.
-- Applied after `pnpm db:reset`:
--   cd apps/api && pnpm exec wrangler d1 execute fitbud --local --persist-to .wrangler/state \
--     --file ../../docs/qa/Z8-14/fixture-ratings.sql
UPDATE checkins
SET checkin_form_version_id = 'c1000001-0000-4000-8000-000000000012'
WHERE coaching_relationship_id = '8f0e3518-8945-4289-83ec-782cabefdcb5'
  AND record_status = 'submitted';
