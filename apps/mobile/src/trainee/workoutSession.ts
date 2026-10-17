import { ApiClientError, type FitBudApiClient } from "@fitbud/api-client";
import type { WorkoutAssignment, WorkoutExecution } from "@fitbud/contracts";
import { enqueueAndPush } from "../sync/actions";
import type { SyncEngine } from "../sync/engine";

export async function openActiveWorkout(
  api: FitBudApiClient,
  sync: SyncEngine,
  assignment: WorkoutAssignment,
): Promise<WorkoutExecution> {
  if (
    assignment.execution &&
    (assignment.status === "in_progress" || assignment.status === "paused")
  ) {
    return api.getWorkoutExecution(assignment.execution.id);
  }

  await enqueueAndPush(sync, {
    recordId: assignment.id,
    operation: "workout.start",
    payload: { assignmentId: assignment.id },
  });
  const refreshed = await api.getWorkoutAssignment(assignment.id);
  if (!refreshed.execution) {
    throw new Error("Workout did not start.");
  }
  return api.getWorkoutExecution(refreshed.execution.id);
}

export function workoutStartError(err: unknown): string {
  return err instanceof ApiClientError
    ? err.message
    : err instanceof Error
      ? err.message
      : "Could not start workout.";
}
