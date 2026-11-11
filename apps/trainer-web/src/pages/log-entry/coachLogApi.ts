import {
  coachEditMeasurementRequestSchema,
  coachLogMealRequestSchema,
  mealComplianceSchema,
  measurementSchema,
  type CoachEditMeasurementRequest,
  type CoachLogMealRequest,
  type MealCompliance,
  type Measurement,
} from "@fitbud/contracts";
import { apiClient } from "../../lib/api";

/**
 * The Z6-20 trainer routes have no typed api-client method yet (`packages/api-client`
 * is outside this task's files), so they go through the client's own `request`:
 * same auth, token refresh, error body and response parsing as every other call.
 */

/** Trainer logs or corrects a client's meal entry (PUT, Idempotency-Key). */
export function putClientMeal(
  assignmentId: string,
  localDate: string,
  body: CoachLogMealRequest,
  idempotencyKey: string,
): Promise<MealCompliance> {
  return apiClient.request(
    "PUT",
    `/meals/compliance/${encodeURIComponent(assignmentId)}/${encodeURIComponent(localDate)}`,
    mealComplianceSchema,
    { auth: true, body: coachLogMealRequestSchema.parse(body), idempotencyKey },
  );
}

/** Trainer edits a client's measurement; `recordVersion` guards the write. */
export function patchClientMeasurement(
  measurementId: string,
  body: CoachEditMeasurementRequest,
): Promise<Measurement> {
  return apiClient.request(
    "PATCH",
    `/progress/measurements/${encodeURIComponent(measurementId)}`,
    measurementSchema,
    { auth: true, body: coachEditMeasurementRequestSchema.parse(body) },
  );
}
