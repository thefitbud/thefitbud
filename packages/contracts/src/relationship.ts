import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

/** Invitation lifecycle as persisted on client_invitations. */
export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "expired",
  "revoked",
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/**
 * Coaching relationship lifecycle after acceptance.
 * Invited exists only on a pending invitation (no relationship row yet).
 */
export const coachingRelationshipStatusSchema = z.enum([
  "onboarding_pending",
  "onboarding_submitted",
  "coaching_ready",
  "ended",
]);
export type CoachingRelationshipStatus = z.infer<
  typeof coachingRelationshipStatusSchema
>;

/** User-visible onboarding status spanning invitation + relationship. */
export const onboardingStatusSchema = z.enum([
  "invited",
  "onboarding_pending",
  "onboarding_submitted",
  "coaching_ready",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const createInvitationRequestSchema = z.object({
  recipientEmail: z.string().email().max(320),
  recipientDisplayName: z.string().trim().min(1).max(120).optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationSchema = z.object({
  id: uuidSchema,
  trainerUserId: uuidSchema,
  recipientEmail: z.string().email(),
  recipientDisplayName: z.string().nullable(),
  status: invitationStatusSchema,
  expiresAt: isoDateTimeSchema,
  acceptedUserId: uuidSchema.nullable(),
  coachingRelationshipId: uuidSchema.nullable(),
  onboardingStatus: onboardingStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationResponseSchema = invitationSchema.extend({
  /** Raw token returned once on create. Never stored or logged. */
  token: z.string().min(1),
});
export type CreateInvitationResponse = z.infer<
  typeof createInvitationResponseSchema
>;

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
});
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const coachingRelationshipSchema = z.object({
  id: uuidSchema,
  trainerUserId: uuidSchema,
  traineeUserId: uuidSchema,
  status: coachingRelationshipStatusSchema,
  onboardingStatus: onboardingStatusSchema,
  invitationId: uuidSchema.nullable(),
  startedAt: isoDateTimeSchema,
  endedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CoachingRelationship = z.infer<typeof coachingRelationshipSchema>;

export const acceptInvitationResponseSchema = z.object({
  invitation: invitationSchema,
  relationship: coachingRelationshipSchema,
});
export type AcceptInvitationResponse = z.infer<
  typeof acceptInvitationResponseSchema
>;

export const invitationListResponseSchema = z.object({
  items: z.array(invitationSchema),
  nextCursor: z.string().nullable(),
});
export type InvitationListResponse = z.infer<typeof invitationListResponseSchema>;

export const relationshipListResponseSchema = z.object({
  items: z.array(coachingRelationshipSchema),
  nextCursor: z.string().nullable(),
});
export type RelationshipListResponse = z.infer<
  typeof relationshipListResponseSchema
>;
