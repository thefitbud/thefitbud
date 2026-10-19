import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import { activeExceptionSummarySchema } from "./exception.js";
import { measurementTypeSchema, mediaAssetSchema } from "./progress.js";
import { localDateSchema } from "./workout.js";

/** Persisted record state. Scheduled / Due / Overdue / Reviewed are never stored. */
export const checkinRecordStatusSchema = z.enum(["draft", "submitted"]);
export type CheckinRecordStatus = z.infer<typeof checkinRecordStatusSchema>;

/** View status including server-derived Scheduled / Due / Overdue / Reviewed. */
export const checkinStatusSchema = z.enum([
  "scheduled",
  "due",
  "submitted",
  "reviewed",
  "overdue",
]);
export type CheckinStatus = z.infer<typeof checkinStatusSchema>;

export const checkinReviewOutcomeSchema = z.enum([
  "acknowledged",
  "needs_follow_up",
  "adjust_coaching",
]);
export type CheckinReviewOutcome = z.infer<typeof checkinReviewOutcomeSchema>;

/** Photo intent metadata only — full R2 upload is D1. */
export const checkinPhotoIntentSchema = z.object({
  notedAt: isoDateTimeSchema,
  contentType: z.string().trim().max(120).nullable().optional(),
  clientRef: z.string().trim().max(120).nullable().optional(),
});
export type CheckinPhotoIntent = z.infer<typeof checkinPhotoIntentSchema>;

const checkinFieldBaseSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(200),
  required: z.boolean(),
  helpText: z.string().min(1).max(500).optional(),
});

/**
 * Check-in form fields. Separate from onboarding fields.
 * `measurement` records a progress measurement type such as body_weight_kg.
 */
const checkinChoiceOptionSchema = z.object({
  id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
});

export const checkinFieldDefinitionSchema = z.discriminatedUnion("type", [
  checkinFieldBaseSchema.extend({
    type: z.literal("short_text"),
    maxLength: z.number().int().min(1).max(10000).optional(),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("long_text"),
    maxLength: z.number().int().min(1).max(10000).optional(),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("single_choice"),
    options: z.array(checkinChoiceOptionSchema).min(1).max(50),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("multiple_choice"),
    options: z.array(checkinChoiceOptionSchema).min(1).max(50),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("number"),
    unit: z.string().min(1).max(32).optional(),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("yes_no"),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("measurement"),
    measurementType: measurementTypeSchema,
    /** Optional display unit for custom metrics (measurementType "other"). */
    unit: z.string().min(1).max(32).optional(),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("photo_intent"),
    /** Slot hint: front | side | back | any. */
    photoSlot: z.enum(["front", "side", "back", "any"]).optional(),
  }),
  checkinFieldBaseSchema.extend({
    type: z.literal("scale_1_5"),
    lowLabel: z.string().min(1).max(80).optional(),
    highLabel: z.string().min(1).max(80).optional(),
  }),
]);
export type CheckinFieldDefinition = z.infer<typeof checkinFieldDefinitionSchema>;

function refineCheckinFields(
  fields: CheckinFieldDefinition[],
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
  });
}

const checkinFieldListSchema = z
  .array(checkinFieldDefinitionSchema)
  .min(1)
  .superRefine(refineCheckinFields);

/** Immutable field list stored on a check-in form version. Order is significant. */
export const checkinFormDefinitionSchema = z.object({
  fields: checkinFieldListSchema,
});
export type CheckinFormDefinition = z.infer<typeof checkinFormDefinitionSchema>;

const checkinFieldAnswerSchema = z.union([
  z.string().max(10000),
  z.number().finite(),
  z.boolean(),
  z.array(z.string().min(1).max(200)).max(50),
  checkinPhotoIntentSchema,
]);

export const checkinAnswersSchema = z.object({
  wellbeing: z.string().trim().min(1).max(1000),
  notes: z.string().trim().max(2000).nullable().optional(),
  bodyWeightKg: z.number().positive().max(500).nullable().optional(),
  photoIntent: checkinPhotoIntentSchema.nullable().optional(),
  /** Extra answers keyed by check-in form field id. Legacy keys above stay. */
  fieldAnswers: z
    .record(z.string().min(1).max(64), checkinFieldAnswerSchema)
    .optional(),
});
export type CheckinAnswers = z.infer<typeof checkinAnswersSchema>;

/** Partial answers allowed while drafting. */
export const checkinDraftAnswersSchema = z.object({
  wellbeing: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  bodyWeightKg: z.number().positive().max(500).nullable().optional(),
  photoIntent: checkinPhotoIntentSchema.nullable().optional(),
  fieldAnswers: z
    .record(z.string().min(1).max(64), checkinFieldAnswerSchema)
    .optional(),
});
export type CheckinDraftAnswers = z.infer<typeof checkinDraftAnswersSchema>;

export const checkinFormTemplateOwnershipSchema = z.enum(["global", "trainer"]);
export type CheckinFormTemplateOwnership = z.infer<
  typeof checkinFormTemplateOwnershipSchema
>;

export const checkinFormVersionSchema = z.object({
  id: uuidSchema,
  templateId: uuidSchema,
  key: z.string().min(1),
  version: z.number().int().positive(),
  scope: checkinFormTemplateOwnershipSchema,
  fields: checkinFieldListSchema,
  createdAt: isoDateTimeSchema,
});
export type CheckinFormVersion = z.infer<typeof checkinFormVersionSchema>;

export const checkinFormTemplateSummarySchema = z.object({
  id: uuidSchema,
  ownership: checkinFormTemplateOwnershipSchema,
  trainerUserId: uuidSchema.nullable(),
  name: z.string().min(1).max(120),
  description: z.string().max(500).nullable(),
  latestVersionId: uuidSchema,
  latestVersionNumber: z.number().int().positive(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CheckinFormTemplateSummary = z.infer<
  typeof checkinFormTemplateSummarySchema
>;

export const checkinFormTemplateListResponseSchema = z.object({
  items: z.array(checkinFormTemplateSummarySchema),
  nextCursor: z.string().nullable(),
});
export type CheckinFormTemplateListResponse = z.infer<
  typeof checkinFormTemplateListResponseSchema
>;

export const checkinFormTemplateDetailSchema =
  checkinFormTemplateSummarySchema.extend({
    versions: z.array(checkinFormVersionSchema).min(1),
  });
export type CheckinFormTemplateDetail = z.infer<
  typeof checkinFormTemplateDetailSchema
>;

export const createCheckinFormTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500).optional(),
  fields: checkinFieldListSchema,
});
export type CreateCheckinFormTemplateRequest = z.infer<
  typeof createCheckinFormTemplateRequestSchema
>;

export const forkCheckinFormTemplateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().min(1).max(500).optional(),
});
export type ForkCheckinFormTemplateRequest = z.infer<
  typeof forkCheckinFormTemplateRequestSchema
>;

export const createCheckinFormTemplateVersionRequestSchema = z.object({
  fields: checkinFieldListSchema,
});
export type CreateCheckinFormTemplateVersionRequest = z.infer<
  typeof createCheckinFormTemplateVersionRequestSchema
>;

export const checkinReviewSchema = z.object({
  id: uuidSchema,
  checkinId: uuidSchema,
  coachingRelationshipId: uuidSchema,
  trainerUserId: uuidSchema,
  outcome: checkinReviewOutcomeSchema,
  notes: z.string().max(2000).nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type CheckinReview = z.infer<typeof checkinReviewSchema>;

export const checkinSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  checkinScheduleId: uuidSchema.nullable(),
  localDate: localDateSchema,
  windowStartsAt: isoDateTimeSchema,
  windowEndsAt: isoDateTimeSchema,
  recordStatus: checkinRecordStatusSchema,
  recordVersion: z.number().int().nonnegative(),
  definitionVersion: z.number().int().positive(),
  /** Pinned check-in form version. Later template edits do not move this id. */
  checkinFormVersionId: uuidSchema,
  answers: checkinDraftAnswersSchema.nullable(),
  submittedAt: isoDateTimeSchema.nullable(),
  /** Derived for UI; Scheduled / Due / Overdue / Reviewed are never client-written. */
  status: checkinStatusSchema,
  review: checkinReviewSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Checkin = z.infer<typeof checkinSchema>;

export const checkinListResponseSchema = cursorPageSchema(checkinSchema);
export type CheckinListResponse = z.infer<typeof checkinListResponseSchema>;

export const scheduleCheckinRequestSchema = z.object({
  localDate: localDateSchema,
  /** When omitted, scheduling pins the global check-in form version. */
  checkinFormVersionId: uuidSchema.optional(),
});
export type ScheduleCheckinRequest = z.infer<typeof scheduleCheckinRequestSchema>;

export const scheduleCheckinResponseSchema = z.object({
  checkin: checkinSchema,
  created: z.boolean(),
});
export type ScheduleCheckinResponse = z.infer<
  typeof scheduleCheckinResponseSchema
>;

export const scheduleNextCheckinRequestSchema = z.object({
  /** Optional explicit due date; when omitted, cadence advances from the source check-in. */
  localDate: localDateSchema.optional(),
  fromCheckinId: uuidSchema.optional(),
  /**
   * When omitted, the next check-in uses the relationship's preferred form,
   * then the source check-in's pinned form, then the FitBud base.
   */
  checkinFormVersionId: uuidSchema.optional(),
});
export type ScheduleNextCheckinRequest = z.infer<
  typeof scheduleNextCheckinRequestSchema
>;

/** Assign a check-in form version to a client (TW-11 / Use for client). */
export const assignPreferredCheckinFormRequestSchema = z.object({
  checkinFormVersionId: uuidSchema,
});
export type AssignPreferredCheckinFormRequest = z.infer<
  typeof assignPreferredCheckinFormRequestSchema
>;

export const assignPreferredCheckinFormResponseSchema = z.object({
  coachingRelationshipId: uuidSchema,
  checkinFormVersionId: uuidSchema,
});
export type AssignPreferredCheckinFormResponse = z.infer<
  typeof assignPreferredCheckinFormResponseSchema
>;

export const saveCheckinDraftRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  answers: checkinDraftAnswersSchema,
});
export type SaveCheckinDraftRequest = z.infer<
  typeof saveCheckinDraftRequestSchema
>;

export const submitCheckinRequestSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  answers: checkinAnswersSchema,
});
export type SubmitCheckinRequest = z.infer<typeof submitCheckinRequestSchema>;

export const recordCheckinReviewRequestSchema = z.object({
  outcome: checkinReviewOutcomeSchema,
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type RecordCheckinReviewRequest = z.infer<
  typeof recordCheckinReviewRequestSchema
>;

export const trainerNoteVisibilitySchema = z.enum(["private", "client"]);
export type TrainerNoteVisibility = z.infer<typeof trainerNoteVisibilitySchema>;

export const trainerNoteSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  trainerUserId: uuidSchema,
  checkinId: uuidSchema.nullable(),
  body: z.string().min(1).max(4000),
  visibility: trainerNoteVisibilitySchema,
  subjectType: z.string().nullable().optional(),
  subjectId: uuidSchema.nullable().optional(),
  sharedAt: isoDateTimeSchema.nullable(),
  seenAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TrainerNote = z.infer<typeof trainerNoteSchema>;

export const createTrainerNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: trainerNoteVisibilitySchema.optional(),
  subjectType: z.string().trim().max(64).nullable().optional(),
  subjectId: uuidSchema.nullable().optional(),
  checkinId: uuidSchema.nullable().optional(),
});
export type CreateTrainerNoteRequest = z.infer<
  typeof createTrainerNoteRequestSchema
>;

export const patchTrainerNoteRequestSchema = z
  .object({
    body: z.string().trim().min(1).max(4000).optional(),
    visibility: trainerNoteVisibilitySchema.optional(),
  })
  .refine((value) => value.body !== undefined || value.visibility !== undefined, {
    message: "Provide body and/or visibility.",
  });
export type PatchTrainerNoteRequest = z.infer<
  typeof patchTrainerNoteRequestSchema
>;

export const deleteTrainerNoteResponseSchema = z.object({
  id: uuidSchema,
  deleted: z.literal(true),
});
export type DeleteTrainerNoteResponse = z.infer<
  typeof deleteTrainerNoteResponseSchema
>;

export const trainerNoteListResponseSchema = cursorPageSchema(trainerNoteSchema);
export type TrainerNoteListResponse = z.infer<
  typeof trainerNoteListResponseSchema
>;

export const checkinReviewPhotoSchema = mediaAssetSchema.pick({
  id: true,
  mediaType: true,
  status: true,
  contentType: true,
  createdAt: true,
  domainEntityType: true,
  domainEntityId: true,
});
export type CheckinReviewPhoto = z.infer<typeof checkinReviewPhotoSchema>;

export const checkinReviewContextSchema = z.object({
  checkin: checkinSchema,
  /** Form version pinned when the check-in was scheduled. Trainer review only. */
  pinnedForm: checkinFormVersionSchema,
  recentWorkoutAdherence: z.object({
    completed: z.number().int().nonnegative(),
    missed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  recentMealCompliance: z.object({
    confirmed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
  }),
  activeExceptions: z.array(activeExceptionSummarySchema),
  /** Stored progress or check-in photos for the relationship, when any exist. */
  photos: z.array(checkinReviewPhotoSchema),
  /** Stored measurements for the relationship (newest first), not invented values. */
  measurements: z.array(
    z.object({
      id: uuidSchema.optional(),
      type: z.string(),
      value: z.string(),
      unit: z.string().optional(),
      observedAt: isoDateTimeSchema,
      mediaAssetId: uuidSchema.nullable().optional(),
    }),
  ),
  previousNotes: z.array(trainerNoteSchema),
  currentPlan: z
    .object({
      planId: uuidSchema,
      planVersionId: uuidSchema,
      title: z.string(),
      versionNumber: z.number().int().positive(),
      effectiveFrom: isoDateTimeSchema.nullable(),
    })
    .nullable(),
  currentConfiguration: z
    .object({
      id: uuidSchema,
      goalShort: z.string().max(120).nullable(),
      goalDescription: z.string().max(500).nullable(),
      checkinCadence: z.enum(["weekly", "biweekly", "monthly"]),
      dueWindowHours: z.number().int().positive(),
    })
    .nullable(),
});
export type CheckinReviewContext = z.infer<typeof checkinReviewContextSchema>;

export const trainerCheckinInboxItemSchema = z.object({
  checkin: checkinSchema,
  coachingRelationshipId: uuidSchema,
  traineeUserId: uuidSchema,
  traineeDisplayName: z.string().min(1).max(320).optional(),
  traineeTimezone: z.string().min(1).max(64).optional(),
});
export type TrainerCheckinInboxItem = z.infer<
  typeof trainerCheckinInboxItemSchema
>;

export const trainerCheckinInboxResponseSchema = cursorPageSchema(
  trainerCheckinInboxItemSchema,
);
export type TrainerCheckinInboxResponse = z.infer<
  typeof trainerCheckinInboxResponseSchema
>;
