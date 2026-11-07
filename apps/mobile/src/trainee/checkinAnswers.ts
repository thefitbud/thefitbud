import { ApiClientError } from "@fitbud/api-client";
import type {
  CheckinDraftAnswers,
  CheckinFieldDefinition,
} from "@fitbud/contracts";
import { checkinAnswerEntries } from "@fitbud/core";

/**
 * What the trainee answered on the check-in screen (Z6-2c, D-W6-42).
 *
 * The screen keeps one string per question id in `values`. A question the
 * trainee did not answer has no entry (or a blank one) and is never sent: no
 * placeholder, no `null`, no value copied from somewhere else. The last stored
 * body weight is a hint the screen shows; it never enters `values` until the
 * trainee confirms or changes it.
 */

/** Ids of the v1 global form's questions that also have a top-level legacy key. */
const LEGACY_WELLBEING_ID = "wellbeing";
const LEGACY_NOTES_ID = "notes";
const LEGACY_WEIGHT_ID = "body_weight";

/** `multiple_choice` answers are kept in `values` as a JSON array of option ids. */
export function encodeChoiceList(ids: readonly string[]): string {
  return ids.length === 0 ? "" : JSON.stringify(ids);
}

export function decodeChoiceList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

type FieldAnswer = string | number | boolean | string[];

function fieldAnswerFor(
  field: CheckinFieldDefinition,
  raw: string,
): FieldAnswer | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  switch (field.type) {
    case "number":
    case "scale_1_5": {
      const n = Number(text);
      return Number.isFinite(n) ? n : undefined;
    }
    case "measurement": {
      const n = Number(text);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    case "yes_no":
      return text === "yes" ? true : text === "no" ? false : undefined;
    case "multiple_choice": {
      const ids = decodeChoiceList(raw);
      return ids.length > 0 ? ids : undefined;
    }
    case "short_text":
    case "long_text":
    case "single_choice":
    case "photo_intent":
      return text;
    default: {
      const _exhaustive: never = field;
      return _exhaustive;
    }
  }
}

/**
 * Answers for a draft save, a submit, a conflict retry and the queued submit:
 * the same function for all four, so none can add a value the trainee did not
 * enter. One `fieldAnswers` entry per answered question, keyed by question id.
 * The legacy top-level keys are filled only for the v1 questions they belong
 * to and only when answered.
 */
export function answersToPayload(
  fields: readonly CheckinFieldDefinition[],
  values: Readonly<Record<string, string>>,
): CheckinDraftAnswers {
  const fieldAnswers: Record<string, FieldAnswer> = {};
  const payload: CheckinDraftAnswers = {};
  const seen = new Set<string>();

  for (const field of fields) {
    if (seen.has(field.id)) continue;
    seen.add(field.id);
    const answer = fieldAnswerFor(field, values[field.id] ?? "");
    if (answer === undefined) continue;
    fieldAnswers[field.id] = answer;

    if (field.id === LEGACY_WELLBEING_ID && typeof answer === "string") {
      payload.wellbeing = answer;
    }
    if (field.id === LEGACY_NOTES_ID && typeof answer === "string") {
      payload.notes = answer;
    }
    if (
      field.id === LEGACY_WEIGHT_ID &&
      field.type === "measurement" &&
      field.measurementType === "body_weight_kg" &&
      typeof answer === "number" &&
      answer <= 500
    ) {
      payload.bodyWeightKg = answer;
    }
  }

  if (Object.keys(fieldAnswers).length > 0) payload.fieldAnswers = fieldAnswers;
  return payload;
}

/** Body of `checkin.save_draft` (and its conflict retry). */
export function draftBody(
  expectedVersion: number,
  fields: readonly CheckinFieldDefinition[],
  values: Readonly<Record<string, string>>,
) {
  return { expectedVersion, answers: answersToPayload(fields, values) };
}

/** Body of `checkin.submit` (first attempt, conflict retry and the queued one). */
export function submitBody(
  expectedVersion: number,
  fields: readonly CheckinFieldDefinition[],
  values: Readonly<Record<string, string>>,
) {
  return { expectedVersion, answers: answersToPayload(fields, values) };
}

/** Screen values from answers already stored on the check-in (a saved draft). */
export function valuesFromStoredAnswers(
  fields: readonly CheckinFieldDefinition[],
  answers: CheckinDraftAnswers | null | undefined,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const entry of checkinAnswerEntries(fields, answers)) {
    const { value } = entry;
    if (typeof value === "string") {
      values[entry.fieldId] = entry.type === "photo_intent" ? "noted" : value;
    } else if (typeof value === "number") {
      values[entry.fieldId] = String(value);
    } else if (typeof value === "boolean") {
      values[entry.fieldId] = value ? "yes" : "no";
    } else if (Array.isArray(value)) {
      values[entry.fieldId] = encodeChoiceList(value);
    } else {
      // A photo-intent object.
      values[entry.fieldId] = "noted";
    }
  }
  return values;
}

/** Newest stored body weight, shown as a hint only. */
export function lastWeightHint(
  measurements: ReadonlyArray<{
    type: string;
    value: number;
    observedAt: string;
  }>,
): { value: number; observedAt: string } | null {
  const latest = measurements
    .filter((item) => item.type === "body_weight_kg")
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  return latest ? { value: latest.value, observedAt: latest.observedAt } : null;
}

/** Whether the screen has a question the trainee can answer. */
export function hasBodyWeightField(
  fields: readonly CheckinFieldDefinition[],
): boolean {
  return fields.some(
    (field) =>
      field.type === "measurement" && field.measurementType === "body_weight_kg",
  );
}

export type CheckinFormLoadFailure = { code: string; message: string };

/**
 * Why the pinned form did not load (AGENTS.md "No misleading catch"). Only an
 * `ApiClientError` message is shown as the API wrote it; everything else shows
 * a short code and the caller passes the error to `reportError`.
 */
export function checkinFormLoadFailure(err: unknown): CheckinFormLoadFailure {
  if (err instanceof ApiClientError) {
    return { code: err.code, message: err.message };
  }
  if (err instanceof Error && err.name === "ZodError") {
    return {
      code: "CHK-PARSE",
      message: "Couldn't open the check-in (CHK-PARSE). Try again.",
    };
  }
  if (isNetworkFailure(err)) {
    return {
      code: "CHK-NET",
      message: "Couldn't reach FitBud (CHK-NET). Check your connection and try again.",
    };
  }
  return {
    code: "CHK-UNK",
    message: "Couldn't open the check-in (CHK-UNK). Try again.",
  };
}

/** Same test as `authErrors.ts`: only a real request failure says "connection". */
function isNetworkFailure(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return (
    err.name === "AbortError" ||
    err.name === "TimeoutError" ||
    (err instanceof TypeError &&
      /network request failed|failed to fetch|network error|load failed/i.test(
        err.message,
      ))
  );
}
