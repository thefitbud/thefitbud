import { formatLocalDate } from "@fitbud/core";

/**
 * D-W12-7 (Z12-39): future days are view only.
 *
 * A trainee may see the plan for a day after today, but nothing dated on it
 * can be logged: no meal outcome, no workout start, skip, set or completion,
 * and no measurement or progress entry. "Today" is the trainee's civil day in
 * their stored timezone (`users.timezone`), judged on the server clock, so a
 * client clock or device zone that runs ahead cannot open tomorrow early.
 * Past days are not affected here; they stay loggable as late logs under the
 * existing window and edit rules.
 *
 * Every zoned date goes through `formatLocalDate`, which resolves the zone
 * with the CU17 resolver (`packages/core/src/zone.ts`). There is no default
 * zone in this module: callers pass the stored zone.
 */

/**
 * The single error body for a future-dated log (422). Static text only
 * (AGENTS.md API errors, D-W3-12): it never carries the date, the item or the
 * zone, so clients can show it as-is. It matches the Today copy.
 */
export const FUTURE_DAY_ERROR = {
  code: "FUTURE_DAY",
  message: "Logging opens on the day.",
} as const;

/** OpenAPI wording for the trainee log routes that run this guard. */
export const FUTURE_DAY_OPENAPI_NOTE =
  "An item dated after the trainee's today (stored timezone) is view only: 422 FUTURE_DAY.";

/** OpenAPI 422 description for those routes. */
export const FUTURE_DAY_LOG_ERROR_DOC =
  "A logging rule refused the request, for example an item on a future day (FUTURE_DAY).";

/** The trainee's civil date for `now`, in their stored `timeZone`. */
export function traineeLocalToday(input: { now: string; timeZone: string }): string {
  return formatLocalDate(new Date(input.now), input.timeZone);
}

/** True when `localDate` (YYYY-MM-DD, trainee civil day) is after the trainee's today. */
export function isFutureLocalDate(input: {
  localDate: string;
  now: string;
  timeZone: string;
}): boolean {
  return input.localDate > traineeLocalToday(input);
}

/**
 * True when the civil day of `instant` in the trainee's zone is after the
 * trainee's today. Used for records dated by an instant rather than an
 * assignment day (measurements, progress entries). An unparseable instant is
 * left to the request schema, which rejects it before this runs.
 */
export function isFutureInstantDay(input: {
  instant: string;
  now: string;
  timeZone: string;
}): boolean {
  const ms = Date.parse(input.instant);
  if (!Number.isFinite(ms)) return false;
  return isFutureLocalDate({
    localDate: formatLocalDate(new Date(ms), input.timeZone),
    now: input.now,
    timeZone: input.timeZone,
  });
}
