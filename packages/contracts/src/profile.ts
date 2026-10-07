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
