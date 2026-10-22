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

export const loggedFoodItemSchema = z.object({
  foodId: uuidSchema.optional(),
  servingId: uuidSchema.optional(),
  quantity: z.number().positive().max(100).optional(),
  customFood: z
    .object({
      name: z.string().trim().min(1).max(120),
      kcal: z.number().int().nonnegative().max(20000),
      protein: z.number().nonnegative().max(2000).optional(),
      carbs: z.number().nonnegative().max(2000).optional(),
      fat: z.number().nonnegative().max(2000).optional(),
      servingLabel: z.string().trim().max(120).optional(),
    })
    .optional(),
});
export type LoggedFoodItem = z.infer<typeof loggedFoodItemSchema>;

export const mealDeviationKindSchema = z.enum([
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
  "manual",
  "other",
  "logged_foods",
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

/** Display row for foods logged against a meal (TW-17 meal panel). */
export const mealComplianceLoggedItemSchema = z.object({
  name: z.string().min(1).max(160),
  quantity: z.number().positive().max(100).nullable().optional(),
  servingLabel: z.string().max(120).nullable().optional(),
  energyKcal: z.number().nonnegative().nullable().optional(),
  proteinG: z.number().nonnegative().nullable().optional(),
  carbsG: z.number().nonnegative().nullable().optional(),
  fatG: z.number().nonnegative().nullable().optional(),
  custom: z.boolean().optional(),
  foodId: uuidSchema.optional(),
});
export type MealComplianceLoggedItem = z.infer<
  typeof mealComplianceLoggedItemSchema
>;

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
  /** Parsed logged foods when the trainee recorded a change (TW-17). */
  loggedItems: z.array(mealComplianceLoggedItemSchema).optional(),
  /** Totals for logged foods (kcal / macros). Null means unknown. */
  loggedTotals: z
    .object({
      energyKcal: z.number().nonnegative().nullable(),
      proteinG: z.number().nonnegative().nullable(),
      carbsG: z.number().nonnegative().nullable(),
      fatG: z.number().nonnegative().nullable(),
    })
    .optional(),
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
  /**
   * Derived for trainee UI: resolved exception / closed window.
   * When true, hide logging actions and show loggingLockReason copy.
   */
  loggingLocked: z.boolean().optional().default(false),
  loggingLockReason: z.string().max(64).nullable().optional(),
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
  items: z.array(loggedFoodItemSchema).max(20).optional(),
  clientLoggedAt: isoDateTimeSchema.optional(),
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
