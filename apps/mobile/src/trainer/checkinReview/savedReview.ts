import type { CheckinReviewContext, TrainerNote } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatLocalDate,
  labelFor,
} from "@fitbud/core";

/**
 * Pure pieces of the saved (read-only) check-in review, frame 75: the line
 * under the "Reviewed" chip and the note that went with the review.
 */

/** "Sun 18 Oct, 9:46 am" in the given zone. Empty when the instant is invalid. */
export function reviewedAtLabel(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return "";
  return `${formatCivilDate(formatLocalDate(instant, timeZone))}, ${formatClockTime(
    instant,
    timeZone,
  )}`;
}

/** "Needs follow-up · Sun 18 Oct, 9:46 am". */
export function reviewedSummaryLine(
  review: NonNullable<CheckinReviewContext["checkin"]["review"]>,
  timeZone: string,
): string {
  const outcome = labelFor("checkin_review_outcome", review.outcome);
  const when = reviewedAtLabel(review.createdAt, timeZone);
  return when ? `${outcome} · ${when}` : outcome;
}

/** The trainer note saved with this check-in's review, if there is one. */
export function noteForCheckin(
  notes: readonly TrainerNote[],
  checkinId: string,
): TrainerNote | null {
  return notes.find((note) => note.checkinId === checkinId) ?? null;
}

/** Signed change with a real minus sign, as frame 75 shows ("−0.5"). */
export function signedDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return "0";
}
