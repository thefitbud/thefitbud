import type {
  NotificationDomainEntityType,
  NotificationType,
  PushPayload,
  ReminderType,
  WorkoutExecutionStatus,
} from "@fitbud/contracts";
import {
  SAFE_PUSH_PAYLOAD_KEYS,
  pushPayloadSchema,
} from "@fitbud/contracts";
import { deriveCheckinStatus } from "./checkin.js";
import { addDaysToLocalDate, isQualifyingWorkoutExecution } from "./workout.js";
import { formatLocalDate, localDateTimeToUtcIso } from "./timezone.js";

/**
 * System reminder clocks. Trainers enable or disable types.
 * They do not set these times.
 */
export const MEAL_REMINDER_ADVANCE_MINUTES = 45;
export const MEAL_REMINDER_FOLLOW_UP_MINUTES = [30, 60] as const;
export const WORKOUT_REMINDER_LOCAL_TIMES = ["06:00", "18:00"] as const;
export const DAILY_SUMMARY_LOCAL_TIME = "21:00";
export const ACTIVITY_NUDGE_HOURLY_LIMIT = 3;

export type MealReminderPhase = "advance" | "follow_up_30" | "follow_up_60";
export type WorkoutReminderLocalTime =
  (typeof WORKOUT_REMINDER_LOCAL_TIMES)[number];
export type ReminderDeliveryDecision = "deliver" | "defer" | "suppress";
export type NudgeActivityType = "workout" | "meal" | "checkin";

export const DEFAULT_REMINDER_TYPES: readonly ReminderType[] = [
  "workout_reminder",
  "meal_reminder",
  "checkin_reminder",
  "subscription_renewal_reminder",
] as const;

/** Stable dedupe key so retries cannot create duplicate user-visible reminders. */
export function reminderDedupeKey(input: {
  type: NotificationType;
  domainEntityId: string;
}): string {
  return `${input.type}:${input.domainEntityId}`;
}

export function mealReminderDedupeKey(
  assignmentId: string,
  phase: MealReminderPhase,
): string {
  return `meal_reminder:${assignmentId}:${phase}`;
}

export function workoutReminderDedupeKey(
  assignmentId: string,
  localTime: WorkoutReminderLocalTime,
): string {
  return `workout_reminder:${assignmentId}:${localTime}`;
}

export function dailySummaryDedupeKey(
  relationshipId: string,
  localDate: string,
): string {
  return `daily_summary:${relationshipId}:${localDate}`;
}

export function activityNudgeDedupeKey(
  activityId: string,
  traineeLocalDate: string,
): string {
  return `activity_nudge:${activityId}:${traineeLocalDate}`;
}

/** Deferred rows must not occupy the delivery dedupe key. */
export function deferredReminderDedupeKey(deliveryDedupeKey: string): string {
  return `deferred:${deliveryDedupeKey}`;
}

export function deliveryDedupeKeyFromDeferred(
  deferredKey: string,
): string | null {
  const prefix = "deferred:";
  if (!deferredKey.startsWith(prefix)) return null;
  const logical = deferredKey.slice(prefix.length);
  if (!logical || logical.startsWith("deferred:")) return null;
  return logical;
}

export function localDateFromDailySummaryKey(dedupeKey: string): string | null {
  const match = /^daily_summary:[0-9a-f-]{36}:(\d{4}-\d{2}-\d{2})$/i.exec(
    dedupeKey,
  );
  return match?.[1] ?? null;
}

export function domainEntityTypeForReminder(
  type: NotificationType,
  activityType?: NudgeActivityType,
): NotificationDomainEntityType {
  switch (type) {
    case "workout_reminder":
      return "workout_assignment";
    case "meal_reminder":
      return "meal_assignment";
    case "checkin_reminder":
      return "checkin";
    case "subscription_renewal_reminder":
    case "daily_summary":
      return "coaching_relationship";
    case "activity_nudge":
      return domainEntityTypeForActivity(activityType ?? "checkin");
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

export function domainEntityTypeForActivity(
  activityType: NudgeActivityType,
): NotificationDomainEntityType {
  switch (activityType) {
    case "workout":
      return "workout_assignment";
    case "meal":
      return "meal_assignment";
    case "checkin":
      return "checkin";
    default: {
      const _exhaustive: never = activityType;
      return _exhaustive;
    }
  }
}

export function reminderPreferenceForActivity(
  activityType: NudgeActivityType,
): ReminderType {
  switch (activityType) {
    case "workout":
      return "workout_reminder";
    case "meal":
      return "meal_reminder";
    case "checkin":
      return "checkin_reminder";
    default: {
      const _exhaustive: never = activityType;
      return _exhaustive;
    }
  }
}

/**
 * Preference category used at delivery time.
 * Daily summary uses push enablement; the item mix was chosen when it was created.
 */
export function reminderPreferenceForNotification(input: {
  notificationType: NotificationType;
  domainEntityType: NotificationDomainEntityType;
}): ReminderType | "daily_summary" | null {
  switch (input.notificationType) {
    case "workout_reminder":
    case "meal_reminder":
    case "checkin_reminder":
    case "subscription_renewal_reminder":
      return input.notificationType;
    case "daily_summary":
      return "daily_summary";
    case "activity_nudge":
      if (input.domainEntityType === "workout_assignment") {
        return "workout_reminder";
      }
      if (input.domainEntityType === "meal_assignment") return "meal_reminder";
      if (input.domainEntityType === "checkin") return "checkin_reminder";
      return null;
    default: {
      const _exhaustive: never = input.notificationType;
      return _exhaustive;
    }
  }
}

export function isWorkoutResolved(
  executionStatus: WorkoutExecutionStatus | null,
): boolean {
  return (
    executionStatus !== null && isQualifyingWorkoutExecution(executionStatus)
  );
}

export function isActivityUnresolved(input: {
  activityType: NudgeActivityType;
  workoutExecutionStatus: WorkoutExecutionStatus | null;
  mealLogged: boolean;
  checkinRecordStatus: "draft" | "submitted" | null;
}): boolean {
  switch (input.activityType) {
    case "workout":
      return !isWorkoutResolved(input.workoutExecutionStatus);
    case "meal":
      return !input.mealLogged;
    case "checkin":
      return input.checkinRecordStatus === "draft";
    default: {
      const _exhaustive: never = input.activityType;
      return _exhaustive;
    }
  }
}

/**
 * Category-off is a final suppression. Quiet hours defer and leave the
 * delivery dedupe key free so the same reminder can send later.
 */
export function reminderDeliveryDecision(input: {
  categoryEnabled: boolean;
  withinQuietHours: boolean;
}): ReminderDeliveryDecision {
  if (!input.categoryEnabled) return "suppress";
  if (input.withinQuietHours) return "defer";
  return "deliver";
}

export function addMinutesToLocalClock(input: {
  localDate: string;
  localTime: string;
  deltaMinutes: number;
}): { localDate: string; localTime: string } {
  const [hour, minute] = input.localTime.split(":").map(Number);
  if (
    hour === undefined ||
    minute === undefined ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    throw new Error("Invalid local time");
  }
  let total = hour * 60 + minute + input.deltaMinutes;
  let dayOffset = 0;
  while (total < 0) {
    total += 24 * 60;
    dayOffset -= 1;
  }
  while (total >= 24 * 60) {
    total -= 24 * 60;
    dayOffset += 1;
  }
  return {
    localDate: addDaysToLocalDate(input.localDate, dayOffset),
    localTime: `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`,
  };
}

export function localClockToUtcIso(input: {
  localDate: string;
  localTime: string;
  timeZone: string;
}): string {
  const [hour, minute] = input.localTime.split(":").map(Number);
  return localDateTimeToUtcIso(
    input.localDate,
    input.timeZone,
    hour ?? 0,
    minute ?? 0,
    0,
  );
}

/**
 * Timed meals: one advance before localTime, then follow-ups while unlogged.
 * A meal with no localTime has no clock reminder. New slots stop at the
 * confirmation window; a quiet-hours deferral can still be delivered later.
 */
export function dueMealReminderPhases(input: {
  nowIso: string;
  localDate: string;
  timeZone: string;
  localTime: string | null;
  logged: boolean;
  windowEndsAt: string;
}): MealReminderPhase[] {
  if (input.logged || !input.localTime) return [];
  const mealClock = {
    localDate: input.localDate,
    localTime: input.localTime,
  };
  const phases: MealReminderPhase[] = [];
  const advanceClock = addMinutesToLocalClock({
    ...mealClock,
    deltaMinutes: -MEAL_REMINDER_ADVANCE_MINUTES,
  });
  const mealAt = localClockToUtcIso({
    ...mealClock,
    timeZone: input.timeZone,
  });
  const advanceAt = localClockToUtcIso({
    ...advanceClock,
    timeZone: input.timeZone,
  });
  if (input.nowIso >= advanceAt && input.nowIso < mealAt) {
    phases.push("advance");
  }
  for (const minutes of MEAL_REMINDER_FOLLOW_UP_MINUTES) {
    const clock = addMinutesToLocalClock({
      ...mealClock,
      deltaMinutes: minutes,
    });
    const at = localClockToUtcIso({ ...clock, timeZone: input.timeZone });
    if (input.nowIso >= at && input.nowIso <= input.windowEndsAt) {
      phases.push(minutes === 30 ? "follow_up_30" : "follow_up_60");
    }
  }
  return phases;
}

/** Unlogged workout on its local date, at or after 06:00 and 18:00. */
export function dueWorkoutReminderTimes(input: {
  nowIso: string;
  assignmentLocalDate: string;
  timeZone: string;
  resolved: boolean;
}): WorkoutReminderLocalTime[] {
  if (input.resolved) return [];
  const today = formatLocalDate(new Date(input.nowIso), input.timeZone);
  if (today !== input.assignmentLocalDate) return [];
  const local = localTimeHhMm(input.nowIso, input.timeZone);
  if (!local) return [];
  return WORKOUT_REMINDER_LOCAL_TIMES.filter((slot) => local >= slot);
}

/** Final daily summary once the trainee-local clock reaches 21:00. */
export function isDailySummaryClockDue(input: {
  nowIso: string;
  timeZone: string;
}): boolean {
  const local = localTimeHhMm(input.nowIso, input.timeZone);
  return local !== null && local >= DAILY_SUMMARY_LOCAL_TIME;
}

/** Check-in reminder when due or overdue and not yet submitted. */
export function isCheckinReminderEligible(input: {
  nowIso: string;
  windowStartsAt: string;
  windowEndsAt: string;
  recordStatus: "draft" | "submitted";
  hasReview: boolean;
}): boolean {
  if (input.recordStatus !== "draft") return false;
  const status = deriveCheckinStatus({
    nowIso: input.nowIso,
    windowStartsAt: input.windowStartsAt,
    windowEndsAt: input.windowEndsAt,
    recordStatus: input.recordStatus,
    hasReview: input.hasReview,
  });
  return status === "due" || status === "overdue";
}

export function isCategoryEnabled(input: {
  pushEnabled: boolean;
  categories: {
    workoutReminder: boolean;
    mealReminder: boolean;
    checkinReminder: boolean;
    subscriptionRenewalReminder: boolean;
  };
  type: ReminderType;
}): boolean {
  if (!input.pushEnabled) return false;
  switch (input.type) {
    case "workout_reminder":
      return input.categories.workoutReminder;
    case "meal_reminder":
      return input.categories.mealReminder;
    case "checkin_reminder":
      return input.categories.checkinReminder;
    case "subscription_renewal_reminder":
      return input.categories.subscriptionRenewalReminder;
    default: {
      const _exhaustive: never = input.type;
      return _exhaustive;
    }
  }
}

/** Format local HH:MM for a UTC instant in the given IANA timezone. */
export function localTimeHhMm(
  nowUtcIso: string,
  timezone: string,
): string | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(new Date(nowUtcIso));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    if (!hour || !minute) return null;
    return `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  } catch {
    return null;
  }
}

/** HH:MM local time inside quiet hours (supports overnight ranges). */
export function isWithinQuietHours(input: {
  localTimeHhMm: string;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
}): boolean {
  if (!input.quietHoursStart || !input.quietHoursEnd) return false;
  const current = input.localTimeHhMm;
  const start = input.quietHoursStart;
  const end = input.quietHoursEnd;
  if (start === end) return true;
  if (start < end) {
    return current >= start && current < end;
  }
  return current >= start || current < end;
}

/**
 * Build routing-only push payload. Rejects any extra or sensitive keys.
 */
export function buildSafePushPayload(input: {
  notificationId: string;
  notificationType: NotificationType;
  domainEntityType: NotificationDomainEntityType;
  domainEntityId: string;
  createdAt: string;
}): PushPayload {
  return pushPayloadSchema.parse({
    notificationId: input.notificationId,
    notificationType: input.notificationType,
    domainEntityType: input.domainEntityType,
    domainEntityId: input.domainEntityId,
    createdAt: input.createdAt,
  });
}

/** True when an object contains only the allowed routing fields. */
export function pushPayloadHasOnlySafeKeys(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload);
  if (keys.length !== SAFE_PUSH_PAYLOAD_KEYS.length) return false;
  return keys.every((key) =>
    (SAFE_PUSH_PAYLOAD_KEYS as readonly string[]).includes(key),
  );
}

const FORBIDDEN_PAYLOAD_SUBSTRINGS = [
  "note",
  "intake",
  "measurement",
  "photo",
  "rpe",
  "weight",
  "answer",
  "body",
  "message",
  "instruction",
] as const;

export function pushPayloadContainsSensitiveKeys(
  payload: Record<string, unknown>,
): boolean {
  return Object.keys(payload).some((key) => {
    const lower = key.toLowerCase();
    if ((SAFE_PUSH_PAYLOAD_KEYS as readonly string[]).includes(key)) {
      return false;
    }
    return FORBIDDEN_PAYLOAD_SUBSTRINGS.some((part) => lower.includes(part));
  });
}

/**
 * Mobile deep-link target from a validated routing payload.
 * Clients must refetch authoritative state after navigation — payload is not state.
 */
export function routeTargetFromPushPayload(payload: PushPayload): {
  tab: "workout" | "diet" | "today";
  domainEntityType: NotificationDomainEntityType;
  domainEntityId: string;
} {
  const target = {
    domainEntityType: payload.domainEntityType,
    domainEntityId: payload.domainEntityId,
  };
  switch (payload.notificationType) {
    case "workout_reminder":
      return { tab: "workout", ...target };
    case "meal_reminder":
      return { tab: "diet", ...target };
    case "checkin_reminder":
    case "subscription_renewal_reminder":
    case "daily_summary":
      return { tab: "today", ...target };
    case "activity_nudge":
      if (payload.domainEntityType === "workout_assignment") {
        return { tab: "workout", ...target };
      }
      if (payload.domainEntityType === "meal_assignment") {
        return { tab: "diet", ...target };
      }
      return { tab: "today", ...target };
    default: {
      const _exhaustive: never = payload.notificationType;
      return _exhaustive;
    }
  }
}
