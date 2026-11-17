import type { MealAssignment, MeDayResponse } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { dayMacrosFromScaledItems, unscaleNutrient } from "@fitbud/core";
import type { RingDatum } from "@fitbud/ui-mobile";

type MacroTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknown: boolean;
};

export function nutrientsFromMealPrescription(meal: MealAssignment): MacroTotals {
  const items = meal.prescription.items.map((item) =>
    "calculated" in item && item.calculated ? item.calculated : null,
  );
  const totals = dayMacrosFromScaledItems(items);
  return {
    kcal: totals.kcal,
    protein: totals.proteinG,
    carbs: totals.carbsG,
    fat: totals.fatG,
    unknown: totals.unknown,
  };
}

/** Meal counts as logged for "N of M meals" (matches trainer activityUtils). */
export function isMealLoggedForCount(status: MealAssignment["status"]): boolean {
  return (
    status === "confirmed" ||
    status === "modified" ||
    status === "logged_later" ||
    status === "skipped"
  );
}

/**
 * Macros contributed by one meal toward day rings.
 * - confirmed / logged_later → plan prescription values
 * - modified → compliance loggedTotals / loggedItems (actual foods)
 * - skipped → nothing (0)
 * - pending / overdue → nothing
 */
export function loggedMacrosForMeal(meal: MealAssignment): MacroTotals {
  if (meal.status === "skipped") {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0, unknown: false };
  }
  if (meal.status === "pending" || meal.status === "overdue") {
    return { kcal: 0, protein: 0, carbs: 0, fat: 0, unknown: false };
  }

  if (meal.status === "modified") {
    const totals = meal.compliance?.loggedTotals;
    if (totals) {
      const unknown =
        totals.energyKcal == null ||
        totals.proteinG == null ||
        totals.carbsG == null ||
        totals.fatG == null;
      return {
        kcal: Math.round(totals.energyKcal ?? 0),
        protein: Math.round(totals.proteinG ?? 0),
        carbs: Math.round(totals.carbsG ?? 0),
        fat: Math.round(totals.fatG ?? 0),
        unknown,
      };
    }
    const items = meal.compliance?.loggedItems ?? [];
    if (items.length > 0) {
      // Sum display units then round once via scaled path for consistency.
      const scaled = items.map((item) => ({
        energyKcalScaled:
          item.energyKcal != null ? Math.round(item.energyKcal * NUTRIENT_SCALE) : null,
        proteinScaled:
          item.proteinG != null ? Math.round(item.proteinG * NUTRIENT_SCALE) : null,
        carbsScaled:
          item.carbsG != null ? Math.round(item.carbsG * NUTRIENT_SCALE) : null,
        fatScaled: item.fatG != null ? Math.round(item.fatG * NUTRIENT_SCALE) : null,
        partial:
          item.energyKcal == null ||
          item.proteinG == null ||
          item.carbsG == null ||
          item.fatG == null,
      }));
      const day = dayMacrosFromScaledItems(scaled);
      return {
        kcal: day.kcal,
        protein: day.proteinG,
        carbs: day.carbsG,
        fat: day.fatG,
        unknown: day.unknown,
      };
    }
  }

  return nutrientsFromMealPrescription(meal);
}

/** Assigned and logged day totals for nutrition rings from meal assignments. */
export function dayNutritionFromMeals(
  meals: MealAssignment[],
  dayTotals?: MeDayResponse["totals"] | null,
): { assigned: MacroTotals; logged: MacroTotals } {
  const assignedItems = meals.flatMap((meal) =>
    meal.prescription.items.map((item) =>
      "calculated" in item && item.calculated ? item.calculated : null,
    ),
  );
  const assignedTotals = dayMacrosFromScaledItems(assignedItems);
  const assigned: MacroTotals = {
    kcal: assignedTotals.kcal,
    protein: assignedTotals.proteinG,
    carbs: assignedTotals.carbsG,
    fat: assignedTotals.fatG,
    unknown: assignedTotals.unknown,
  };

  // Plan-derived meals are summed in scaled units and rounded once for the
  // day (Z12-42); a changed meal brings its own logged figures.
  let loggedKcal = 0;
  let loggedProtein = 0;
  let loggedCarbs = 0;
  let loggedFat = 0;
  let unknown = false;
  const planLoggedItems: Array<
    (typeof assignedItems)[number]
  > = [];
  for (const meal of meals) {
    if (!isMealLoggedForCount(meal.status)) continue;
    if (meal.status === "skipped") continue;
    if (meal.status === "modified") {
      const macros = loggedMacrosForMeal(meal);
      loggedKcal += macros.kcal;
      loggedProtein += macros.protein;
      loggedCarbs += macros.carbs;
      loggedFat += macros.fat;
      if (macros.unknown) unknown = true;
      continue;
    }
    for (const item of meal.prescription.items) {
      planLoggedItems.push("calculated" in item && item.calculated ? item.calculated : null);
    }
  }
  const planLogged = dayMacrosFromScaledItems(planLoggedItems);
  loggedKcal += planLogged.kcal;
  loggedProtein += planLogged.proteinG;
  loggedCarbs += planLogged.carbsG;
  loggedFat += planLogged.fatG;
  if (planLogged.unknown) unknown = true;

  const logged: MacroTotals = {
    kcal: loggedKcal,
    protein: loggedProtein,
    carbs: loggedCarbs,
    fat: loggedFat,
    unknown,
  };

  // Prefer authoritative day kcal from /me/day when present (scaled sum, unscale once).
  // Ignore zero — legacy confirms stored null compliance kcal and would wipe rings.
  // Slots missing from perMeal are optimistic or still in the outbox: add their
  // planned kcal once. Slots already listed are not added again.
  if (dayTotals?.kcalScaled != null && dayTotals.kcalScaled > 0) {
    const present = new Set(
      (dayTotals.perMeal ?? []).map((row) => row.slotKey),
    );
    let extraKcal = 0;
    for (const meal of meals) {
      if (!isMealLoggedForCount(meal.status)) continue;
      if (present.has(meal.prescription.id)) continue;
      extraKcal += loggedMacrosForMeal(meal).kcal;
    }
    logged.kcal = unscaleNutrient(dayTotals.kcalScaled) + extraKcal;
  }

  return { assigned, logged };
}

export function buildNutritionRings(
  meals: MealAssignment[],
  dayTotals?: MeDayResponse["totals"] | null,
): RingDatum[] {
  const { assigned, logged } = dayNutritionFromMeals(meals, dayTotals);
  const unknown = assigned.unknown || logged.unknown;

  return [
    {
      key: "kcal",
      label: "Kcal",
      logged: logged.kcal,
      assigned: assigned.kcal,
      unit: "kcal",
      unknown,
    },
    {
      key: "protein",
      label: "Protein",
      logged: logged.protein,
      assigned: assigned.protein,
      unit: "g",
      unknown,
    },
    {
      key: "carbs",
      label: "Carbs",
      logged: logged.carbs,
      assigned: assigned.carbs,
      unit: "g",
      unknown,
    },
    {
      key: "fat",
      label: "Fat",
      logged: logged.fat,
      assigned: assigned.fat,
      unit: "g",
      unknown,
    },
  ];
}

/**
 * Only the meals planned for `localDate` (Z11b-1). The meal list is requested
 * for one day, but on device a dropped query string returned every meal since
 * the plan started ("676 of 747 meals logged"). Today, Diet and the kcal
 * summary never count another day's rows, whatever the list holds.
 */
export function mealsForDay<T extends { localDate: string }>(
  items: readonly T[],
  localDate: string,
): T[] {
  return items.filter((item) => item.localDate === localDate);
}

export function mealsLoggedSummary(meals: readonly MealAssignment[]): string {
  const total = meals.length;
  const logged = meals.filter((m) => isMealLoggedForCount(m.status)).length;
  if (total === 0) return "No meals planned today.";
  return `${logged} of ${total} meals logged`;
}

export type DayKcalRow = {
  id: string;
  kcal: number;
  kind: "logged" | "planned";
};

export type DayKcalSummary = {
  rows: DayKcalRow[];
  /** Sum of the `logged` rows only. The Diet ring and day summary show this. */
  loggedTotal: number;
  /** Sum of the planned kcal of every meal of the day. */
  plannedTotal: number;
};

/** A meal's planned kcal in scaled units, unrounded (summed over its items). */
function plannedKcalScaled(meal: MealAssignment): number {
  let total = 0;
  for (const item of meal.prescription.items) {
    if ("calculated" in item && item.calculated) {
      total += item.calculated.energyKcalScaled ?? 0;
    }
  }
  return total;
}

/** A meal's logged kcal in scaled units, unrounded (same sources as `loggedMacrosForMeal`). */
function loggedKcalScaled(
  meal: MealAssignment,
  serverScaled: number | undefined,
): number {
  if (meal.status === "skipped") return 0;
  if (meal.status === "modified") {
    const logged = meal.compliance?.loggedTotals?.energyKcal;
    if (logged != null) return logged * NUTRIENT_SCALE;
    const items = meal.compliance?.loggedItems ?? [];
    if (items.length > 0) {
      return items.reduce(
        (sum, item) => sum + (item.energyKcal ?? 0) * NUTRIENT_SCALE,
        0,
      );
    }
    return plannedKcalScaled(meal);
  }
  if (serverScaled != null && serverScaled > 0) return serverScaled;
  return plannedKcalScaled(meal);
}

/**
 * Single kcal source for the Diet day summary and the meal rows (D-W11-6).
 * A logged meal contributes its logged kcal (actual foods for "something
 * different", the server per-meal total or the plan otherwise, 0 when skipped);
 * a meal not logged yet shows its planned kcal and adds nothing to the logged
 * total.
 *
 * Rounding happens once on each day sum (Z12-42): the rows show each meal
 * rounded, but the logged total and the planned total are each the scaled sum
 * rounded one time, so a day eaten as planned never reads "1,746 of 1,745".
 */
export function dayKcalSummary(
  allAssignments: readonly MealAssignment[],
  dayTotals?: MeDayResponse["totals"] | null,
  /** The selected day; rows of any other day are ignored (Z11b-1). */
  localDate?: string,
): DayKcalSummary {
  const assignments =
    localDate === undefined ? allAssignments : mealsForDay(allAssignments, localDate);
  const perMeal = new Map(
    (dayTotals?.perMeal ?? []).map((row) => [row.slotKey, row.kcalScaled]),
  );
  const rows: DayKcalRow[] = [];
  let loggedScaled = 0;
  const plannedTotal = dayNutritionFromMeals([...assignments]).assigned.kcal;
  for (const meal of assignments) {
    if (isMealLoggedForCount(meal.status)) {
      const scaled = loggedKcalScaled(meal, perMeal.get(meal.prescription.id));
      rows.push({
        id: meal.id,
        kcal: Math.round(scaled / NUTRIENT_SCALE),
        kind: "logged",
      });
      loggedScaled += scaled;
    } else {
      rows.push({
        id: meal.id,
        kcal: nutrientsFromMealPrescription(meal).kcal,
        kind: "planned",
      });
    }
  }
  return {
    rows,
    loggedTotal: Math.round(loggedScaled / NUTRIENT_SCALE),
    plannedTotal,
  };
}
