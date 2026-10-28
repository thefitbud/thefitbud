import type {
  ExceptionDetail,
  ExceptionType,
  MealAssignment,
  WorkoutAssignment,
} from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  labelFor,
} from "@fitbud/core";

function detailString(
  details: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  if (!details) return null;
  const value = details[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Coaching week label from relationship start — same rule as ClientStatusScreen. */
export function coachingWeekNumber(
  startedAt: string | null | undefined,
  nowMs: number = Date.now(),
): number | null {
  if (!startedAt) return null;
  const elapsed = nowMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

/**
 * Frame 31 subtitle: `Lose 6 kg · week 6 · 3 open items`.
 * Omits missing goal/week parts; always ends with the open-items count.
 */
export function reviewSheetClientSubtitle(input: {
  goalShort?: string | null;
  weekNumber?: number | null;
  openCount: number;
}): string {
  const parts: string[] = [];
  const goal = input.goalShort?.trim();
  if (goal) parts.push(goal);
  if (input.weekNumber != null && input.weekNumber > 0) {
    parts.push(`week ${input.weekNumber}`);
  }
  parts.push(
    input.openCount === 1
      ? "1 open item"
      : `${input.openCount} open items`,
  );
  return parts.join(" · ");
}

/** Frame 31 title: `Missed workout · Tue 13 Oct` (kind · civil date). */
export function reviewSheetCardTitle(input: {
  type: ExceptionType;
  localDate?: string | null;
  summary?: string | null;
}): string {
  const kind = labelFor("exception_type", input.type);
  const localDate = input.localDate?.trim();
  if (localDate) {
    return `${kind} · ${formatCivilDate(localDate)}`;
  }
  // Fall back to summary only when it already looks like kind · date.
  const summary = input.summary?.trim();
  if (summary && summary.includes(" · ")) return summary;
  return kind;
}

/**
 * Body paragraph under the title.
 * Workout missed: `{Day name} was planned for {time} and wasn't logged.`
 * Meal overdue: `{Meal} was planned for {time} and wasn't logged.`
 */
export function reviewSheetCardBody(input: {
  type: ExceptionType;
  sourceName?: string | null;
  plannedClock?: string | null;
}): string | null {
  const name = input.sourceName?.trim();
  const clock = input.plannedClock?.trim();
  if (
    input.type === "missed_workout" ||
    input.type === "skipped_workout" ||
    input.type === "overdue_meal" ||
    input.type === "skipped_meal" ||
    input.type === "meal_logged_later"
  ) {
    if (name && clock) {
      return `${name} was planned for ${clock} and wasn't logged.`;
    }
    if (name) {
      return `${name} was planned and wasn't logged.`;
    }
  }
  if (input.type === "meal_deviation" && name) {
    return clock
      ? `${name} was logged differently from the plan · ${clock}.`
      : `${name} was logged differently from the plan.`;
  }
  if (input.type === "overdue_checkin") {
    return clock
      ? `Check-in was due by ${clock} and wasn't submitted.`
      : "Check-in is overdue and wasn't submitted.";
  }
  return null;
}

/** Planned grid value: `5 exercises · 16 sets` (+ optional `about N min`). */
export function reviewSheetPlannedLine(input: {
  exerciseCount?: number | null;
  setCount?: number | null;
  durationMinutes?: number | null;
  mealKcal?: number | null;
  fallback?: string | null;
}): string | null {
  if (
    input.exerciseCount != null &&
    input.exerciseCount > 0 &&
    input.setCount != null
  ) {
    const parts = [
      `${input.exerciseCount} exercise${input.exerciseCount === 1 ? "" : "s"}`,
      `${input.setCount} set${input.setCount === 1 ? "" : "s"}`,
    ];
    if (input.durationMinutes != null && input.durationMinutes > 0) {
      parts.push(`about ${input.durationMinutes} min`);
    }
    return parts.join(" · ");
  }
  if (input.mealKcal != null && input.mealKcal > 0) {
    return `${Math.round(input.mealKcal)} kcal`;
  }
  return input.fallback?.trim() || null;
}

/** Logged grid value for frame 31. */
export function reviewSheetLoggedLine(input: {
  type: ExceptionType;
  loggedAt?: string | null;
  deviationKind?: string | null;
}): string {
  if (input.type === "skipped_meal" || input.type === "skipped_workout") {
    return "Skipped";
  }
  if (input.type === "meal_deviation") {
    return input.deviationKind
      ? `Changed · ${input.deviationKind}`
      : "Changed";
  }
  if (input.type === "meal_logged_later") {
    return "Logged later";
  }
  if (input.loggedAt) {
    return "Logged";
  }
  return "Nothing logged";
}

/** Reminder grid value: `Sent 8:15 pm · not opened`. */
export function reviewSheetReminderLine(input: {
  sentAt?: string | null;
  opened?: boolean | null;
  timeZone?: string;
}): string | null {
  if (!input.sentAt) return null;
  const clock = formatClockTime(input.sentAt, input.timeZone);
  if (!clock) return null;
  const openLabel =
    input.opened === true
      ? "opened"
      : input.opened === false
        ? "not opened"
        : null;
  return openLabel ? `Sent ${clock} · ${openLabel}` : `Sent ${clock}`;
}

export type ReviewSheetCardModel = {
  title: string;
  body: string | null;
  planned: string | null;
  logged: string;
  reminder: string | null;
  localDate: string | null;
  severity: ExceptionDetail["severity"];
  ageMinutes: number;
};

function workoutPlanned(
  workout: WorkoutAssignment | null,
  timeZone?: string,
): {
  sourceName: string | null;
  plannedClock: string | null;
  exerciseCount: number | null;
  setCount: number | null;
} {
  if (!workout) {
    return {
      sourceName: null,
      plannedClock: null,
      exerciseCount: null,
      setCount: null,
    };
  }
  const exercises = workout.workoutDay?.exercises ?? [];
  const setCount = exercises.reduce(
    (sum, ex) => sum + (ex.setTargets?.length ?? 0),
    0,
  );
  return {
    sourceName: workout.workoutDayName,
    plannedClock:
      formatClockTime(workout.windowStartsAt, timeZone) || null,
    exerciseCount: exercises.length || null,
    setCount: exercises.length > 0 ? setCount : null,
  };
}

function mealPlanned(
  meal: MealAssignment | null,
  mealKcal: number | null = null,
  timeZone?: string,
): {
  sourceName: string | null;
  plannedClock: string | null;
  mealKcal: number | null;
} {
  if (!meal) {
    return { sourceName: null, plannedClock: null, mealKcal: null };
  }
  return {
    sourceName: meal.mealName,
    plannedClock: formatClockTime(meal.windowStartsAt, timeZone) || null,
    mealKcal,
  };
}

/**
 * Build the frame 31 card model from exception detail + optional source rows.
 * Reminder stays null unless the caller supplies sent/opened facts.
 */
export function buildReviewSheetCardModel(input: {
  detail: ExceptionDetail;
  ageMinutes: number;
  workout?: WorkoutAssignment | null;
  meal?: MealAssignment | null;
  /** Planned meal kcal when already summed from prescription items. */
  mealKcal?: number | null;
  /** Optional explicit session length for Planned (frame may include `about N min`). */
  durationMinutes?: number | null;
  reminder?: { sentAt?: string | null; opened?: boolean | null } | null;
  timeZone?: string;
}): ReviewSheetCardModel {
  const { detail } = input;
  const localDate =
    detailString(detail.details, "localDate") ??
    input.workout?.localDate ??
    input.meal?.localDate ??
    null;
  const workoutBits = workoutPlanned(input.workout ?? null, input.timeZone);
  const mealBits = mealPlanned(
    input.meal ?? null,
    input.mealKcal ?? null,
    input.timeZone,
  );
  const sourceName =
    workoutBits.sourceName ??
    mealBits.sourceName ??
    detailString(detail.details, "mealName") ??
    detailString(detail.details, "workoutDayName");
  const plannedClock =
    workoutBits.plannedClock ??
    mealBits.plannedClock ??
    (() => {
      const ends =
        detailString(detail.details, "windowEndsAt") ??
        detailString(detail.details, "windowEnd");
      return ends ? formatClockTime(ends, input.timeZone) || null : null;
    })();

  return {
    title: reviewSheetCardTitle({
      type: detail.type,
      localDate,
      summary: detail.summary,
    }),
    body: reviewSheetCardBody({
      type: detail.type,
      sourceName,
      plannedClock,
    }),
    planned: reviewSheetPlannedLine({
      exerciseCount: workoutBits.exerciseCount,
      setCount: workoutBits.setCount,
      durationMinutes: input.durationMinutes ?? null,
      mealKcal: mealBits.mealKcal,
      fallback: sourceName,
    }),
    logged: reviewSheetLoggedLine({
      type: detail.type,
      loggedAt: detailString(detail.details, "loggedAt"),
      deviationKind: detailString(detail.details, "deviationKind"),
    }),
    reminder: reviewSheetReminderLine({
      sentAt: input.reminder?.sentAt,
      opened: input.reminder?.opened,
      timeZone: input.timeZone,
    }),
    localDate,
    severity: detail.severity,
    ageMinutes: input.ageMinutes,
  };
}
