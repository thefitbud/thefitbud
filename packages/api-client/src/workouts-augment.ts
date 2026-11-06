import {
  coachEditWorkoutRequestSchema,
  coachLogWorkoutRequestSchema,
  workoutExecutionSchema,
  type CoachEditWorkoutRequest,
  type CoachLogWorkoutRequest,
  type WorkoutExecution,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

declare module "./index.js" {
  interface FitBudApiClient {
    /**
     * Trainer logs a client's finished workout (Z6-19). Reuse the same
     * `idempotencyKey` when retrying one logical log.
     */
    logClientWorkout(
      assignmentId: string,
      body: CoachLogWorkoutRequest,
      idempotencyKey: string,
    ): Promise<WorkoutExecution>;
    /** Trainer edits a client's finished workout (Z6-19); send the `recordVersion` read. */
    editClientWorkout(
      executionId: string,
      body: CoachEditWorkoutRequest,
    ): Promise<WorkoutExecution>;
  }
}

export function installWorkoutsClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;
  proto.logClientWorkout = async function logClientWorkout(
    assignmentId,
    body,
    idempotencyKey,
  ) {
    return this.request(
      "POST",
      `/workouts/assignments/${encodeURIComponent(assignmentId)}/log`,
      workoutExecutionSchema,
      { auth: true, body: coachLogWorkoutRequestSchema.parse(body), idempotencyKey },
    );
  };
  proto.editClientWorkout = async function editClientWorkout(executionId, body) {
    return this.request(
      "PATCH",
      `/workouts/executions/${encodeURIComponent(executionId)}`,
      workoutExecutionSchema,
      { auth: true, body: coachEditWorkoutRequestSchema.parse(body) },
    );
  };
}
