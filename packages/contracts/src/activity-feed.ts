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
});
export const activityFeedResponseSchema = z.object({
  events: z.array(activityFeedEventSchema),
  nextCursor: z.string().nullable(),
});
