/**
 * Trainer log and edit of a client's meal (Z10-19, Z12-52). Pure rules; the API
 * enforces R1 to R5 and the client only avoids asking for what it would refuse.
 */
import {
  coachLogMealRequestSchema,
  mealComplianceSchema,
  type CoachLogMealRequest,
  type LoggedFoodItem,
  type MealAssignment,
  type MealCompliance,
  type MealComplianceOutcome,
  type MealDeviationKind,
} from "@fitbud/contracts";
import type { FitBudApiClient } from "@fitbud/api-client";

export const OUTCOMES: MealComplianceOutcome[] = ["confirmed", "modified", "skipped"];

/**
 * TR-08a choices a coach authors in person (Z12-52). Other kinds stay readable
 * on existing entries but are no longer offered as chips.
 */
export const AUTHORABLE_KINDS: MealDeviationKind[] = [
  "portion_adjustment",
  "restaurant",
  "logged_foods",
];

export const NOTE_MAX = 500;

/** Body the Something different editors post when the coach authors the log. */
export type CoachDeviateBody = {
  deviationKind: Extract<
    MealDeviationKind,
    "portion_adjustment" | "restaurant" | "logged_foods"
  >;
  notes: string | null;
  items: LoggedFoodItem[];
};

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
  return c?.deviationKind === "logged_foods" && c.loggedByRole === "trainee";
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
  // Modified opens TR-08a editors (Z12-52); the main Save is for confirmed/skipped
  // and for note-only edits of a trainee food list.
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

/** Coach-authored Something different → PUT body with items (Z12-52). */
export function buildCoachDeviateBody(
  deviate: CoachDeviateBody,
  existing: MealCompliance | null,
): CoachLogMealRequest {
  return coachLogMealRequestSchema.parse({
    outcome: "modified",
    deviationKind: deviate.deviationKind,
    notes: deviate.notes,
    items: deviate.items,
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
