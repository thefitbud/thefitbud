import type { Checkin } from "@fitbud/contracts";

function hasCoachReview(item: Checkin): boolean {
  return Boolean(item.review) || item.status === "reviewed";
}

/**
 * Pick the most relevant check-in for Today's banner.
 * Prefer due/overdue, else a recent coach review (reply + next date),
 * else submitted awaiting review, else the next scheduled.
 *
 * Reviewed must beat unreviewed submitted — otherwise a newer Sunday
 * "waiting" check-in hides Friday's coach reply while Progress still
 * lists the reviewed row as Acknowledged.
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

  const reviewed = items
    .filter((item) => hasCoachReview(item))
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (reviewed[0]) return reviewed[0];

  const submitted = items
    .filter((item) => item.status === "submitted" && !hasCoachReview(item))
    .slice()
    .sort((a, b) => b.localDate.localeCompare(a.localDate));
  if (submitted[0]) return submitted[0];

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

/** Props for the Today check-in banner (shared by UI + integration tests). */
export function todayCheckinBanner(
  checkin: Checkin | null,
  nextScheduled: Checkin | null,
  coachFirst: string,
): {
  kind: "none" | "scheduled" | "reviewed" | "waiting" | "due";
  title: string;
  body: string | null;
  nextLine: string | null;
} {
  if (!checkin) {
    return {
      kind: "none",
      title: "Check-in",
      body: "No check-in is due right now.",
      nextLine: null,
    };
  }
  if (checkin.status === "scheduled") {
    return {
      kind: "scheduled",
      title: `Next check-in ${checkin.localDate}`,
      body: "You can fill this in when it opens.",
      nextLine: null,
    };
  }
  if (hasCoachReview(checkin)) {
    const notes = checkin.review?.notes?.trim() || null;
    return {
      kind: "reviewed",
      title:
        checkin.review?.outcome === "needs_attention"
          ? `${coachFirst} wants a follow-up`
          : "Acknowledged",
      body: notes ?? `${coachFirst} reviewed your check-in.`,
      nextLine: nextScheduled
        ? `Next check-in ${nextScheduled.localDate}`
        : null,
    };
  }
  if (checkin.status === "submitted") {
    return {
      kind: "waiting",
      title: "Check-in sent",
      body: `Waiting for ${coachFirst} to review.`,
      nextLine: null,
    };
  }
  return {
    kind: "due",
    title: `Weekly check-in · Due ${checkin.localDate}`,
    body: "Takes about 3 min",
    nextLine: null,
  };
}
