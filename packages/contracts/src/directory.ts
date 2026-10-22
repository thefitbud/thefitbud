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
  /** When coaching ended (ISO instant), for ended roster chips. */
  endedAt: isoDateTimeSchema.nullable().optional(),
  /** Weeks since coaching started, counted from the relationship start. */
  week: z.number().int().positive().nullable().optional(),
  /** City label only when the trainee timezone differs from the trainer. */
  city: z.string().max(80).nullable().optional(),
  updatedAt: isoDateTimeSchema,
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
