import type {
  CoachEditWorkoutRequest,
  CoachLogWorkoutRequest,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatLocalDate,
  localDateTimeToUtcIso,
} from "@fitbud/core";

/** Trainer log and edit window (R2): today minus 7 days through today. */
export const LOG_WINDOW_DAYS = 7;

const BODYWEIGHT_LABEL = "bodyweight";
const KG_LABEL = /^\s*(\d{1,3}(?:\.\d{1,2})?)\s*kg\s*$/i;
const LOAD_TEXT = /^\d{1,3}(?:\.\d{1,2})?$/;
const REPS_TEXT = /^\d{1,3}$/;

export type SetDraft = {
  key: string;
  /** Create: the plan's set target. */
  setTargetId: string | null;
  /** Edit: the logged set. */
  setExecutionId: string | null;
  order: number;
  plannedLabel: string;
  done: boolean;
  loadText: string;
  bodyweight: boolean;
  repsText: string;
};

export type ExerciseDraft = {
  exerciseId: string;
  name: string;
  /** "4 × 8" from the plan's targets; null when the plan gives no reps. */
  plannedSummary: string | null;
  sets: SetDraft[];
};

export function windowDates(today: string): string[] {
  const out: string[] = [];
  for (let back = LOG_WINDOW_DAYS; back >= 0; back -= 1) {
    out.push(addDaysToLocalDate(today, -back));
  }
  return out;
}

export function isWithinWindow(localDate: string, today: string): boolean {
  return (
    localDate >= addDaysToLocalDate(today, -LOG_WINDOW_DAYS) && localDate <= today
  );
}

/** The kg number in a load label, or null when the label is not a plain kg load. */
export function parseKgLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const match = KG_LABEL.exec(label);
  return match ? String(Number(match[1])) : null;
}

export function isBodyweightLabel(label: string | null | undefined): boolean {
  return (label ?? "").trim().toLowerCase() === BODYWEIGHT_LABEL;
}

function plannedText(reps: number | null, loadLabel: string | null): string {
  if (loadLabel && reps != null) return `${loadLabel} × ${reps}`;
  if (loadLabel) return loadLabel;
  if (reps != null) return `${reps} reps`;
  return "—";
}

export function draftsFromAssignment(assignment: WorkoutAssignment): ExerciseDraft[] {
  return [...assignment.workoutDay.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => {
      const targets = [...exercise.setTargets].sort((a, b) => a.order - b.order);
      const reps = targets[0]?.reps ?? null;
      return {
        exerciseId: exercise.id,
        name: exercise.name,
        plannedSummary: reps != null ? `${targets.length} × ${reps}` : null,
        sets: targets.map((target) => ({
          key: target.id,
          setTargetId: target.id,
          setExecutionId: null,
          order: target.order,
          plannedLabel: plannedText(target.reps, target.loadLabel),
          done: true,
          loadText: parseKgLabel(target.loadLabel) ?? "",
          bodyweight: isBodyweightLabel(target.loadLabel),
          repsText: target.reps != null ? String(target.reps) : "",
        })),
      };
    });
}

export function draftsFromExecution(execution: WorkoutExecution): ExerciseDraft[] {
  return [...execution.exercises]
    .sort((a, b) => a.order - b.order)
    .map((exercise) => {
      const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
      const reps = sets[0]?.prescribedReps ?? null;
      return {
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        plannedSummary: reps != null ? `${sets.length} × ${reps}` : null,
        sets: sets.map((set) => {
          const done = set.status === "completed" || set.status === "modified";
          const loadLabel = set.actualLoadLabel ?? set.prescribedLoadLabel;
          const reps = set.actualReps ?? set.prescribedReps;
          return {
            key: set.id,
            setTargetId: set.setTargetId,
            setExecutionId: set.id,
            order: set.order,
            plannedLabel: plannedText(set.prescribedReps, set.prescribedLoadLabel),
            done,
            loadText: done ? (parseKgLabel(loadLabel) ?? "") : "",
            bodyweight: done && isBodyweightLabel(loadLabel),
            repsText: done && reps != null ? String(reps) : "",
          };
        }),
      };
    });
}

export function setProblem(set: SetDraft): string | null {
  if (!set.done) return null;
  if (set.repsText !== "") {
    if (!REPS_TEXT.test(set.repsText)) return "Reps are a whole number, 1 to 100.";
    const reps = Number(set.repsText);
    if (reps < 1 || reps > 100) return "Reps are a whole number, 1 to 100.";
  }
  if (!set.bodyweight && set.loadText !== "") {
    if (!LOAD_TEXT.test(set.loadText) || Number(set.loadText) > 500) {
      return "Load is kg, 0 to 500, with up to 2 decimals.";
    }
  }
  return null;
}

export function draftsProblem(drafts: ExerciseDraft[]): string | null {
  for (const exercise of drafts) {
    for (const set of exercise.sets) {
      const problem = setProblem(set);
      if (problem) return `${exercise.name}, set ${set.order}: ${problem}`;
    }
  }
  return null;
}

function doneSetFields(set: SetDraft): {
  actualReps?: number;
  actualLoadKg?: number;
  bodyweight?: true;
} {
  const out: { actualReps?: number; actualLoadKg?: number; bodyweight?: true } = {};
  if (set.repsText !== "") out.actualReps = Number(set.repsText);
  if (set.bodyweight) out.bodyweight = true;
  else if (set.loadText !== "") out.actualLoadKg = Number(set.loadText);
  return out;
}

/** The instant a log for `localDate` is stamped with: noon there, or now for today. */
export function performedAtFor(
  localDate: string,
  timeZone: string,
  now: Date = new Date(),
): string {
  if (formatLocalDate(now, timeZone) === localDate) return now.toISOString();
  return localDateTimeToUtcIso(localDate, timeZone, 12, 0);
}

export function buildLogRequest(input: {
  drafts: ExerciseDraft[];
  performedAt: string;
}): CoachLogWorkoutRequest {
  return {
    performedAt: input.performedAt,
    exercises: input.drafts.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      sets: exercise.sets.map((set) => ({
        setTargetId: set.setTargetId!,
        status: set.done ? ("completed" as const) : ("skipped" as const),
        ...(set.done ? doneSetFields(set) : {}),
      })),
    })),
  };
}

function sameSet(a: SetDraft, b: SetDraft): boolean {
  return (
    a.done === b.done &&
    a.bodyweight === b.bodyweight &&
    a.loadText === b.loadText &&
    a.repsText === b.repsText
  );
}

export function changedSetCount(
  initial: ExerciseDraft[],
  current: ExerciseDraft[],
): number {
  let count = 0;
  current.forEach((exercise, e) => {
    exercise.sets.forEach((set, s) => {
      const before = initial[e]?.sets[s];
      if (!before || !sameSet(before, set)) count += 1;
    });
  });
  return count;
}

export function buildEditRequest(input: {
  recordVersion: number;
  initial: ExerciseDraft[];
  drafts: ExerciseDraft[];
  performedAt: string | null;
}): CoachEditWorkoutRequest {
  const sets: NonNullable<CoachEditWorkoutRequest["sets"]> = [];
  input.drafts.forEach((exercise, e) => {
    exercise.sets.forEach((set, s) => {
      const before = input.initial[e]?.sets[s];
      if (before && sameSet(before, set)) return;
      sets.push({
        setExecutionId: set.setExecutionId!,
        status: set.done ? ("completed" as const) : ("skipped" as const),
        ...(set.done ? doneSetFields(set) : {}),
      });
    });
  });
  return {
    recordVersion: input.recordVersion,
    ...(input.performedAt ? { performedAt: input.performedAt } : {}),
    ...(sets.length > 0 ? { sets } : {}),
  };
}
