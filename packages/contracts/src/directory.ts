import { z } from "zod";
import { adherenceStateSchema } from "./adherence.js";
import { checkinStatusSchema } from "./checkin.js";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import { onboardingStatusSchema } from "./relationship.js";
import { clientFacetsSchema } from "./read-models.js";
import { renewalStateSchema } from "./subscription.js";
import { workspaceEffectivePlanSummarySchema } from "./workspace.js";
import { localDateSchema } from "./workout.js";

export const clientDirectoryNextCheckinSchema = z.object({
  id: uuidSchema,
  localDate: localDateSchema,
  status: checkinStatusSchema,
});
export type ClientDirectoryNextCheckin = z.infer<
  typeof clientDirectoryNextCheckinSchema
>;

export const clientDirectoryAttentionSchema = z.object({
  needsYouCount: z.number().int().nonnegative(),
  notedCount: z.number().int().nonnegative(),
  mostSevere: z.enum(["critical", "attention"]).nullable(),
  /** An open (not noted) item other than a meal deviation. */
  hasOpenMissed: z.boolean(),
  /** An open (not noted) meal deviation. */
  hasOpenOffPlan: z.boolean(),
  hasOpenAsk: z.boolean(),
});
export type ClientDirectoryAttention = z.infer<typeof clientDirectoryAttentionSchema>;

export const clientDirectoryItemSchema = z.object({
  relationshipId: uuidSchema.nullable(),
  invitationId: uuidSchema.nullable(),
  traineeDisplayName: z.string().min(1).max(320),
  status: onboardingStatusSchema,
  goalShort: z.string().max(120).nullable(),
  nextCheckin: clientDirectoryNextCheckinSchema.nullable(),
  effectivePlan: workspaceEffectivePlanSummarySchema.nullable(),
  adherenceState: adherenceStateSchema,
  /** Same derivation as Home Renewals (`deriveRenewalState`). */
  renewalState: renewalStateSchema.nullable(),
  renewsOn: localDateSchema.nullable(),
  /** When coaching started (ISO instant, the relationship start); null for invited rows. */
  startedAt: isoDateTimeSchema.nullable().optional(),
  /** When coaching ended (ISO instant), for ended roster chips. */
  endedAt: isoDateTimeSchema.nullable().optional(),
  /** `startedAt` as a civil date in the trainer's timezone (Z10-21). */
  startedOn: localDateSchema.nullable().optional(),
  /** `endedAt` as a civil date in the trainer's timezone (Z10-21). */
  endedOn: localDateSchema.nullable().optional(),
  /** Weeks since coaching started, counted from the relationship start. */
  week: z.number().int().positive().nullable().optional(),
  /** City label only when the trainee timezone differs from the trainer. */
  city: z.string().max(80).nullable().optional(),
  updatedAt: isoDateTimeSchema,
  /**
   * Z14-1: stored open exceptions and open asks for this client, so the
   * Clients list badges need no attention call. Needs you = detected or
   * active items; noted = acknowledged. Absent on invited rows.
   */
  attention: clientDirectoryAttentionSchema.optional(),
});
export type ClientDirectoryItem = z.infer<typeof clientDirectoryItemSchema>;

export const clientDirectoryListResponseSchema = z.object({
  items: z.array(clientDirectoryItemSchema),
  facets: clientFacetsSchema.optional(),
  nextCursor: z.string().nullable(),
});
export type ClientDirectoryListResponse = z.infer<
  typeof clientDirectoryListResponseSchema
>;
