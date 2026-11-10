import type { Exception, WorkspaceHeader } from "@fitbud/contracts";

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

/**
 * One client's open coaching-configuration exceptions (D11: asks and renewals
 * stay in their Home sections). The API returns detected/active rows newest
 * first; sort again so the order never depends on the transport.
 */
export function buildPanelList(rows: readonly Exception[]): PanelList {
  const open = rows
    .filter((row) => row.status === "detected" || row.status === "active")
    .slice()
    .sort((a, b) => {
      const byDetected = b.detectedAt.localeCompare(a.detectedAt);
      return byDetected !== 0 ? byDetected : b.id.localeCompare(a.id);
    });
  return {
    items: open.slice(0, PANEL_MAX_ITEMS),
    moreCount: Math.max(0, open.length - PANEL_MAX_ITEMS),
  };
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

/** "Open 5 d · not reviewed yet" (frame 02). */
export function itemAgeLine(
  item: Pick<Exception, "detectedAt" | "status">,
  now: number = Date.now(),
): string {
  const detected = Date.parse(item.detectedAt);
  const days = Number.isNaN(detected)
    ? 0
    : Math.max(0, Math.floor((now - detected) / DAY_MS));
  const age = days === 0 ? "Open today" : `Open ${days} d`;
  const review =
    item.status === "acknowledged" ? "reviewed" : "not reviewed yet";
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

/** "1 of 3 resolved · 2 still open" (frame 02 resolved footer). */
export function resolvedFooterText(resolved: number, total: number): string {
  const open = Math.max(0, total - resolved);
  return open === 0
    ? `All ${total} resolved`
    : `${resolved} of ${total} resolved · ${open} still open`;
}

/**
 * Next unresolved item after `fromIndex`, wrapping to the start; null when
 * every item is resolved.
 */
export function nextUnresolvedIndex(
  items: readonly Pick<Exception, "id">[],
  fromIndex: number,
  resolvedIds: ReadonlySet<string>,
): number | null {
  const n = items.length;
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIndex + step) % n;
    const item = items[idx];
    if (item && !resolvedIds.has(item.id)) return idx;
  }
  return null;
}
