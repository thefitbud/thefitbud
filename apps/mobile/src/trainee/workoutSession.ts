import { ApiClientError, type FitBudApiClient } from "@fitbud/api-client";
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
  return err instanceof ApiClientError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not start workout.";
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
