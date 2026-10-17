import { sql } from "drizzle-orm";
import type { Db } from "../db/client.js";

export async function rebuildFoodSearchFts(db: Db, foodId?: string): Promise<void> {
  if (foodId) {
    await db.run(sql`DELETE FROM food_search_fts WHERE food_id = ${foodId}`);
    await db.run(sql`
      INSERT INTO food_search_fts (food_id, name, aliases, tags)
      SELECT f.id, f.name,
        COALESCE((SELECT group_concat(a.alias, ' ') FROM food_library_aliases a WHERE a.food_library_item_id = f.id), ''),
        trim(COALESCE(f.dish_category, '') || ' ' || COALESCE(f.food_group, '') || ' ' || COALESCE(f.region, '') || ' ' ||
          replace(replace(replace(COALESCE(f.diet_tags_json, ''), '[', ''), ']', ''), '"', ''))
      FROM food_library_items f
      WHERE f.status = 'active' AND f.id = ${foodId}
    `);
    return;
  }
  await db.run(sql`DELETE FROM food_search_fts`);
  await db.run(sql`
    INSERT INTO food_search_fts (food_id, name, aliases, tags)
    SELECT f.id, f.name,
      COALESCE((SELECT group_concat(a.alias, ' ') FROM food_library_aliases a WHERE a.food_library_item_id = f.id), ''),
      trim(COALESCE(f.dish_category, '') || ' ' || COALESCE(f.food_group, '') || ' ' || COALESCE(f.region, '') || ' ' ||
        replace(replace(replace(COALESCE(f.diet_tags_json, ''), '[', ''), ']', ''), '"', ''))
    FROM food_library_items f WHERE f.status = 'active'
  `);
}

export async function rebuildExerciseSearchFts(
  db: Db,
  exerciseId?: string,
): Promise<void> {
  if (exerciseId) {
    await db.run(sql`DELETE FROM exercise_search_fts WHERE exercise_id = ${exerciseId}`);
    await db.run(sql`
      INSERT INTO exercise_search_fts (exercise_id, name, aliases, tags)
      SELECT e.id, e.name,
        COALESCE((SELECT group_concat(a.alias, ' ') FROM exercise_library_aliases a WHERE a.exercise_library_item_id = e.id), ''),
        trim(COALESCE(e.movement_pattern_code, '') || ' ' || COALESCE(e.setting, '') || ' ' ||
          COALESCE((SELECT group_concat(m.muscle_code, ' ') FROM exercise_library_muscles m WHERE m.exercise_library_item_id = e.id), '') || ' ' ||
          COALESCE((SELECT group_concat(q.equipment_code, ' ') FROM exercise_library_equipment q WHERE q.exercise_library_item_id = e.id), ''))
      FROM exercise_library_items e
      WHERE e.status = 'active' AND e.id = ${exerciseId}
    `);
    return;
  }
  await db.run(sql`DELETE FROM exercise_search_fts`);
  await db.run(sql`
    INSERT INTO exercise_search_fts (exercise_id, name, aliases, tags)
    SELECT e.id, e.name,
      COALESCE((SELECT group_concat(a.alias, ' ') FROM exercise_library_aliases a WHERE a.exercise_library_item_id = e.id), ''),
      trim(COALESCE(e.movement_pattern_code, '') || ' ' || COALESCE(e.setting, '') || ' ' ||
        COALESCE((SELECT group_concat(m.muscle_code, ' ') FROM exercise_library_muscles m WHERE m.exercise_library_item_id = e.id), '') || ' ' ||
        COALESCE((SELECT group_concat(q.equipment_code, ' ') FROM exercise_library_equipment q WHERE q.exercise_library_item_id = e.id), ''))
    FROM exercise_library_items e WHERE e.status = 'active'
  `);
}
