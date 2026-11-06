import { z } from "zod";
import { isoDateTimeSchema, uuidSchema } from "./identity.js";
import { localDateSchema } from "./workout.js";

// W6 Z6-9: placeholder type from Z5-4, still exported by the contracts index scaffold test.
export type W6StepsContract = Record<string, never>;

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31). */
export function isRealStepsDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const stepsLocalDateSchema = localDateSchema.refine(
  isRealStepsDate,
  "Expected a real date",
);

export const stepsSourceSchema = z.enum(["apple_health", "health_connect", "manual"]);
export type StepsSource = z.infer<typeof stepsSourceSchema>;

export const STEPS_TARGET_MIN = 1000;
export const STEPS_TARGET_MAX = 50000;
export const STEPS_DAY_MAX = 200000;

const stepsTargetSchema = z.number().int().min(STEPS_TARGET_MIN).max(STEPS_TARGET_MAX);
const stepsCountSchema = z.number().int().min(0).max(STEPS_DAY_MAX);

/**
 * `PUT /me/steps/days/:localDate`. `syncedAt` is when the phone read the total; a
 * write only replaces a stored day when its `syncedAt` is newer. It defaults to the
 * server time, and a value ahead of the server clock is treated as the server time.
 */
export const putStepsDayRequestSchema = z.object({
  steps: stepsCountSchema,
  source: stepsSourceSchema,
  syncedAt: isoDateTimeSchema.optional(),
});
export type PutStepsDayRequest = z.infer<typeof putStepsDayRequestSchema>;

export const stepsDaySchema = z.object({
  localDate: localDateSchema,
  steps: stepsCountSchema,
  source: stepsSourceSchema,
  syncedAt: isoDateTimeSchema,
});
export type StepsDay = z.infer<typeof stepsDaySchema>;

/** The stored day after a write, and whether this write is the one that is stored. */
export const putStepsDayResponseSchema = stepsDaySchema.extend({
  applied: z.boolean(),
});
export type PutStepsDayResponse = z.infer<typeof putStepsDayResponseSchema>;

/** `GET /me/steps/today`: `steps` is null until a total has been saved for today. */
export const stepsTodayResponseSchema = z.object({
  localDate: localDateSchema,
  steps: stepsCountSchema.nullable(),
  target: stepsTargetSchema,
});
export type StepsTodayResponse = z.infer<typeof stepsTodayResponseSchema>;

export const stepsRangeSchema = z.enum(["7d", "30d", "90d"]);
export type StepsRange = z.infer<typeof stepsRangeSchema>;

export const stepsQuerySchema = z.object({
  range: stepsRangeSchema.default("7d"),
});
export type StepsQuery = z.infer<typeof stepsQuerySchema>;

/** `GET /steps/relationships/:id`: saved days only, oldest first; no gaps are filled in. */
export const stepsRangeResponseSchema = z.object({
  relationshipId: uuidSchema,
  target: stepsTargetSchema,
  from: localDateSchema,
  to: localDateSchema,
  days: z.array(stepsDaySchema),
});
export type StepsRangeResponse = z.infer<typeof stepsRangeResponseSchema>;

export const putStepsTargetRequestSchema = z.object({
  target: stepsTargetSchema,
});
export type PutStepsTargetRequest = z.infer<typeof putStepsTargetRequestSchema>;

export const putStepsTargetResponseSchema = z.object({
  relationshipId: uuidSchema,
  target: stepsTargetSchema,
});
export type PutStepsTargetResponse = z.infer<typeof putStepsTargetResponseSchema>;
