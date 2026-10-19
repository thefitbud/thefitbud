import type {
  Checkin,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";

export type NextUpHero =
  | { kind: "meal"; meal: MealAssignment; reason: "overdue" | "window" }
  | { kind: "workout"; workout: WorkoutAssignment }
  | { kind: "checkin"; checkin: Checkin };

const WINDOW_MS = 60 * 60 * 1000;

function isLoggedMealStatus(status: MealAssignment["status"]): boolean {
  return (
    status === "confirmed" ||
    status === "modified" ||
    status === "logged_later" ||
    status === "skipped"
  );
}

function isDoneWorkout(status: WorkoutAssignment["status"]): boolean {
  return status === "completed" || status === "skipped" || status === "missed";
}

/** Minutes until window start (negative = already started). */
function minutesUntil(iso: string, now: Date): number {
  return Math.round((new Date(iso).getTime() - now.getTime()) / 60_000);
}

/**
 * Single "next up" hero for Today (TR-06).
 * Priority: overdue required item → meal within ±60 min → unfinished workout → due check-in.
 */
export function nextUp(input: {
  meals: readonly MealAssignment[];
  workout: WorkoutAssignment | null;
  checkin: Checkin | null;
  now?: Date;
}): NextUpHero | null {
  const now = input.now ?? new Date();

  const overdueMeal = input.meals.find(
    (meal) => meal.status === "overdue" && !isLoggedMealStatus(meal.status),
  );
  if (overdueMeal) {
    return { kind: "meal", meal: overdueMeal, reason: "overdue" };
  }

  const overdueWorkout =
    input.workout &&
    input.workout.status === "missed"
      ? input.workout
      : null;
  // Missed workouts still surface via the workout card; hero prefers meal window next.

  const openMeals = input.meals.filter(
    (meal) => meal.status === "pending" || meal.status === "overdue",
  );
  const inWindow = openMeals.find((meal) => {
    const start = new Date(meal.windowStartsAt).getTime();
    const end = new Date(meal.windowEndsAt).getTime();
    const t = now.getTime();
    return t >= start - WINDOW_MS && t <= end + WINDOW_MS;
  });
  if (inWindow) {
    return {
      kind: "meal",
      meal: inWindow,
      reason: inWindow.status === "overdue" ? "overdue" : "window",
    };
  }

  if (input.workout && !isDoneWorkout(input.workout.status)) {
    return { kind: "workout", workout: input.workout };
  }

  if (
    input.checkin &&
    (input.checkin.status === "due" || input.checkin.status === "overdue")
  ) {
    return { kind: "checkin", checkin: input.checkin };
  }

  // Fallback: next pending meal by time even outside the ±60 min window.
  const nextPending = openMeals[0];
  if (nextPending) {
    return { kind: "meal", meal: nextPending, reason: "window" };
  }

  void overdueWorkout;
  void minutesUntil;
  return null;
}

/** Format a positive minute countdown as "in 2 h 31 min" / "in 45 min". */
export function formatCountdown(totalMinutes: number): string {
  if (totalMinutes <= 0) return "now";
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours <= 0) return `in ${mins} min`;
  if (mins === 0) return `in ${hours} h`;
  return `in ${hours} h ${mins} min`;
}

/** Label for the hero eyebrow, e.g. "Next up · in 2 h 31 min" / "Overdue". */
export function nextUpEyebrow(hero: NextUpHero, now = new Date()): string {
  if (hero.kind === "meal") {
    if (hero.reason === "overdue" || hero.meal.status === "overdue") {
      return "Overdue";
    }
    const mins = minutesUntil(hero.meal.windowStartsAt, now);
    if (mins > 0) return `Next up · ${formatCountdown(mins)}`;
    if (mins >= -60) return "Next up · now";
    return "Next up";
  }
  if (hero.kind === "workout") {
    if (hero.workout.status === "in_progress" || hero.workout.status === "paused") {
      return "In progress";
    }
    return "Next up · workout";
  }
  return hero.checkin.status === "overdue" ? "Overdue check-in" : "Check-in due";
}
