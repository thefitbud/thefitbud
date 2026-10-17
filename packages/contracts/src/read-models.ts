import { z } from "zod";
import { adherenceStateSchema } from "./adherence.js";
import { exceptionSeveritySchema, exceptionStatusSchema, exceptionTypeSchema } from "./exception.js";
import { uuidSchema } from "./identity.js";
import { localDateSchema } from "./workout.js";

export const weekDayStateSchema = z.enum([
  "done",
  "partial",
  "missed",
  "rest",
  "future",
]);
export type WeekDayState = z.infer<typeof weekDayStateSchema>;

export const weekReadModelSchema = z.object({
  start: localDateSchema,
  workouts: z.object({
    assigned: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
  }),
  meals: z.object({
    assigned: z.number().int().nonnegative(),
    logged: z.number().int().nonnegative(),
  }),
  days: z.array(
    z.object({
      date: localDateSchema,
      state: weekDayStateSchema,
    }),
  ),
});
export type WeekReadModel = z.infer<typeof weekReadModelSchema>;

export const attentionGroupItemSchema = z.object({
  id: uuidSchema,
  type: exceptionTypeSchema,
  severity: exceptionSeveritySchema,
  status: exceptionStatusSchema,
  ageMinutes: z.number().int().nonnegative(),
  summary: z.string(),
});
export type AttentionGroupItem = z.infer<typeof attentionGroupItemSchema>;

export const attentionGroupSchema = z.object({
  relationshipId: uuidSchema,
  traineeDisplayName: z.string(),
  items: z.array(attentionGroupItemSchema),
});
export type AttentionGroup = z.infer<typeof attentionGroupSchema>;

export const attentionGroupsResponseSchema = z.object({
  groups: z.array(attentionGroupSchema),
});
export type AttentionGroupsResponse = z.infer<typeof attentionGroupsResponseSchema>;

export const clientFacetsSchema = z.object({
  status: z.record(z.string(), z.number().int().nonnegative()),
  adherence: z.record(z.string(), z.number().int().nonnegative()),
  renewal: z.record(z.string(), z.number().int().nonnegative()),
});
export type ClientFacets = z.infer<typeof clientFacetsSchema>;

export const clientDirectoryWithFacetsResponseSchema = z.object({
  items: z.array(z.record(z.string(), z.unknown())),
  facets: clientFacetsSchema,
  nextCursor: z.string().nullable(),
});

export const responsivenessLabelSchema = z.enum([
  "logs_on_own",
  "responds",
  "often_misses",
  "reminders_paused",
  "notifications_off",
  "not_enough_data",
]);
export type ResponsivenessLabel = z.infer<typeof responsivenessLabelSchema>;

export const responsivenessResponseSchema = z.object({
  label: responsivenessLabelSchema,
  counts: z.object({
    sent: z.number().int().nonnegative(),
    opened: z.number().int().nonnegative(),
    loggedAfter: z.number().int().nonnegative(),
    loggedBefore: z.number().int().nonnegative(),
  }),
});
export type ResponsivenessResponse = z.infer<typeof responsivenessResponseSchema>;

export const reengagementCandidateSchema = z.object({
  relationshipId: uuidSchema,
  traineeDisplayName: z.string(),
  waMeUrl: z.string().url(),
});
export type ReengagementCandidate = z.infer<typeof reengagementCandidateSchema>;

export const reengagementCandidatesResponseSchema = z.object({
  items: z.array(reengagementCandidateSchema),
});
export type ReengagementCandidatesResponse = z.infer<
  typeof reengagementCandidatesResponseSchema
>;

export const resolveExceptionOutcomeSchema = z.enum([
  "talked",
  "plan_adjusted",
  "no_action",
  "other",
]);
