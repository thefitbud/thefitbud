import { asc, inArray } from "drizzle-orm";
import type { createDb } from "../db/client.js";
import { foodLibraryServings } from "../db/schema.js";

type Db = ReturnType<typeof createDb>;

export async function servingsByFoodId(db: Db, foodIds: string[]) {
  const grouped = new Map<
    string,
    (typeof foodLibraryServings.$inferSelect)[]
  >();
  if (foodIds.length === 0) return grouped;
  const rows = await db
    .select()
    .from(foodLibraryServings)
    .where(inArray(foodLibraryServings.foodLibraryItemId, foodIds))
    .orderBy(asc(foodLibraryServings.sortOrder), asc(foodLibraryServings.label));
  for (const row of rows) {
    const current = grouped.get(row.foodLibraryItemId) ?? [];
    current.push(row);
    grouped.set(row.foodLibraryItemId, current);
  }
  return grouped;
}
