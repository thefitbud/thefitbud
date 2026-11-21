/**
 * TM-12a/b helpers: trainer diet-day review labels and meal row copy.
 * Status badges follow the v3 mock (As planned / Changed portion / Ate out /
 * Not due yet) — not raw enum values.
 */
import type { MealAssignment } from "@fitbud/contracts";
import { formatClockTime, formatNumber } from "@fitbud/core";
import {
  isMealLoggedForCount,
  loggedMacrosForMeal,
  nutrientsFromMealPrescription,
} from "../../trainee/nutrition";
import { cleanFoodLabel } from "../../trainee/mealHelpers";

export type DietMealBadge =
  | { kind: "as_planned"; label: "As planned" }
  | { kind: "changed_portion"; label: "Changed portion" }
  | { kind: "ate_out"; label: "Ate out" }
  | { kind: "logged_myself"; label: "Logged myself" }
  | { kind: "changed"; label: "Changed" }
  | { kind: "skipped"; label: "Skipped" }
  | { kind: "not_due"; label: "Not due yet" }
  | { kind: "missed"; label: "Not logged" };

export function planFoodLine(meal: MealAssignment): string {
  const names = meal.prescription.items
    .map((item) => cleanFoodLabel(item.name))
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : cleanFoodLabel(meal.mealName);
}

export function loggedFoodLine(meal: MealAssignment): string | null {
  const compliance = meal.compliance;
  if (!compliance) return null;
  if (compliance.deviationKind === "restaurant") {
    const kcal = compliance.loggedTotals?.energyKcal;
    if (kcal != null) return `${formatNumber(Math.round(kcal))} kcal`;
    return compliance.notes?.trim() || "Ate out";
  }
  if (compliance.deviationKind === "logged_foods") {
    const names = (compliance.loggedItems ?? []).map((item) =>
      cleanFoodLabel(item.name),
    );
    return names.length > 0 ? names.join(", ") : null;
  }
  if (compliance.deviationKind === "portion_adjustment") {
    const names = (compliance.loggedItems ?? []).map((item) =>
      cleanFoodLabel(item.name),
    );
    if (names.length > 0) return names.join(", ");
  }
  return planFoodLine(meal);
}

export function dietMealBadge(
  meal: MealAssignment,
  nowMs = Date.now(),
): DietMealBadge {
  if (meal.status === "skipped") return { kind: "skipped", label: "Skipped" };
  if (meal.status === "confirmed" || meal.status === "logged_later") {
    return { kind: "as_planned", label: "As planned" };
  }
  if (meal.status === "modified") {
    const kind = meal.compliance?.deviationKind;
    if (kind === "restaurant") return { kind: "ate_out", label: "Ate out" };
    if (kind === "portion_adjustment") {
      return { kind: "changed_portion", label: "Changed portion" };
    }
    if (kind === "logged_foods") {
      return { kind: "logged_myself", label: "Logged myself" };
    }
    return { kind: "changed", label: "Changed" };
  }
  const starts = Date.parse(meal.windowStartsAt);
  if (Number.isFinite(starts) && nowMs < starts) {
    return { kind: "not_due", label: "Not due yet" };
  }
  return { kind: "missed", label: "Not logged" };
}

export function mealKcalPair(meal: MealAssignment): {
  logged: number | null;
  planned: number;
} {
  const planned = nutrientsFromMealPrescription(meal).kcal;
  if (!isMealLoggedForCount(meal.status) || meal.status === "skipped") {
    return { logged: null, planned };
  }
  return { logged: loggedMacrosForMeal(meal).kcal, planned };
}

export function mealTimeLabel(meal: MealAssignment, zone: string): string {
  return formatClockTime(meal.windowStartsAt, zone);
}

export function mealsLoggedCount(meals: MealAssignment[]): {
  logged: number;
  total: number;
} {
  const total = meals.length;
  const logged = meals.filter((m) => isMealLoggedForCount(m.status)).length;
  return { logged, total };
}
