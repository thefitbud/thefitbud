import type { AttentionGroupsResponse } from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];

const SEVERITY_RANK: Record<AttentionGroupItem["severity"], number> = {
  critical: 0,
  attention: 1,
};

export type ReviewSheetDashState = "ok" | "on" | "idle";

const OPEN_FOR_SHEET = new Set(["detected", "active", "acknowledged"]);

/**
 * Open items for the trainer mobile review sheet (frame 31), ordered the
 * same way as Needs you cards: severity, then age (oldest first for triage).
 */
export function reviewSheetItemsForRelationship(
  groups: ReadonlyArray<AttentionGroup>,
  relationshipId: string,
): AttentionGroupItem[] {
  const group = groups.find((entry) => entry.relationshipId === relationshipId);
  if (!group) return [];
  return [...group.items]
    .filter((item) => OPEN_FOR_SHEET.has(item.status))
    .sort((a, b) => {
      const sev =
        (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      if (sev !== 0) return sev;
      return b.ageMinutes - a.ageMinutes;
    });
}

/** `{current} of {total}` — frame 31 item nav label. */
export function reviewSheetItemLabel(index: number, total: number): string {
  if (total <= 0) return "0 of 0";
  const safe = clampReviewSheetIndex(index, total);
  return `${safe + 1} of ${total}`;
}

/**
 * Progress dashes under the sheet header.
 * Acknowledged items are ok (green) even when they are current — frame 31
 * resolved. Otherwise visited (before current) → ok; current → on (indigo);
 * upcoming → idle.
 */
export function reviewSheetDashStates(
  index: number,
  total: number,
  reviewed?: readonly boolean[],
): ReviewSheetDashState[] {
  if (total <= 0) return [];
  const safe = clampReviewSheetIndex(index, total);
  return Array.from({ length: total }, (_, i) => {
    if (reviewed?.[i]) return "ok";
    if (i < safe) return "ok";
    if (i === safe) return "on";
    return "idle";
  });
}

export function clampReviewSheetIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (index < 0) return 0;
  if (index >= total) return total - 1;
  return index;
}

export function canGoPrevReviewSheet(index: number): boolean {
  return index > 0;
}

export function canGoNextReviewSheet(index: number, total: number): boolean {
  return total > 0 && index < total - 1;
}

export function stepReviewSheetIndex(
  index: number,
  total: number,
  delta: -1 | 1,
): number {
  return clampReviewSheetIndex(index + delta, total);
}

/** Index of `exceptionId` in the sheet queue, or 0 when missing. */
export function reviewSheetIndexForItem(
  items: ReadonlyArray<{ id: string }>,
  exceptionId: string,
): number {
  const found = items.findIndex((item) => item.id === exceptionId);
  return found >= 0 ? found : 0;
}

/** Open-items fragment of the frame 31 subtitle. Prefer `reviewSheetClientSubtitle`. */
export function reviewSheetOpenItemsLine(count: number): string {
  return count === 1 ? "1 open item" : `${count} open items`;
}

/** Mark reviewed (acknowledged) and resolve both read as done on this sheet. */
export function reviewSheetItemReviewed(status: string): boolean {
  return status === "acknowledged" || status === "resolved";
}

export function reviewSheetAllReviewed(
  items: ReadonlyArray<{ status: string }>,
): boolean {
  return (
    items.length > 0 &&
    items.every((item) => reviewSheetItemReviewed(item.status))
  );
}

export type ReviewSheetFooterMode =
  | "empty"
  | "actions"
  | "resolved"
  | "all_resolved";

/**
 * Frame 31 body. All-acknowledged clients show the summary until the trainer
 * steps back onto an item (`browsingItem`) to undo.
 */
export function reviewSheetFooterMode(
  items: ReadonlyArray<{ status: string }>,
  index: number,
  browsingItem: boolean,
): ReviewSheetFooterMode {
  if (items.length === 0) return "empty";
  if (reviewSheetAllReviewed(items) && !browsingItem) return "all_resolved";
  const safe = clampReviewSheetIndex(index, items.length);
  const item = items[safe];
  if (item && reviewSheetItemReviewed(item.status)) return "resolved";
  return "actions";
}

/** Stepper label. All-resolved summary reads "Done" (frame 31). */
export function reviewSheetStepLabel(
  index: number,
  total: number,
  done: boolean,
): string {
  if (done && total > 0) return "Done";
  return reviewSheetItemLabel(index, total);
}

const OUTCOME_PHRASES: Record<string, string> = {
  talked: "Talked to client",
  plan_adjusted: "Plan adjusted",
  no_action: "No action needed",
};

/** Frame 31 outcome phrases. Unknown values are omitted, not relabelled. */
export function reviewSheetOutcomePhrase(outcome: string): string | null {
  const mapped = OUTCOME_PHRASES[outcome];
  if (mapped) return mapped;
  if (Object.values(OUTCOME_PHRASES).includes(outcome)) return outcome;
  return null;
}

export function reviewSheetItemOutcome(
  details: Record<string, unknown> | null | undefined,
): string | null {
  if (!details) return null;
  const raw = details.outcome ?? details.resolveOutcome;
  if (typeof raw !== "string") return null;
  return reviewSheetOutcomePhrase(raw);
}

export function reviewSheetItemDate(
  details: Record<string, unknown> | null | undefined,
  now?: Date,
): string | null {
  const localDate = details?.localDate;
  if (typeof localDate !== "string" || localDate.length === 0) return null;
  return formatCivilDate(localDate, { now });
}

/**
 * Green banner after Mark reviewed.
 * Frame: "Resolved by you · just now · Talked to client".
 */
export function reviewSheetResolvedBanner(
  outcome: string | null,
  justNow: boolean,
): string {
  const parts = ["Resolved by you"];
  if (justNow) parts.push("just now");
  if (outcome) parts.push(outcome);
  return parts.join(" · ");
}

/** Primary button under a resolved item that still has a following item. */
export function reviewSheetNextItemLabel(
  index: number,
  total: number,
): string | null {
  if (!canGoNextReviewSheet(index, total)) return null;
  return `Next item · ${index + 2} of ${total}`;
}

export function reviewSheetAllResolvedTitle(
  count: number,
  firstName: string,
): string {
  return `All ${count} resolved for ${firstName}`;
}

/** Locked frame sentence. The mock uses "his" for this client. */
export function reviewSheetAllResolvedLeaveLine(firstName: string): string {
  return `${firstName} leaves Needs you. You'll find this in his History.`;
}

export function reviewSheetResolvedRowLabel(outcome: string | null): string {
  return outcome ? `Resolved · ${outcome}` : "Resolved";
}

export function reviewSheetNextClientLabel(displayName: string): string {
  return `Next client: ${displayName}`;
}

export const REVIEW_SHEET_BACK_LABEL = "Back to Needs you";

/**
 * Next Needs you client. Prefers the card after the current one. When the
 * current client has already left Needs you, the first remaining card.
 */
export function nextReviewClient<T extends { relationshipId: string }>(
  cards: readonly T[],
  currentRelationshipId: string,
): T | null {
  const index = cards.findIndex(
    (card) => card.relationshipId === currentRelationshipId,
  );
  if (index >= 0) {
    return (
      cards[index + 1] ??
      cards.find((card) => card.relationshipId !== currentRelationshipId) ??
      null
    );
  }
  return cards[0] ?? null;
}

export function nextReviewClientName(
  cards: ReadonlyArray<{ relationshipId: string; traineeDisplayName: string }>,
  currentRelationshipId: string,
): string | null {
  return (
    nextReviewClient(cards, currentRelationshipId)?.traineeDisplayName ?? null
  );
}
