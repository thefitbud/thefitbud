import { ApiClientError } from "@fitbud/api-client";
import type { ExceptionDetail } from "@fitbud/contracts";
import { isNetworkFailure } from "../attention/offline";
import { formatClockTime, formatCivilDate, formatLocalDate } from "@fitbud/core";

export { isNetworkFailure };

/** The exception does not exist for this trainer any more (TM-04g). */
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

/**
 * TM-04f banner: "Resolved by you · Sat 17 Oct, 10:05 am · Talked to Rohan."
 * The exception read carries no outcome, so the outcome phrase is shown only
 * when this screen resolved it (the trainer's own choice, still in memory).
 */
export function resolvedBannerText(
  detail: Pick<ExceptionDetail, "resolvedAt" | "closedReason">,
  timeZone: string,
  now?: Date,
  outcomePhrase?: string | null,
): string {
  const when = detail.resolvedAt ? instantLine(detail.resolvedAt, timeZone, now) : "";
  const head =
    detail.closedReason === "coaching_ended"
      ? "Closed when coaching ended"
      : "Resolved by you";
  const base = when ? `${head} · ${when}` : head;
  return outcomePhrase ? `${base} · ${outcomePhrase}.` : base;
}

export type ResolveOutcomeValue = "talked" | "plan_adjusted" | "no_action";

/** Outcome chip and banner phrase: "Talked to Rohan", "Plan adjusted", "No action needed". */
export function resolvedOutcomePhrase(
  outcome: ResolveOutcomeValue | null,
  firstName: string,
): string | null {
  if (outcome === "talked") return firstName ? `Talked to ${firstName}` : "Talked to client";
  if (outcome === "plan_adjusted") return "Plan adjusted";
  if (outcome === "no_action") return "No action needed";
  return null;
}

/** State line on a noted item (RP-02): the item stays open until resolved. */
export function notedStateLine(
  acknowledgedAt: string | null,
  timeZone: string,
): string {
  const at = acknowledgedAt ? formatClockTime(acknowledgedAt, timeZone) : "";
  return at ? `Noted by you at ${at} · still open` : "Noted · still open";
}

/** TM-04i banner. */
export function endedBannerText(
  firstName: string,
  endedAt: string | null,
  timeZone: string,
  now?: Date,
): string {
  const who = firstName || "your client";
  const day = endedAt ? civilDayLine(endedAt, timeZone, now) : "";
  return day
    ? `Coaching with ${who} ended on ${day}. This is read only.`
    : `Coaching with ${who} has ended. This is read only.`;
}

/**
 * TM-04h banner. With the item on screen it says what needs a connection;
 * with nothing loaded yet it asks to reconnect.
 */
export function offlineBannerText(hasItem: boolean): string {
  return hasItem
    ? "You're offline. Reviewing and reminding need a connection."
    : "You're offline. Reconnect and try again.";
}

/**
 * TM-04g. A 404 says only that the item is gone for this trainer, not who
 * closed it or when, so the copy does not claim "resolved on FitBud web at …".
 */
export const NOT_FOUND_TITLE = "This item is no longer available";
export const NOT_FOUND_BODY =
  "It may have been resolved elsewhere or replaced by a plan change. Nothing else to do here.";
export const BACK_TO_NEEDS_YOU = "Back to Attention";

/** Header subtitle: "Fat loss · week 6 · since 5 d", or "Fat loss · ended 30 Oct". */
export function exceptionHeaderSubtitle(input: {
  goalShort: string | null;
  weekNumber: number | null;
  ageLabel: string | null;
  endedDay: string | null;
}): string {
  const parts: string[] = [];
  const goal = input.goalShort?.trim();
  if (goal) parts.push(goal);
  if (input.endedDay) {
    parts.push(`ended ${input.endedDay}`);
  } else {
    if (input.weekNumber != null && input.weekNumber > 0) parts.push(`week ${input.weekNumber}`);
    if (input.ageLabel) parts.push(input.ageLabel);
  }
  return parts.join(" · ");
}

export type ExceptionReviewStatus = "open" | "reviewed" | "resolved" | "ended";

/** Which TM-04 state the item is in. Ended wins: an ended client is read only. */
export function exceptionReviewStatus(
  status: ExceptionDetail["status"],
  ended: boolean,
): ExceptionReviewStatus {
  if (ended) return "ended";
  if (status === "resolved") return "resolved";
  if (status === "acknowledged") return "reviewed";
  return "open";
}

/** Minutes since the item was raised, for the "since 5 d" fragment. */
export function exceptionAgeMinutes(
  detail: Pick<ExceptionDetail, "activatedAt" | "detectedAt">,
  nowMs: number = Date.now(),
): number {
  const from = Date.parse(detail.activatedAt ?? detail.detectedAt);
  if (!Number.isFinite(from)) return 0;
  return Math.max(0, Math.round((nowMs - from) / 60000));
}
