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
  /**
   * D-W12-24: a `customFood` on a logged-foods log is also saved to the
   * trainee's own foods (search and Recent) unless this is false. False keeps
   * it on this log only; the coach still sees it as added by the client.
   * Omitted means true. Ignored for library items and on other deviation
   * kinds, which never save a food.
   */
  saveToMyFoods: z.boolean().optional(),
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
  /**
   * Who logged the entry (Z6-20, R1): `coach` entries are read-only to the
   * trainee ("Logged by your coach"). The API always sends it (REST reads and
   * sync pull payloads); optional so older clients' fixtures parse.
   */
  loggedByRole: z.enum(["trainee", "coach"]).optional(),
  /** Set when a coach edited the entry ("Edited by your coach"). */
  lastEditedByRole: z.enum(["trainee", "coach"]).nullable().optional(),
  /** When the entry was last edited (Z14-11, D-W14-23); null when never edited. */
  lastEditedAt: isoDateTimeSchema.nullable().optional(),
  /**
   * Z14-11 / D-W14-22: only on reads for the trainee. The instant the trainee's
   * 24 h edit window closes (their `loggedAt` + 24 h), or `null` when the entry
   * cannot be edited at all (logged or edited by the coach, ended relationship).
   * The app shows its hint and buttons from this, never from its own rule.
   */
  editableUntil: isoDateTimeSchema.nullable().optional(),
  /**
   * Z14-11 / D-W14-22 (c): only on reads for the trainee. True only while
   * `editableUntil` is in the future and the meal could still be logged again.
   */
  canRemove: z.boolean().optional(),
  /**
   * Z14-11 / D-W14-23: only on coach reads, when the trainee edited the entry.
   * What the entry said before that edit.
   */
  previousValue: z
    .object({
      outcome: mealComplianceOutcomeSchema,
      deviationKind: mealDeviationKindSchema.nullable(),
      notes: z.string().max(500).nullable(),
      kcal: z.number().int().nonnegative().nullable(),
    })
    .nullable()
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
  /**
   * When the trainee confirmed, for an offline or near-midnight submit
   * (Z7-20). Omitted: the server receive time is used.
   */
  clientLoggedAt: isoDateTimeSchema.optional(),
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
  /**
   * When the trainee skipped, for an offline or near-midnight submit
   * (Z7-20). Omitted: the server receive time is used.
   */
  clientLoggedAt: isoDateTimeSchema.optional(),
});
export type SkipMealRequest = z.infer<typeof skipMealRequestSchema>;

/**
 * `PATCH /meals/logs/:id` (trainee, Idempotency-Key). Replaces the outcome,
 * amounts and note of the trainee's own entry for 24 h after it was logged
 * (Z14-11, D-W14-22). `items` carry the portion lines, food-search items or an
 * ate-out kcal line, as at log time. `recordVersion` is the version edited.
 */
export const traineeEditMealRequestSchema = z
  .object({
    outcome: mealComplianceOutcomeSchema,
    deviationKind: mealDeviationKindSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    items: z.array(loggedFoodItemSchema).max(20).optional(),
    recordVersion: z.number().int().nonnegative(),
  })
  .superRefine((body, ctx) => {
    if (body.outcome === "modified" && !body.deviationKind) {
      ctx.addIssue({
        code: "custom",
        path: ["deviationKind"],
        message: "A changed meal needs a deviation kind.",
      });
    }
    if (body.outcome !== "modified" && body.deviationKind) {
      ctx.addIssue({
        code: "custom",
        path: ["deviationKind"],
        message: "Only a changed meal has a deviation kind.",
      });
    }
    if (body.outcome !== "modified" && body.items && body.items.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Only a changed meal carries food items.",
      });
    }
  });
export type TraineeEditMealRequest = z.infer<typeof traineeEditMealRequestSchema>;

/** `DELETE /meals/logs/:id` (trainee, Idempotency-Key): the version being removed. */
export const traineeRemoveMealRequestSchema = z.object({
  recordVersion: z.number().int().nonnegative(),
});
export type TraineeRemoveMealRequest = z.infer<typeof traineeRemoveMealRequestSchema>;

/** `POST /meals/logs/:id/photo` (trainee, Idempotency-Key). */
export const attachMealPhotoRequestSchema = z.object({
  mediaAssetId: uuidSchema,
});
export type AttachMealPhotoRequest = z.infer<typeof attachMealPhotoRequestSchema>;

/** Response of `DELETE /meals/logs/:id`: the meal is not logged again. */
export const removeMealLogResponseSchema = z.object({
  /** The removed entry's id (sync reads it as the record id). */
  id: uuidSchema,
  assignmentId: uuidSchema,
  coachingRelationshipId: uuidSchema,
  removed: z.literal(true),
});
export type RemoveMealLogResponse = z.infer<typeof removeMealLogResponseSchema>;

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
