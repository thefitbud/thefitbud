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
  /** Human item name when resolved (e.g. "Lunch"). */
  itemLabel: z.string().min(1).max(120).nullable().optional(),
  /** Civil date of the source item when known (YYYY-MM-DD). */
  itemDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  /** Present after answer; trainee never receives private note bodies. */
  coachAnswered: z.boolean().optional(),
  answerVisibleToClient: z.boolean().optional(),
});
export type CoachAsk = z.infer<typeof coachAskSchema>;

export const coachAskListResponseSchema = z.object({
  items: z.array(coachAskSchema),
});

export const answerCoachAskRequestSchema = z.object({
  note: z.string().trim().max(2000).nullable().optional(),
  /** When false (default), the optional note stays private to the trainer. */
  visibleToClient: z.boolean().optional().default(false),
});
export type AnswerCoachAskRequest = z.infer<typeof answerCoachAskRequestSchema>;

export const coachAskNoteRequestSchema = z.object({
  note: z.string().trim().min(1).max(2000),
});
export type CoachAskNoteRequest = z.infer<typeof coachAskNoteRequestSchema>;
