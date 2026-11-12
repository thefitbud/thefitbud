import type { TrainerCheckinInboxItem } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatClockTime,
  formatInstant,
  formatLocalDate,
  formatPersonName,
} from "@fitbud/core";

export type CheckinListSegment = "to_review" | "overdue";

export type CheckinListRow = {
  id: string;
  relationshipId: string;
  name: string;
  firstName: string;
  line: string;
  item: TrainerCheckinInboxItem;
};

export type CheckinListModel = {
  toReview: CheckinListRow[];
  overdue: CheckinListRow[];
};

function nameOf(item: TrainerCheckinInboxItem): string {
  return formatPersonName(item.traineeDisplayName ?? "Client") || "Client";
}

/** Whole civil days from `from` to `to` ("YYYY-MM-DD"), never negative. */
export function civilDaysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/**
 * "Fri 16 Oct, 9:30 pm", in the client's zone. When that differs from the
 * trainer's zone the zone abbreviation follows ("7:15 pm GST").
 */
export function submittedAtLabel(
  item: TrainerCheckinInboxItem,
  trainerZone: string,
): string {
  const iso = item.checkin.submittedAt;
  if (!iso) return formatCivilDate(item.checkin.localDate);
  const zone = item.traineeTimezone ?? trainerZone;
  const when = new Date(iso);
  const day = formatCivilDate(formatLocalDate(when, zone));
  const clock = formatClockTime(when, zone);
  // Same wall clock and date in both zones (also covers alias names such as
  // Asia/Calcutta and Asia/Kolkata): no zone suffix needed.
  const sameAsTrainer =
    clock === formatClockTime(when, trainerZone) &&
    formatLocalDate(when, zone) === formatLocalDate(when, trainerZone);
  if (sameAsTrainer) return `${day}, ${clock}`;
  // formatInstant gives "16 Oct, 7:15 pm GST"; its tail carries the zone name.
  const withZone = formatInstant(iso, zone, { viewerTz: trainerZone });
  const abbreviation = withZone.slice(withZone.indexOf(clock) + clock.length).trim();
  return abbreviation ? `${day}, ${clock} ${abbreviation}` : `${day}, ${clock}`;
}

export function toReviewLine(
  item: TrainerCheckinInboxItem,
  trainerZone: string,
): string {
  return `Check-in · submitted ${submittedAtLabel(item, trainerZone)}`;
}

export function overdueLine(
  item: TrainerCheckinInboxItem,
  today: string,
): string {
  const due = formatCivilDate(item.checkin.localDate);
  const days = civilDaysBetween(item.checkin.localDate, today);
  return days > 0
    ? `Check-in · due ${due} · ${days} d overdue`
    : `Check-in · due ${due}`;
}

function byAscending(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Submitted check-ins are "To review"; overdue ones are "Overdue". Check-ins
 * that are only due (window still open) are in neither list: nothing is wrong
 * yet and there is nothing for the trainer to do. Oldest first in both.
 */
export function buildCheckinListModel(
  items: TrainerCheckinInboxItem[],
  input: { trainerZone: string; today: string },
): CheckinListModel {
  const toReview = items
    .filter((item) => item.checkin.status === "submitted")
    .sort((a, b) =>
      byAscending(
        a.checkin.submittedAt ?? a.checkin.localDate,
        b.checkin.submittedAt ?? b.checkin.localDate,
      ),
    )
    .map((item) => rowOf(item, toReviewLine(item, input.trainerZone)));
  const overdue = items
    .filter((item) => item.checkin.status === "overdue")
    .sort((a, b) => byAscending(a.checkin.localDate, b.checkin.localDate))
    .map((item) => rowOf(item, overdueLine(item, input.today)));
  return { toReview, overdue };
}

function rowOf(item: TrainerCheckinInboxItem, line: string): CheckinListRow {
  const name = nameOf(item);
  return {
    id: item.checkin.id,
    relationshipId: item.coachingRelationshipId,
    name,
    firstName: name.split(" ")[0] ?? name,
    line,
    item,
  };
}

export function emptyCopy(segment: CheckinListSegment): {
  title: string;
  body: string | null;
} {
  return segment === "to_review"
    ? {
        title: "No check-ins to review",
        body: "Submitted check-ins land here.",
      }
    : { title: "No overdue check-ins", body: null };
}
