import type { HistoryItem } from "@fitbud/contracts";

/** Descending by occurredAt, then id (stable tie-break for opaque cursors). */
export function compareHistoryItemsNewestFirst(
  a: Pick<HistoryItem, "id" | "occurredAt">,
  b: Pick<HistoryItem, "id" | "occurredAt">,
): number {
  if (a.occurredAt !== b.occurredAt) {
    return a.occurredAt < b.occurredAt ? 1 : -1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

/**
 * Keep items strictly older than an opaque cursor position (newest-first pages).
 */
export function isHistoryItemAfterCursor(
  item: Pick<HistoryItem, "id" | "occurredAt">,
  cursor: { k: string; id: string },
): boolean {
  if (item.occurredAt < cursor.k) return true;
  if (item.occurredAt > cursor.k) return false;
  return item.id < cursor.id;
}
