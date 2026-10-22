import { z } from "zod";

export const stepsSettingsResponseSchema = z.object({
  enabled: z.boolean(),
  dailyGoal: z.number().int().positive().nullable(),
  source: z.enum(["manual", "health_connect", "healthkit"]).nullable(),
});
export type StepsSettingsResponse = z.infer<typeof stepsSettingsResponseSchema>;

export const updateStepsSettingsRequestSchema = z.object({
  dailyGoal: z.number().int().positive().nullable().optional(),
  source: z.enum(["manual", "health_connect", "healthkit"]).nullable().optional(),
});
export type UpdateStepsSettingsRequest = z.infer<
  typeof updateStepsSettingsRequestSchema
>;
