import type { MealAssignment, MeDayResponse } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import type { RingDatum } from "@fitbud/ui-mobile";

type MacroTotals = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  unknown: boolean;
};

function scaledToUnit(value: number | null | undefined): number {
  if (value == null) return 0;
  return Math.round(value / NUTRIENT_SCALE);
}

function nutrientsFromMealPrescription(meal: MealAssignment): MacroTotals {
  let kcal = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  let unknown = false;

  for (const item of meal.prescription.items) {
    const calculated =
      "calculated" in item && item.calculated ? item.calculated : null;
    if (!calculated) {
      unknown = true;
      continue;
    }
    if (calculated.partial) unknown = true;
    kcal += scaledToUnit(calculated.energyKcalScaled);
    protein += scaledToUnit(calculated.proteinScaled);
    carbs += scaledToUnit(calculated.carbsScaled);
    fat += scaledToUnit(calculated.fatScaled);
  }

  return { kcal, protein, carbs, fat, unknown };
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
  const assigned = meals.reduce<MacroTotals>(
    (acc, meal) => {
      const part = nutrientsFromMealPrescription(meal);
      return {
        kcal: acc.kcal + part.kcal,
        protein: acc.protein + part.protein,
        carbs: acc.carbs + part.carbs,
        fat: acc.fat + part.fat,
        unknown: acc.unknown || part.unknown,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, unknown: false },
  );

  const loggedFromMeals = meals.reduce<MacroTotals>(
    (acc, meal) => {
      if (!isLoggedMeal(meal.status)) return acc;
      const part = nutrientsFromMealPrescription(meal);
      return {
        kcal: acc.kcal + part.kcal,
        protein: acc.protein + part.protein,
        carbs: acc.carbs + part.carbs,
        fat: acc.fat + part.fat,
        unknown: acc.unknown || part.unknown,
      };
    },
    { kcal: 0, protein: 0, carbs: 0, fat: 0, unknown: false },
  );

  if (dayTotals?.kcalScaled != null) {
    loggedFromMeals.kcal = Math.round(dayTotals.kcalScaled / NUTRIENT_SCALE);
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
