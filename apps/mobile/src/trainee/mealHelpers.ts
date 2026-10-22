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

export function isMealLoggingLocked(meal: MealAssignment): boolean {
  return meal.loggingLocked === true;
}

/**
 * Log actions must wait until the meal list (with derived lock flags) has
 * finished loading. Sync payloads omit locks and default to unlocked — showing
 * "Eaten as planned" in that window is a product bug.
 */
export function canShowMealLogActions(input: {
  lockStateKnown: boolean;
  selectedDate: string;
  today: string;
  meal: MealAssignment;
  unresolvedExceptionCount: number;
}): boolean {
  if (!input.lockStateKnown) return false;
  return canLogMealOnDate(input);
}

/** Plain-words reason when a meal can't be logged. */
export function mealLockCopy(
  meal: MealAssignment,
  coachName = "Your coach",
): string | null {
  if (!isMealLoggingLocked(meal)) return null;
  const reason = meal.loggingLockReason;
  if (reason === "exception_resolved") {
    return `Closed by ${coachName} · can't be logged now`;
  }
  if (reason === "optional_past_day") {
    return "Optional meal · not logged";
  }
  if (reason === "edit_window_closed") {
    return "Closed · can't be changed now";
  }
  if (reason === "superseded" || reason === "relationship_ended") {
    return "This meal is no longer on your plan";
  }
  return `Closed by ${coachName} · can't be logged now`;
}

/**
 * Whether the trainee may log this meal on the selected calendar day (D23).
 * Locked (resolved exception) meals never show actions.
 */
export function canLogMealOnDate(input: {
  selectedDate: string;
  today: string;
  meal: MealAssignment;
  unresolvedExceptionCount: number;
}): boolean {
  const { selectedDate, today, meal, unresolvedExceptionCount } = input;
  if (isMealLoggingLocked(meal)) return false;
  if (!canActOnMealStatus(meal.status)) return false;
  if (selectedDate === today) return true;
  if (selectedDate > today) return false;
  if (meal.prescription.required === false) return false;
  return unresolvedExceptionCount > 0;
}

/** Strip internal library labels like "INDB recipe portion" from display. */
export function cleanFoodLabel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/\s*\(INDB[^)]*\)/gi, "")
    .replace(/\s*INDB recipe portion/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
