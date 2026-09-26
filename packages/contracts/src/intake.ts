import { z } from "zod";
import {
  coachingRelationshipSchema,
  onboardingStatusSchema,
} from "./relationship.js";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

export const intakeFieldTypeSchema = z.enum(["text", "textarea"]);
export type IntakeFieldType = z.infer<typeof intakeFieldTypeSchema>;

export const intakeFieldDefinitionSchema = z.object({
  id: z.string().min(1).max(64),
  type: intakeFieldTypeSchema,
  label: z.string().min(1).max(200),
  required: z.boolean(),
  maxLength: z.number().int().min(1).max(10000).optional(),
});
export type IntakeFieldDefinition = z.infer<typeof intakeFieldDefinitionSchema>;

export const intakeDefinitionSchema = z.object({
  id: uuidSchema,
  key: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.enum(["global", "trainer"]),
  fields: z.array(intakeFieldDefinitionSchema).min(1),
  createdAt: isoDateTimeSchema,
});
export type IntakeDefinition = z.infer<typeof intakeDefinitionSchema>;

export const intakeSubmissionStatusSchema = z.enum(["draft", "submitted"]);
export type IntakeSubmissionStatus = z.infer<typeof intakeSubmissionStatusSchema>;

export const intakeAnswersSchema = z.record(z.string().max(10000));
export type IntakeAnswers = z.infer<typeof intakeAnswersSchema>;

export const intakeSubmissionSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  intakeDefinitionId: uuidSchema,
  traineeUserId: uuidSchema,
  status: intakeSubmissionStatusSchema,
  answers: intakeAnswersSchema,
  version: z.number().int().nonnegative(),
  submittedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type IntakeSubmission = z.infer<typeof intakeSubmissionSchema>;

export const saveIntakeDraftRequestSchema = z.object({
  answers: intakeAnswersSchema,
  expectedVersion: z.number().int().nonnegative(),
});
export type SaveIntakeDraftRequest = z.infer<typeof saveIntakeDraftRequestSchema>;

export const submitIntakeRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
});
export type SubmitIntakeRequest = z.infer<typeof submitIntakeRequestSchema>;

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
  intakeSubmissionId: uuidSchema,
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
