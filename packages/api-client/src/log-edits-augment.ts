import {
  attachMealPhotoRequestSchema,
  mealComplianceSchema,
  removeMealLogResponseSchema,
  traineeEditMealRequestSchema,
  traineeRemoveMealRequestSchema,
  traineeWorkoutFeedbackRequestSchema,
  workoutExecutionSchema,
  type AttachMealPhotoRequest,
  type MealCompliance,
  type RemoveMealLogResponse,
  type TraineeEditMealRequest,
  type TraineeRemoveMealRequest,
  type TraineeWorkoutFeedbackRequest,
  type WorkoutExecution,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "./index.js";

declare module "./index.js" {
  interface FitBudApiClient {
    /**
     * Trainee sets or clears the session RPE and/or the note of a finished
     * workout, for 48 h after it finished (Z14-11, D-W14-20, Z14-31 /
     * D-W14-34). Omit `rpe` or `note` to leave it unchanged; `null` clears it.
     * Send the `recordVersion` read and reuse the same `idempotencyKey` when
     * retrying one logical change.
     */
    setWorkoutFeedback(
      executionId: string,
      body: TraineeWorkoutFeedbackRequest,
      idempotencyKey: string,
    ): Promise<WorkoutExecution>;
    /** Trainee edits their own logged meal for 24 h (Z14-11, D-W14-22). */
    editMealLog(
      entryId: string,
      body: TraineeEditMealRequest,
      idempotencyKey: string,
    ): Promise<MealCompliance>;
    /** Trainee removes their own logged meal while it can still be logged again. */
    removeMealLog(
      entryId: string,
      body: TraineeRemoveMealRequest,
      idempotencyKey: string,
    ): Promise<RemoveMealLogResponse>;
    /** Trainee attaches an uploaded meal photo to a logged meal (Z14-11, D-W14-19). */
    attachMealPhoto(
      entryId: string,
      body: AttachMealPhotoRequest,
      idempotencyKey: string,
    ): Promise<MealCompliance>;
  }
}

export function installLogEditsClientMethods(
  Client: new (...args: never[]) => FitBudApiClient,
): void {
  const proto = Client.prototype as FitBudApiClient;
  proto.setWorkoutFeedback = async function setWorkoutFeedback(
    executionId,
    body,
    idempotencyKey,
  ) {
    return this.request(
      "PATCH",
      `/workouts/executions/${encodeURIComponent(executionId)}/feedback`,
      workoutExecutionSchema,
      { auth: true, body: traineeWorkoutFeedbackRequestSchema.parse(body), idempotencyKey },
    );
  };
  proto.editMealLog = async function editMealLog(entryId, body, idempotencyKey) {
    return this.request(
      "PATCH",
      `/meals/logs/${encodeURIComponent(entryId)}`,
      mealComplianceSchema,
      { auth: true, body: traineeEditMealRequestSchema.parse(body), idempotencyKey },
    );
  };
  proto.removeMealLog = async function removeMealLog(entryId, body, idempotencyKey) {
    return this.request(
      "DELETE",
      `/meals/logs/${encodeURIComponent(entryId)}`,
      removeMealLogResponseSchema,
      { auth: true, body: traineeRemoveMealRequestSchema.parse(body), idempotencyKey },
    );
  };
  proto.attachMealPhoto = async function attachMealPhoto(entryId, body, idempotencyKey) {
    return this.request(
      "POST",
      `/meals/logs/${encodeURIComponent(entryId)}/photo`,
      mealComplianceSchema,
      { auth: true, body: attachMealPhotoRequestSchema.parse(body), idempotencyKey },
    );
  };
}
