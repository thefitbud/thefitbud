/**
 * Trainer log and edit of a client's workout (Z10-16, frames DS8 a and d).
 * Pure rules: the date strip, which assignment a date offers, how drafts map to
 * the Z6-19 request bodies. The API enforces the same rules (R1 to R5); the
 * client only keeps the trainer from asking for what it would refuse.
 */
import type {
  CoachEditWorkoutRequest,
  CoachLogWorkoutRequest,
  WorkoutAssignment,
  WorkoutExecution,
} from "@fitbud/contracts";
import { localDateTimeToUtcIso } from "@fitbud/core";
import {
  displayLoad,
  initialDraft,
  loadBody,
  type SetDraft,
} from "../../workout/shared";
import { addDays } from "../../lib/dates";

/** Chips in the date strip: today and the six days before it (frame d1). */
export const STRIP_DAYS = 7;

export function dateStrip(today: string): string[] {
  return Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i - (STRIP_DAYS - 1)));
}

/** The instant a log on `date` is stamped with: now for today, midday otherwise. */
export function performedAtFor(date: string, today: string, zone: string, now: Date): string {
  return date === today ? now.toISOString() : localDateTimeToUtcIso(date, zone, 12);
}

const FINISHED = new Set(["completed", "modified"]);

export function isFinishedExecution(a: WorkoutAssignment): boolean {
  return a.execution != null && FINISHED.has(a.execution.status);
}

/**
 * Assignments the trainer can log or edit: scheduled ones with no execution
 * (log) or a finished one (edit). Started, paused and skipped ones are not offered.
 */
export function loggableAssignments(items: WorkoutAssignment[]): WorkoutAssignment[] {
  return items
    .filter(
      (a) =>
        a.scheduleStatus === "scheduled" &&
        a.supersededAt == null &&
        (a.execution == null || isFinishedExecution(a)),
    )
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
}

export function assignmentsOn(items: WorkoutAssignment[], date: string): WorkoutAssignment[] {
  return loggableAssignments(items).filter((a) => a.localDate === date);
}

export type FormSet = {
  /** Set target id when logging, set execution id when editing. */
  id: string;
  order: number;
  prescribedReps: number | null;
  prescribedLoadLabel: string | null;
  actualReps: number | null;
  actualLoadLabel: string | null;
};

export type FormExercise = {
  /** Plan exercise id (log) or exercise execution id (edit). */
  key: string;
  exerciseId: string;
  name: string;
  order: number;
  sets: FormSet[];
};

export function exercisesFromAssignment(a: WorkoutAssignment): FormExercise[] {
  return a.workoutDay.exercises
    .slice()
    .sort((x, y) => x.order - y.order)
    .map((ex) => ({
      key: ex.id,
      exerciseId: ex.id,
      name: ex.name,
      order: ex.order,
      sets: ex.setTargets
        .slice()
        .sort((x, y) => x.order - y.order)
        .map((t) => ({
          id: t.id,
          order: t.order,
          prescribedReps: t.reps,
          prescribedLoadLabel: t.loadLabel,
          actualReps: null,
          actualLoadLabel: null,
        })),
    }));
}

export function exercisesFromExecution(e: WorkoutExecution): FormExercise[] {
  return e.exercises
    .slice()
    .sort((x, y) => x.order - y.order)
    .map((ex) => ({
      key: ex.id,
      exerciseId: ex.exerciseId,
      name: ex.name,
      order: ex.order,
      sets: ex.sets
        .slice()
        .sort((x, y) => x.order - y.order)
        .map((s) => ({
          id: s.id,
          order: s.order,
          prescribedReps: s.prescribedReps,
          prescribedLoadLabel: s.prescribedLoadLabel,
          actualReps: s.actualReps,
          actualLoadLabel: s.actualLoadLabel,
        })),
    }));
}

/** What a row starts with: the plan when logging, what was logged when editing. */
export function startDraft(set: FormSet): SetDraft {
  const load = set.actualLoadLabel ?? set.prescribedLoadLabel;
  return initialDraft(load, set.actualReps ?? set.prescribedReps);
}

export function draftsFor(exercises: FormExercise[]): Record<string, SetDraft> {
  const out: Record<string, SetDraft> = {};
  for (const ex of exercises) for (const set of ex.sets) out[set.id] = startDraft(set);
  return out;
}

function draftSame(a: SetDraft, b: SetDraft): boolean {
  return (
    a.bodyweight === b.bodyweight &&
    a.reps.trim() === b.reps.trim() &&
    (a.bodyweight || a.load.trim() === b.load.trim())
  );
}

/** "40 × 8", "BW × 8": the plan for a set. */
export function plannedText(set: FormSet): string {
  const load = displayLoad(set.prescribedLoadLabel);
  return `${load} × ${set.prescribedReps ?? "—"}`;
}

/** "4 × 8" when every set has the same reps, else "4 sets". */
export function exerciseSummary(sets: FormSet[]): string {
  const reps = new Set(sets.map((s) => s.prescribedReps));
  const first = sets[0]?.prescribedReps;
  return reps.size === 1 && first != null ? `${sets.length} × ${first}` : `${sets.length} sets`;
}

function setBody(draft: SetDraft, prescribedLoadLabel: string | null) {
  const reps = Number.parseInt(draft.reps.trim(), 10);
  const load = loadBody(draft, prescribedLoadLabel);
  return {
    status: "completed" as const,
    ...(Number.isFinite(reps) ? { actualReps: reps } : {}),
    ...(load.actualLoadKg !== undefined ? { actualLoadKg: load.actualLoadKg } : {}),
    ...(load.actualLoadLabel === "Bodyweight" ? { bodyweight: true as const } : {}),
  };
}

/** Every set of the workout day, as done, with the values on screen (Z6-19). */
export function buildLogBody(
  exercises: FormExercise[],
  drafts: Record<string, SetDraft>,
  performedAt: string,
): CoachLogWorkoutRequest {
  return {
    performedAt,
    exercises: exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      sets: ex.sets.map((set) => ({
        setTargetId: set.id,
        ...setBody(drafts[set.id] ?? startDraft(set), set.prescribedLoadLabel),
      })),
    })),
  };
}

/** Only the sets the trainer changed; null when nothing changed. */
export function buildEditBody(
  exercises: FormExercise[],
  drafts: Record<string, SetDraft>,
  recordVersion: number,
): CoachEditWorkoutRequest | null {
  const sets: NonNullable<CoachEditWorkoutRequest["sets"]> = [];
  for (const ex of exercises) {
    for (const set of ex.sets) {
      const draft = drafts[set.id] ?? startDraft(set);
      if (draftSame(draft, startDraft(set))) continue;
      const kg = Number.parseFloat(draft.load);
      const load = draft.bodyweight
        ? { bodyweight: true as const }
        : Number.isFinite(kg)
          ? { actualLoadKg: Math.round(kg * 100) / 100 }
          : {};
      const reps = Number.parseInt(draft.reps.trim(), 10);
      sets.push({
        setExecutionId: set.id,
        status: "completed",
        ...(Number.isFinite(reps) ? { actualReps: reps } : {}),
        ...load,
      });
    }
  }
  return sets.length > 0 ? { recordVersion, sets } : null;
}

/** "Logged by you" / "Edited by you" for an entry the trainer wrote or changed (R1). */
export function authorshipLabel(e: Pick<WorkoutExecution, "loggedByRole" | "lastEditedByRole">): string | null {
  if (e.lastEditedByRole === "coach") return "Edited by you";
  if (e.loggedByRole === "coach") return "Logged by you";
  return null;
}
