import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const coachingConfigurationStatusSchema = z.enum([
  "draft",
  "configured",
  "active",
  "superseded",
]);
export type CoachingConfigurationStatus = z.infer<
  typeof coachingConfigurationStatusSchema
>;

export const mealPhotoRequirementSchema = z.enum([
  "none",
  "selected_meals",
  "all_meals",
]);
export type MealPhotoRequirement = z.infer<typeof mealPhotoRequirementSchema>;

export const checkinCadenceSchema = z.enum(["weekly", "biweekly", "monthly"]);
export type CheckinCadence = z.infer<typeof checkinCadenceSchema>;

export const workoutExpectationsSchema = z.object({
  sessionsPerWeek: z.number().int().min(1).max(14),
  completionWindowHours: z.number().int().min(1).max(72),
});
export type WorkoutExpectations = z.infer<typeof workoutExpectationsSchema>;

export const nutritionExpectationsSchema = z.object({
  mealsPerDay: z.number().int().min(1).max(8),
  confirmationWindowHours: z.number().int().min(1).max(48),
  photoRequirement: mealPhotoRequirementSchema,
});
export type NutritionExpectations = z.infer<typeof nutritionExpectationsSchema>;

export const checkinScheduleExpectationsSchema = z.object({
  cadence: checkinCadenceSchema,
  dueWindowHours: z.number().int().min(1).max(168),
});
export type CheckinScheduleExpectations = z.infer<
  typeof checkinScheduleExpectationsSchema
>;

export const trackingRequirementsSchema = z.object({
  requireBodyWeight: z.boolean(),
  requireProgressPhotos: z.boolean(),
  requireSessionRpe: z.boolean(),
});
export type TrackingRequirements = z.infer<typeof trackingRequirementsSchema>;

const optionalTrimmedText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => {
      if (typeof value !== "string") return value;
      return value.length === 0 ? null : value;
    });

export const coachingConfigurationSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  status: coachingConfigurationStatusSchema,
  versionNumber: z.number().int().positive(),
  /** Optimistic concurrency token. Request expectedVersion means this field. */
  recordVersion: z.number().int().nonnegative(),
  goalShort: z.string().max(120).nullable(),
  goalDescription: z.string().max(500).nullable(),
  notes: z.string().max(2000).nullable(),
  workout: workoutExpectationsSchema,
  nutrition: nutritionExpectationsSchema,
  checkin: checkinScheduleExpectationsSchema,
  tracking: trackingRequirementsSchema,
  configuredAt: isoDateTimeSchema.nullable(),
  activatedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CoachingConfiguration = z.infer<typeof coachingConfigurationSchema>;

export const saveConfigurationDraftRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  goalShort: optionalTrimmedText(120),
  goalDescription: optionalTrimmedText(500),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Omitted sections use stored values, or the core defaults on a new draft. */
  workout: workoutExpectationsSchema.optional(),
  nutrition: nutritionExpectationsSchema.optional(),
  checkin: checkinScheduleExpectationsSchema.optional(),
  tracking: trackingRequirementsSchema.optional(),
});

export const copyConfigurationDraftRequestSchema = z.object({
  sourceRelationshipId: uuidSchema,
});
export type CopyConfigurationDraftRequest = z.infer<
  typeof copyConfigurationDraftRequestSchema
>;
export type SaveConfigurationDraftRequest = z.infer<
  typeof saveConfigurationDraftRequestSchema
>;

export const configureConfigurationRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type ConfigureConfigurationRequest = z.infer<
  typeof configureConfigurationRequestSchema
>;

export const activateConfigurationRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type ActivateConfigurationRequest = z.infer<
  typeof activateConfigurationRequestSchema
>;
