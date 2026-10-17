import type { FoodLibraryServing } from "@fitbud/contracts";
import seed from "./foodServingsSeed.json";

type SeedRow = {
  id: string;
  label: string;
  unit: string;
  conversionScaled: number;
};

const byFoodId = seed as Record<string, SeedRow[]>;

/** v2 library servings extracted from API seed (`02_foods.sql`). */
export function servingsFromLibrarySeed(foodId: string): FoodLibraryServing[] {
  const rows = byFoodId[foodId];
  if (!rows?.length) return [];
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    unit: row.unit,
    conversionScaled: row.conversionScaled,
  }));
}
