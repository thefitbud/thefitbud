import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  NUTRIENT_SCALE,
  calculatedNutrientsSchema,
  exerciseDifficultySchema,
  foodClassificationSchema,
  legacyPortionToSnapshot,
  nutrientVectorSchema,
  nutritionBasisSchema,
} from "./nutrition.js";

export const planVersionStatusSchema = z.enum([
  "draft",
  "published",
  "scheduled",
  "effective",
  "superseded",
]);
export type PlanVersionStatus = z.infer<typeof planVersionStatusSchema>;

export const planCreationSourceSchema = z.enum([
  "blank",
  "previous_version",
  "template",
  "adjustment",
]);
export type PlanCreationSource = z.infer<typeof planCreationSourceSchema>;

export const workoutSetTargetSchema = z.object({
  id: uuidSchema,
  order: z.number().int().min(1).max(50),
  reps: z.number().int().min(1).max(100).nullable(),
  loadLabel: z.string().trim().max(80).nullable(),
  rpe: z.number().min(1).max(10).nullable(),
});
export type WorkoutSetTarget = z.infer<typeof workoutSetTargetSchema>;

const exerciseLabelSchema = z.string().trim().min(1).max(80);

export const workoutExerciseSchema = z.object({
  id: uuidSchema,
  order: z.number().int().min(1).max(100),
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2000).nullable(),
  primaryMuscles: z.array(exerciseLabelSchema).max(12).optional().default([]),
  secondaryMuscles: z.array(exerciseLabelSchema).max(12).optional().default([]),
  equipment: z.array(exerciseLabelSchema).max(12).optional().default([]),
  difficulty: exerciseDifficultySchema.nullable().optional().default(null),
  setTargets: z.array(workoutSetTargetSchema).max(30),
  sourceExerciseLibraryItemId: uuidSchema.optional(),
});
export type WorkoutExercise = z.infer<typeof workoutExerciseSchema>;

/** 0 = Sunday … 6 = Saturday. Omitted on legacy content that has no calendar. */
export const weekdaySchema = z.number().int().min(0).max(6);
export type Weekday = z.infer<typeof weekdaySchema>;

export const workoutDaySchema = z.object({
  id: uuidSchema,
  order: z.number().int().min(1).max(14),
  name: z.string().trim().min(1).max(120),
  weekday: weekdaySchema.nullable().optional(),
  exercises: z.array(workoutExerciseSchema).max(40),
});
export type WorkoutDay = z.infer<typeof workoutDaySchema>;

const foodServingSnapshotSchema = z.object({
  label: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  conversionScaled: z
    .number()
    .int()
    .positive()
    .max(NUTRIENT_SCALE * 5000)
    .nullable(),
});

/** New prescription snapshot. Nutrients are calculated from its own canonical copy. */
export const calculatedFoodSnapshotSchema = z.object({
  snapshotKind: z.literal("calculated"),
  name: z.string().trim().min(1).max(120),
  classification: foodClassificationSchema,
  basis: nutritionBasisSchema,
  canonical: nutrientVectorSchema,
  serving: foodServingSnapshotSchema.extend({
    conversionScaled: z.number().int().positive().max(NUTRIENT_SCALE * 5000),
  }),
  quantityScaled: z.number().int().positive().max(NUTRIENT_SCALE * 100),
  calculated: calculatedNutrientsSchema,
  sourceFoodLibraryItemId: uuidSchema.optional(),
  sourceServingId: uuidSchema.optional(),
});

/**
 * Already-calculated historical snapshot. Quantity is exactly 1 and there is
 * no basis to recalculate from.
 */
export const legacyFoodSnapshotSchema = z.object({
  snapshotKind: z.literal("legacy"),
  name: z.string().trim().min(1).max(120),
  classification: z.null(),
  basis: z.null(),
  canonical: z.null(),
  serving: foodServingSnapshotSchema.extend({
    conversionScaled: z.null(),
  }),
  quantityScaled: z.literal(NUTRIENT_SCALE),
  calculated: calculatedNutrientsSchema,
  sourceFoodLibraryItemId: uuidSchema.optional(),
});

const legacyPortionFoodSchema = z.object({
  sourceFoodLibraryItemId: uuidSchema.optional(),
  name: z.string().trim().min(1).max(120),
  portionLabel: z.string().trim().min(1).max(120),
  calories: z.number().int().nonnegative().max(20000).nullable(),
  proteinGrams: z.number().nonnegative().max(2000).nullable(),
  carbsGrams: z.number().nonnegative().max(2000).nullable(),
  fatGrams: z.number().nonnegative().max(2000).nullable(),
});

/** Snapshot of one food inside a meal. Not a live library join. */
export const mealFoodItemSchema = z.union([
  calculatedFoodSnapshotSchema,
  legacyFoodSnapshotSchema,
  legacyPortionFoodSchema.transform((item) => legacyPortionToSnapshot(item)),
]);
export type MealFoodItem = z.infer<typeof mealFoodItemSchema>;

export const mealTypeSchema = z.enum([
  "breakfast",
  "lunch",
  "snack",
  "dinner",
  "other",
]);
export type MealType = z.infer<typeof mealTypeSchema>;

/** Trainee-local clock time. Not a generation window. */
export const localTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const assignmentWindowModeSchema = z.enum([
  "next_7_days",
  "next_calendar_week",
  "custom",
]);
export type AssignmentWindowMode = z.infer<typeof assignmentWindowModeSchema>;

export const dietAdjustmentScopeSchema = z.enum(["today_onward", "today_only"]);
export type DietAdjustmentScope = z.infer<typeof dietAdjustmentScopeSchema>;

export const assignmentScheduleStatusSchema = z.enum([
  "scheduled",
  "superseded",
]);
export type AssignmentScheduleStatus = z.infer<
  typeof assignmentScheduleStatusSchema
>;

export const mealPrescriptionSchema = z.object({
  id: uuidSchema,
  order: z.number().int().min(1).max(12),
  /** Custom label, separate from meal type. */
  name: z.string().trim().min(1).max(120),
  mealType: mealTypeSchema.nullable().optional(),
  applicableWeekdays: z.array(weekdaySchema).max(7).optional(),
  localTime: localTimeSchema.nullable().optional(),
  /** Legacy display text. Ignored when placing assignments. */
  scheduleHint: z.string().trim().max(120).nullable(),
  instructions: z.string().trim().max(2000).nullable(),
  photoRequired: z.boolean(),
  items: z
    .array(mealFoodItemSchema)
    .max(30)
    .optional()
    .transform((items) => items ?? []),
});
export type MealPrescription = z.infer<typeof mealPrescriptionSchema>;

export const planContentSchema = z
  .object({
    workoutDays: z.array(workoutDaySchema).max(14),
    mealPrescriptions: z.array(mealPrescriptionSchema).max(12),
  })
  .superRefine((value, ctx) => {
    if (
      value.workoutDays.length === 0 &&
      value.mealPrescriptions.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Plan content requires at least one workout day or meal.",
      });
    }
  });
export type PlanContent = z.infer<typeof planContentSchema>;

export const planSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  title: z.string().min(1).max(160),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Plan = z.infer<typeof planSchema>;

export const planVersionSchema = z.object({
  id: uuidSchema,
  planId: uuidSchema,
  versionNumber: z.number().int().positive(),
  status: planVersionStatusSchema,
  recordVersion: z.number().int().nonnegative(),
  content: planContentSchema,
  creationSource: planCreationSourceSchema,
  /** Template the version was copied from. Provenance only; not a live join. */
  sourceTemplateId: uuidSchema.nullable(),
  publishedAt: isoDateTimeSchema.nullable(),
  effectiveFrom: isoDateTimeSchema.nullable(),
  effectiveTo: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PlanVersion = z.infer<typeof planVersionSchema>;

export const planVersionSummarySchema = planVersionSchema.omit({
  content: true,
});
export type PlanVersionSummary = z.infer<typeof planVersionSummarySchema>;

export const planWithVersionsSchema = z.object({
  plan: planSchema,
  versions: z.array(planVersionSummarySchema),
});
export type PlanWithVersions = z.infer<typeof planWithVersionsSchema>;

export const planListResponseSchema = cursorPageSchema(planWithVersionsSchema);
export type PlanListResponse = z.infer<typeof planListResponseSchema>;

export const createPlanRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: planContentSchema,
});
export type CreatePlanRequest = z.infer<typeof createPlanRequestSchema>;

export const createPlanResponseSchema = z.object({
  plan: planSchema,
  version: planVersionSchema,
});
export type CreatePlanResponse = z.infer<typeof createPlanResponseSchema>;

export const updatePlanDraftRequestSchema = z.object({
  expectedRecordVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(160).optional(),
  content: planContentSchema,
});
export type UpdatePlanDraftRequest = z.infer<typeof updatePlanDraftRequestSchema>;

export const publishPlanRequestSchema = z.object({
  expectedRecordVersion: z.number().int().nonnegative(),
  mode: z.enum(["immediate", "scheduled"]),
  effectiveFrom: isoDateTimeSchema.optional(),
  /** Meal reconciliation scope. Defaults to today onward. Does not set plan expiry. */
  dietScope: dietAdjustmentScopeSchema.optional(),
});
export type PublishPlanRequest = z.infer<typeof publishPlanRequestSchema>;

export const createPlanDraftFromVersionRequestSchema = z.object({
  sourceVersionId: uuidSchema,
  /** When true, creationSource is adjustment (intervention loop). */
  asAdjustment: z.boolean().optional(),
});
export type CreatePlanDraftFromVersionRequest = z.infer<
  typeof createPlanDraftFromVersionRequestSchema
>;

export const effectivePlanResponseSchema = z.object({
  plan: planSchema.nullable(),
  version: planVersionSchema.nullable(),
});
export type EffectivePlanResponse = z.infer<typeof effectivePlanResponseSchema>;

/** Optional filters for GET /plans/relationships/:id. Omitted fields keep the unfiltered list. */
export const planListFilterSchema = z.object({
  versionStatus: planVersionStatusSchema.optional(),
  effectiveFrom: isoDateTimeSchema.optional(),
  effectiveTo: isoDateTimeSchema.optional(),
});
export type PlanListFilter = z.infer<typeof planListFilterSchema>;

export const consistencyWarningCodeSchema = z.enum([
  "workout_weekdays",
  "workout_sessions",
  "meal_weekdays",
  "meal_slots",
]);

export const consistencyWarningSchema = z.object({
  code: consistencyWarningCodeSchema,
  message: z.string().min(1).max(500),
  expected: z.number().int().nonnegative(),
  actual: z.number().int().nonnegative(),
});
export type ConsistencyWarning = z.infer<typeof consistencyWarningSchema>;

export const planConsistencyResponseSchema = z.object({
  fingerprint: z.string(),
  acknowledged: z.boolean(),
  warnings: z.array(consistencyWarningSchema),
});
export type PlanConsistencyResponse = z.infer<
  typeof planConsistencyResponseSchema
>;

export const acknowledgePlanConsistencyRequestSchema = z.object({
  fingerprint: z.string().min(1).max(500),
});
export type AcknowledgePlanConsistencyRequest = z.infer<
  typeof acknowledgePlanConsistencyRequestSchema
>;
