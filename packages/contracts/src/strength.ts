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

/**
 * How an exercise is charted (Z8-13, D-W8-7). `load_kg` plots the top set's kg
 * (bodyweight-plus counts its added kg). `reps` plots the most reps in one set; it is
 * used for bodyweight and reps-only lifts that carry no kg at all in the range.
 */
export const strengthChartBySchema = z.enum(["load_kg", "reps"]);
export type StrengthChartBy = z.infer<typeof strengthChartBySchema>;

/**
 * A day's best set for one exercise. On a `load_kg` exercise: the highest kg, ties
 * broken by reps, and `topLoadKg` is null on a day that only had bodyweight or
 * reps-only sets. On a `reps` exercise: the set with the most reps, `topLoadKg` null.
 */
export const strengthPointSchema = z.object({
  localDate: localDateSchema,
  topLoadKg: z.number().nonnegative().nullable(),
  reps: z.number().int().nonnegative().nullable(),
  /** Reps summed over the day's charted sets (kg, bodyweight-plus, bodyweight, reps-only). */
  totalReps: z.number().int().nonnegative(),
  /** Reps × kg summed over the day's sets that carry kg; null when none did. */
  volumeKg: z.number().nonnegative().nullable(),
});
export type StrengthPoint = z.infer<typeof strengthPointSchema>;

export const strengthExerciseSchema = z.object({
  exerciseId: z.string().min(1),
  name: z.string(),
  chartBy: strengthChartBySchema,
  /** Days in the range with at least one logged set of this exercise (text loads included). */
  sessions: z.number().int().nonnegative(),
  /**
   * Planned workouts in the range (up to the range end) that held this exercise, plus
   * any logged workout it was added to.
   */
  plannedSessions: z.number().int().nonnegative(),
  points: z.array(strengthPointSchema),
});
export type StrengthExercise = z.infer<typeof strengthExerciseSchema>;

export const strengthWeekCountSchema = z.object({
  /** Monday of the week, trainee-local. */
  weekStart: localDateSchema,
  /** Finished (completed or modified) workouts. */
  count: z.number().int().nonnegative(),
  /**
   * Scheduled workouts in the week (superseded ones left out, finished ones always
   * in). The current week counts all its days; other weeks stop at the range end.
   */
  planned: z.number().int().nonnegative(),
});
export type StrengthWeekCount = z.infer<typeof strengthWeekCountSchema>;

/** One logged set whose load could not be charted, for the "See sets" list. */
export const strengthUnchartedSetSchema = z.object({
  localDate: localDateSchema,
  exerciseName: z.string(),
  /** The load as it was logged. */
  loadLabel: z.string(),
  reps: z.number().int().nonnegative().nullable(),
});
export type StrengthUnchartedSet = z.infer<typeof strengthUnchartedSetSchema>;

/** At most this many uncharted sets are listed; `sets` still counts all of them. */
export const STRENGTH_UNCHARTED_LIST_MAX = 50;

export const strengthReadModelSchema = z.object({
  exercises: z.array(strengthExerciseSchema),
  workoutsPerWeek: z.array(strengthWeekCountSchema),
  /** Logged sets with a load that could not be turned into kg (kind `text`). */
  notCharted: z.object({
    sets: z.number().int().nonnegative(),
    /** Newest first, at most STRENGTH_UNCHARTED_LIST_MAX. */
    items: z.array(strengthUnchartedSetSchema).max(STRENGTH_UNCHARTED_LIST_MAX),
  }),
});
export type StrengthReadModel = z.infer<typeof strengthReadModelSchema>;
