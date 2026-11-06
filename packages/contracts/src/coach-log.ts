import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";

/** Z5-4 scaffold marker, still asserted by `w6-scaffold.test.ts`. */
export type W6CoachLogContract = Record<string, never>;

/**
 * Trainer log and edit of a client's workout (Z6-19, PLAN-v2 D-P2-21, D-W6-IP
 * rules R1–R5). The response of both routes is `workoutExecutionSchema`.
 */

/** Who wrote or last edited a client log entry. */
export const coachLogAuthorRoleSchema = z.enum(["trainee", "coach"]);
export type CoachLogAuthorRole = z.infer<typeof coachLogAuthorRoleSchema>;

/** Numeric load in kg, 0–500 with at most 2 decimals (same rule as set complete). */
const loadKgSchema = z
  .number()
  .min(0)
  .max(500)
  .refine((kg) => Math.abs(kg * 100 - Math.round(kg * 100)) < 1e-6, {
    message: "At most 2 decimals.",
  });

/**
 * One set as the trainer records it. A done set keeps the prescribed reps and
 * load unless the trainer sends them; `actualLoadKg` and `bodyweight` are
 * mutually exclusive. A skipped set carries no reps or load.
 */
const coachSetFields = {
  status: z.enum(["completed", "skipped"]),
  actualReps: z.number().int().min(1).max(100).nullable().optional(),
  actualLoadKg: loadKgSchema.optional(),
  bodyweight: z.literal(true).optional(),
};

type CoachSetFields = {
  status: "completed" | "skipped";
  actualReps?: number | null;
  actualLoadKg?: number;
  bodyweight?: true;
};

function coachSetIsConsistent(set: CoachSetFields): boolean {
  if (set.actualLoadKg !== undefined && set.bodyweight) return false;
  if (set.status === "skipped") {
    return (
      set.actualReps === undefined &&
      set.actualLoadKg === undefined &&
      set.bodyweight === undefined
    );
  }
  return true;
}

const coachSetRefinement = {
  message: "A set has either a kg load or bodyweight, and a skipped set has no values.",
};

export const coachLogSetSchema = z
  .object({ setTargetId: uuidSchema, ...coachSetFields })
  .refine(coachSetIsConsistent, coachSetRefinement);
export type CoachLogSet = z.infer<typeof coachLogSetSchema>;

export const coachLogExerciseSchema = z.object({
  exerciseId: uuidSchema,
  sets: z.array(coachLogSetSchema).min(1).max(50),
});
export type CoachLogExercise = z.infer<typeof coachLogExerciseSchema>;

/**
 * `POST /workouts/assignments/:assignmentId/log` (trainer, Idempotency-Key).
 * The whole finished workout in one body: every set of the assignment's
 * workout day appears exactly once, done or skipped (never auto-skipped).
 * `performedAt` must be within the last 7 days and not in the future (R2).
 */
export const coachLogWorkoutRequestSchema = z.object({
  performedAt: isoDateTimeSchema,
  sessionRpe: z.number().min(1).max(10).nullable().optional(),
  exercises: z.array(coachLogExerciseSchema).min(1).max(100),
});
export type CoachLogWorkoutRequest = z.infer<typeof coachLogWorkoutRequestSchema>;

export const coachEditSetSchema = z
  .object({ setExecutionId: uuidSchema, ...coachSetFields })
  .refine(coachSetIsConsistent, coachSetRefinement);
export type CoachEditSet = z.infer<typeof coachEditSetSchema>;

/**
 * `PATCH /workouts/executions/:executionId` (trainer). Changes the listed
 * sets, `performedAt` or the session RPE of a finished execution dated within
 * the last 7 days. `recordVersion` is the version the trainer edited; a stale
 * one returns 409 `VERSION_CONFLICT`, never a silent overwrite.
 */
export const coachEditWorkoutRequestSchema = z
  .object({
    recordVersion: z.number().int().nonnegative(),
    performedAt: isoDateTimeSchema.optional(),
    sessionRpe: z.number().min(1).max(10).nullable().optional(),
    sets: z.array(coachEditSetSchema).min(1).max(500).optional(),
  })
  .refine(
    (body) =>
      body.performedAt !== undefined ||
      body.sessionRpe !== undefined ||
      body.sets !== undefined,
    { message: "Send at least one change." },
  );
export type CoachEditWorkoutRequest = z.infer<typeof coachEditWorkoutRequestSchema>;

/**
 * Dedupe key of a `coach_log_updated` notification. One notification type
 * covers a create and an edit; which one it was rides in the key (as the daily
 * summary carries its date), so the push payload stays routing only. The
 * mobile inbox reads it back with `parseCoachLogDedupeKey` for Firoz's copy
 * (D-W6-33). Z6-20 adds the meal and measurement entity types.
 */
export const COACH_LOG_ACTIONS = ["create", "edit"] as const;
export type CoachLogAction = (typeof COACH_LOG_ACTIONS)[number];

export const COACH_LOG_ENTITY_TYPES = ["workout_execution"] as const;
export type CoachLogEntityType = (typeof COACH_LOG_ENTITY_TYPES)[number];

const COACH_LOG_KEY_PREFIX = "coach_log_updated";

/** Unique per audit event (`log_edit_events.id`). */
export function coachLogDedupeKey(input: {
  action: CoachLogAction;
  entityType: CoachLogEntityType;
  eventId: string;
}): string {
  return `${COACH_LOG_KEY_PREFIX}:${input.action}:${input.entityType}:${input.eventId}`;
}

/** The action and entity type of a `coachLogDedupeKey`; null for any other key. */
export function parseCoachLogDedupeKey(
  dedupeKey: string,
): { action: CoachLogAction; entityType: CoachLogEntityType } | null {
  const parts = dedupeKey.split(":");
  if (parts.length !== 4) return null;
  const [prefix, action, entityType, eventId] = parts;
  if (prefix !== COACH_LOG_KEY_PREFIX || !eventId) return null;
  const knownAction = COACH_LOG_ACTIONS.find((value) => value === action);
  const knownEntity = COACH_LOG_ENTITY_TYPES.find((value) => value === entityType);
  if (!knownAction || !knownEntity) return null;
  return { action: knownAction, entityType: knownEntity };
}
