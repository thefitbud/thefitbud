import { z } from "zod";
import { localDateSchema } from "./workout.js";

// W6 Z6-5: placeholder type from Z5-4, still exported by the contracts index scaffold test.
export type W6StrengthContract = Record<string, never>;

/** True for a real calendar date written YYYY-MM-DD (rejects 2026-02-31). */
function isRealLocalDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const strengthDateSchema = localDateSchema.refine(isRealLocalDate, "Expected a real date");

export const strengthRangeSchema = z.enum(["4w", "12w", "all"]);
export type StrengthRange = z.infer<typeof strengthRangeSchema>;

/**
 * `GET /strength/relationships/:relationshipId`. `from` and `to` are trainee-local
 * dates (inclusive) and, when either is given, replace `range`.
 */
export const strengthQuerySchema = z
  .object({
    range: strengthRangeSchema.default("12w"),
    from: strengthDateSchema.optional(),
    to: strengthDateSchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: "from must not be after to",
    path: ["from"],
  });
export type StrengthQuery = z.infer<typeof strengthQuerySchema>;

/** A day's best set for one exercise: highest load in kg, ties broken by reps. */
export const strengthPointSchema = z.object({
  localDate: localDateSchema,
  topLoadKg: z.number().nonnegative(),
  reps: z.number().int().nonnegative().nullable(),
});
export type StrengthPoint = z.infer<typeof strengthPointSchema>;

export const strengthExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  name: z.string(),
  points: z.array(strengthPointSchema),
});
export type StrengthExercise = z.infer<typeof strengthExerciseSchema>;

export const strengthWeekCountSchema = z.object({
  /** Monday of the week, trainee-local. */
  weekStart: localDateSchema,
  count: z.number().int().nonnegative(),
});
export type StrengthWeekCount = z.infer<typeof strengthWeekCountSchema>;

export const strengthReadModelSchema = z.object({
  exercises: z.array(strengthExerciseSchema),
  workoutsPerWeek: z.array(strengthWeekCountSchema),
  /** Logged sets with a load that could not be turned into kg (kind `text` and other non-kg labels). */
  notCharted: z.object({ sets: z.number().int().nonnegative() }),
});
export type StrengthReadModel = z.infer<typeof strengthReadModelSchema>;
