import type {
  CheckinDraftAnswers,
  CheckinFieldDefinition,
  CheckinReviewContext,
} from "@fitbud/contracts";
import { checkinAnswerEntries } from "@fitbud/core";

/**
 * What trainer review shows for a check-in (Z6-2c, D-W6-42): the pinned form's
 * answered questions in form order, from core's shared answer list, so phone
 * and web show the same answers. Unanswered questions are skipped. Nothing is
 * read from a fixed question list and no `wellbeing` fallback is shown for a
 * form that has no such question.
 */

export type ReviewRatingTile = {
  fieldId: string;
  label: string;
  value: number;
};

export type ReviewMeasureTile = {
  fieldId: string;
  label: string;
  value: number;
  unit: string;
  /** Change from the previous stored measurement; only weight and waist. */
  since: { delta: number; previousObservedAt: string } | null;
};

export type ReviewTextRow = {
  fieldId: string;
  label: string;
  text: string;
};

export type CheckinReviewRows = {
  ratings: ReviewRatingTile[];
  measures: ReviewMeasureTile[];
  texts: ReviewTextRow[];
};

type StoredMeasurement = CheckinReviewContext["measurements"][number];

/** Stored measurement type that carries a "since" line for a question. */
function sinceType(field: CheckinFieldDefinition | undefined): string | null {
  if (field?.type !== "measurement") return null;
  if (field.measurementType === "body_weight_kg") return "body_weight_kg";
  if (field.measurementType === "waist_cm") return "waist_cm";
  return null;
}

function sinceFor(
  type: string | null,
  answered: number,
  stored: readonly StoredMeasurement[],
): ReviewMeasureTile["since"] {
  if (!type) return null;
  const rows = stored.filter((item) => item.type === type);
  const [current, previous] = rows;
  if (!current || !previous) return null;
  const currentValue = Number(current.value);
  const previousValue = Number(previous.value);
  // Only when the newest stored row is this check-in's own answer.
  if (!Number.isFinite(currentValue) || !Number.isFinite(previousValue)) return null;
  if (currentValue !== answered) return null;
  return {
    delta: Number((currentValue - previousValue).toFixed(1)),
    previousObservedAt: previous.observedAt,
  };
}

export function checkinReviewRows(input: {
  fields: readonly CheckinFieldDefinition[];
  answers: CheckinDraftAnswers | null | undefined;
  measurements: readonly StoredMeasurement[];
}): CheckinReviewRows {
  const rows: CheckinReviewRows = { ratings: [], measures: [], texts: [] };
  for (const entry of checkinAnswerEntries(input.fields, input.answers)) {
    const field = input.fields.find((item) => item.id === entry.fieldId);
    const { value } = entry;
    if (entry.type === "scale_1_5") {
      if (typeof value === "number") {
        rows.ratings.push({ fieldId: entry.fieldId, label: entry.label, value });
      }
    } else if (entry.type === "measurement") {
      if (typeof value === "number") {
        rows.measures.push({
          fieldId: entry.fieldId,
          label: entry.label,
          value,
          unit: entry.unit ?? "",
          since: sinceFor(sinceType(field), value, input.measurements),
        });
      }
    } else if (entry.type === "photo_intent") {
      // Photos are shown from the stored photos, not as an answer row.
    } else {
      rows.texts.push({
        fieldId: entry.fieldId,
        label: entry.label,
        text: textFor(entry, field),
      });
    }
  }
  return rows;
}

function optionLabel(
  field: CheckinFieldDefinition | undefined,
  id: string,
): string {
  if (
    field &&
    (field.type === "single_choice" || field.type === "multiple_choice")
  ) {
    return field.options.find((option) => option.id === id)?.label ?? id;
  }
  return id;
}

function textFor(
  entry: ReturnType<typeof checkinAnswerEntries>[number],
  field: CheckinFieldDefinition | undefined,
): string {
  const { value } = entry;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((id) => optionLabel(field, id)).join(", ");
  if (typeof value === "number") {
    return entry.unit ? `${value} ${entry.unit}` : String(value);
  }
  if (typeof value === "string") {
    return entry.type === "single_choice" ? optionLabel(field, value) : value;
  }
  return "";
}
