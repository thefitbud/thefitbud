-- Z8-13 QA fixture (LOCAL demo seed only, never remote).
-- The demo seed logs every set with a kg or bodyweight load, so the "sets not charted"
-- banner of frame 160e never shows. This turns Rohan Mehta's newest logged Barbell Squat
-- set and newest Seated Cable Row set into free-text loads, the way a trainee logging
-- "RPE 8" or "red band" is stored (load_kind 'text', no kg). Applied after `pnpm db:reset`:
--   cd apps/api && pnpm exec wrangler d1 execute fitbud --local --persist-to .wrangler/state \
--     --file ../../docs/qa/Z8-13/fixture-text-load-sets.sql
UPDATE set_executions
SET actual_load_label = 'RPE 8', actual_load_kg = NULL, load_kind = 'text'
WHERE id = (
  SELECT se.id
  FROM set_executions se
  JOIN exercise_executions ee ON ee.id = se.exercise_execution_id
  JOIN workout_executions we ON we.id = ee.workout_execution_id
  JOIN workout_assignments wa ON wa.id = we.assignment_id
  WHERE we.coaching_relationship_id = 'c422296e-ed7b-4196-a2b4-647096af3002'
    AND ee.name = 'Barbell Squat'
    AND se.status IN ('completed', 'modified')
  ORDER BY wa.local_date DESC, se."order" DESC
  LIMIT 1
);

UPDATE set_executions
SET actual_load_label = 'red band', actual_load_kg = NULL, load_kind = 'text'
WHERE id = (
  SELECT se.id
  FROM set_executions se
  JOIN exercise_executions ee ON ee.id = se.exercise_execution_id
  JOIN workout_executions we ON we.id = ee.workout_execution_id
  JOIN workout_assignments wa ON wa.id = we.assignment_id
  WHERE we.coaching_relationship_id = 'c422296e-ed7b-4196-a2b4-647096af3002'
    AND ee.name = 'Seated Cable Row'
    AND se.status IN ('completed', 'modified')
  ORDER BY wa.local_date DESC, se."order" DESC
  LIMIT 1
);
