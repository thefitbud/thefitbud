import type { Exception, WorkspaceHeader } from "@fitbud/contracts";
import { formatCivilDate, labelFor } from "@fitbud/core";

/** SP1: the panel walks at most this many items; the rest read "n more". */
export const PANEL_MAX_ITEMS = 10;

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type PanelList = {
  /** Items the panel steps through, newest first, at most PANEL_MAX_ITEMS. */
  items: Exception[];
  /** Open items beyond the cap (shown as "n more"). */
  moreCount: number;
};

type OrderRow = Pick<Exception, "severity" | "detectedAt">;

/**
 * Review order for one client's items (D-W13-21): Critical first, then newest
 * first. The Overview "Needs attention" card uses the same comparator on the
 * same API rows, and `Array.prototype.sort` is stable, so equal rows keep the
 * API order in both places and the pager's "n of m" equals the card position.
 */
export function compareReviewOrder(a: OrderRow, b: OrderRow): number {
  return (
    (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1) ||
    b.detectedAt.localeCompare(a.detectedAt)
  );
}

/** Still open: not resolved yet (detected, active or noted). */
export function isOpenItem(row: Pick<Exception, "status">): boolean {
  return row.status !== "resolved";
}

/**
 * One client's open items (D11: asks and renewals stay in their Home
 * sections), noted ones included, in review order (D-W13-21).
 */
export function buildPanelList(rows: readonly Exception[]): PanelList {
  const open = rows.filter(isOpenItem).slice().sort(compareReviewOrder);
  return {
    items: open.slice(0, PANEL_MAX_ITEMS),
    moreCount: Math.max(0, open.length - PANEL_MAX_ITEMS),
  };
}

/** Meal or workout name and civil day the item is about, when known. */
export type ItemSource = { name: string | null; localDate: string | null };

function detailText(
  details: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = details?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** What the item's own details already say about its meal/workout and day. */
export function sourceFromDetails(
  item: Pick<Exception, "details">,
): ItemSource {
  return {
    name:
      detailText(item.details, "mealName") ??
      detailText(item.details, "workoutDayName"),
    localDate: detailText(item.details, "localDate"),
  };
}

/**
 * Item title, the same in the single item and in Resolve several… rows:
 * "{what happened} · {meal or workout} · {Wed 21 Oct}" (parts left out when
 * unknown; the name is not repeated when the summary already says it).
 */
export function itemTitle(
  item: Pick<Exception, "type" | "summary" | "details">,
  source?: Partial<ItemSource> | null,
): string {
  const own = sourceFromDetails(item);
  const name = own.name ?? source?.name ?? null;
  const localDate = own.localDate ?? source?.localDate ?? null;
  const base = item.summary?.trim() || labelFor("exception_type", item.type);
  const parts = [base];
  if (name && !base.toLowerCase().includes(name.toLowerCase())) parts.push(name);
  if (localDate) parts.push(formatCivilDate(localDate));
  return parts.join(" · ");
}

/** Short row label, e.g. "Missed workout · Thu 15 Oct". */
export function itemShortLabel(
  item: Pick<Exception, "type" | "details">,
): string {
  const base = labelFor("exception_type", item.type);
  const localDate = detailText(item.details, "localDate");
  return localDate ? `${base} · ${formatCivilDate(localDate)}` : base;
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

/** Same avatar tone as the client's Home row (home.css .home-av.c1–c8). */
export function avatarToneClass(name: string): string {
  const n = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return `home-av c${(n % 8) + 1}`;
}

function relationshipWeek(
  startedAt: string | null | undefined,
  now: number,
): number | null {
  if (!startedAt) return null;
  const started = Date.parse(startedAt);
  if (Number.isNaN(started)) return null;
  return Math.max(1, Math.floor((now - started) / WEEK_MS) + 1);
}

export function openItemsLabel(count: number): string {
  return count === 1 ? "1 open item" : `${count} open items`;
}

/** Header meta (frame 02): "{goal} · week {n} · {k} open items". */
export function headerMeta(
  header: Pick<WorkspaceHeader, "goalShort" | "startedAt" | "endedAt"> | null,
  openCount: number | null,
  now: number = Date.now(),
): string {
  const parts: string[] = [];
  if (header?.goalShort) parts.push(header.goalShort);
  const week = header?.endedAt ? null : relationshipWeek(header?.startedAt, now);
  if (week != null) parts.push(`week ${week}`);
  if (openCount != null) parts.push(openItemsLabel(openCount));
  return parts.join(" · ");
}

/** "Open 5 d · not reviewed yet" / "Open 5 d · noted" (frame 02, RP-02). */
export function itemAgeLine(
  item: Pick<Exception, "detectedAt" | "status">,
  now: number = Date.now(),
): string {
  const detected = Date.parse(item.detectedAt);
  const days = Number.isNaN(detected)
    ? 0
    : Math.max(0, Math.floor((now - detected) / DAY_MS));
  const age = days === 0 ? "Open today" : `Open ${days} d`;
  // W14 words (D-W13-5): a noted item reads "noted", not "reviewed".
  const review =
    item.status === "acknowledged" ? "noted" : "not reviewed yet";
  return `${age} · ${review}`;
}

/** Source card heading (frame 02): where the expectation came from. */
export function sourceOrigin(
  sourceEntityType: Exception["sourceEntityType"],
  planTitle: string | null,
): string {
  const base =
    sourceEntityType === "workout_assignment"
      ? "From the workout plan"
      : sourceEntityType === "meal_assignment"
        ? "From the meal plan"
        : "From check-ins";
  return planTitle && sourceEntityType !== "checkin"
    ? `${base} · ${planTitle}`
    : base;
}

/** RP-04: "2 more open for Rohan" under a handled item. */
export function moreOpenText(count: number, firstName: string): string | null {
  if (count <= 0) return null;
  return `${count} more open for ${firstName}`;
}

/** RP-05 all-done line: "2 resolved · 1 noted, still open". */
export function allDoneSummary(resolved: number, noted: number): string {
  const parts: string[] = [];
  if (resolved > 0) parts.push(`${resolved} resolved`);
  if (noted > 0) parts.push(`${noted} noted, still open`);
  return parts.length > 0 ? parts.join(" · ") : "Nothing left to review";
}
