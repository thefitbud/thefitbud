import type { Checkin } from "@fitbud/contracts";

/**
 * Pick the most relevant check-in for Today.
 * Prefer due/overdue (overdue first, then earliest local date), else the next upcoming scheduled.
 * Avoids taking the first item from a newest-first list (which can hide today's due behind a future scheduled).
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

  // Surface a recent coach reply on Today before the next scheduled window.
  const reviewed = items
    .filter((item) => item.status === "reviewed" && item.review)
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (reviewed[0]) return reviewed[0];

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
