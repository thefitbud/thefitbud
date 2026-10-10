import { addDaysToLocalDate, weekdayFromLocalDate } from "./workout.js";

export type AssignmentWindowMode = "next_7_days" | "next_calendar_week" | "custom";

export type DietAdjustmentScope = "today_onward" | "today_only";

export type LocalDateRange = {
  fromDate: string;
  toDate: string;
};

const ACKNOWLEDGE_SENTENCE =
  "Adjust the plan, adjust the configuration, or acknowledge the difference.";

export type ConsistencyWarningCode =
  | "workout_weekdays"
  | "workout_sessions"
  | "meal_weekdays"
  | "meal_slots";

export type ConsistencyWarning = {
  code: ConsistencyWarningCode;
  message: string;
  expected: number;
  actual: number;
};

/** Seven trainee-local dates beginning today, inclusive. */
export function nextSevenDayRange(today: string): LocalDateRange {
  return { fromDate: today, toDate: addDaysToLocalDate(today, 6) };
}

/**
 * Monday–Sunday whose Monday is strictly after today.
 * Weekday 0 is Sunday and 1 is Monday, matching weekdayFromLocalDate.
 */
export function nextCalendarWeekRange(today: string): LocalDateRange {
  const weekday = weekdayFromLocalDate(today);
  const daysUntilNextMonday = weekday === 0 ? 1 : 8 - weekday;
  const fromDate = addDaysToLocalDate(today, daysUntilNextMonday);
  return { fromDate, toDate: addDaysToLocalDate(fromDate, 6) };
}

export function resolveAssignmentWindow(input: {
  window?: AssignmentWindowMode;
  today: string;
  fromDate?: string;
  toDate?: string;
}): { ok: true; range: LocalDateRange } | { ok: false; message: string } {
  const mode = input.window ?? "custom";
  if (mode === "next_7_days") {
    return { ok: true, range: nextSevenDayRange(input.today) };
  }
  if (mode === "next_calendar_week") {
    return { ok: true, range: nextCalendarWeekRange(input.today) };
  }
  if (!input.fromDate || !input.toDate) {
    return { ok: false, message: "Custom dates need fromDate and toDate." };
  }
  if (input.fromDate > input.toDate) {
    return { ok: false, message: "fromDate must be on or before toDate." };
  }
  return {
    ok: true,
    range: { fromDate: input.fromDate, toDate: input.toDate },
  };
}

/** Intersect a generation range with a plan effective interval. Does not write that interval. */
export function clipInclusiveLocalRange(
  range: LocalDateRange,
  bounds: { fromDate: string | null; toDate: string | null },
): LocalDateRange | null {
  let fromDate = range.fromDate;
  let toDate = range.toDate;
  if (bounds.fromDate && fromDate < bounds.fromDate) fromDate = bounds.fromDate;
  if (bounds.toDate && toDate > bounds.toDate) toDate = bounds.toDate;
  if (fromDate > toDate) return null;
  return { fromDate, toDate };
}

export function localDatesInRange(range: LocalDateRange): string[] {
  const dates: string[] = [];
  let cursor = range.fromDate;
  while (cursor <= range.toDate) {
    dates.push(cursor);
    cursor = addDaysToLocalDate(cursor, 1);
  }
  return dates;
}

type WeekdayDay = { weekday?: number | null };

/** Place each stored weekday on matching dates. Days without a weekday are not invented onto the calendar. */
export function workoutSessionsOnDates<T extends WeekdayDay>(
  days: readonly T[],
  dates: readonly string[],
): Array<{ localDate: string; day: T }> {
  const placed: Array<{ localDate: string; day: T }> = [];
  for (const localDate of dates) {
    const weekday = weekdayFromLocalDate(localDate);
    for (const day of days) {
      if (day.weekday == null) continue;
      if (day.weekday === weekday) placed.push({ localDate, day });
    }
  }
  return placed;
}

type ScheduledMeal = { applicableWeekdays?: readonly number[] | null };

/** Place meals only on their applicable weekdays. scheduleHint is not a calendar. */
export function mealsOnDates<T extends ScheduledMeal>(
  meals: readonly T[],
  dates: readonly string[],
): Array<{ localDate: string; meal: T }> {
  const placed: Array<{ localDate: string; meal: T }> = [];
  for (const localDate of dates) {
    const weekday = weekdayFromLocalDate(localDate);
    for (const meal of meals) {
      const applicable = meal.applicableWeekdays ?? [];
      if (!applicable.includes(weekday)) continue;
      placed.push({ localDate, meal });
    }
  }
  return placed;
}

/** Unstarted rows on or after this local date are eligible to supersede. Past rows stay. */
export function supersedeFromLocalDate(input: {
  scope: DietAdjustmentScope;
  today: string;
  effectiveLocalDate: string;
}): { fromDate: string; toDate: string | null } {
  if (input.scope === "today_only") {
    return { fromDate: input.today, toDate: input.today };
  }
  const fromDate =
    input.effectiveLocalDate > input.today
      ? input.effectiveLocalDate
      : input.today;
  return { fromDate, toDate: null };
}

type SignatureExercise = {
  name: string;
  instructions: string | null;
  setTargets: ReadonlyArray<{
    order: number;
    reps: number | null;
    loadLabel: string | null;
    rpe: number | null;
  }>;
};

type SignatureDay = WeekdayDay & {
  name: string;
  exercises: readonly SignatureExercise[];
};

/** Identity-free comparison so a deep copy is the same workout plan. */
export function workoutScheduleSignature(days: readonly SignatureDay[]): string {
  const normalized = days
    .map((day) => ({
      weekday: day.weekday ?? null,
      name: day.name,
      exercises: [...day.exercises]
        .map((exercise) => ({
          name: exercise.name,
          instructions: exercise.instructions,
          sets: [...exercise.setTargets]
            .sort((left, right) => left.order - right.order)
            .map((set) => ({
              reps: set.reps,
              loadLabel: set.loadLabel,
              rpe: set.rpe,
            })),
        }))
        .sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .sort((left, right) => {
      const leftWeekday = left.weekday ?? -1;
      const rightWeekday = right.weekday ?? -1;
      if (leftWeekday !== rightWeekday) return leftWeekday - rightWeekday;
      return left.name.localeCompare(right.name);
    });
  return JSON.stringify(normalized);
}

export function workoutSchedulesMatch(
  left: readonly SignatureDay[],
  right: readonly SignatureDay[],
): boolean {
  return workoutScheduleSignature(left) === workoutScheduleSignature(right);
}

export function planConsistencyWarnings(input: {
  sessionsPerWeek: number;
  mealsPerDay: number;
  workoutDays: readonly WeekdayDay[];
  mealPrescriptions: readonly ScheduledMeal[];
}): ConsistencyWarning[] {
  const warnings: ConsistencyWarning[] = [];
  if (input.workoutDays.length > 0) {
    const scheduled = input.workoutDays.filter((day) => day.weekday != null).length;
    if (scheduled !== input.workoutDays.length) {
      warnings.push({
        code: "workout_weekdays",
        expected: input.workoutDays.length,
        actual: scheduled,
        message: `Some workout days are not mapped to a weekday, so those sessions are not placed on the calendar. ${ACKNOWLEDGE_SENTENCE}`,
      });
    }
    if (scheduled !== input.sessionsPerWeek) {
      warnings.push({
        code: "workout_sessions",
        expected: input.sessionsPerWeek,
        actual: scheduled,
        message: `This plan maps ${scheduled} workout sessions to weekdays, and the configuration expects ${input.sessionsPerWeek} sessions per week. ${ACKNOWLEDGE_SENTENCE}`,
      });
    }
  }
  if (input.mealPrescriptions.length > 0) {
    const scheduledMeals = input.mealPrescriptions.filter(
      (meal) => (meal.applicableWeekdays?.length ?? 0) > 0,
    ).length;
    if (scheduledMeals !== input.mealPrescriptions.length) {
      warnings.push({
        code: "meal_weekdays",
        expected: input.mealPrescriptions.length,
        actual: scheduledMeals,
        message: `Some meals have no applicable days, so they are not placed on the calendar. ${ACKNOWLEDGE_SENTENCE}`,
      });
    }
    const mismatchedCounts: number[] = [];
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const count = input.mealPrescriptions.filter((meal) =>
        (meal.applicableWeekdays ?? []).includes(weekday),
      ).length;
      if (count > 0 && count !== input.mealsPerDay) mismatchedCounts.push(count);
    }
    if (mismatchedCounts.length > 0) {
      const actual = mismatchedCounts[0]!;
      warnings.push({
        code: "meal_slots",
        expected: input.mealsPerDay,
        actual,
        message: `A scheduled day has ${actual} meals, and the configuration expects ${input.mealsPerDay} meals per day. ${ACKNOWLEDGE_SENTENCE}`,
      });
    }
  }
  return warnings;
}

export function consistencyFingerprint(
  warnings: readonly Pick<ConsistencyWarning, "code" | "expected" | "actual">[],
): string {
  return warnings
    .map((warning) => `${warning.code}:${warning.expected}:${warning.actual}`)
    .sort()
    .join("|");
}
