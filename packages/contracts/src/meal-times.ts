import { z } from "zod";

export const mealTimeSlotSchema = z.object({
  slotKey: z.string(),
  label: z.string(),
  planTime: z.string(),
  overrideTime: z.string().nullable().optional(),
  /** all, weekdays, or weekends when an override exists. */
  dayPattern: z.enum(["all", "weekdays", "weekends"]).nullable().optional(),
});
export const mealTimesResponseSchema = z.object({
  slots: z.array(mealTimeSlotSchema),
  mealTimesNeedReview: z.boolean().optional(),
});
export const mealTimeOverrideSchema = z.object({
  slotKey: z.string(),
  dayPattern: z.string(),
  time: z.string(),
});
export const updateMealTimesRequestSchema = z.object({
  overrides: z.array(mealTimeOverrideSchema),
});
export type UpdateMealTimesRequest = z.infer<
  typeof updateMealTimesRequestSchema
>;
