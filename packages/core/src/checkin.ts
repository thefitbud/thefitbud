import {
  checkinFormDefinitionSchema,
  type CheckinCadence,
  type CheckinDraftAnswers,
  type CheckinFieldDefinition,
  type CheckinRecordStatus,
  type CheckinStatus,
  type MeasurementType,
} from "@fitbud/contracts";
import { addDaysToLocalDate } from "./workout.js";

export const MVP_CHECKIN_DEFINITION_VERSION = 1;

/** Seeded global weekly check-in. Migration 0019 inserts these ids. */
export const GLOBAL_CHECKIN_FORM_TEMPLATE_ID =
  "c1000001-0000-4000-8000-000000000001";
export const GLOBAL_CHECKIN_FORM_VERSION_ID =
  "c1000001-0000-4000-8000-000000000011";

/** Today's wellbeing, notes, body weight, and photo intent. */
export const GLOBAL_CHECKIN_FORM_FIELDS: CheckinFieldDefinition[] = [
  {
    id: "wellbeing",
    label: "Wellbeing",
    type: "short_text",
    required: true,
    maxLength: 1000,
  },
  {
    id: "notes",
    label: "Notes",
    type: "long_text",
    required: false,
    maxLength: 2000,
  },
  {
    id: "body_weight",
    label: "Body weight",
    type: "measurement",
    measurementType: "body_weight_kg",
    required: false,
  },
  {
    id: "photo",
    label: "Progress photo",
    type: "photo_intent",
    required: false,
  },
];

const REQUIRED_DRAFT_KEYS = ["wellbeing"] as const;

export function daysForCheckinCadence(cadence: CheckinCadence): number {
  switch (cadence) {
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 28;
    default: {
      const _exhaustive: never = cadence;
      return _exhaustive;
    }
  }
}

export function nextCheckinLocalDate(input: {
  fromLocalDate: string;
  cadence: CheckinCadence;
}): string {
  return addDaysToLocalDate(
    input.fromLocalDate,
    daysForCheckinCadence(input.cadence),
  );
}

export function canSaveCheckinDraft(input: {
  recordStatus: CheckinRecordStatus;
}): boolean {
  return input.recordStatus === "draft";
}

export function canSubmitCheckin(input: {
  recordStatus: CheckinRecordStatus;
  nowIso: string;
  windowStartsAt: string;
}): boolean {
  if (input.recordStatus !== "draft") return false;
  return input.nowIso >= input.windowStartsAt;
}

export function canRecordCheckinReview(input: {
  recordStatus: CheckinRecordStatus;
  hasReview: boolean;
}): boolean {
  return input.recordStatus === "submitted" && !input.hasReview;
}

/**
 * Derive check-in view status from window + submission + review.
 * Scheduled / Due / Overdue / Reviewed are never written by the client.
 */
export function deriveCheckinStatus(input: {
  nowIso: string;
  windowStartsAt: string;
  windowEndsAt: string;
  recordStatus: CheckinRecordStatus;
  hasReview: boolean;
}): CheckinStatus {
  if (input.hasReview) return "reviewed";
  if (input.recordStatus === "submitted") return "submitted";
  if (input.nowIso > input.windowEndsAt) return "overdue";
  if (input.nowIso >= input.windowStartsAt) return "due";
  return "scheduled";
}

export function missingRequiredCheckinAnswers(
  answers: CheckinDraftAnswers | null | undefined,
  fields?: readonly CheckinFieldDefinition[],
): string[] {
  if (!fields) {
    if (!answers) return [...REQUIRED_DRAFT_KEYS];
    const missing: string[] = [];
    for (const key of REQUIRED_DRAFT_KEYS) {
      const value = answers[key];
      if (typeof value !== "string" || value.trim().length === 0) {
        missing.push(key);
      }
    }
    return missing;
  }
  return fields
    .filter((field) => field.required)
    .filter((field) => isBlankCheckinFieldAnswer(field, answerForCheckinField(field, answers)))
    .map((field) => field.id);
}

export function canTrainerReadCheckinFormTemplate(
  template: { ownership: "global" | "trainer"; trainerUserId: string | null },
  trainerUserId: string,
): boolean {
  if (template.ownership === "global") {
    return template.trainerUserId == null;
  }
  return template.trainerUserId === trainerUserId;
}

export function latestCheckinFormVersion<
  T extends { templateId: string; version: number },
>(versions: readonly T[], templateId: string): T | null {
  const matches = versions.filter((item) => item.templateId === templateId);
  if (matches.length === 0) return null;
  return matches.reduce((best, item) =>
    item.version > best.version ? item : best,
  );
}

export function parseCheckinFormFields(
  fields: unknown,
):
  | { ok: true; fields: CheckinFieldDefinition[] }
  | { ok: false } {
  const parsed = checkinFormDefinitionSchema.safeParse({ fields });
  if (!parsed.success) return { ok: false };
  return { ok: true, fields: parsed.data.fields };
}

function answerForCheckinField(
  field: CheckinFieldDefinition,
  answers: CheckinDraftAnswers | null | undefined,
): unknown {
  const keyed = answers?.fieldAnswers?.[field.id];
  if (keyed !== undefined) return keyed;
  if (field.id === "wellbeing") return answers?.wellbeing;
  if (field.id === "notes") return answers?.notes ?? undefined;
  if (field.id === "photo") return answers?.photoIntent ?? undefined;
  if (
    field.type === "measurement" &&
    field.measurementType === "body_weight_kg"
  ) {
    return answers?.bodyWeightKg ?? undefined;
  }
  return undefined;
}

function isBlankCheckinFieldAnswer(
  field: CheckinFieldDefinition,
  value: unknown,
): boolean {
  if (value == null) return true;
  if (field.type === "short_text" || field.type === "long_text") {
    return typeof value !== "string" || value.trim().length === 0;
  }
  if (field.type === "measurement") {
    return typeof value !== "number" || !Number.isFinite(value) || value <= 0;
  }
  if (field.type === "photo_intent") {
    return typeof value !== "object";
  }
  return true;
}

/**
 * Measurement rows to insert from a submitted check-in.
 * The answer object is kept separately. bodyWeightKg still links body_weight_kg.
 */
export function linkedMeasurementsForCheckin(input: {
  fields: readonly CheckinFieldDefinition[];
  answers: CheckinDraftAnswers;
}): Array<{ type: MeasurementType; value: number }> {
  const found: Array<{ type: MeasurementType; value: number }> = [];
  const seen = new Set<string>();
  for (const field of input.fields) {
    if (field.type !== "measurement") continue;
    const raw = answerForCheckinField(field, input.answers);
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw <= 0) continue;
    if (seen.has(field.measurementType)) continue;
    seen.add(field.measurementType);
    found.push({ type: field.measurementType, value: raw });
  }
  if (
    typeof input.answers.bodyWeightKg === "number" &&
    input.answers.bodyWeightKg > 0 &&
    !seen.has("body_weight_kg")
  ) {
    found.push({ type: "body_weight_kg", value: input.answers.bodyWeightKg });
  }
  return found;
}
