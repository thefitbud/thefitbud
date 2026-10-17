import { z } from "zod";
import { isoDateTimeSchema } from "./identity.js";
import { localDateSchema } from "./workout.js";

const traineeGenderSchema = z
  .string()
  .trim()
  .max(64)
  .transform((value) => (value.length === 0 ? null : value));

export const traineeProfileSchema = z.object({
  displayName: z.string().min(1).max(120),
  dateOfBirth: localDateSchema.nullable(),
  gender: z.string().max(64).nullable(),
  updatedAt: isoDateTimeSchema,
});
export type TraineeProfile = z.infer<typeof traineeProfileSchema>;

export const updateTraineeProfileRequestSchema = z.object({
  dateOfBirth: localDateSchema.nullable(),
  gender: z.union([traineeGenderSchema, z.null()]),
});
export type UpdateTraineeProfileRequest = z.infer<
  typeof updateTraineeProfileRequestSchema
>;

export const trainerProfileSchema = z.object({
  displayName: z.string().min(1).max(120),
  whatsappE164: z.string().min(10).max(16).nullable(),
});
export type TrainerProfile = z.infer<typeof trainerProfileSchema>;

export const updateTrainerProfileRequestSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  whatsappE164: z.string().trim().min(8).max(20).optional().nullable(),
  timezone: z.string().min(1).max(64),
});
export type UpdateTrainerProfileRequest = z.infer<
  typeof updateTrainerProfileRequestSchema
>;
