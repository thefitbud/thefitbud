/**
 * Trainer log and edit of a client's meal (Z10-19). Pure rules; the API
 * enforces R1 to R5 and the client only avoids asking for what it would refuse.
 */
import {
  coachLogMealRequestSchema,
  mealComplianceSchema,
  type CoachLogMealRequest,
  type MealAssignment,
  type MealCompliance,
  type MealComplianceOutcome,
  type MealDeviationKind,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "@fitbud/api-client";

export const OUTCOMES: MealComplianceOutcome[] = ["confirmed", "modified", "skipped"];

/** The kinds a trainer can author. `logged_foods` only keeps the client's own list. */
export const AUTHORABLE_KINDS: MealDeviationKind[] = [
  "portion_adjustment",
  "substitute",
  "restaurant",
  "repeat_recent",
  "manual",
  "other",
];

export const NOTE_MAX = 500;

/** Scheduled, current meals on `date`, in plan order. */
export function mealsOn(items: MealAssignment[], date: string): MealAssignment[] {
  return items
    .filter((a) => a.localDate === date && a.scheduleStatus === "scheduled" && a.supersededAt == null)
    .sort((a, b) => a.prescription.order - b.prescription.order);
}

export type MealDraft = {
  outcome: MealComplianceOutcome | null;
  deviationKind: MealDeviationKind | null;
  notes: string;
};

export function startDraft(c: MealCompliance | null): MealDraft {
  return {
    outcome: c?.outcome ?? null,
    deviationKind: c?.deviationKind ?? null,
    notes: c?.notes ?? "",
  };
}

/** The client's own food list is kept as is: only the note is editable (D-W6-40). */
export function isFoodListEntry(c: MealCompliance | null): boolean {
  return c?.deviationKind === "logged_foods";
}

export function setOutcome(d: MealDraft, outcome: MealComplianceOutcome): MealDraft {
  return { ...d, outcome, deviationKind: outcome === "modified" ? d.deviationKind : null };
}

export function isChanged(d: MealDraft, c: MealCompliance | null): boolean {
  if (!c) return true;
  const s = startDraft(c);
  return s.outcome !== d.outcome || s.deviationKind !== d.deviationKind || s.notes.trim() !== d.notes.trim();
}

export function isComplete(d: MealDraft): boolean {
  if (d.outcome == null) return false;
  if (d.outcome === "modified" && !d.deviationKind) return false;
  return d.notes.trim().length <= NOTE_MAX;
}

/** `recordVersion` only when an entry exists (a first log must leave it out). */
export function buildMealBody(d: MealDraft, existing: MealCompliance | null): CoachLogMealRequest {
  const notes = d.notes.trim();
  return coachLogMealRequestSchema.parse({
    outcome: d.outcome,
    ...(d.outcome === "modified" ? { deviationKind: d.deviationKind } : {}),
    notes: notes === "" ? null : notes,
    ...(existing ? { recordVersion: existing.recordVersion } : {}),
  });
}

/** `PUT /meals/compliance/:assignmentId/:date` (Z6-20). */
export async function putCoachMeal(
  api: FitBudApiClient,
  assignmentId: string,
  date: string,
  body: CoachLogMealRequest,
  idempotencyKey: string,
): Promise<MealCompliance> {
  return api.request(
    "PUT",
    `/meals/compliance/${encodeURIComponent(assignmentId)}/${encodeURIComponent(date)}`,
    mealComplianceSchema,
    { auth: true, body, idempotencyKey },
  );
}

/** "Logged by you" / "Edited by you" (R1). */
export function authorshipLabel(c: Pick<MealCompliance, "loggedByRole" | "lastEditedByRole"> | null): string | null {
  if (!c) return null;
  if (c.lastEditedByRole === "coach") return "Edited by you";
  if (c.loggedByRole === "coach") return "Logged by you";
  return null;
}
