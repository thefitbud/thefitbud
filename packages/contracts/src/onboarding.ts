import { z } from "zod";
import {
  coachingRelationshipSchema,
  onboardingStatusSchema,
} from "./relationship.js";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const onboardingFieldTypeSchema = z.enum(["text", "textarea"]);
export type OnboardingFieldType = z.infer<typeof onboardingFieldTypeSchema>;

export const onboardingFieldDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  type: onboardingFieldTypeSchema,
  label: z.string().min(1).max(200),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(10000).optional(),
});
export type OnboardingFieldDefinition = z.infer<
  typeof onboardingFieldDefinitionSchema
>;

export const onboardingFormVersionSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.enum(["global", "trainer"]),
  fields: z.array(onboardingFieldDefinitionSchema).min(1),
  createdAt: isoDateTimeSchema,
});
export type OnboardingFormVersion = z.infer<typeof onboardingFormVersionSchema>;

export const onboardingFormResponseStatusSchema = z.enum(["draft", "submitted"]);
export type OnboardingFormResponseStatus = z.infer<
  typeof onboardingFormResponseStatusSchema
>;

export const onboardingAnswersSchema = z.record(z.string().max(10000));
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

export const onboardingFormResponseSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  onboardingFormVersionId: uuidSchema,
  traineeUserId: uuidSchema,
  status: onboardingFormResponseStatusSchema,
  answers: onboardingAnswersSchema,
  version: z.number().int().nonnegative(),
  submittedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OnboardingFormResponse = z.infer<typeof onboardingFormResponseSchema>;

export const saveOnboardingDraftRequestSchema = z.object({
  answers: onboardingAnswersSchema,
  expectedVersion: z.number().int().nonnegative(),
});
export type SaveOnboardingDraftRequest = z.infer<
  typeof saveOnboardingDraftRequestSchema
>;

export const submitOnboardingRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type SubmitOnboardingRequest = z.infer<typeof submitOnboardingRequestSchema>;

export const onboardingReviewOutcomeSchema = z.enum(["coaching_ready"]);
export type OnboardingReviewOutcome = z.infer<
  typeof onboardingReviewOutcomeSchema
>;

export const createOnboardingReviewRequestSchema = z.object({
  outcome: onboardingReviewOutcomeSchema,
});
export type CreateOnboardingReviewRequest = z.infer<
  typeof createOnboardingReviewRequestSchema
>;

export const onboardingReviewSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  onboardingFormResponseId: uuidSchema,
  trainerUserId: uuidSchema,
  outcome: onboardingReviewOutcomeSchema,
  createdAt: isoDateTimeSchema,
});
export type OnboardingReview = z.infer<typeof onboardingReviewSchema>;

export const createOnboardingReviewResponseSchema = z.object({
  review: onboardingReviewSchema,
  relationship: coachingRelationshipSchema,
  onboardingStatus: onboardingStatusSchema,
});
export type CreateOnboardingReviewResponse = z.infer<
  typeof createOnboardingReviewResponseSchema
>;
