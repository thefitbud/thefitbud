import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  completeSetRequestSchema,
  completeWorkoutRequestSchema,
} from "./workout.js";
import {
  confirmMealRequestSchema,
  deviateMealRequestSchema,
  skipMealRequestSchema,
} from "./meal.js";
import {
  saveCheckinDraftRequestSchema,
  submitCheckinRequestSchema,
} from "./checkin.js";
import { createMeasurementRequestSchema } from "./progress.js";

/**
 * Entities that participate in trainee offline sync.
 * Published plan versions are pull-only (never edited via sync).
 */
export const syncEntityTypeSchema = z.enum([
  "effective_plan",
  "workout_assignment",
  "workout_execution",
  "meal_assignment",
  "meal_compliance",
  "checkin",
  "measurement",
]);
export type SyncEntityType = z.infer<typeof syncEntityTypeSchema>;

/**
 * Offline-capable trainee mutations.
 * File uploads are intentionally absent — they stay on the separate files API.
 */
export const syncMutationOperationSchema = z.enum([
  "workout.start",
  "workout.pause",
  "workout.resume",
  "workout.complete_set",
  "workout.complete",
  "workout.skip",
  "meal.confirm",
  "meal.deviate",
  "meal.skip",
  "checkin.save_draft",
  "checkin.submit",
  "measurement.create",
]);
export type SyncMutationOperation = z.infer<typeof syncMutationOperationSchema>;

export const syncMutationResultStatusSchema = z.enum([
  "applied",
  "already_applied",
  "rejected",
  "conflicted",
]);
export type SyncMutationResultStatus = z.infer<
  typeof syncMutationResultStatusSchema
>;

export const syncChangeKindSchema = z.enum(["upsert", "tombstone"]);
export type SyncChangeKind = z.infer<typeof syncChangeKindSchema>;

const workoutStartPayloadSchema = z.object({
  assignmentId: uuidSchema,
});

const workoutExecutionActionPayloadSchema = z.object({
  executionId: uuidSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
});

const workoutCompleteSetPayloadSchema = z.object({
  executionId: uuidSchema,
  setExecutionId: uuidSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
  body: completeSetRequestSchema.default({}),
});

const workoutCompletePayloadSchema = z.object({
  executionId: uuidSchema,
  expectedVersion: z.number().int().nonnegative().optional(),
  body: completeWorkoutRequestSchema,
});

const workoutSkipPayloadSchema = z.object({
  assignmentId: uuidSchema,
});

const mealConfirmPayloadSchema = z.object({
  assignmentId: uuidSchema,
  body: confirmMealRequestSchema.default({}),
});

const mealDeviatePayloadSchema = z.object({
  assignmentId: uuidSchema,
  body: deviateMealRequestSchema,
});

const mealSkipPayloadSchema = z.object({
  assignmentId: uuidSchema,
  body: skipMealRequestSchema.default({}),
});

const checkinDraftPayloadSchema = z.object({
  checkinId: uuidSchema,
  body: saveCheckinDraftRequestSchema,
});

const checkinSubmitPayloadSchema = z.object({
  checkinId: uuidSchema,
  body: submitCheckinRequestSchema,
});

const measurementCreatePayloadSchema = z.object({
  coachingRelationshipId: uuidSchema,
  /** Stable client-generated UUID for offline-created measurements. */
  id: uuidSchema.optional(),
  body: createMeasurementRequestSchema,
});

export const syncMutationPayloadSchema = z.union([
  workoutStartPayloadSchema,
  workoutExecutionActionPayloadSchema,
  workoutCompleteSetPayloadSchema,
  workoutCompletePayloadSchema,
  workoutSkipPayloadSchema,
  mealConfirmPayloadSchema,
  mealDeviatePayloadSchema,
  mealSkipPayloadSchema,
  checkinDraftPayloadSchema,
  checkinSubmitPayloadSchema,
  measurementCreatePayloadSchema,
]);
export type SyncMutationPayload = z.infer<typeof syncMutationPayloadSchema>;

export const syncMutationRequestSchema = z.object({
  mutationId: uuidSchema,
  idempotencyKey: uuidSchema,
  entityType: syncEntityTypeSchema,
  recordId: uuidSchema,
  operation: syncMutationOperationSchema,
  expectedServerVersion: z.number().int().nonnegative().nullable().optional(),
  clientOccurredAt: isoDateTimeSchema,
  payload: z.record(z.unknown()),
});
export type SyncMutationRequest = z.infer<typeof syncMutationRequestSchema>;

export const syncPushRequestSchema = z.object({
  mutations: z.array(syncMutationRequestSchema).min(1).max(50),
});
export type SyncPushRequest = z.infer<typeof syncPushRequestSchema>;

export const syncMutationErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
});
export type SyncMutationError = z.infer<typeof syncMutationErrorSchema>;

export const syncMutationResultSchema = z.object({
  mutationId: uuidSchema,
  status: syncMutationResultStatusSchema,
  recordId: uuidSchema.nullable(),
  serverVersion: z.number().int().nonnegative().nullable(),
  entityType: syncEntityTypeSchema.nullable(),
  error: syncMutationErrorSchema.nullable(),
});
export type SyncMutationResult = z.infer<typeof syncMutationResultSchema>;

export const syncPushResponseSchema = z.object({
  results: z.array(syncMutationResultSchema),
});
export type SyncPushResponse = z.infer<typeof syncPushResponseSchema>;

export const syncChangeRecordSchema = z.object({
  sequence: z.number().int().positive(),
  entityType: syncEntityTypeSchema,
  recordId: uuidSchema,
  changeKind: syncChangeKindSchema,
  serverVersion: z.number().int().nonnegative().nullable(),
  coachingRelationshipId: uuidSchema,
  changedAt: isoDateTimeSchema,
  /** Authoritative domain payload for upserts; null for tombstones. */
  payload: z.unknown().nullable(),
});
export type SyncChangeRecord = z.infer<typeof syncChangeRecordSchema>;

export const syncPullResponseSchema = z.object({
  changes: z.array(syncChangeRecordSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
});
export type SyncPullResponse = z.infer<typeof syncPullResponseSchema>;

/** Maps each mutation operation to its primary entity type. */
export const SYNC_OPERATION_ENTITY: Record<
  SyncMutationOperation,
  SyncEntityType
> = {
  "workout.start": "workout_execution",
  "workout.pause": "workout_execution",
  "workout.resume": "workout_execution",
  "workout.complete_set": "workout_execution",
  "workout.complete": "workout_execution",
  "workout.skip": "workout_execution",
  "meal.confirm": "meal_compliance",
  "meal.deviate": "meal_compliance",
  "meal.skip": "meal_compliance",
  "checkin.save_draft": "checkin",
  "checkin.submit": "checkin",
  "measurement.create": "measurement",
};
