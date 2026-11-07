/**
 * Progress metrics by question key (Z6-7). Reads a relationship's numeric series
 * from submitted check-in answers (by standard key, through the form version the
 * check-in was pinned to) and from stored measurements, merged by local date.
 * The check-in wins a day both have. Values only: no trend, change or percentage.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  PROGRESS_METRIC_KEYS,
  checkinDraftAnswersSchema,
  type ProgressMetricKey,
  type ProgressMetricPoint,
  type ProgressMetricRange,
  type ProgressMetricSeries,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  formatLocalDate,
  parseCheckinFormFields,
  validateCheckinAnswer,
} from "@fitbud/core";
import type { createDb } from "../db/client";
import { checkinFormVersions, checkins, measurements } from "../db/schema";

type Db = ReturnType<typeof createDb>;

/** Stored measurement types that are the same quantity as a metric key. `other` has no key. */
const MEASUREMENT_TYPE_KEY: Record<string, ProgressMetricKey | undefined> = {
  body_weight_kg: "weight",
  waist_cm: "waist",
  hip_cm: "hips",
  chest_cm: "chest",
};

const KEY_UNIT: Record<ProgressMetricKey, "kg" | "cm" | null> = {
  weight: "kg",
  waist: "cm",
  hips: "cm",
  chest: "cm",
  arm: "cm",
  thigh: "cm",
  energy: null,
  sleep_quality: null,
  stress: null,
  hunger: null,
};

const RANGE_DAYS: Record<"4w" | "12w", number> = { "4w": 28, "12w": 84 };

export function isProgressMetricKey(value: string): value is ProgressMetricKey {
  return (PROGRESS_METRIC_KEYS as readonly string[]).includes(value);
}

export type MetricsWindow = { from: string | null; to: string | null };

/** Resolved local-date window, inclusive. "all" has no start and ends today; nothing future is returned. */
export function resolveMetricsWindow(input: {
  range: ProgressMetricRange;
  from?: string;
  to?: string;
  today: string;
}): MetricsWindow {
  if (input.range === "all") return { from: null, to: input.today };
  if (input.range === "custom") {
    return { from: input.from ?? null, to: input.to ?? null };
  }
  return {
    from: addDaysToLocalDate(input.today, -(RANGE_DAYS[input.range] - 1)),
    to: input.today,
  };
}

function inWindow(localDate: string, window: MetricsWindow): boolean {
  if (window.from && localDate < window.from) return false;
  if (window.to && localDate > window.to) return false;
  return true;
}

export async function loadProgressMetricSeries(
  db: Db,
  input: {
    relationshipId: string;
    keys: readonly ProgressMetricKey[];
    window: MetricsWindow;
    timezone: string;
  },
): Promise<ProgressMetricSeries[]> {
  const { relationshipId, keys, window, timezone } = input;
  const wanted = new Set<ProgressMetricKey>(keys);
  const measurementTypes = Object.entries(MEASUREMENT_TYPE_KEY)
    .filter(([, key]) => key && wanted.has(key))
    .map(([type]) => type);

  // All submitted check-ins, cut by window in code: a linked measurement is dated by its
  // check-in, which may sit outside the window the measurement's own timestamp falls in.
  const checkinConditions = [
    eq(checkins.coachingRelationshipId, relationshipId),
    eq(checkins.recordStatus, "submitted"),
  ];

  const checkinRows = await db
    .select({
      id: checkins.id,
      localDate: checkins.localDate,
      formVersionId: checkins.checkinFormVersionId,
      answersJson: checkins.answersJson,
    })
    .from(checkins)
    .where(and(...checkinConditions))
    .orderBy(asc(checkins.localDate));

  const versionIds = [...new Set(checkinRows.map((row) => row.formVersionId))];
  const versionRows =
    versionIds.length === 0
      ? []
      : await db
          .select({ id: checkinFormVersions.id, schemaJson: checkinFormVersions.schemaJson })
          .from(checkinFormVersions)
          .where(inArray(checkinFormVersions.id, versionIds));
  // field id -> key, only for fields the form version itself marks with a standard key.
  const keyedFields = new Map<string, Map<string, ProgressMetricKey>>();
  for (const version of versionRows) {
    let rawFields: unknown;
    try {
      rawFields = (JSON.parse(version.schemaJson) as { fields?: unknown }).fields;
    } catch {
      continue;
    }
    const parsed = parseCheckinFormFields(rawFields);
    if (!parsed.ok) continue;
    const byField = new Map<string, ProgressMetricKey>();
    for (const field of parsed.fields) {
      if (field.key && isProgressMetricKey(field.key) && wanted.has(field.key)) {
        byField.set(field.id, field.key);
      }
    }
    keyedFields.set(version.id, byField);
  }

  const measurementRows =
    measurementTypes.length === 0
      ? []
      : await db
          .select({
            type: measurements.type,
            value: measurements.value,
            observedAt: measurements.observedAt,
            checkinId: measurements.checkinId,
          })
          .from(measurements)
          .where(
            and(
              eq(measurements.coachingRelationshipId, relationshipId),
              inArray(measurements.type, measurementTypes as never),
            ),
          )
          .orderBy(asc(measurements.observedAt));

  const byKey = new Map<ProgressMetricKey, Map<string, ProgressMetricPoint>>();
  for (const key of keys) byKey.set(key, new Map());

  // Check-in answers by the check-in's own local date. The measurement linked at submit
  // time is stamped with the submit time (possibly days later), so it is dated by its
  // check-in below and the answer then wins that same date: one point, not two.
  const checkinLocalDate = new Map(checkinRows.map((row) => [row.id, row.localDate]));
  const answerPoints: Array<{ key: ProgressMetricKey; point: ProgressMetricPoint }> = [];
  for (const row of checkinRows) {
    if (!row.answersJson) continue;
    const fieldKeys = keyedFields.get(row.formVersionId);
    if (!fieldKeys || fieldKeys.size === 0) continue;
    let parsedAnswers;
    try {
      parsedAnswers = checkinDraftAnswersSchema.safeParse(JSON.parse(row.answersJson));
    } catch {
      continue;
    }
    if (!parsedAnswers.success) continue;
    const answers = parsedAnswers.data;
    for (const [fieldId, key] of fieldKeys) {
      let value: unknown = answers.fieldAnswers?.[fieldId];
      if (value === undefined && key === "weight") value = answers.bodyWeightKg ?? undefined;
      if (value === undefined || !validateCheckinAnswer(key, value).ok) continue;
      answerPoints.push({
        key,
        point: { localDate: row.localDate, value: value as number, checkinId: row.id },
      });
    }
  }

  // Stored measurements. One linked to a submitted check-in is dated by that check-in's
  // local date, never by its submit time; the latest reading of a date wins among them.
  for (const row of measurementRows) {
    const key = MEASUREMENT_TYPE_KEY[row.type];
    if (!key) continue;
    const linkedDate = row.checkinId ? checkinLocalDate.get(row.checkinId) : undefined;
    const localDate = linkedDate ?? formatLocalDate(new Date(row.observedAt), timezone);
    if (!inWindow(localDate, window)) continue;
    byKey.get(key)?.set(localDate, {
      localDate,
      value: row.value,
      checkinId: row.checkinId ?? null,
    });
  }

  // A check-in answer wins the local date it shares with a measurement.
  for (const { key, point } of answerPoints) {
    if (!inWindow(point.localDate, window)) continue;
    byKey.get(key)?.set(point.localDate, point);
  }

  return keys.map((key) => ({
    key,
    unit: KEY_UNIT[key],
    points: [...(byKey.get(key)?.values() ?? [])].sort((a, b) =>
      a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0,
    ),
  }));
}
