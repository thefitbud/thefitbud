import type {
  CoachEditMeasurementRequest,
  CoachLogMealRequest,
  MealCompliance,
  MealComplianceOutcome,
  MealDeviationKind,
  Measurement,
  MeasurementType,
} from "@fitbud/contracts";
import { formatCivilDate, formatLocalDate } from "@fitbud/core";

export { LOG_WINDOW_DAYS, isWithinWindow } from "../log-workout/logWorkoutModel";

/** Outcomes a trainer can record, in the order the form shows them. */
export const MEAL_OUTCOMES: readonly MealComplianceOutcome[] = [
  "confirmed",
  "modified",
  "skipped",
];

/**
 * Deviation kinds a trainer can pick. `logged_foods` is the client's own food
 * list: a trainer keeps it on an entry that has one but cannot author one.
 */
export const MEAL_DEVIATION_KINDS: readonly MealDeviationKind[] = [
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
  "manual",
  "other",
];

export const NOTE_MAX = 500;

/** Measurement types the form offers, with the unit each one is stored in. */
export const MEASUREMENT_TYPES: readonly { type: MeasurementType; unit: string }[] = [
  { type: "body_weight_kg", unit: "kg" },
  { type: "waist_cm", unit: "cm" },
  { type: "hip_cm", unit: "cm" },
  { type: "chest_cm", unit: "cm" },
];

const VALUE_TEXT = /^\d{1,4}(?:\.\d{1,2})?$/;

/** The measurement number, or null when the text is not a positive value up to 1000. */
export function parseMeasurementValue(text: string): number | null {
  const trimmed = text.trim();
  if (!VALUE_TEXT.test(trimmed)) return null;
  const value = Number(trimmed);
  return value > 0 && value <= 1000 ? value : null;
}

export function measurementValueProblem(text: string): string | null {
  if (text.trim() === "") return "Enter the measurement.";
  if (parseMeasurementValue(text) === null) {
    return "Enter a number above 0, up to 1000, with at most 2 decimals.";
  }
  return null;
}

export type MealDraft = {
  outcome: MealComplianceOutcome;
  deviationKind: MealDeviationKind | null;
  notes: string;
};

export function mealDraftFrom(compliance: MealCompliance | null): MealDraft {
  if (!compliance) return { outcome: "confirmed", deviationKind: null, notes: "" };
  return {
    outcome: compliance.outcome,
    deviationKind: compliance.outcome === "modified" ? compliance.deviationKind : null,
    notes: compliance.notes ?? "",
  };
}

/** An entry that holds the client's own food list: only its note can change. */
export function hasClientFoodList(compliance: MealCompliance | null): boolean {
  return compliance?.deviationKind === "logged_foods";
}

export function mealDraftProblem(draft: MealDraft): string | null {
  if (draft.outcome === "modified" && !draft.deviationKind) {
    return "Pick what changed in this meal.";
  }
  return null;
}

export function mealDraftsEqual(a: MealDraft, b: MealDraft): boolean {
  return (
    a.outcome === b.outcome &&
    a.deviationKind === b.deviationKind &&
    a.notes.trim() === b.notes.trim()
  );
}

/** The exact body of one meal save; `recordVersion` only when an entry exists. */
export function buildMealRequest(
  draft: MealDraft,
  recordVersion: number | null,
): CoachLogMealRequest {
  const notes = draft.notes.trim();
  const body: CoachLogMealRequest = {
    outcome: draft.outcome,
    notes: notes === "" ? null : notes,
  };
  if (draft.outcome === "modified") body.deviationKind = draft.deviationKind;
  if (recordVersion !== null) body.recordVersion = recordVersion;
  return body;
}

/** "Logged by coach" / "Edited by coach · Mon 2 Nov"; null for the client's own entry. */
export function coachEntryTag(
  entry: Pick<MealCompliance | Measurement, "loggedByRole" | "lastEditedByRole" | "updatedAt">,
  clientTimezone: string,
): string | null {
  if (entry.loggedByRole === "coach") return "Logged by coach";
  if (entry.lastEditedByRole === "coach") {
    const day = formatLocalDate(new Date(entry.updatedAt), clientTimezone);
    return `Edited by coach · ${formatCivilDate(day)}`;
  }
  return null;
}

export function unitFor(type: MeasurementType): string {
  return MEASUREMENT_TYPES.find((row) => row.type === type)?.unit ?? "";
}

/** The exact body of one measurement edit: only what changed, plus the version read. */
export function buildMeasurementEdit(input: {
  recordVersion: number;
  value: number;
  initialValue: number;
  observedAt: string | null;
}): CoachEditMeasurementRequest {
  const body: CoachEditMeasurementRequest = { recordVersion: input.recordVersion };
  if (input.value !== input.initialValue) body.value = input.value;
  if (input.observedAt !== null) body.observedAt = input.observedAt;
  return body;
}
