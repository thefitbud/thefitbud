import type { Checkin } from "@fitbud/contracts";

/**
 * Pick the most relevant check-in for Today.
 * Prefer due/overdue, else the next upcoming scheduled.
 * After a review, Today should show "Next check-in <date>" (scheduled),
 * not keep surfacing the reviewed card.
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

  const submitted = items
    .filter((item) => item.status === "submitted")
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (submitted[0]) return submitted[0];

  const upcoming = items
    .filter((item) => item.status === "scheduled")
    .slice()
    .sort((a, b) => a.localDate.localeCompare(b.localDate));
  return upcoming[0] ?? null;
}
