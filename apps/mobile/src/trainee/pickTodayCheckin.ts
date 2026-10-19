import type { Checkin } from "@fitbud/contracts";

/**
 * Pick the most relevant check-in for Today.
 * Prefer due/overdue, else submitted (waiting for review), else a recent
 * reviewed reply, else the next upcoming scheduled.
 *
 * When both reviewed and scheduled exist, return the reviewed item so Today
 * can show the coach reply; callers should also use pickNextScheduledCheckin
 * for the "Next check-in <date>" line.
 */
export function pickTodayCheckin(
  items: readonly Checkin[],
): Checkin | null {
  const actionable = items
    .filter((item) => item.status === "due" || item.status === "overdue")
    .slice()
    .sort((a, b) => {
      const rank = (status: string) => (status === "overdue" ? 0 : 1);
      const byStatus = rank(a.status) - rank(b.status);
      if (byStatus !== 0) return byStatus;
      return a.localDate.localeCompare(b.localDate);
    });
  if (actionable[0]) return actionable[0];

  // A review payload means the coach already replied — never show "Waiting".
  const submitted = items
    .filter((item) => item.status === "submitted" && !item.review)
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (submitted[0]) return submitted[0];

  const reviewed = items
    .filter((item) => Boolean(item.review))
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (reviewed[0]) return reviewed[0];

  return pickNextScheduledCheckin(items);
}

/** Earliest upcoming scheduled check-in (for "Next check-in <date>"). */
export function pickNextScheduledCheckin(
  items: readonly Checkin[],
): Checkin | null {
  const upcoming = items
    .filter((item) => item.status === "scheduled")
    .slice()
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  return upcoming[0] ?? null;
}
