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

const textLimitSchema = {
  maxLength: z.number().int().min(1).max(10000).optional(),
};

/** Stable option identity. The id is not the display label. */
export const onboardingChoiceOptionSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
});
export type OnboardingChoiceOption = z.infer<typeof onboardingChoiceOptionSchema>;

const choiceOptionsSchema = z.array(onboardingChoiceOptionSchema).min(1).max(50);

/**
 * Immutable field definition.
 * `text`, `textarea`, and `select` remain valid for versions already stored.
 * A legacy select option's id is its label string.
 * New versions use the six typed fields below.
 */
export const onboardingFieldDefinitionSchema = z.discriminatedUnion("type", [
  onboardingFieldBaseSchema.extend({
    type: z.literal("text"),
    ...textLimitSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("textarea"),
    ...textLimitSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("select"),
    options: z.array(z.string().min(1).max(200)).min(1).max(50),
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("short_text"),
    ...textLimitSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("long_text"),
    ...textLimitSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("single_choice"),
    options: choiceOptionsSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("multiple_choice"),
    options: choiceOptionsSchema,
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("number"),
  }),
  onboardingFieldBaseSchema.extend({
    type: z.literal("yes_no"),
  }),
]);
export type OnboardingFieldDefinition = z.infer<
  typeof onboardingFieldDefinitionSchema
>;
export type OnboardingFieldType = OnboardingFieldDefinition["type"];

function refineOnboardingFields(
  fields: OnboardingFieldDefinition[],
  ctx: z.RefinementCtx,
) {
  const fieldIds = new Set<string>();
  fields.forEach((field, index) => {
    if (fieldIds.has(field.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Field ids must be unique.",
        path: [index, "id"],
      });
    }
    fieldIds.add(field.id);
    if (
      field.type !== "select" &&
      field.type !== "single_choice" &&
      field.type !== "multiple_choice"
    ) {
      return;
    }
    const optionIds =
      field.type === "select"
        ? field.options
        : field.options.map((option) => option.id);
    const seen = new Set<string>();
    optionIds.forEach((optionId, optionIndex) => {
      if (seen.has(optionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Option ids must be unique.",
          path: [index, "options", optionIndex],
        });
      }
      seen.add(optionId);
    });
  });
}

const onboardingFieldListSchema = z
  .array(onboardingFieldDefinitionSchema)
  .min(1)
  .superRefine(refineOnboardingFields);

/** Immutable field list stored on an onboarding form version. Order is significant. */
export const onboardingFormDefinitionSchema = z.object({
  fields: onboardingFieldListSchema,
});
export type OnboardingFormDefinition = z.infer<typeof onboardingFormDefinitionSchema>;

export const onboardingFormVersionSchema = z.object({
  id: uuidSchema,
  templateId: uuidSchema,
  key: z.string().min(1),
  version: z.number().int().positive(),
  scope: z.enum(["global", "trainer"]),
  fields: onboardingFieldListSchema,
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
  fields: onboardingFieldListSchema,
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
  fields: onboardingFieldListSchema,
});
export type CreateOnboardingFormTemplateVersionRequest = z.infer<
  typeof createOnboardingFormTemplateVersionRequestSchema
>;

export const onboardingFormResponseStatusSchema = z.enum(["draft", "submitted"]);
export type OnboardingFormResponseStatus = z.infer<
  typeof onboardingFormResponseStatusSchema
>;

/**
 * One answer matching a pinned field: text, one option id, option ids,
 * a finite number, or a yes/no boolean.
 */
export const onboardingAnswerValueSchema = z.union([
  z.string().max(10000),
  z.array(z.string().min(1).max(200)).max(50),
  z.number().finite(),
  z.boolean(),
]);
export type OnboardingAnswerValue = z.infer<typeof onboardingAnswerValueSchema>;

export const onboardingAnswersSchema = z.record(
  z.string(),
  onboardingAnswerValueSchema,
);
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
