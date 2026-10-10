import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  assignmentScheduleStatusSchema,
  assignmentWindowModeSchema,
  dietAdjustmentScopeSchema,
  mealPrescriptionSchema,
} from "./plan.js";
import { localDateSchema } from "./workout.js";

/** Persisted compliance outcome. Pending / Logged Later / Overdue are never stored. */
export const mealComplianceOutcomeSchema = z.enum([
  "confirmed",
  "modified",
  "skipped",
]);
export type MealComplianceOutcome = z.infer<typeof mealComplianceOutcomeSchema>;

/** Assignment view status including server-derived Pending / Logged Later / Overdue. */
export const mealAssignmentStatusSchema = z.enum([
  "pending",
  "confirmed",
  "modified",
  "skipped",
  "logged_later",
  "overdue",
]);
export type MealAssignmentStatus = z.infer<typeof mealAssignmentStatusSchema>;

export const mealDeviationKindSchema = z.enum([
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
  "manual",
  "other",
]);
export type MealDeviationKind = z.infer<typeof mealDeviationKindSchema>;

/**
 * Meal photo association. When a meal requires a photo, `mediaAssetId` must
 * reference a ready meal_photo media asset owned by the coaching relationship.
 * Object keys are never authorization.
 */
export const mealPhotoIntentSchema = z.object({
  notedAt: isoDateTimeSchema,
  mediaAssetId: uuidSchema,
  contentType: z.string().trim().max(120).nullable().optional(),
  clientRef: z.string().trim().max(120).nullable().optional(),
});
export type MealPhotoIntent = z.infer<typeof mealPhotoIntentSchema>;

export const mealComplianceSchema = z.object({
  id: uuidSchema,
  assignmentId: uuidSchema,
  coachingRelationshipId: uuidSchema,
  planVersionId: uuidSchema,
  traineeUserId: uuidSchema,
  outcome: mealComplianceOutcomeSchema,
  recordVersion: z.number().int().nonnegative(),
  loggedAt: isoDateTimeSchema,
  deviationKind: mealDeviationKindSchema.nullable(),
  notes: z.string().max(500).nullable(),
  photoRequired: z.boolean(),
  photoIntent: mealPhotoIntentSchema.nullable(),
  /** Linked R2 media asset when upload completed (D1). */
  mediaAssetId: uuidSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type MealCompliance = z.infer<typeof mealComplianceSchema>;

export const mealAssignmentSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  planId: uuidSchema,
  planVersionId: uuidSchema,
  mealPrescriptionId: uuidSchema,
  mealName: z.string().min(1).max(120),
  localDate: localDateSchema,
  windowStartsAt: isoDateTimeSchema,
  windowEndsAt: isoDateTimeSchema,
  photoRequired: z.boolean(),
  /** Derived for UI; Pending / Logged Later / Overdue are never client-written. */
  status: mealAssignmentStatusSchema,
  scheduleStatus: assignmentScheduleStatusSchema.default("scheduled"),
  supersededAt: isoDateTimeSchema.nullable().optional(),
  supersededByPlanVersionId: uuidSchema.nullable().optional(),
  prescription: mealPrescriptionSchema,
  compliance: mealComplianceSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type MealAssignment = z.infer<typeof mealAssignmentSchema>;

export const mealAssignmentListResponseSchema = cursorPageSchema(
  mealAssignmentSchema,
);
export type MealAssignmentListResponse = z.infer<
  typeof mealAssignmentListResponseSchema
>;

export const generateMealAssignmentsRequestSchema = z.object({
  window: assignmentWindowModeSchema.optional(),
  fromDate: localDateSchema.optional(),
  toDate: localDateSchema.optional(),
  dietScope: dietAdjustmentScopeSchema.optional(),
});
export type GenerateMealAssignmentsRequest = z.infer<
  typeof generateMealAssignmentsRequestSchema
>;

export const generateMealAssignmentsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  assignments: z.array(mealAssignmentSchema),
});
export type GenerateMealAssignmentsResponse = z.infer<
  typeof generateMealAssignmentsResponseSchema
>;

export const confirmMealRequestSchema = z.object({
  photoIntent: mealPhotoIntentSchema.nullable().optional(),
});
export type ConfirmMealRequest = z.infer<typeof confirmMealRequestSchema>;

export const deviateMealRequestSchema = z.object({
  deviationKind: mealDeviationKindSchema,
  notes: z.string().trim().max(500).nullable().optional(),
  photoIntent: mealPhotoIntentSchema.nullable().optional(),
});
export type DeviateMealRequest = z.infer<typeof deviateMealRequestSchema>;

export const skipMealRequestSchema = z.object({
  notes: z.string().trim().max(500).nullable().optional(),
});
export type SkipMealRequest = z.infer<typeof skipMealRequestSchema>;

export const mealComplianceItemSchema = z.object({
  assignmentId: uuidSchema,
  localDate: localDateSchema,
  mealName: z.string().min(1).max(120),
  status: mealAssignmentStatusSchema,
  outcome: mealComplianceOutcomeSchema.nullable(),
  planVersionId: uuidSchema,
  loggedAt: isoDateTimeSchema.nullable(),
  photoRequired: z.boolean(),
  hasPhotoIntent: z.boolean(),
  mediaAssetId: uuidSchema.nullable(),
});
export type MealComplianceItem = z.infer<typeof mealComplianceItemSchema>;

export const mealComplianceSummaryResponseSchema = z.object({
  items: z.array(mealComplianceItemSchema),
  totals: z.object({
    pending: z.number().int().nonnegative(),
    confirmed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    loggedLater: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
  }),
});
export type MealComplianceSummaryResponse = z.infer<
  typeof mealComplianceSummaryResponseSchema
>;
