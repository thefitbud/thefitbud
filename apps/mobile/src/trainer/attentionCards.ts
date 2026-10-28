import type { AttentionGroupsResponse, ExceptionStatus } from "@fitbud/contracts";
import { attentionReviewBucket, labelFor } from "@fitbud/core";

type AttentionGroup = AttentionGroupsResponse["groups"][number];
type AttentionGroupItem = AttentionGroup["items"][number];

export type AttentionLists = {
  /** Open clients, including acknowledged items, matching the API `groups` list. */
  groups: AttentionGroup[];
  /** Clients with at least one detected or active item. Items are the unreviewed ones. */
  needsYou: AttentionGroup[];
  /** Clients whose remaining open items are all acknowledged. */
  reviewed: AttentionGroup[];
};

const SEVERITY_RANK: Record<AttentionGroupItem["severity"], number> = {
  critical: 0,
  attention: 1,
};

export type ClientAttentionCard = {
  relationshipId: string;
  traineeDisplayName: string;
  clientWhatsappE164: string | null;
  primary: AttentionGroupItem;
  itemCount: number;
};

export function buildClientAttentionCards(
  groups: AttentionGroup[],
): ClientAttentionCard[] {
  return groups
    .map((group) => {
      const sorted = [...group.items].sort((a, b) => {
        const sev =
          (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
        if (sev !== 0) return sev;
        return b.ageMinutes - a.ageMinutes;
      });
      const primary = sorted[0];
      if (!primary) return null;
      return {
        relationshipId: group.relationshipId,
        traineeDisplayName: group.traineeDisplayName,
        clientWhatsappE164: group.clientWhatsappE164 ?? null,
        primary,
        itemCount: group.items.length,
      };
    })
    .filter((row): row is ClientAttentionCard => row != null)
    .sort((a, b) => {
      const sev =
        (SEVERITY_RANK[a.primary.severity] ?? 9) -
        (SEVERITY_RANK[b.primary.severity] ?? 9);
      if (sev !== 0) return sev;
      return b.primary.ageMinutes - a.primary.ageMinutes;
    });
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** "since 5 d" — age on the attention card. */
export function formatAttentionAge(ageMinutes: number): string {
  if (ageMinutes < 60) {
    const mins = Math.max(1, ageMinutes);
    return `since ${mins} min`;
  }
  if (ageMinutes < 24 * 60) {
    const hours = Math.max(1, Math.round(ageMinutes / 60));
    return `since ${hours} h`;
  }
  const days = Math.max(1, Math.round(ageMinutes / (24 * 60)));
  return `since ${days} d`;
}

function localDateOf(item: AttentionGroupItem): string | null {
  const value = item.details?.localDate;
  return typeof value === "string" ? value : null;
}

function weekdayLabel(localDate: string): string | null {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  return WEEKDAY[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? null;
}

/** One issue line for a client card, grouped the way the attention mockup reads. */
export function attentionIssueLine(items: AttentionGroupItem[]): string {
  const workouts = items.filter(
    (item) => item.type === "missed_workout" || item.type === "skipped_workout",
  );
  const meals = items.filter(
    (item) =>
      item.type === "overdue_meal" ||
      item.type === "skipped_meal" ||
      item.type === "meal_deviation" ||
      item.type === "meal_logged_later",
  );
  const checkins = items.filter((item) => item.type === "overdue_checkin");
  if (checkins[0] && workouts.length === 0) {
    const days = Math.max(1, Math.round(checkins[0].ageMinutes / (24 * 60)));
    return days === 1
      ? "Check-in 1 day overdue"
      : `Check-in ${days} days overdue`;
  }
  if (workouts.length > 0 && workouts.length >= meals.length) {
    const days = [
      ...new Set(
        workouts
          .map((item) => localDateOf(item))
          .filter((value): value is string => Boolean(value))
          .map((date) => weekdayLabel(date))
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const shown = days.slice(0, 2);
    const hidden = Math.max(0, days.length - shown.length) + (items.length - workouts.length);
    const noun =
      workouts.length === 1
        ? "Missed workout"
        : `Missed ${workouts.length} workouts`;
    const parts = [noun];
    if (shown.length > 0) parts.push(shown.join(", "));
    if (hidden > 0) parts.push(`+${hidden} more`);
    return parts.join(" · ");
  }
  if (meals.length > 0) {
    const label = meals[0]!.summary.replace(/^Skipped required meal:\s*/i, "").replace(/^Required meal still unlogged:\s*/i, "");
    const headline = /breakfast/i.test(label)
      ? "Breakfast not logged"
      : label;
    const days = [
      ...new Set(
        meals
          .map((item) => localDateOf(item))
          .filter((value): value is string => Boolean(value))
          .map((date) => weekdayLabel(date))
          .filter((value): value is string => Boolean(value)),
      ),
    ].slice(0, 3);
    return days.length > 0 ? `${headline} · ${days.join(", ")}` : headline;
  }
  return items[0]?.summary ?? "Needs a look";
}

const OPEN_STATUSES = new Set<ExceptionStatus>([
  "detected",
  "active",
  "acknowledged",
]);

function isExceptionStatus(value: string): value is ExceptionStatus {
  return (
    value === "detected" ||
    value === "active" ||
    value === "acknowledged" ||
    value === "resolved"
  );
}

function compareAttentionGroups(a: AttentionGroup, b: AttentionGroup): number {
  const aCrit = a.mostSevere === "critical" ? 1 : 0;
  const bCrit = b.mostSevere === "critical" ? 1 : 0;
  if (aCrit !== bCrit) return bCrit - aCrit;
  const aAge = a.oldestAgeMinutes ?? 0;
  const bAge = b.oldestAgeMinutes ?? 0;
  if (aAge !== bAge) return bAge - aAge;
  return a.traineeDisplayName.localeCompare(b.traineeDisplayName);
}

function projectAttentionBucket(
  group: AttentionGroup,
  bucket: "needs_you" | "reviewed",
): AttentionGroup {
  const items = group.items.filter((item) =>
    bucket === "needs_you"
      ? item.status === "detected" || item.status === "active"
      : item.status === "acknowledged",
  );
  const mostSevere = items.some((item) => item.severity === "critical")
    ? "critical"
    : "attention";
  const oldestAgeMinutes = items.reduce(
    (max, item) => Math.max(max, item.ageMinutes),
    0,
  );
  return {
    ...group,
    items,
    itemCount: items.length,
    mostSevere,
    oldestAgeMinutes,
    bucket,
  };
}

/**
 * Split grouped attention the way F1a does.
 * A client stays in Needs you while any open item is still detected or active.
 */
export function partitionAttentionGroups(groups: AttentionGroup[]): AttentionLists {
  const stamped = groups.map((group) => {
    const statuses = group.items
      .map((item) => item.status)
      .filter(isExceptionStatus);
    return {
      ...group,
      bucket: attentionReviewBucket(statuses) ?? "needs_you",
    };
  });
  const needsYou: AttentionGroup[] = [];
  const reviewed: AttentionGroup[] = [];
  for (const group of stamped) {
    if (group.bucket === "reviewed") {
      const projected = projectAttentionBucket(group, "reviewed");
      if (projected.items.length > 0) reviewed.push(projected);
      continue;
    }
    const projected = projectAttentionBucket(group, "needs_you");
    if (projected.items.length > 0) needsYou.push(projected);
  }
  needsYou.sort(compareAttentionGroups);
  reviewed.sort(compareAttentionGroups);
  return { groups: stamped, needsYou, reviewed };
}

export function acknowledgeAttentionItem(
  groups: AttentionGroup[],
  exceptionId: string,
): AttentionGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.id === exceptionId
        ? { ...item, status: "acknowledged" as const }
        : item,
    ),
  }));
}

export function restoreAttentionItem(
  groups: AttentionGroup[],
  exceptionId: string,
  status: "detected" | "active",
): AttentionGroup[] {
  return groups.map((group) => ({
    ...group,
    items: group.items.map((item) =>
      item.id === exceptionId ? { ...item, status } : item,
    ),
  }));
}

export function attentionItemStatus(
  groups: AttentionGroup[],
  exceptionId: string,
): ExceptionStatus | null {
  for (const group of groups) {
    const item = group.items.find((entry) => entry.id === exceptionId);
    if (item && isExceptionStatus(item.status)) return item.status;
  }
  return null;
}

/**
 * Partial Mark reviewed while the client is still in Needs you.
 * Product label is "Reviewed, still open" (client chip). The count is
 * acknowledged open items, which stay open — they are not Resolved.
 */
export function partialReviewLine(
  items: ReadonlyArray<{ status: string }>,
): string | null {
  let open = 0;
  let acknowledged = 0;
  for (const item of items) {
    if (!isExceptionStatus(item.status) || !OPEN_STATUSES.has(item.status)) {
      continue;
    }
    open += 1;
    if (item.status === "acknowledged") acknowledged += 1;
  }
  if (acknowledged === 0 || acknowledged >= open) return null;
  return `${labelFor("client_chip", "reviewed_still_open")} · ${acknowledged} of ${open} reviewed`;
}

/** Collapsed Reviewed section line from TW-04 / the Home mockup. */
export function reviewedStillOpenSummary(count: number): string {
  return count === 1
    ? "1 reviewed item still open"
    : `${count} reviewed items still open`;
}
