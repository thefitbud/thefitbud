import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail } from "@fitbud/contracts";
import { formatClockTime, formatCivilDate, formatLocalDate } from "@fitbud/core";

/**
 * True only for a proven network failure (AGENTS.md "No misleading catch"):
 * the api-client's own status-0 / NETWORK_ERROR, or the TypeError `fetch`
 * throws when it cannot reach the server. A ZodError, a programming TypeError
 * or any other error is never "offline". Same rule as Z10-2's
 * `trainer/attention/offline.ts`, copied because that file is outside this
 * task's files_owned.
 */
const FETCH_FAILURE =
  /^(network request failed|failed to fetch|load failed|networkerror when attempting to fetch)/i;

export function isNetworkFailure(err: unknown): boolean {
  if (err instanceof ApiClientError) {
    return err.status === 0 || err.code === "NETWORK_ERROR";
  }
  return err instanceof TypeError && FETCH_FAILURE.test(err.message);
}

/** The exception does not exist for this trainer any more (frame 39). */
export function isNotFound(err: unknown): boolean {
  return err instanceof ApiClientError && err.status === 404;
}

/** "Sat 17 Oct, 10:05 am" in the given zone, or "" for an unreadable instant. */
export function instantLine(iso: string, timeZone: string, now?: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const day = formatCivilDate(formatLocalDate(date, timeZone), { now });
  return `${day}, ${formatClockTime(date, timeZone)}`;
}

/** "Sat 3 Oct" in the given zone. */
export function civilDayLine(iso: string, timeZone: string, now?: Date): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatCivilDate(formatLocalDate(date, timeZone), { now });
}

/** Frame 37 banner line. The API stores no outcome on the action, so none is shown. */
export function resolvedBannerText(
  detail: Pick<ExceptionDetail, "resolvedAt" | "closedReason">,
  timeZone: string,
  now?: Date,
): string {
  const when = detail.resolvedAt ? instantLine(detail.resolvedAt, timeZone, now) : "";
  const head =
    detail.closedReason === "coaching_ended"
      ? "Closed when coaching ended"
      : "Resolved by you";
  return when ? `${head} · ${when}` : head;
}

/** Frame 41 banner. */
export function endedBannerText(
  firstName: string,
  endedAt: string | null,
  timeZone: string,
  now?: Date,
): string {
  const who = firstName || "your client";
  const day = endedAt ? civilDayLine(endedAt, timeZone, now) : "";
  return day
    ? `Coaching with ${who} ended on ${day}. This item is read-only.`
    : `Coaching with ${who} has ended. This item is read-only.`;
}

/** Frame 40 banner. */
export function offlineBannerText(
  lastUpdateAt: string | null,
  timeZone: string,
): string {
  const at = lastUpdateAt ? formatClockTime(lastUpdateAt, timeZone) : "";
  return at
    ? `You're offline. Showing the last update from ${at}.`
    : "You're offline. Reconnect and try again.";
}
