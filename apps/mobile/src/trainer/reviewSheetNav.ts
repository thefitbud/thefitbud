import type { AttentionGroupsResponse } from "@fitbud/contracts";

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
 * Visited (before current) → ok (green); current → on (indigo); upcoming → idle.
 */
export function reviewSheetDashStates(
  index: number,
  total: number,
): ReviewSheetDashState[] {
  if (total <= 0) return [];
  const safe = clampReviewSheetIndex(index, total);
  return Array.from({ length: total }, (_, i) => {
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
