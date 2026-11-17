import type {
  ExceptionDetail,
  NudgeActivityResponse,
  NudgeActivityType,
  ResponsivenessResponse,
} from "@fitbud/contracts";
import {
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  formatClockTime,
  formatHhMmTime,
  isWithinQuietHours,
  localTimeHhMm,
} from "@fitbud/core";
import { labelFor } from "../labels";
import { exceptionSourceName } from "./exceptionSheetContent";

/** Z12-50 (D-W12-9): body limit, same as the contract. */
export const NUDGE_BODY_MAX = 200;

export type NudgeChip = "gentle" | "check_in" | "reschedule";

export const NUDGE_CHIPS: ReadonlyArray<{ id: NudgeChip; label: string }> = [
  { id: "gentle", label: "Gentle" },
  { id: "check_in", label: "Check in" },
  { id: "reschedule", label: "Reschedule" },
];

export type NudgeTarget = {
  relationshipId: string;
  activityType: NudgeActivityType;
  activityId: string;
  /** "Missed workouts" / "Dinner not logged": the sheet subtitle's head. */
  kindLabel: string;
  /** Item name from the exception's own details ("Lower body A"), or null. */
  sourceName: string | null;
  /** Weekday of the item ("Fri"), or null. */
  dayLabel: string | null;
};

/**
 * Z12-50: the only exception types a nudge can be about. Each is an item that
 * was due and never logged. meal_deviation and meal_logged_later are logged
 * meals, so the API answers ACTIVITY_RESOLVED for them.
 */
const NUDGEABLE_EXCEPTION_TYPES: ReadonlySet<string> = new Set([
  "missed_workout",
  "overdue_meal",
  "overdue_checkin",
]);

export function isNudgeableExceptionType(type: string): boolean {
  return NUDGEABLE_EXCEPTION_TYPES.has(type);
}

export function nudgeActivityType(
  sourceEntityType: ExceptionDetail["sourceEntityType"],
): NudgeActivityType {
  return sourceEntityType === "workout_assignment"
    ? "workout"
    : sourceEntityType === "meal_assignment"
      ? "meal"
      : "checkin";
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function weekdayOf(localDate: unknown): string | null {
  if (typeof localDate !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const day = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
  return WEEKDAYS[day] ?? null;
}

export function nudgeTargetFromException(
  detail: Pick<
    ExceptionDetail,
    | "type"
    | "details"
    | "sourceEntityType"
    | "sourceEntityId"
    | "coachingRelationshipId"
  >,
): NudgeTarget {
  const source = exceptionSourceName(detail);
  const isMeal =
    detail.type === "overdue_meal" || detail.type === "skipped_meal";
  return {
    relationshipId: detail.coachingRelationshipId,
    activityType: nudgeActivityType(detail.sourceEntityType),
    activityId: detail.sourceEntityId,
    kindLabel:
      source && isMeal
        ? `${source} not logged`
        : labelFor("exception_type", detail.type),
    sourceName: source,
    dayLabel: weekdayOf(detail.details?.localDate),
  };
}

/** "Missed workouts · Tue" (TM-04b subtitle). */
export function nudgeTargetSubtitle(target: NudgeTarget): string {
  return [target.kindLabel, target.dayLabel].filter(Boolean).join(" · ");
}

/**
 * The three body prefills. Each uses only what the exception already carries
 * (item name, weekday): no invented times, no link. Always 1–200 characters.
 */
export function nudgeChipBody(chip: NudgeChip, target: NudgeTarget): string {
  const { activityType: type, sourceName: source, dayLabel: day } = target;
  const text = (() => {
    if (chip === "gentle") {
      if (type === "workout")
        return `${source ?? "Your workout"} is waiting. Can you fit it in soon?`;
      if (type === "meal")
        return `${source ?? "This meal"} wasn't logged${day ? ` on ${day}` : ""}. Can you add it, even roughly?`;
      return "Your check-in is waiting. Can you send it when you get a moment?";
    }
    if (chip === "check_in") {
      if (type === "workout")
        return "How is training going? Is anything getting in the way?";
      if (type === "meal")
        return "How are meals going? Is anything making logging hard?";
      return "How is the week going? Your check-in helps me plan the next one.";
    }
    if (type === "workout")
      return `Want to move ${source ?? "your workout"} to another day? Tell me what works.`;
    if (type === "meal")
      return "Would a different meal time suit you better? Tell me what works.";
    return "Want to move your check-in to another day? Tell me what works.";
  })();
  return text.slice(0, NUDGE_BODY_MAX);
}

/** Early link check so the sheet can say so; the server stays the judge. */
export function bodyLooksLikeLink(body: string): boolean {
  return /(?:[a-z][a-z0-9+.-]*:\/\/|\bmailto:|\btel:|\bwww\.|\b[a-z0-9-]+\.(?:com|in|org|net|io|co|me|ly|app|link|to)\b)/i.test(
    body,
  );
}

export type NudgePreState =
  | { kind: "ready" }
  | { kind: "quiet_hours"; localTime: string; endsAt: string }
  | { kind: "push_off" }
  | { kind: "reminders_paused" };

/**
 * What the sheet can tell before Send, from the client's responsiveness read
 * (push preference, paused reminders, quiet hours). A missing token or OS
 * permission is only known after sending (the response says `push_off`).
 */
export function nudgePreState(
  info: Pick<
    ResponsivenessResponse,
    "label" | "pushEnabled" | "quietHoursStart" | "quietHoursEnd"
  > | null,
  clientTimeZone: string | null,
  now: Date = new Date(),
): NudgePreState {
  if (!info) return { kind: "ready" };
  if (info.label === "reminders_paused") return { kind: "reminders_paused" };
  if (info.pushEnabled === false) return { kind: "push_off" };
  if (clientTimeZone) {
    let local: string | null = null;
    try {
      local = localTimeHhMm(now.toISOString(), clientTimeZone);
    } catch {
      local = null;
    }
    const end = info.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END;
    if (
      local &&
      isWithinQuietHours({
        localTimeHhMm: local,
        quietHoursStart: info.quietHoursStart ?? DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: end,
      })
    ) {
      return {
        kind: "quiet_hours",
        localTime: formatHhMmTime(local),
        endsAt: formatHhMmTime(end),
      };
    }
  }
  return { kind: "ready" };
}

/** TM-04c line. */
export function quietHoursLine(
  first: string,
  state: { localTime: string; endsAt: string },
): string {
  return `It's ${state.localTime} for ${first}, inside their quiet hours. The push arrives at ${state.endsAt}.`;
}

/** TM-04o line (push off). */
export function pushOffLine(first: string): string {
  return `${first} has turned off FitBud notifications. They'll see this the next time they open the app.`;
}

/** D-W12-10: reminders paused. */
export function remindersPausedLine(first: string): string {
  return `${first} has paused reminders. They'll see this in FitBud, without a notification.`;
}

/** TM-04n line; `at` is the stored nudge's send time when the server returned it. */
export function nudgeLimitLine(first: string, at: string | null): string {
  const when = at ? formatClockTime(at) : "";
  return when
    ? `You nudged ${first} about this at ${when}. You can nudge again tomorrow.`
    : `You can nudge ${first} again tomorrow.`;
}

export type NudgeOutcome =
  | { kind: "sent"; toast: string }
  | { kind: "held"; toast: string }
  | { kind: "inbox"; toast: string }
  | { kind: "limit"; line: string };

/** What a successful (200) response means for the sheet. */
export function nudgeOutcome(
  response: NudgeActivityResponse,
  first: string,
): NudgeOutcome {
  if (response.deduped) {
    return {
      kind: "limit",
      line: nudgeLimitLine(first, response.nudgedAt ?? null),
    };
  }
  if (response.delivery === "inbox") {
    return {
      kind: "inbox",
      toast:
        response.inboxReason === "reminders_paused"
          ? `Nudge sent to ${first}'s inbox. Reminders are paused`
          : `Nudge sent to ${first}'s inbox. Push is off`,
    };
  }
  if (response.deferredForQuietHours) {
    const end = response.quietHoursEnd
      ? formatHhMmTime(response.quietHoursEnd)
      : null;
    return {
      kind: "held",
      toast: end
        ? `Nudge sent. The push arrives at ${end}`
        : "Nudge sent. The push arrives after quiet hours",
    };
  }
  return { kind: "sent", toast: `Nudge sent to ${first}` };
}
