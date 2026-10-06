import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import { localDateSchema } from "./workout.js";

export const paymentFrequencySchema = z.enum([
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
]);
export type PaymentFrequency = z.infer<typeof paymentFrequencySchema>;

/** Derived in the trainer timezone. The 7-day upcoming window is an MVP rule. */
export const renewalStateSchema = z.enum([
  "current",
  "upcoming",
  "due",
  "expired",
]);
export type RenewalState = z.infer<typeof renewalStateSchema>;

export const subscriptionSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  versionNumber: z.number().int().positive(),
  planName: z.string().min(1).max(120),
  paymentFrequency: paymentFrequencySchema,
  startsOn: localDateSchema,
  renewsOn: localDateSchema,
  renewalState: renewalStateSchema,
  createdAt: isoDateTimeSchema,
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const saveSubscriptionRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  planName: z.string().trim().min(1).max(120),
  paymentFrequency: paymentFrequencySchema,
  startsOn: localDateSchema,
  renewsOn: localDateSchema,
});
export type SaveSubscriptionRequest = z.infer<typeof saveSubscriptionRequestSchema>;

export const subscriptionAttentionItemSchema = z.object({
  coachingRelationshipId: uuidSchema,
  traineeUserId: uuidSchema,
  planName: z.string().min(1).max(120),
  paymentFrequency: paymentFrequencySchema,
  renewsOn: localDateSchema,
  renewalState: z.enum(["upcoming", "due", "expired"]),
  versionNumber: z.number().int().positive(),
});
export type SubscriptionAttentionItem = z.infer<
  typeof subscriptionAttentionItemSchema
>;

export const subscriptionAttentionResponseSchema = z.object({
  items: z.array(subscriptionAttentionItemSchema),
});
export type SubscriptionAttentionResponse = z.infer<
  typeof subscriptionAttentionResponseSchema
>;
