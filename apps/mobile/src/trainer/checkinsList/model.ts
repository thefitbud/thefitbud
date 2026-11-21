import type { Checkin, TrainerCheckinInboxItem } from "@fitbud/contracts";
import {
  formatCivilDate,
  formatPersonName,
  formatRelative,
} from "@fitbud/core";

export type CheckinListSegment = "to_review" | "overdue" | "reviewed";

export type CheckinListRow = {
  id: string;
  relationshipId: string;
  name: string;
  firstName: string;
  /** Secondary line under the name (TM-05a/b/e). */
  line: string;
  /** Chip + age footer (e.g. "1 d ago", "1 d late", "Sun 8 Nov"). */
  age: string | null;
  item: TrainerCheckinInboxItem;
  /** True when the trainer left a client-visible reply note. */
  replied?: boolean;
};

export type CheckinListModel = {
  toReview: CheckinListRow[];
  overdue: CheckinListRow[];
  reviewed: CheckinListRow[];
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
 * Age label next to the status chip. Submitted uses relative time; overdue uses
 * "N d late". Reviewed uses the review civil date.
 */
export function ageLabel(
  item: TrainerCheckinInboxItem,
  today: string,
  nowIso = new Date().toISOString(),
): string | null {
  const { checkin } = item;
  if (checkin.status === "reviewed" && checkin.review?.createdAt) {
    return formatCivilDate(checkin.review.createdAt.slice(0, 10));
  }
  if (checkin.status === "overdue") {
    const days = civilDaysBetween(checkin.localDate, today);
    return days > 0 ? `${days} d late` : "due today";
  }
  if (checkin.status === "submitted" && checkin.submittedAt) {
    const relative = formatRelative(checkin.submittedAt, nowIso);
    if (relative === "yesterday") return "1 d ago";
    if (relative === "just now") return "just now";
    return relative;
  }
  return null;
}

/** TM-05a: "Weekly check-in · week 2 · 2 photos" — week/photos when known. */
export function toReviewLine(item: TrainerCheckinInboxItem, week?: number | null): string {
  const parts = ["Weekly check-in"];
  if (week != null && week > 0) parts.push(`week ${week}`);
  return parts.join(" · ");
}

/** TM-05b: "Weekly check-in · week 5 · due Fri 13 Nov". */
export function overdueLine(
  item: TrainerCheckinInboxItem,
  week?: number | null,
): string {
  const parts = ["Weekly check-in"];
  if (week != null && week > 0) parts.push(`week ${week}`);
  parts.push(`due ${formatCivilDate(item.checkin.localDate)}`);
  return parts.join(" · ");
}

/** TM-05e: "Week 1 · you replied" or "Week 7". */
export function reviewedLine(
  item: TrainerCheckinInboxItem,
  input: { week?: number | null; replied?: boolean },
): string {
  const week =
    input.week != null && input.week > 0 ? `Week ${input.week}` : "Check-in";
  return input.replied ? `${week} · you replied` : week;
}

function byAscending(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function byDescending(a: string, b: string): number {
  return a > b ? -1 : a < b ? 1 : 0;
}

export type WeekLookup = ReadonlyMap<string, number>;

/**
 * Submitted → To review; overdue → Overdue; reviewed → Reviewed (last 30 days
 * supplied by the caller). Merely-due check-ins stay out of every list.
 */
export function buildCheckinListModel(
  items: TrainerCheckinInboxItem[],
  input: {
    trainerZone: string;
    today: string;
    nowIso?: string;
    weeksByRelationship?: WeekLookup;
    repliedIds?: ReadonlySet<string>;
  },
): CheckinListModel {
  const nowIso = input.nowIso ?? new Date().toISOString();
  const weeks = input.weeksByRelationship;
  const replied = input.repliedIds;

  const toReview = items
    .filter((item) => item.checkin.status === "submitted")
    .sort((a, b) =>
      byAscending(
        a.checkin.submittedAt ?? a.checkin.localDate,
        b.checkin.submittedAt ?? b.checkin.localDate,
      ),
    )
    .map((item) =>
      rowOf(item, {
        line: toReviewLine(item, weeks?.get(item.coachingRelationshipId)),
        age: ageLabel(item, input.today, nowIso),
      }),
    );

  const overdue = items
    .filter((item) => item.checkin.status === "overdue")
    .sort((a, b) => byAscending(a.checkin.localDate, b.checkin.localDate))
    .map((item) =>
      rowOf(item, {
        line: overdueLine(item, weeks?.get(item.coachingRelationshipId)),
        age: ageLabel(item, input.today, nowIso),
      }),
    );

  const reviewed = items
    .filter((item) => item.checkin.status === "reviewed")
    .sort((a, b) =>
      byDescending(
        a.checkin.review?.createdAt ?? a.checkin.localDate,
        b.checkin.review?.createdAt ?? b.checkin.localDate,
      ),
    )
    .map((item) => {
      const didReply = replied?.has(item.checkin.id) ?? false;
      return rowOf(item, {
        line: reviewedLine(item, {
          week: weeks?.get(item.coachingRelationshipId),
          replied: didReply,
        }),
        age: ageLabel(item, input.today, nowIso),
        replied: didReply,
      });
    });

  return { toReview, overdue, reviewed };
}

function rowOf(
  item: TrainerCheckinInboxItem,
  over: { line: string; age: string | null; replied?: boolean },
): CheckinListRow {
  const name = nameOf(item);
  return {
    id: item.checkin.id,
    relationshipId: item.coachingRelationshipId,
    name,
    firstName: name.split(" ")[0] ?? name,
    line: over.line,
    age: over.age,
    item,
    replied: over.replied,
  };
}

/** Coaching week from relationship start (same formula as ClientStatusScreen). */
export function coachingWeekAt(
  startedAt: string | null | undefined,
  untilMs: number,
): number | null {
  if (!startedAt) return null;
  const elapsed = untilMs - Date.parse(startedAt);
  if (!Number.isFinite(elapsed) || elapsed < 0) return 1;
  return Math.max(1, Math.floor(elapsed / (7 * 24 * 60 * 60 * 1000)) + 1);
}

export function emptyCopy(segment: CheckinListSegment): {
  title: string;
  body: string | null;
} {
  if (segment === "to_review") {
    return {
      title: "No check-ins waiting. Nice.",
      body: "New check-ins show up here when clients send them.",
    };
  }
  if (segment === "overdue") {
    return { title: "No overdue check-ins", body: null };
  }
  return {
    title: "No reviewed check-ins yet",
    body: "Reviewed check-ins from the last 30 days show up here.",
  };
}

/** Wrap a lone Checkin into an inbox-shaped row for the Reviewed list. */
export function inboxItemFromCheckin(
  checkin: Checkin,
  meta: {
    relationshipId: string;
    traineeDisplayName: string;
    traineeTimezone?: string;
  },
): TrainerCheckinInboxItem {
  return {
    checkin,
    coachingRelationshipId: meta.relationshipId,
    traineeUserId: checkin.coachingRelationshipId,
    traineeDisplayName: meta.traineeDisplayName,
    traineeTimezone: meta.traineeTimezone,
  };
}
