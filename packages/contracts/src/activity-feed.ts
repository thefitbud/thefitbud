import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const activityFeedEventSchema = z.object({
  id: z.string(),
  relationshipId: uuidSchema,
  traineeDisplayName: z.string().nullable(),
  type: z.string(),
  subtype: z.string().nullable(),
  occurredAt: isoDateTimeSchema,
  traineeLocalTime: z.string().nullable(),
  summary: z.string(),
  kcal: z.number().int().nullable().optional(),
  link: z.string().nullable().optional(),
  /**
   * Z14-11 / D-W14-23: on a client's own edit or removal of a meal log
   * (`type` `client_edited` or `client_removed`), the meal entry it is about,
   * its day and the entry's previous kcal, so the trainer surfaces can open the
   * meal and show "Edited"/"Removed" without a new endpoint.
   */
  entryId: uuidSchema.nullable().optional(),
  mealDate: z.string().nullable().optional(),
  previousKcal: z.number().int().nullable().optional(),
});
export const activityFeedResponseSchema = z.object({
  events: z.array(activityFeedEventSchema),
  nextCursor: z.string().nullable(),
});
