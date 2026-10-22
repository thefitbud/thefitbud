import { z } from "zod";
import { cursorPageSchema, isoDateTimeSchema, uuidSchema } from "./identity.js";
import {
  assignmentScheduleStatusSchema,
  assignmentWindowModeSchema,
  workoutDaySchema,
} from "./plan.js";

/** Calendar date in the trainee's timezone (YYYY-MM-DD). */
export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export type LocalDate = z.infer<typeof localDateSchema>;

/** Persisted execution lifecycle. Missed is never stored here. */
export const workoutExecutionStatusSchema = z.enum([
  "started",
  "paused",
  "completed",
  "modified",
  "skipped",
]);
export type WorkoutExecutionStatus = z.infer<
  typeof workoutExecutionStatusSchema
>;

/** Assignment view status including server-derived Missed. */
export const workoutAssignmentStatusSchema = z.enum([
  "assigned",
  "in_progress",
  "paused",
  "completed",
  "modified",
  "skipped",
  "missed",
]);
export type WorkoutAssignmentStatus = z.infer<
  typeof workoutAssignmentStatusSchema
>;

export const setExecutionStatusSchema = z.enum([
  "pending",
  "completed",
  "modified",
  "skipped",
]);
export type SetExecutionStatus = z.infer<typeof setExecutionStatusSchema>;

export const exerciseExecutionStatusSchema = z.enum([
  "pending",
  "completed",
  "skipped",
]);
export type ExerciseExecutionStatus = z.infer<
  typeof exerciseExecutionStatusSchema
>;

export const setExecutionSchema = z.object({
  id: uuidSchema,
  exerciseExecutionId: uuidSchema,
  setTargetId: uuidSchema,
  order: z.number().int().min(1).max(50),
  status: setExecutionStatusSchema,
  prescribedReps: z.number().int().min(1).max(100).nullable(),
  prescribedLoadLabel: z.string().max(80).nullable(),
  actualReps: z.number().int().min(1).max(100).nullable(),
  actualLoadLabel: z.string().max(80).nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type SetExecution = z.infer<typeof setExecutionSchema>;

export const exerciseExecutionSchema = z.object({
  id: uuidSchema,
  workoutExecutionId: uuidSchema,
  exerciseId: uuidSchema,
  name: z.string().min(1).max(120),
  order: z.number().int().min(1).max(100),
  status: exerciseExecutionStatusSchema,
  sets: z.array(setExecutionSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ExerciseExecution = z.infer<typeof exerciseExecutionSchema>;

export const workoutExecutionSchema = z.object({
  id: uuidSchema,
  assignmentId: uuidSchema,
  coachingRelationshipId: uuidSchema,
  planVersionId: uuidSchema,
  traineeUserId: uuidSchema,
  status: workoutExecutionStatusSchema,
  recordVersion: z.number().int().nonnegative(),
  startedAt: isoDateTimeSchema,
  pausedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  sessionRpe: z.number().min(1).max(10).nullable(),
  requireSessionRpe: z.boolean(),
  exercises: z.array(exerciseExecutionSchema),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutExecution = z.infer<typeof workoutExecutionSchema>;

export const workoutExecutionSummarySchema = workoutExecutionSchema.omit({
  exercises: true,
});
export type WorkoutExecutionSummary = z.infer<
  typeof workoutExecutionSummarySchema
>;

export const workoutAssignmentSchema = z.object({
  id: uuidSchema,
  coachingRelationshipId: uuidSchema,
  planId: uuidSchema,
  planVersionId: uuidSchema,
  workoutDayId: uuidSchema,
  workoutDayName: z.string().min(1).max(120),
  localDate: localDateSchema,
  windowStartsAt: isoDateTimeSchema,
  windowEndsAt: isoDateTimeSchema,
  /** Derived for UI; Missed is never client-written. */
  status: workoutAssignmentStatusSchema,
  scheduleStatus: assignmentScheduleStatusSchema.default("scheduled"),
  supersededAt: isoDateTimeSchema.nullable().optional(),
  supersededByPlanVersionId: uuidSchema.nullable().optional(),
  workoutDay: workoutDaySchema,
  execution: workoutExecutionSummarySchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type WorkoutAssignment = z.infer<typeof workoutAssignmentSchema>;

export const workoutAssignmentListResponseSchema = cursorPageSchema(
  workoutAssignmentSchema,
);
export type WorkoutAssignmentListResponse = z.infer<
  typeof workoutAssignmentListResponseSchema
>;

export const generateWorkoutAssignmentsRequestSchema = z.object({
  window: assignmentWindowModeSchema.optional(),
  fromDate: localDateSchema.optional(),
  toDate: localDateSchema.optional(),
});
export type GenerateWorkoutAssignmentsRequest = z.infer<
  typeof generateWorkoutAssignmentsRequestSchema
>;

export const generateWorkoutAssignmentsResponseSchema = z.object({
  created: z.number().int().nonnegative(),
  assignments: z.array(workoutAssignmentSchema),
});
export type GenerateWorkoutAssignmentsResponse = z.infer<
  typeof generateWorkoutAssignmentsResponseSchema
>;

export const completeSetRequestSchema = z.object({
  /** Omit or null to keep prescribed values (no re-entry). */
  actualReps: z.number().int().min(1).max(100).nullable().optional(),
  actualLoadLabel: z.string().trim().max(80).nullable().optional(),
});
export type CompleteSetRequest = z.infer<typeof completeSetRequestSchema>;

export const completeWorkoutRequestSchema = z.object({
  sessionRpe: z.number().min(1).max(10).nullable().optional(),
});
export type CompleteWorkoutRequest = z.infer<typeof completeWorkoutRequestSchema>;

export const workoutAdherenceItemSchema = z.object({
  assignmentId: uuidSchema,
  localDate: localDateSchema,
  workoutDayName: z.string().min(1).max(120),
  status: workoutAssignmentStatusSchema,
  planVersionId: uuidSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  sessionRpe: z.number().min(1).max(10).nullable(),
});
export type WorkoutAdherenceItem = z.infer<typeof workoutAdherenceItemSchema>;

export const workoutAdherenceResponseSchema = z.object({
  items: z.array(workoutAdherenceItemSchema),
  totals: z.object({
    assigned: z.number().int().nonnegative(),
    completed: z.number().int().nonnegative(),
    modified: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    missed: z.number().int().nonnegative(),
    inProgress: z.number().int().nonnegative(),
  }),
});
export type WorkoutAdherenceResponse = z.infer<
  typeof workoutAdherenceResponseSchema
>;
