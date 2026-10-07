import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import { activeExceptionSummarySchema } from "./exception.js";
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

export const checkinAnswersSchema = z.object({
  wellbeing: z.string().trim().min(1).max(1000),
  notes: z.string().trim().max(2000).nullable().optional(),
  bodyWeightKg: z.number().positive().max(500).nullable().optional(),
  photoIntent: checkinPhotoIntentSchema.nullable().optional(),
});
export type CheckinAnswers = z.infer<typeof checkinAnswersSchema>;

/** Partial answers allowed while drafting. */
export const checkinDraftAnswersSchema = z.object({
  wellbeing: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  bodyWeightKg: z.number().positive().max(500).nullable().optional(),
  photoIntent: checkinPhotoIntentSchema.nullable().optional(),
});
export type CheckinDraftAnswers = z.infer<typeof checkinDraftAnswersSchema>;

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
});
export type ScheduleNextCheckinRequest = z.infer<
  typeof scheduleNextCheckinRequestSchema
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

export const trainerNoteSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  trainerUserId: uuidSchema,
  checkinId: uuidSchema.nullable(),
  body: z.string().min(1).max(4000),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TrainerNote = z.infer<typeof trainerNoteSchema>;

export const createTrainerNoteRequestSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  checkinId: uuidSchema.nullable().optional(),
});
export type CreateTrainerNoteRequest = z.infer<
  typeof createTrainerNoteRequestSchema
>;

export const trainerNoteListResponseSchema = cursorPageSchema(trainerNoteSchema);
export type TrainerNoteListResponse = z.infer<
  typeof trainerNoteListResponseSchema
>;

export const checkinReviewContextSchema = z.object({
  checkin: checkinSchema,
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
