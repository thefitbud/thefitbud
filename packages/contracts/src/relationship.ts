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
 * Persisted coaching relationship lifecycle.
 * Client onboarding progress is derived and is not stored here.
 */
export const coachingRelationshipStatusSchema = z.enum(["active", "ended"]);
export type CoachingRelationshipStatus = z.infer<
  typeof coachingRelationshipStatusSchema
>;

/**
 * Derived client lifecycle spanning invitation, onboarding, configuration, and end.
 * Clients must read this field rather than reconstructing it from raw rows.
 */
export const onboardingStatusSchema = z.enum([
  "invited",
  "onboarding_pending",
  "onboarding_submitted",
  "coaching_ready",
  "active",
  "ended",
]);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const createInvitationRequestSchema = z.object({
  recipientEmail: z.string().email().max(320),
  recipientDisplayName: z.string().trim().min(1).max(120).optional(),
  /** WhatsApp number as entered by the trainer. Normalized to E.164 digits on the server. */
  recipientWhatsapp: z.string().trim().min(8).max(20).optional(),
  sendEmail: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(30).optional(),
  /**
   * When omitted, the server runs form resolution once and stores that version.
   * When set, the server pins the latest version of this template only.
   */
  onboardingFormTemplateId: uuidSchema.optional(),
});
export type CreateInvitationRequest = z.infer<typeof createInvitationRequestSchema>;

export const invitationSchema = z.object({
  id: uuidSchema,
  trainerUserId: uuidSchema,
  recipientEmail: z.string().email(),
  recipientDisplayName: z.string().nullable(),
  /** E.164 digits without +. Null when the trainer did not supply a WhatsApp number. */
  recipientWhatsappE164: z.string().min(10).max(15).nullable(),
  status: invitationStatusSchema,
  expiresAt: isoDateTimeSchema,
  acceptedUserId: uuidSchema.nullable(),
  coachingRelationshipId: uuidSchema.nullable(),
  onboardingFormTemplateVersionId: uuidSchema,
  onboardingStatus: onboardingStatusSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Invitation = z.infer<typeof invitationSchema>;

export const createInvitationResponseSchema = invitationSchema.extend({
  /** Raw token returned once on create. Never stored or logged. */
  token: z.string().min(1),
  inviteUrl: z.string().url(),
});
export type CreateInvitationResponse = z.infer<
  typeof createInvitationResponseSchema
>;

export const acceptInvitationRequestSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().trim().min(1).max(120).optional(),
  timezone: z.string().min(1).max(64).optional(),
  mobileE164: z.string().trim().min(8).max(20).optional(),
  password: z.string().min(8).max(64).optional(),
  otpProof: z.string().min(1).optional(),
});

export const acceptInvitationWithTokenResponseSchema = z.object({
  token: z.string(),
  tokenKind: z.enum(["test_id_token", "firebase_custom_token"]),
  userId: uuidSchema,
  relationshipId: uuidSchema,
});
export type AcceptInvitationWithTokenResponse = z.infer<
  typeof acceptInvitationWithTokenResponseSchema
>;
export type AcceptInvitationRequest = z.infer<typeof acceptInvitationRequestSchema>;

export const pendingReactivationSchema = z.object({
  requestId: uuidSchema,
  expiresAt: isoDateTimeSchema,
  /** When the trainer sent the reactivation request. */
  sentAt: isoDateTimeSchema.optional(),
  intakeUpdateRequested: z.boolean(),
});
export type PendingReactivation = z.infer<typeof pendingReactivationSchema>;

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
  /** Trainer's display name when available (trainee-facing reads). */
  trainerDisplayName: z.string().min(1).max(120).nullable().optional(),
  /** Trainer WhatsApp E.164 digits (no +) for TR-18 Ask coach; null when unset. */
  trainerWhatsappE164: z.string().min(10).max(15).nullable().optional(),
  /** Present on relationship read when a trainee reactivation request is pending. */
  pendingReactivation: pendingReactivationSchema.nullable().optional(),
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

export const endRelationshipRequestSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type EndRelationshipRequest = z.infer<typeof endRelationshipRequestSchema>;

export const reactivateRelationshipRequestSchema = z.object({
  intakeUpdateRequested: z.boolean().optional(),
});
export type ReactivateRelationshipRequest = z.infer<
  typeof reactivateRelationshipRequestSchema
>;

export const invitationPreviewResponseSchema = z.object({
  trainerDisplayName: z.string().min(1),
  status: invitationStatusSchema,
});
export type InvitationPreviewResponse = z.infer<
  typeof invitationPreviewResponseSchema
>;
