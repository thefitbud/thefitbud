import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const coachAskItemTypeSchema = z.enum([
  "meal_assignment",
  "workout_assignment",
  "exercise_execution",
  "checkin",
  "plan_version",
]);
export const coachAskTopicSchema = z.string().min(1).max(64);
export const coachAskStatusSchema = z.enum(["open", "answered", "expired"]);

export const createCoachAskRequestSchema = z.object({
  relationshipId: uuidSchema,
  itemType: coachAskItemTypeSchema,
  itemId: uuidSchema,
  topic: coachAskTopicSchema,
});
export type CreateCoachAskRequest = z.infer<typeof createCoachAskRequestSchema>;

export const coachAskSchema = z.object({
  id: uuidSchema,
  relationshipId: uuidSchema,
  itemType: coachAskItemTypeSchema,
  itemId: uuidSchema,
  topic: coachAskTopicSchema,
  status: coachAskStatusSchema,
  askCount: z.number().int(),
  askedAt: isoDateTimeSchema,
  lastAskedAt: isoDateTimeSchema,
});
export type CoachAsk = z.infer<typeof coachAskSchema>;

export const coachAskListResponseSchema = z.object({
  items: z.array(coachAskSchema),
});
