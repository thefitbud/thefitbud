import {
  isBulkResolvableExceptionType,
  type BulkResolveItemResult,
  type BulkResolveSkipReason,
  type Exception,
} from "@fitbud/contracts";
import { labelFor } from "@fitbud/core";
import { itemShortLabel } from "./AlsoOpenList";

/** D11: the confirm dialog opens only when more than this many are selected. */
export const BULK_CONFIRM_ABOVE = 3;

/** Undo stays on screen this long after the bulk resolve answers (D11). */
export const BULK_UNDO_MS = 5000;

type Row = Pick<Exception, "id" | "type" | "details" | "detectedAt">;

/** D11 / D-W6-15: only missed workout, missed meal and missed log items. */
export function isBulkCompatible(item: Pick<Exception, "type">): boolean {
  return isBulkResolvableExceptionType(item.type);
}

export function compatibleIds(items: readonly Row[]): string[] {
  return items.filter(isBulkCompatible).map((item) => item.id);
}

export function itemsLabel(count: number): string {
  return count === 1 ? "1 item" : `${count} items`;
}

/**
 * Top-right hint when some items cannot join a bulk action, e.g.
 * "Meal changes are resolved on their own". Null when every item can.
 */
export function individualOnlyHint(items: readonly Row[]): string | null {
  const others = items.filter((item) => !isBulkCompatible(item));
  if (others.length === 0) return null;
  const types = new Set(others.map((item) => item.type));
  if (types.size > 1) return "Some items are resolved on their own";
  // Count-safe for every label: "Meal change · resolved on its own" (1) or
  // "Meal change · 2 resolved on their own".
  const label = labelFor("exception_type", others[0]!.type);
  return others.length === 1
    ? `${label} · resolved on its own`
    : `${label} · ${others.length} resolved on their own`;
}

function detailString(item: Row, key: string): string | null {
  const value = item.details?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function openDays(detectedAt: string, now: number): number {
  const detected = Date.parse(detectedAt);
  if (Number.isNaN(detected)) return 0;
  return Math.max(0, Math.floor((now - detected) / 86_400_000));
}

/**
 * Second line of a bulk row (DS2): "Lower body A · open 7 d" when the item
 * names its workout or meal, otherwise "Open 2 d"; items that cannot join a
 * bulk action add "resolve on its own".
 */
export function bulkRowSubline(item: Row, now: number = Date.now()): string {
  const days = openDays(item.detectedAt, now);
  const age = days === 0 ? "open today" : `open ${days} d`;
  const name =
    detailString(item, "workoutDayName") ?? detailString(item, "mealName");
  const base = name
    ? `${name} · ${age}`
    : age.charAt(0).toUpperCase() + age.slice(1);
  return isBulkCompatible(item) ? base : `${base} · resolve on its own`;
}

const SKIP_CHIP: Record<BulkResolveSkipReason, string> = {
  already_resolved: "Already resolved",
  not_found: "No longer exists",
  incompatible_type: "Resolve on its own",
};

export function skipChipLabel(reason: BulkResolveSkipReason): string {
  return SKIP_CHIP[reason];
}

const SKIP_PHRASE: Record<BulkResolveSkipReason, (n: number) => string> = {
  already_resolved: (n) => `${n} already resolved elsewhere`,
  not_found: (n) => `${n} no longer ${n === 1 ? "exists" : "exist"}`,
  incompatible_type: (n) =>
    `${n} must be resolved on ${n === 1 ? "its" : "their"} own`,
};

/**
 * Per-item outcome line (D11), e.g. "4 resolved, 1 already resolved
 * elsewhere. Dinner not logged · Mon 2 Nov was left as it was." Null when
 * every selected item was resolved (the Undo toast says so).
 */
export function bulkResultSummary(
  results: readonly BulkResolveItemResult[],
  items: readonly Row[],
): string | null {
  const skipped = results.filter(
    (r): r is Extract<BulkResolveItemResult, { status: "skipped" }> =>
      r.status === "skipped",
  );
  if (skipped.length === 0) return null;
  const resolved = results.length - skipped.length;
  const counts = new Map<BulkResolveSkipReason, number>();
  for (const r of skipped)
    counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  const parts = [
    resolved === 0 ? "Nothing was resolved" : `${resolved} resolved`,
  ];
  for (const reason of [
    "already_resolved",
    "not_found",
    "incompatible_type",
  ] as const) {
    const n = counts.get(reason);
    if (n) parts.push(SKIP_PHRASE[reason](n));
  }
  const head = `${parts.join(", ")}.`;
  if (skipped.length === 1) {
    const item = items.find((row) => row.id === skipped[0]!.id);
    return item ? `${head} ${itemShortLabel(item)} was left as it was.` : head;
  }
  return `${head} Those items were left as they were.`;
}

/** "1 item still open · Meal change" for the footer after a bulk action. */
export function stillOpenText(items: readonly Row[]): string {
  if (items.length === 0) return "Every item is resolved";
  const labels = Array.from(
    new Set(items.map((item) => labelFor("exception_type", item.type))),
  );
  return `${itemsLabel(items.length)} still open · ${labels.join(", ")}`;
}
