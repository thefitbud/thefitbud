import { z } from "zod";
import {
  coachingRelationshipSchema,
  onboardingStatusSchema,
} from "./relationship.js";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

const onboardingFieldBaseSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  required: z.boolean(),
  helpText: z.string().min(1).max(500).optional(),
});

export const onboardingFieldDefinitionSchema = z.discriminatedUnion("type", [
  onboardingFieldBaseSchema.extend({
    type: z.literal("text"),
    maxLength: z.number().int().min(1).max(10000).optional(),
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("textarea"),
    maxLength: z.number().int().min(1).max(10000).optional(),
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("select"),
    options: z.array(z.string().min(1).max(200)).min(1).max(50),
  }),
]);
export type OnboardingFieldDefinition = z.infer<
  typeof onboardingFieldDefinitionSchema
>;
export type OnboardingFieldType = OnboardingFieldDefinition["type"];

/** Immutable field list stored on an onboarding form version. Order is significant. */
export const onboardingFormDefinitionSchema = z.object({
  fields: z.array(onboardingFieldDefinitionSchema).min(1),
});
export type OnboardingFormDefinition = z.infer<typeof onboardingFormDefinitionSchema>;

export const onboardingFormVersionSchema = z.object({
  id: uuidSchema,
  templateId: uuidSchema,
  key: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.enum(["global", "trainer"]),
  fields: z.array(onboardingFieldDefinitionSchema).min(1),
  createdAt: isoDateTimeSchema,
});
export type OnboardingFormVersion = z.infer<typeof onboardingFormVersionSchema>;

export const onboardingFormTemplateOwnershipSchema = z.enum(["global", "trainer"]);
export type OnboardingFormTemplateOwnership = z.infer<
  typeof onboardingFormTemplateOwnershipSchema
>;

export const onboardingFormTemplateSummarySchema = z.object({
  id: uuidSchema,
  ownership: onboardingFormTemplateOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  latestVersionId: uuidSchema,
  latestVersionNumber: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OnboardingFormTemplateSummary = z.infer<
  typeof onboardingFormTemplateSummarySchema
>;

export const onboardingFormTemplateListResponseSchema = z.object({
  items: z.array(onboardingFormTemplateSummarySchema),
  nextCursor: z.string().nullable(),
});
export type OnboardingFormTemplateListResponse = z.infer<
  typeof onboardingFormTemplateListResponseSchema
>;

export const onboardingFormTemplateDetailSchema =
  onboardingFormTemplateSummarySchema.extend({
    versions: z.array(onboardingFormVersionSchema).min(1),
  });
export type OnboardingFormTemplateDetail = z.infer<
  typeof onboardingFormTemplateDetailSchema
>;

export const createOnboardingFormTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).optional(),
  fields: z.array(onboardingFieldDefinitionSchema).min(1),
});
export type CreateOnboardingFormTemplateRequest = z.infer<
  typeof createOnboardingFormTemplateRequestSchema
>;

export const forkOnboardingFormTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(500).optional(),
});
export type ForkOnboardingFormTemplateRequest = z.infer<
  typeof forkOnboardingFormTemplateRequestSchema
>;

export const createOnboardingFormTemplateVersionRequestSchema = z.object({
  fields: z.array(onboardingFieldDefinitionSchema).min(1),
});
export type CreateOnboardingFormTemplateVersionRequest = z.infer<
  typeof createOnboardingFormTemplateVersionRequestSchema
>;

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
