import { type FitBudApiClient, userFacingMessage } from "@fitbud/api-client";
import type {
  WorkoutAssignment,
  WorkoutExecution,
  WorkoutExecutionSummary,
} from "@fitbud/contracts";
import { createIdempotencyKey } from "../lib/idempotency";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";

function newId(): string {
  return createIdempotencyKey();
}

/** Build a local execution snapshot from the assignment plan (offline start/continue). */
export function synthesizeExecutionFromAssignment(
  assignment: WorkoutAssignment,
  existing?: WorkoutExecutionSummary | null,
): WorkoutExecution {
  const now = new Date().toISOString();
  const executionId = existing?.id ?? newId();
  const status =
    existing?.status === "paused"
      ? "paused"
      : existing?.status === "started"
        ? "started"
        : "started";

  return {
    id: executionId,
    assignmentId: assignment.id,
    coachingRelationshipId: assignment.coachingRelationshipId,
    planVersionId: assignment.planVersionId,
    traineeUserId: existing?.traineeUserId ?? "",
    status,
    recordVersion: existing?.recordVersion ?? 0,
    startedAt: existing?.startedAt ?? now,
    pausedAt: existing?.pausedAt ?? null,
    completedAt: existing?.completedAt ?? null,
    sessionRpe: existing?.sessionRpe ?? null,
    requireSessionRpe: existing?.requireSessionRpe ?? false,
    exercises: [...assignment.workoutDay.exercises]
      .sort((a, b) => a.order - b.order)
      .map((exercise) => {
        const exerciseId = newId();
        return {
          id: exerciseId,
          workoutExecutionId: executionId,
          exerciseId: exercise.id,
          name: exercise.name,
          order: exercise.order,
          status: "pending" as const,
          sets: [...exercise.setTargets]
            .sort((a, b) => a.order - b.order)
            .map((target) => ({
              id: newId(),
              exerciseExecutionId: exerciseId,
              setTargetId: target.id,
              order: target.order,
              status: "pending" as const,
              prescribedReps: target.reps,
              prescribedLoadLabel: target.loadLabel,
              actualReps: null,
              actualLoadLabel: null,
              completedAt: null,
              createdAt: now,
              updatedAt: now,
            })),
          createdAt: now,
          updatedAt: now,
        };
      }),
    createdAt: existing?.createdAt ?? now,
    updatedAt: existing?.updatedAt ?? now,
  };
}

async function fetchExecutionOrSynthesize(
  api: FitBudApiClient,
  assignment: WorkoutAssignment,
  summary: WorkoutExecutionSummary,
): Promise<WorkoutExecution> {
  try {
    return await api.getWorkoutExecution(summary.id);
  } catch {
    return synthesizeExecutionFromAssignment(assignment, summary);
  }
}

/**
 * Start or resume a workout. Prefers an existing local execution summary,
 * then enqueues start and refreshes; synthesizes from the assignment when
 * offline so the gym path still works.
 */
export async function openActiveWorkout(
  api: FitBudApiClient,
  sync: SyncEngine,
  assignment: WorkoutAssignment,
): Promise<WorkoutExecution> {
  if (
    assignment.execution &&
    (assignment.status === "in_progress" ||
      assignment.status === "paused" ||
      assignment.execution.status === "started" ||
      assignment.execution.status === "paused")
  ) {
    return fetchExecutionOrSynthesize(api, assignment, assignment.execution);
  }

  // Prefer an already-attached execution on the assignment (local cache / prior start).
  if (
    assignment.execution &&
    assignment.execution.status !== "completed" &&
    assignment.execution.status !== "skipped" &&
    assignment.execution.status !== "modified"
  ) {
    return fetchExecutionOrSynthesize(api, assignment, assignment.execution);
  }

  await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "workout.start",
    payload: { assignmentId: assignment.id },
  });

  try {
    const refreshed = await api.getWorkoutAssignment(assignment.id);
    if (refreshed.execution) {
      return fetchExecutionOrSynthesize(api, refreshed, refreshed.execution);
    }
  } catch {
    // Offline or network failure after enqueue — synthesize below.
  }

  if (assignment.workoutDay.exercises.length === 0) {
    throw new Error(
      "Couldn't start this workout offline. Pull to refresh when you're back online.",
    );
  }

  return synthesizeExecutionFromAssignment(assignment, assignment.execution);
}

export function workoutStartError(err: unknown): string {
  return userFacingMessage(err, { fallback: "Could not start workout." });
}

/**
 * Seeded / list payloads sometimes omit nested exercise rows. Build summary
 * counts from the assignment day when the execution has no exercises (TR-12).
 */
export function enrichExecutionFromAssignmentDay(
  execution: WorkoutExecution,
  assignment: WorkoutAssignment | null | undefined,
): WorkoutExecution {
  if (execution.exercises.length > 0) return execution;
  const day = assignment?.workoutDay;
  if (!day?.exercises.length) return execution;
  const now = execution.completedAt ?? new Date().toISOString();
  const completed =
    execution.status === "completed" || execution.status === "modified";
  return {
    ...execution,
    exercises: [...day.exercises]
      .sort((a, b) => a.order - b.order)
      .map((exercise, index) => {
        const exerciseId = exercise.id;
        return {
          id: exerciseId,
          workoutExecutionId: execution.id,
          exerciseId: exercise.id,
          name: exercise.name,
          order: exercise.order ?? index + 1,
          status: completed ? ("completed" as const) : ("pending" as const),
          sets: [...exercise.setTargets]
            .sort((a, b) => a.order - b.order)
            .map((target, setIndex) => ({
              id: target.id,
              exerciseExecutionId: exerciseId,
              setTargetId: target.id,
              order: target.order ?? setIndex + 1,
              status: completed
                ? ("completed" as const)
                : ("pending" as const),
              prescribedReps: target.reps,
              prescribedLoadLabel: target.loadLabel,
              actualReps: completed ? target.reps : null,
              actualLoadLabel: completed ? target.loadLabel : null,
              completedAt: completed ? now : null,
              createdAt: now,
              updatedAt: now,
            })),
          createdAt: now,
          updatedAt: now,
        };
      }),
  };
}

/** Map setTargetId → prescribed rest seconds from the day's plan. */
export function restSecondsBySetTargetId(
  assignment: WorkoutAssignment,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const exercise of assignment.workoutDay.exercises) {
    for (const target of exercise.setTargets) {
      if (target.restSeconds != null) {
        map[target.id] = target.restSeconds;
      }
    }
  }
  return map;
}

/* -------------------------------------------------------------------------- */
/* Session figures for the Workout tab and the summary (Z12-44)                */
/* -------------------------------------------------------------------------- */

/** A set the trainee logged (as planned or changed). */
function isLoggedSet(set: { status: string }): boolean {
  return set.status === "completed" || set.status === "modified";
}

/**
 * "7 of 18 sets" (W-01b), "Sets 17 / 18" (W-01c, W-17a): logged sets out of
 * every set in the session. Skipped sets count in the total, not as done.
 */
export function sessionSetCounts(
  execution: Pick<WorkoutExecution, "exercises">,
): { done: number; skipped: number; total: number } {
  let done = 0;
  let skipped = 0;
  let total = 0;
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (isLoggedSet(set)) done += 1;
      else if (set.status === "skipped") skipped += 1;
    }
  }
  return { done, skipped, total };
}

/** "40 kg", "42.5kg": a load label that is a weight in kg, else null. */
export function kgFromLoadLabel(
  label: string | null | undefined,
): number | null {
  const match = label?.trim().match(/^(\d+(?:\.\d+)?)\s*kg$/i);
  if (!match) return null;
  const kg = Number(match[1]);
  return Number.isFinite(kg) ? kg : null;
}

/**
 * Volume (W-01c, W-17a): kg × reps over the logged sets whose load is a
 * weight in kg, from what was logged (falling back to the plan for a set
 * logged as planned). Bodyweight and other loads add nothing. Null when no
 * logged set carries a kg load, so the screen shows a dash, never "0 kg".
 */
export function sessionVolumeKg(
  execution: Pick<WorkoutExecution, "exercises">,
): number | null {
  let volume = 0;
  let counted = false;
  for (const exercise of execution.exercises) {
    for (const set of exercise.sets) {
      if (!isLoggedSet(set)) continue;
      const kg = kgFromLoadLabel(
        set.actualLoadLabel ?? set.prescribedLoadLabel,
      );
      const reps = set.actualReps ?? set.prescribedReps;
      if (kg == null || reps == null) continue;
      volume += kg * reps;
      counted = true;
    }
  }
  return counted ? Math.round(volume * 10) / 10 : null;
}

export type NextUpSet = {
  /** Index of the exercise in `execution.exercises`. */
  exerciseIndex: number;
  exerciseName: string;
  /** 1-based set number within the exercise. */
  setNumber: number;
  /** "40 × 10", or "12 reps" when the plan has no kg load. */
  target: string;
};

/**
 * The first pending set, in exercise and set order (W-01b "Up next"), or
 * null when nothing is left to log.
 */
export function nextUpSet(
  execution: Pick<WorkoutExecution, "exercises">,
): NextUpSet | null {
  const exercises = [...execution.exercises].sort((a, b) => a.order - b.order);
  for (const exercise of exercises) {
    const sets = [...exercise.sets].sort((a, b) => a.order - b.order);
    const index = sets.findIndex((set) => set.status === "pending");
    if (index < 0) continue;
    const set = sets[index]!;
    const kg = kgFromLoadLabel(set.prescribedLoadLabel);
    const reps = set.prescribedReps;
    const target =
      kg != null && reps != null
        ? `${kg} × ${reps}`
        : reps != null
          ? `${reps} reps`
          : (set.prescribedLoadLabel?.trim() ?? "");
    return {
      exerciseIndex: execution.exercises.indexOf(exercise),
      exerciseName: exercise.name,
      setNumber: index + 1,
      target,
    };
  }
  return null;
}
