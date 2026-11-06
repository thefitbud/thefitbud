import { formatLocalDate } from "@fitbud/core";

/** EC1 rule 2: how far ahead of the server clock a client-stated log time may be. */
export const LOG_TIME_FUTURE_DRIFT_MS = 5 * 60 * 1000;

export type LogTimeBoundsResult =
  | { ok: true }
  | { ok: false; reason: "future" | "before_window" };

/**
 * Checks the instant a log was made against the item's window start.
 *
 * - `clientLoggedAt` after `now` + 5 min is `future` (clock drift allowance).
 * - `clientLoggedAt` before `windowStart` is `before_window`; exactly at the
 *   start is accepted.
 *
 * Only the future bound uses the server clock. The lower bound compares the
 * time the log was made, never the time the server received it, so a queued
 * offline log that was valid when made still passes when delivered late.
 */
export function assertLogTimeWithinBounds(input: {
  clientLoggedAt: string;
  windowStart: string;
  now: string;
}): LogTimeBoundsResult {
  const logged = Date.parse(input.clientLoggedAt);
  const start = Date.parse(input.windowStart);
  const now = Date.parse(input.now);
  if (logged > now + LOG_TIME_FUTURE_DRIFT_MS) {
    return { ok: false, reason: "future" };
  }
  if (logged < start) {
    return { ok: false, reason: "before_window" };
  }
  return { ok: true };
}

/**
 * EC1 rule 1: the ended period stays frozen after a reactivation.
 *
 * `reactivatedAt` is the relationship's latest reactivation. Reactivation
 * clears `ended_at`, and every end comes before the reactivation that follows
 * it, so "before the latest reactivation" covers both the time before the
 * latest end and the ended period itself. A log belongs to that frozen period
 * when either:
 *
 * - it was made (`loggedAt`: the client-stated time for offline-capable logs,
 *   otherwise the server time) before the reactivation, or
 * - the item is dated (`localDate`, the trainee's civil day) before the day of
 *   the reactivation in the trainee's timezone. Ending and reactivating both
 *   supersede every item from their own day on, so an item still scheduled on
 *   an earlier day is always one from before the end.
 *
 * A relationship that was never reactivated has no frozen period here; an
 * ended relationship is already rejected by the read-only guard.
 */
export function isInEndedPeriod(input: {
  reactivatedAt: string | null;
  loggedAt: string;
  localDate: string;
  timeZone: string;
}): boolean {
  if (!input.reactivatedAt) return false;
  if (Date.parse(input.loggedAt) < Date.parse(input.reactivatedAt)) return true;
  return input.localDate < reactivationLocalDate(input.reactivatedAt, input.timeZone);
}

/** The trainee's civil day on which the relationship was last reactivated. */
export function reactivationLocalDate(
  reactivatedAt: string,
  timeZone: string,
): string {
  return formatLocalDate(new Date(reactivatedAt), timeZone);
}

export const LOG_TIME_ERROR_CODES = {
  future: "LOG_TIME_IN_FUTURE",
  before_window: "LOG_TIME_BEFORE_WINDOW",
  ended_period: "ENDED_PERIOD",
} as const;

export const LOG_TIME_ERROR_MESSAGES = {
  future: "The log time is in the future.",
  before_window: "The log time is before this item's window opened.",
  ended_period: "This item is from before coaching restarted and cannot be logged.",
} as const;

export type LogTimeRejection = keyof typeof LOG_TIME_ERROR_CODES;
