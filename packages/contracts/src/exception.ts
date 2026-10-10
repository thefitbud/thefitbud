import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";

/** Persisted exception lifecycle. Dismissed is deferred. */
export const exceptionStatusSchema = z.enum([
  "detected",
  "active",
  "acknowledged",
  "resolved",
]);
export type ExceptionStatus = z.infer<typeof exceptionStatusSchema>;

/**
 * Deterministic exception types. No opaque risk scores and no fifth
 * client-adherence value.
 */
export const exceptionTypeSchema = z.enum([
  "missed_workout",
  "skipped_workout",
  "overdue_meal",
  "skipped_meal",
  "meal_deviation",
  "meal_logged_later",
  "overdue_checkin",
]);
export type ExceptionType = z.infer<typeof exceptionTypeSchema>;

/** Stored activity severity. On track means no exception was created. */
export const exceptionSeveritySchema = z.enum(["critical", "attention"]);
export type ExceptionSeverity = z.infer<typeof exceptionSeveritySchema>;

export const exceptionSourceEntityTypeSchema = z.enum([
  "workout_assignment",
  "meal_assignment",
  "checkin",
]);
export type ExceptionSourceEntityType = z.infer<
  typeof exceptionSourceEntityTypeSchema
>;

export const exceptionActionKindSchema = z.enum(["acknowledge", "resolve"]);
export type ExceptionActionKind = z.infer<typeof exceptionActionKindSchema>;

export const interventionKindSchema = z.enum([
  "note",
  "acknowledge",
  "resolve",
  "plan_adjustment",
  "schedule_checkin",
]);
export type InterventionKind = z.infer<typeof interventionKindSchema>;

export const exceptionSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  type: exceptionTypeSchema,
  severity: exceptionSeveritySchema,
  status: exceptionStatusSchema,
  ruleVersion: z.string().min(1).max(64),
  sourceEntityType: exceptionSourceEntityTypeSchema,
  sourceEntityId: uuidSchema,
  summary: z.string().min(1).max(500),
  details: z.record(z.string(), z.unknown()).nullable(),
  detectedAt: isoDateTimeSchema,
  activatedAt: isoDateTimeSchema.nullable(),
  acknowledgedAt: isoDateTimeSchema.nullable(),
  resolvedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Exception = z.infer<typeof exceptionSchema>;

export const exceptionActionSchema = z.object({
  id: uuidSchema,
  exceptionId: uuidSchema,
  trainerUserId: uuidSchema,
  action: exceptionActionKindSchema,
  note: z.string().max(2000).nullable(),
  createdAt: isoDateTimeSchema,
});
export type ExceptionAction = z.infer<typeof exceptionActionSchema>;

export const exceptionDetailSchema = exceptionSchema.extend({
  actions: z.array(exceptionActionSchema),
});
export type ExceptionDetail = z.infer<typeof exceptionDetailSchema>;

export const attentionItemSchema = z.object({
  exception: exceptionSchema,
  coachingRelationshipId: uuidSchema,
  traineeUserId: uuidSchema,
  traineeDisplayName: z.string().nullable(),
});
export type AttentionItem = z.infer<typeof attentionItemSchema>;

export const attentionFeedResponseSchema = cursorPageSchema(attentionItemSchema);
export type AttentionFeedResponse = z.infer<typeof attentionFeedResponseSchema>;

export const exceptionListResponseSchema = cursorPageSchema(exceptionSchema);
export type ExceptionListResponse = z.infer<typeof exceptionListResponseSchema>;

export const evaluateExceptionsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  activated: z.number().int().nonnegative(),
  resolved: z.number().int().nonnegative(),
  exceptions: z.array(exceptionSchema),
});
export type EvaluateExceptionsResponse = z.infer<
  typeof evaluateExceptionsResponseSchema
>;

export const acknowledgeExceptionRequestSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
});
export type AcknowledgeExceptionRequest = z.infer<
  typeof acknowledgeExceptionRequestSchema
>;

export const resolveExceptionRequestSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
  interventionKind: z
    .enum(["note", "resolve", "plan_adjustment", "schedule_checkin"])
    .optional(),
  resultingPlanVersionId: uuidSchema.nullable().optional(),
});
export type ResolveExceptionRequest = z.infer<
  typeof resolveExceptionRequestSchema
>;

export const interventionSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  trainerUserId: uuidSchema,
  exceptionId: uuidSchema.nullable(),
  checkinId: uuidSchema.nullable(),
  kind: interventionKindSchema,
  summary: z.string().min(1).max(500),
  resultingPlanVersionId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Intervention = z.infer<typeof interventionSchema>;

export const createInterventionRequestSchema = z.object({
  kind: interventionKindSchema,
  summary: z.string().trim().min(1).max(500),
  exceptionId: uuidSchema.nullable().optional(),
  checkinId: uuidSchema.nullable().optional(),
  resultingPlanVersionId: uuidSchema.nullable().optional(),
});
export type CreateInterventionRequest = z.infer<
  typeof createInterventionRequestSchema
>;

export const interventionListResponseSchema = cursorPageSchema(interventionSchema);
export type InterventionListResponse = z.infer<
  typeof interventionListResponseSchema
>;

/** Compact exception summary for check-in review context. */
export const activeExceptionSummarySchema = z.object({
  id: uuidSchema,
  type: exceptionTypeSchema,
  status: exceptionStatusSchema,
  summary: z.string(),
  sourceEntityType: exceptionSourceEntityTypeSchema,
  sourceEntityId: uuidSchema,
  detectedAt: isoDateTimeSchema,
});
export type ActiveExceptionSummary = z.infer<
  typeof activeExceptionSummarySchema
>;
