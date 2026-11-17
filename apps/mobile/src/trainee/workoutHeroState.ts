import type {
  EffectivePlanResponse,
  WorkoutAssignment,
  WorkoutExecutionSummary,
} from "@fitbud/contracts";
import { addDays, startOfWeekMonday, weekDatesFrom } from "../lib/dates";
import { coachLogState } from "./workout/coach-logged/coachLogged";

/**
 * One state for a day's workout card, read by both Workout and Today (Z12-44),
 * so the two tabs cannot disagree about what the trainee may do with a day.
 *
 * ISSUE-MAP #4: a finished day offered both "Start workout" (disabled) and
 * "View summary". Each tab decided from `assignment.status` alone, and that
 * field can lag the execution (a list read before the finish reached the
 * server, a cached week): the execution summary already said `completed`.
 * Here a day is done when either says so, and a done day's only action is
 * View summary (W-01c).
 *
 * The future rule is Z12-39's (D-W12-7): a day after the trainee's own today
 * is a preview and offers nothing to do.
 */
export type WorkoutHeroKind =
  /** No assignment that day (TR-10a). */
  | "rest"
  /** After today: preview only, no Start (W-01e). */
  | "future"
  /** Today, not started (W-01a). */
  | "not_started"
  /** Started or paused (W-01b). */
  | "in_progress"
  /** Finished by the trainee: View summary only (W-01c). */
  | "done"
  /** Before today and not done: it can still be logged late (TR-10c). */
  | "missed"
  /** The trainee said "Not today": nothing to do. */
  | "skipped"
  /** Logged by the coach: read-only, View workout (R1). */
  | "coach_logged";

/** The one action a state offers, or null. */
export type WorkoutHeroAction =
  | "start"
  | "continue"
  | "view_summary"
  | "view_workout"
  | "log_late"
  | null;

export type WorkoutHeroState = {
  kind: WorkoutHeroKind;
  action: WorkoutHeroAction;
  /** True only while paused (W-01b says "Paused" instead of "In progress"). */
  paused: boolean;
};

type HeroAssignment = Pick<WorkoutAssignment, "localDate" | "status"> & {
  execution?: Pick<
    WorkoutExecutionSummary,
    "status" | "loggedByRole" | "lastEditedByRole"
  > | null;
};

/** Done by the trainee or the coach: the assignment or its execution says so. */
export function isWorkoutDone(assignment: HeroAssignment): boolean {
  return (
    assignment.status === "completed" ||
    assignment.status === "modified" ||
    assignment.execution?.status === "completed" ||
    assignment.execution?.status === "modified"
  );
}

function isOpenExecution(assignment: HeroAssignment): boolean {
  return (
    assignment.status === "in_progress" ||
    assignment.status === "paused" ||
    assignment.execution?.status === "started" ||
    assignment.execution?.status === "paused"
  );
}

const ACTION: Record<WorkoutHeroKind, WorkoutHeroAction> = {
  rest: null,
  future: null,
  not_started: "start",
  in_progress: "continue",
  done: "view_summary",
  missed: "log_late",
  skipped: null,
  coach_logged: "view_workout",
};

export function workoutHeroState(
  assignment: HeroAssignment | null | undefined,
  today: string,
): WorkoutHeroState {
  const kind = heroKind(assignment, today);
  return {
    kind,
    action: ACTION[kind],
    paused:
      kind === "in_progress" &&
      (assignment?.status === "paused" ||
        assignment?.execution?.status === "paused"),
  };
}

function heroKind(
  assignment: HeroAssignment | null | undefined,
  today: string,
): WorkoutHeroKind {
  if (!assignment) return "rest";
  // A coach's log wins: the trainee cannot start or change it (R1).
  if (coachLogState(assignment.execution ?? null) === "logged") {
    return "coach_logged";
  }
  if (isWorkoutDone(assignment)) return "done";
  // ISO civil dates compare as strings.
  if (assignment.localDate > today) return "future";
  if (isOpenExecution(assignment)) return "in_progress";
  if (assignment.status === "skipped" || assignment.execution?.status === "skipped") {
    return "skipped";
  }
  if (assignment.status === "missed" || assignment.localDate < today) {
    return "missed";
  }
  return "not_started";
}

/* -------------------------------------------------------------------------- */
/* The week: dots and count from one source (ISSUE-MAP #10)                    */
/* -------------------------------------------------------------------------- */

export type WeekWorkoutDay = {
  localDate: string;
  /** True when every counted workout of the day is done. */
  done: boolean;
};

export type WeekWorkoutSummary = {
  /** Days of the week with a counted workout, Monday first. */
  days: WeekWorkoutDay[];
  /** The seven civil dates of the week, Monday first. */
  dates: string[];
  completed: number;
  total: number;
};

/**
 * "This week: 3 of 4 done", the summary's week dots (W-17b) and the Workout
 * tab's eyebrow (W-01c), all from one list, so a dot and the count can never
 * disagree ("3 of 3" beside two ticks, ISSUE-MAP #10).
 *
 * A day counts when it has a required workout, or a workout that was done
 * anyway; it is done when all of its counted workouts are. Counting days, not
 * assignments, is what makes the count equal the number of ticked dots.
 */
export function weekWorkoutSummary(
  assignments: readonly HeroWeekAssignment[],
  weekStart: string,
): WeekWorkoutSummary {
  const dates = weekDatesFrom(startOfWeekMonday(weekStart));
  const end = addDays(dates[0]!, 6);
  const byDate = new Map<string, HeroWeekAssignment[]>();
  for (const item of assignments) {
    if (item.localDate < dates[0]! || item.localDate > end) continue;
    const counted = item.workoutDay.required !== false || isWorkoutDone(item);
    if (!counted) continue;
    const list = byDate.get(item.localDate) ?? [];
    list.push(item);
    byDate.set(item.localDate, list);
  }
  const days: WeekWorkoutDay[] = dates
    .filter((date) => byDate.has(date))
    .map((date) => ({
      localDate: date,
      done: byDate.get(date)!.every(isWorkoutDone),
    }));
  return {
    days,
    dates,
    completed: days.filter((day) => day.done).length,
    total: days.length,
  };
}

type HeroWeekAssignment = HeroAssignment & {
  id: string;
  workoutDay: { required?: boolean };
};

/**
 * The week as it stands once `executionId` has finished: the assignment that
 * holds it reads as done even when the list was loaded before the finish
 * reached the server (ISSUE-MAP #10: the summary passed that stale list).
 * Returns the same array when nothing needed patching.
 */
export function withFinishedExecution<T extends HeroWeekAssignment>(
  assignments: readonly T[],
  finished: { id: string; assignmentId: string },
): T[] {
  let changed = false;
  const next = assignments.map((item) => {
    if (item.id !== finished.assignmentId) return item;
    if (isWorkoutDone(item)) return item;
    changed = true;
    return { ...item, status: "completed" as const };
  });
  return changed ? next : (assignments as T[]);
}

/**
 * One exercise row's plan (W-01a/e): "3 × 12 · 16 kg", "3 × 8–10 · 40 kg",
 * "3 × 12" (no load). The reps are the range across the planned sets.
 */
export function exercisePrescription(exercise: {
  setTargets: ReadonlyArray<{ reps: number | null; loadLabel: string | null }>;
}): string {
  const sets = exercise.setTargets.length;
  const reps = exercise.setTargets
    .map((target) => target.reps)
    .filter((value): value is number => value != null);
  let base: string;
  if (reps.length === 0) {
    base = sets === 1 ? "1 set" : `${sets} sets`;
  } else {
    const min = Math.min(...reps);
    const max = Math.max(...reps);
    base = `${sets} × ${min === max ? min : `${min}–${max}`}`;
  }
  const load = exercise.setTargets[0]?.loadLabel?.trim();
  return load ? `${base} · ${load}` : base;
}

/* -------------------------------------------------------------------------- */
/* Header eyebrow (W-01a/c/e, TR-10a/b)                                        */
/* -------------------------------------------------------------------------- */

function mondayDiffWeeks(fromMonday: string, toMonday: string): number {
  const [fy, fm, fd] = fromMonday.split("-").map(Number);
  const [ty, tm, td] = toMonday.split("-").map(Number);
  const days = Math.round(
    (Date.UTC(ty!, tm! - 1, td!) - Date.UTC(fy!, fm! - 1, fd!)) / 86_400_000,
  );
  return Math.floor(days / 7);
}

/**
 * "Week 3 of 12": the week of the plan version the trainee is on, counted
 * from the Monday of its first day. "of 12" only when the version has an end;
 * null when the plan has no start to count from.
 */
export function planWeekLabel(
  plan: EffectivePlanResponse | null | undefined,
  weekStart: string,
): string | null {
  const from = plan?.version?.effectiveFrom?.slice(0, 10);
  if (!from) return null;
  const firstMonday = startOfWeekMonday(from);
  const week = Math.max(1, mondayDiffWeeks(firstMonday, startOfWeekMonday(weekStart)) + 1);
  const to = plan?.version?.effectiveTo?.slice(0, 10);
  if (to && to >= from) {
    const weeks = mondayDiffWeeks(firstMonday, startOfWeekMonday(to)) + 1;
    if (week <= weeks) return `Week ${week} of ${weeks}`;
  }
  return `Week ${week}`;
}
