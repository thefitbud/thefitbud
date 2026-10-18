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

function isLoggedMeal(status: MealAssignment["status"]): boolean {
  return (
    status === "confirmed" ||
    status === "modified" ||
    status === "logged_later" ||
    status === "skipped"
  );
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

  const loggedItems = meals
    .filter((meal) => isLoggedMeal(meal.status))
    .flatMap((meal) =>
      meal.prescription.items.map((item) =>
        "calculated" in item && item.calculated ? item.calculated : null,
      ),
    );
  const loggedTotals = dayMacrosFromScaledItems(loggedItems);
  const loggedFromMeals: MacroTotals = {
    kcal: loggedTotals.kcal,
    protein: loggedTotals.proteinG,
    carbs: loggedTotals.carbsG,
    fat: loggedTotals.fatG,
    unknown: loggedTotals.unknown,
  };

  if (dayTotals?.kcalScaled != null) {
    loggedFromMeals.kcal = unscaleNutrient(dayTotals.kcalScaled);
  }

  return { assigned, logged: loggedFromMeals };
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
