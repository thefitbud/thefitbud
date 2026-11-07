import {
  CHECKIN_STANDARD_KEYS,
  type CheckinDraftAnswers,
  type CheckinFieldDefinition,
  type CheckinStandardKey,
} from "@fitbud/contracts";

export { CHECKIN_STANDARD_KEYS };
export type { CheckinStandardKey };

type KeySpec =
  | { kind: "measurement"; measurementType: string; min: number; max: number }
  | { kind: "photo"; slot: "front" | "side" | "back" }
  | { kind: "rating" }
  | { kind: "notes" };

const WEIGHT = { min: 20, max: 300 };
const CM = { min: 10, max: 250 };

/** Field type and answer rule for every standard key (D-W6-17). */
const KEY_SPECS: Record<CheckinStandardKey, KeySpec> = {
  weight: { kind: "measurement", measurementType: "body_weight_kg", ...WEIGHT },
  waist: { kind: "measurement", measurementType: "waist_cm", ...CM },
  hips: { kind: "measurement", measurementType: "hip_cm", ...CM },
  chest: { kind: "measurement", measurementType: "chest_cm", ...CM },
  arm: { kind: "measurement", measurementType: "other", ...CM },
  thigh: { kind: "measurement", measurementType: "other", ...CM },
  photo_front: { kind: "photo", slot: "front" },
  photo_side: { kind: "photo", slot: "side" },
  photo_back: { kind: "photo", slot: "back" },
  energy: { kind: "rating" },
  sleep_quality: { kind: "rating" },
  stress: { kind: "rating" },
  hunger: { kind: "rating" },
  notes: { kind: "notes" },
};

export type CheckinAnswerCheck = { ok: true } | { ok: false };

/**
 * Validates one answer for a standard key. Weight 20-300 kg, measurements
 * 10-250 cm, ratings integers 1-5, photos a non-empty file id, notes text.
 */
export function validateCheckinAnswer(
  key: CheckinStandardKey,
  value: unknown,
): CheckinAnswerCheck {
  const spec = KEY_SPECS[key];
  if (!spec) return { ok: false };
  switch (spec.kind) {
    case "measurement":
      return typeof value === "number" &&
        Number.isFinite(value) &&
        value >= spec.min &&
        value <= spec.max
        ? { ok: true }
        : { ok: false };
    case "rating":
      return typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 5
        ? { ok: true }
        : { ok: false };
    case "photo":
      return typeof value === "string" &&
        value.length > 0 &&
        value.length <= 200
        ? { ok: true }
        : { ok: false };
    case "notes":
      return typeof value === "string" && value.length <= 10000
        ? { ok: true }
        : { ok: false };
  }
}

export type CheckinFormKeyProblem = {
  code: "DUPLICATE_CHECKIN_KEY" | "CHECKIN_KEY_MISMATCH";
  key: CheckinStandardKey;
  /** Index of the offending field in the submitted list. */
  index: number;
};

function fieldMatchesKey(field: CheckinFieldDefinition, key: CheckinStandardKey) {
  const spec = KEY_SPECS[key];
  if (field.id !== key) return false;
  switch (spec.kind) {
    case "measurement":
      return (
        field.type === "measurement" &&
        field.measurementType === spec.measurementType &&
        (spec.measurementType !== "other" || field.unit === "cm")
      );
    case "photo":
      return field.type === "photo_intent" && field.photoSlot === spec.slot;
    case "rating":
      return field.type === "scale_1_5";
    case "notes":
      return field.type === "long_text";
  }
}

/**
 * Checks the standard keys of a form definition: each key at most once, and a
 * keyed field must have the id and type its key defines. Questions with no key
 * are custom and are not checked. Returns the first problem, or null.
 */
export function findCheckinFormKeyProblem(
  fields: readonly CheckinFieldDefinition[],
): CheckinFormKeyProblem | null {
  const seen = new Set<CheckinStandardKey>();
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    const key = field.key;
    if (!key) continue;
    if (seen.has(key)) return { code: "DUPLICATE_CHECKIN_KEY", key, index };
    seen.add(key);
    if (!fieldMatchesKey(field, key)) {
      return { code: "CHECKIN_KEY_MISMATCH", key, index };
    }
  }
  return null;
}

/**
 * Keys whose submitted answer is invalid. Only keyed fields are checked; blank
 * (absent) answers are the required-answer rule's business, not this one's.
 */
export function invalidCheckinKeyedAnswers(
  fields: readonly CheckinFieldDefinition[],
  answers: CheckinDraftAnswers | null | undefined,
): CheckinStandardKey[] {
  const invalid: CheckinStandardKey[] = [];
  for (const field of fields) {
    if (!field.key) continue;
    const value = answers?.fieldAnswers?.[field.id];
    if (value === undefined || value === null) continue;
    if (!validateCheckinAnswer(field.key, value).ok) invalid.push(field.key);
  }
  return invalid;
}
