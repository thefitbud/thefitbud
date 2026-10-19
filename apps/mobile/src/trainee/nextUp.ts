import type {
  Checkin,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import { formatClockTime } from "@fitbud/core";

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

  const openMeals = input.meals
    .filter((meal) => !isLoggedMealStatus(meal.status))
    .slice()
    .sort(
      (a, b) =>
        new Date(a.windowStartsAt).getTime() -
        new Date(b.windowStartsAt).getTime(),
    );

  // Prefer a meal whose window is open or within ±60 min of now.
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
      reason:
        inWindow.status === "overdue" ||
        now.getTime() > new Date(inWindow.windowEndsAt).getTime()
          ? "overdue"
          : "window",
    };
  }

  // Stale overdue: pick the most recently ended window (dinner at 10:50 pm,
  // not breakfast from the morning).
  const overdueMeals = openMeals
    .filter(
      (meal) =>
        meal.status === "overdue" ||
        now.getTime() > new Date(meal.windowEndsAt).getTime(),
    )
    .sort(
      (a, b) =>
        new Date(b.windowEndsAt).getTime() - new Date(a.windowEndsAt).getTime(),
    );
  if (overdueMeals[0]) {
    return { kind: "meal", meal: overdueMeals[0], reason: "overdue" };
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

  // Next pending meal later today (by start time).
  const nextPending = openMeals.find(
    (meal) => new Date(meal.windowStartsAt).getTime() > now.getTime(),
  );
  if (nextPending) {
    return { kind: "meal", meal: nextPending, reason: "window" };
  }

  void minutesUntil;
  return null;
}

/** Status chip line for a due meal card (TR-07): countdown or "due now" in window. */
export function mealDueStatusLabel(
  meal: MealAssignment,
  _timeZone: string,
  now = new Date(),
): string {
  if (
    meal.status === "overdue" ||
    now.getTime() > new Date(meal.windowEndsAt).getTime()
  ) {
    return "Overdue";
  }
  const mins = minutesUntil(meal.windowStartsAt, now);
  // Never "due now" before the window starts (night → next breakfast).
  if (mins > 0) return formatCountdown(mins);
  if (now.getTime() <= new Date(meal.windowEndsAt).getTime()) {
    return "due now";
  }
  return "Later";
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
