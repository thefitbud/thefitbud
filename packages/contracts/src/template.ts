import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  createPlanResponseSchema,
  planContentSchema,
} from "./plan.js";

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

export const exerciseDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);
export type ExerciseDifficulty = z.infer<typeof exerciseDifficultySchema>;

const libraryLabelSchema = z.string().trim().min(1).max(80);

export const exerciseLibraryItemSchema = z.object({
  id: uuidSchema,
  ownership: libraryOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  instructions: z.string().max(2000).nullable(),
  defaultLoadLabel: z.string().max(80).nullable(),
  defaultReps: z.number().int().min(1).max(100).nullable(),
  muscleGroups: z.array(libraryLabelSchema).max(12),
  equipment: z.array(libraryLabelSchema).max(12),
  difficulty: exerciseDifficultySchema.nullable(),
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
  defaultLoadLabel: z.string().trim().max(80).nullable().optional(),
  defaultReps: z.number().int().min(1).max(100).nullable().optional(),
  muscleGroups: z.array(libraryLabelSchema).max(12).optional(),
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

const nullableFoodGramsSchema = z.number().nonnegative().max(2000).nullable();

export const foodLibraryItemSchema = z.object({
  id: uuidSchema,
  ownership: libraryOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  cuisineRegion: z.literal("indian"),
  portionLabel: z.string().min(1).max(120),
  notes: z.string().max(2000).nullable(),
  description: z.string().max(2000).nullable(),
  calories: z.number().int().nonnegative().max(20000).nullable(),
  proteinGrams: nullableFoodGramsSchema,
  carbsGrams: nullableFoodGramsSchema,
  fatGrams: nullableFoodGramsSchema,
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

export const createFoodLibraryItemRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  portionLabel: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  calories: z.number().int().nonnegative().max(20000).nullable().optional(),
  proteinGrams: z.number().nonnegative().max(2000).nullable().optional(),
  carbsGrams: z.number().nonnegative().max(2000).nullable().optional(),
  fatGrams: z.number().nonnegative().max(2000).nullable().optional(),
});
export type CreateFoodLibraryItemRequest = z.infer<
  typeof createFoodLibraryItemRequestSchema
>;

export const updateFoodLibraryItemRequestSchema =
  createFoodLibraryItemRequestSchema;
export type UpdateFoodLibraryItemRequest = z.infer<
  typeof updateFoodLibraryItemRequestSchema
>;
