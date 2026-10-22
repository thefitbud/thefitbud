import { and, desc, eq } from "drizzle-orm";
import { planContentSchema } from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import type { Db } from "../db/client.js";
import { mealTimeOverrides, planVersions, plans } from "../db/schema.js";

export type MergedMealSlot = {
  slotKey: string;
  label: string;
  planTime: string;
  overrideTime: string | null;
  dayPattern: "all" | "weekdays" | "weekends" | null;
};

function slotKeyForMeal(meal: { mealType?: string | null; name: string }): string {
  if (meal.mealType) return meal.mealType;
  return meal.name.trim().toLowerCase().replace(/\s+/g, "-");
}

function displayLabel(name: string, slotKey: string): string {
  const trimmed = name.trim();
  if (trimmed) return trimmed;
  return labelFor("meal_type", slotKey);
}

/**
 * Plan meal slots merged with trainee overrides.
 * Slot keys follow meal type so overrides survive a new plan version.
 */
export async function listMergedMealTimeSlots(
  db: Db,
  relationshipId: string,
): Promise<{ slots: MergedMealSlot[]; mealTimesNeedReview: boolean }> {
  const [effective] = await db
    .select({ contentJson: planVersions.contentJson })
    .from(plans)
    .innerJoin(planVersions, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "effective"),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
    .limit(1);

  const overrides = await db
    .select()
    .from(mealTimeOverrides)
    .where(eq(mealTimeOverrides.relationshipId, relationshipId));

  const overrideFor = (slotKey: string) => {
    const rows = overrides.filter((row) => row.slotKey === slotKey);
    return rows.find((row) => row.dayPattern === "all") ?? rows[0] ?? null;
  };

  let prescriptions: Array<{
    slotKey: string;
    label: string;
    planTime: string;
    order: number;
  }> = [];

  if (effective) {
    const parsed = planContentSchema.safeParse(JSON.parse(effective.contentJson));
    if (parsed.success) {
      prescriptions = parsed.data.mealPrescriptions
        .map((meal) => ({
          slotKey: slotKeyForMeal(meal),
          label: displayLabel(meal.name, slotKeyForMeal(meal)),
          planTime: meal.localTime ?? "08:00",
          order: meal.order,
        }))
        .sort((a, b) => a.order - b.order);
    }
  }

  if (prescriptions.length === 0) {
    return {
      mealTimesNeedReview: false,
      slots: overrides.map((row) => ({
        slotKey: row.slotKey,
        label: labelFor("meal_type", row.slotKey),
        planTime: row.time,
        overrideTime: null,
        dayPattern: row.dayPattern,
      })),
    };
  }

  const known = new Set(prescriptions.map((meal) => meal.slotKey));
  const dropped = overrides.some((row) => !known.has(row.slotKey));
  return {
    mealTimesNeedReview: dropped,
    slots: prescriptions.map((meal) => {
      const override = overrideFor(meal.slotKey);
      const changed = override != null && override.time !== meal.planTime;
      return {
        slotKey: meal.slotKey,
        label: meal.label,
        planTime: meal.planTime,
        overrideTime: changed ? override.time : null,
        dayPattern: override?.dayPattern ?? null,
      };
    }),
  };
}
