import { z } from "zod";
import { localDateSchema } from "./workout.js";

/**
 * Standard check-in question keys (Z6-6, D-W6-41). A trainer form may include
 * each key at most once; questions without a key are custom and never charted.
 * v1 forms carry no keys and keep working.
 */
export const CHECKIN_STANDARD_KEYS = [
  "weight",
  "waist",
  "hips",
  "chest",
  "arm",
  "thigh",
  "photo_front",
  "photo_side",
  "photo_back",
  "energy",
  "sleep_quality",
  "stress",
  "hunger",
  "notes",
] as const;

export const checkinStandardKeySchema = z.enum(CHECKIN_STANDARD_KEYS);
export type CheckinStandardKey = z.infer<typeof checkinStandardKeySchema>;

/**
 * Progress metrics by question key (Z6-7). Only keys that have a numeric
 * answer can be charted: photos and notes are not series.
 */
export const PROGRESS_METRIC_KEYS = [
  "weight",
  "waist",
  "hips",
  "chest",
  "arm",
  "thigh",
  "energy",
  "sleep_quality",
  "stress",
  "hunger",
] as const;

export const progressMetricKeySchema = z.enum(PROGRESS_METRIC_KEYS);
export type ProgressMetricKey = z.infer<typeof progressMetricKeySchema>;

export const progressMetricRangeSchema = z.enum(["4w", "12w", "all", "custom"]);
export type ProgressMetricRange = z.infer<typeof progressMetricRangeSchema>;

/** Compare is two keys in one call. */
export const PROGRESS_METRICS_MAX_KEYS = 2;

const metricLocalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Expected a real calendar date");

/** Query for GET /progress/relationships/:id/metrics, keys already split. */
export const progressMetricsQuerySchema = z
  .object({
    keys: z
      .array(progressMetricKeySchema)
      .min(1)
      .max(PROGRESS_METRICS_MAX_KEYS)
      .refine((keys) => new Set(keys).size === keys.length, "Keys must be unique"),
    range: progressMetricRangeSchema.default("12w"),
    from: metricLocalDateSchema.optional(),
    to: metricLocalDateSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.range === "custom") {
      if (!value.from) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from is required" });
      }
      if (!value.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to is required" });
      }
      if (value.from && value.to && value.from > value.to) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["from"], message: "from must not be after to" });
      }
    } else if (value.from || value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["range"],
        message: "from and to need range=custom",
      });
    }
  });
export type ProgressMetricsQuery = z.input<typeof progressMetricsQuerySchema>;

/** One value on one local date. `checkinId` is null when the value is a stored measurement with no check-in. */
export const progressMetricPointSchema = z.object({
  localDate: localDateSchema,
  value: z.number().finite(),
  checkinId: z.string().uuid().nullable(),
});
export type ProgressMetricPoint = z.infer<typeof progressMetricPointSchema>;

export const progressMetricSeriesSchema = z.object({
  key: progressMetricKeySchema,
  /** Fixed per key: kg for weight, cm for body measurements, none for 1-5 ratings. */
  unit: z.enum(["kg", "cm"]).nullable(),
  /** Oldest first, one point per local date. Values only: no trend, change or percentage. */
  points: z.array(progressMetricPointSchema),
});
export type ProgressMetricSeries = z.infer<typeof progressMetricSeriesSchema>;

export const progressMetricsResponseSchema = z.object({
  relationshipId: z.string().uuid(),
  range: progressMetricRangeSchema,
  /** Resolved local dates in the trainee's stored timezone; null for range=all. */
  from: localDateSchema.nullable(),
  to: localDateSchema.nullable(),
  timezone: z.string().min(1),
  /** In the order the keys were asked. */
  series: z.array(progressMetricSeriesSchema),
});
export type ProgressMetricsResponse = z.infer<typeof progressMetricsResponseSchema>;

/** Z5-4 scaffold placeholder, still referenced by `w6-scaffold.test.ts`. Kept: that test is outside Z6-7 files_owned. */
export type W6CheckinFormV2Contract = Record<string, never>;
