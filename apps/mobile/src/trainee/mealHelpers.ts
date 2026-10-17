import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { nutrientsFromMealPrescription } from "./nutrition";

export function mealPlanKcal(meal: MealAssignment): number | null {
  const { kcal, unknown } = nutrientsFromMealPrescription(meal);
  if (unknown && kcal === 0) return null;
  return kcal;
}

export function mealKcalFromDayTotals(
  meal: MealAssignment,
  perMeal: Array<{ slotKey: string; kcalScaled: number }> | undefined,
): number | null {
  const slotKey = meal.prescription.id;
  const match = perMeal?.find((row) => row.slotKey === slotKey);
  if (match) {
    return Math.round(match.kcalScaled / NUTRIENT_SCALE);
  }
  return mealPlanKcal(meal);
}

export function canActOnMealStatus(status: MealAssignment["status"]): boolean {
  return status === "pending" || status === "overdue";
}

/**
 * Whether the trainee may log this meal on the selected calendar day (D23).
 */
export function canLogMealOnDate(input: {
  selectedDate: string;
  today: string;
  meal: MealAssignment;
  unresolvedExceptionCount: number;
}): boolean {
  const { selectedDate, today, meal, unresolvedExceptionCount } = input;
  if (!canActOnMealStatus(meal.status)) return false;
  if (selectedDate === today) return true;
  if (selectedDate > today) return false;
  if (meal.prescription.required === false) return false;
  return unresolvedExceptionCount > 0;
}
