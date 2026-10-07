import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";

/**
 * Readable coaching-history kinds projected from authoritative domain tables.
 * Not an internal event-log dump.
 */
export const historyItemKindSchema = z.enum([
  "onboarding_submitted",
  "onboarding_reviewed",
  "configuration_activated",
  "subscription_revision",
  "plan_version",
  "workout_execution",
  "meal_compliance",
  "checkin_submitted",
  "checkin_reviewed",
  "measurement",
  "progress_entry",
  "progress_photo",
  "exception",
  "trainer_note",
  "intervention",
]);
export type HistoryItemKind = z.infer<typeof historyItemKindSchema>;

export const historyItemSchema = z.object({
  id: uuidSchema,
  kind: historyItemKindSchema,
  occurredAt: isoDateTimeSchema,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(500),
  sourceEntityType: z.string().min(1).max(64),
  sourceEntityId: uuidSchema,
  /** Domain status when useful for reading (e.g. plan version, exception). */
  status: z.string().min(1).max(64).nullable(),
});
export type HistoryItem = z.infer<typeof historyItemSchema>;

export const historyListResponseSchema = cursorPageSchema(historyItemSchema);
export type HistoryListResponse = z.infer<typeof historyListResponseSchema>;

/** Optional filters for GET /history/relationships/:id. Applied in each source query before its row cap. */
export const historyListFilterSchema = z.object({
  kind: historyItemKindSchema.optional(),
  occurredFrom: isoDateTimeSchema.optional(),
  occurredTo: isoDateTimeSchema.optional(),
});
export type HistoryListFilter = z.infer<typeof historyListFilterSchema>;
