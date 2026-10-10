import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  decimalNutrientSchema,
  exerciseDifficultySchema,
  foodClassificationSchema,
  libraryItemStatusSchema,
  nutritionBasisSchema,
} from "./nutrition.js";
import {
  createPlanResponseSchema,
  planContentSchema,
} from "./plan.js";

export { exerciseDifficultySchema } from "./nutrition.js";

export const planTemplateTypeSchema = z.enum([
  "workout",
  "nutrition",
  "combined",
]);
export type PlanTemplateType = z.infer<typeof planTemplateTypeSchema>;

export const libraryOwnershipSchema = z.enum(["global", "trainer"]);
export type LibraryOwnership = z.infer<typeof libraryOwnershipSchema>;

export const planTemplateSchema = z.object({
  id: uuidSchema,
  trainerUserId: uuidSchema,
  title: z.string().min(1).max(160),
  templateType: planTemplateTypeSchema,
  content: planContentSchema,
  recordVersion: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type PlanTemplate = z.infer<typeof planTemplateSchema>;

export const planTemplateSummarySchema = planTemplateSchema.omit({
  content: true,
});
export type PlanTemplateSummary = z.infer<typeof planTemplateSummarySchema>;

export const planTemplateListResponseSchema = cursorPageSchema(
  planTemplateSummarySchema,
);
export type PlanTemplateListResponse = z.infer<
  typeof planTemplateListResponseSchema
>;

export const createPlanTemplateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  templateType: planTemplateTypeSchema,
  content: planContentSchema,
});
export type CreatePlanTemplateRequest = z.infer<
  typeof createPlanTemplateRequestSchema
>;

export const createPlanTemplateFromVersionRequestSchema = z.object({
  planId: uuidSchema,
  versionId: uuidSchema,
  title: z.string().trim().min(1).max(160),
  templateType: planTemplateTypeSchema,
});
export type CreatePlanTemplateFromVersionRequest = z.infer<
  typeof createPlanTemplateFromVersionRequestSchema
>;

export const updatePlanTemplateRequestSchema = z.object({
  expectedRecordVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(160).optional(),
  templateType: planTemplateTypeSchema.optional(),
  content: planContentSchema,
});
export type UpdatePlanTemplateRequest = z.infer<
  typeof updatePlanTemplateRequestSchema
>;

/** Create a new client plan draft by copying template JSON (never aliases). */
export const applyPlanTemplateRequestSchema = z.object({
  templateId: uuidSchema,
  title: z.string().trim().min(1).max(160).optional(),
  expectedRecordVersion: z.number().int().nonnegative().optional(),
});
export type ApplyPlanTemplateRequest = z.infer<
  typeof applyPlanTemplateRequestSchema
>;

export const applyPlanTemplateResponseSchema = createPlanResponseSchema.extend({
  updatedExistingDraft: z.boolean(),
});
export type ApplyPlanTemplateResponse = z.infer<
  typeof applyPlanTemplateResponseSchema
>;

export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

const libraryLabelSchema = z.string().trim().min(1).max(80);

export const exerciseLibraryItemSchema = z.object({
  id: uuidSchema,
  ownership: libraryOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  instructions: z.string().max(2000).nullable(),
  primaryMuscles: z.array(libraryLabelSchema).max(12),
  secondaryMuscles: z.array(libraryLabelSchema).max(12),
  equipment: z.array(libraryLabelSchema).max(12),
  difficulty: exerciseDifficultySchema.nullable(),
  status: libraryItemStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ExerciseLibraryItem = z.infer<typeof exerciseLibraryItemSchema>;

export const exerciseLibraryListResponseSchema = cursorPageSchema(
  exerciseLibraryItemSchema,
);
export type ExerciseLibraryListResponse = z.infer<
  typeof exerciseLibraryListResponseSchema
>;

export const createExerciseLibraryItemRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  instructions: z.string().trim().max(2000).nullable().optional(),
  primaryMuscles: z.array(libraryLabelSchema).max(12).optional(),
  secondaryMuscles: z.array(libraryLabelSchema).max(12).optional(),
  equipment: z.array(libraryLabelSchema).max(12).optional(),
  difficulty: exerciseDifficultySchema.nullable().optional(),
});
export type CreateExerciseLibraryItemRequest = z.infer<
  typeof createExerciseLibraryItemRequestSchema
>;

export const updateExerciseLibraryItemRequestSchema =
  createExerciseLibraryItemRequestSchema;
export type UpdateExerciseLibraryItemRequest = z.infer<
  typeof updateExerciseLibraryItemRequestSchema
>;

export const foodLibraryServingSchema = z.object({
  id: uuidSchema,
  label: z.string().min(1).max(120),
  unit: z.string().min(1).max(40),
  conversionScaled: z.number().int().positive().nullable(),
});
export type FoodLibraryServing = z.infer<typeof foodLibraryServingSchema>;

export const foodLibraryItemSchema = z.object({
  id: uuidSchema,
  ownership: libraryOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  cuisineRegion: z.literal("indian"),
  classification: foodClassificationSchema.nullable(),
  basis: nutritionBasisSchema.nullable(),
  energyKcalScaled: z.number().int().nonnegative().nullable(),
  proteinScaled: z.number().int().nonnegative().nullable(),
  carbsScaled: z.number().int().nonnegative().nullable(),
  fatScaled: z.number().int().nonnegative().nullable(),
  servings: z.array(foodLibraryServingSchema).max(12),
  notes: z.string().max(2000).nullable(),
  description: z.string().max(2000).nullable(),
  status: libraryItemStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type FoodLibraryItem = z.infer<typeof foodLibraryItemSchema>;

export const foodLibraryListResponseSchema = cursorPageSchema(
  foodLibraryItemSchema,
);
export type FoodLibraryListResponse = z.infer<
  typeof foodLibraryListResponseSchema
>;

export const createFoodLibraryServingRequestSchema = z.object({
  label: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(40),
  /** Grams or millilitres represented by one serving of this food. */
  conversion: decimalNutrientSchema(5000),
});

export const createFoodLibraryItemRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  classification: foodClassificationSchema,
  basis: nutritionBasisSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  energyKcal: decimalNutrientSchema(2000).nullable().optional(),
  proteinGrams: decimalNutrientSchema(100).nullable().optional(),
  carbsGrams: decimalNutrientSchema(100).nullable().optional(),
  fatGrams: decimalNutrientSchema(100).nullable().optional(),
  servings: z.array(createFoodLibraryServingRequestSchema).min(1).max(12),
});
export type CreateFoodLibraryItemRequest = z.infer<
  typeof createFoodLibraryItemRequestSchema
>;

export const updateFoodLibraryItemRequestSchema =
  createFoodLibraryItemRequestSchema;
export type UpdateFoodLibraryItemRequest = z.infer<
  typeof updateFoodLibraryItemRequestSchema
>;
