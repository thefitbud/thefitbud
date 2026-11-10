import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";

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
 * Instant used to judge a trainee log (Z7-20).
 *
 * A client-supplied time is when the log was made, so a submit just before
 * local midnight is judged on that civil day and not on the server-receive
 * day. When the client omits it, the server receive time is used and
 * behaviour matches the paths that used to stamp `now` only.
 *
 * The contract accepts an offset (`+05:30`), but stored instants are compared
 * as strings, so the result is always the canonical UTC form (`…Z`).
 */
export function resolveLogInstant(input: {
  clientLoggedAt?: string | null;
  now: string;
}): string {
  return input.clientLoggedAt
    ? new Date(Date.parse(input.clientLoggedAt)).toISOString()
    : input.now;
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

/** R2 (D-P2-21): a trainer logs or edits entries dated within this many days back. */
export const COACH_LOG_WINDOW_DAYS = 7;

/**
 * R2 (D-P2-21, Z6-19): trainers skip the Z6-11 window bounds above, but every
 * date of the entry must be within the last 7 days and not in the future.
 *
 * - `localDates` are civil days in the trainee's timezone (the assignment's day).
 * - `instants` (the performed time) may be at most the same 5-minute drift
 *   ahead of the server clock, and their civil day is checked as well.
 * - "Within the last 7 days" is from today minus 7 days through today, in the
 *   trainee's timezone, so last Wednesday's workout can still be fixed on
 *   Wednesday.
 */
export function isWithinCoachLogWindow(input: {
  localDates: readonly string[];
  instants: readonly string[];
  now: string;
  timeZone: string;
}): boolean {
  const nowMs = Date.parse(input.now);
  const today = formatLocalDate(new Date(nowMs), input.timeZone);
  const earliest = addDaysToLocalDate(today, -COACH_LOG_WINDOW_DAYS);
  const days = [...input.localDates];
  for (const instant of input.instants) {
    const ms = Date.parse(instant);
    if (!Number.isFinite(ms) || ms > nowMs + LOG_TIME_FUTURE_DRIFT_MS) return false;
    days.push(formatLocalDate(new Date(ms), input.timeZone));
  }
  return days.every((day) => day >= earliest && day <= today);
}

export const COACH_LOG_BACKDATE_ERROR = {
  code: "BACKDATE_LIMIT",
  message: "A trainer log must be dated within the last 7 days and not in the future.",
} as const;

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
