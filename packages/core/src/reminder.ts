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

/** Reminder engine v2 (§3.6) — system clocks; trainers only enable categories. */
export const WORKOUT_REMINDER_OFFSET_MINUTES = 75;
export const WORKOUT_FALLBACK_ANCHOR = "18:00";
export const MEAL_REMINDER_AFTER_MINUTES = 40;
export const MEAL_REMINDER_SNOOZE_MINUTES = 30;
export const DAILY_SUMMARY_CAP_LOCAL_TIME = "21:30";
export const HARD_STOP_LOCAL_TIME = "22:00";
export const DEFAULT_QUIET_HOURS_START = "22:00";
export const DEFAULT_QUIET_HOURS_END = "07:00";
export const DAILY_PUSH_CAP = 5;
export const REMINDER_MERGE_WINDOW_MINUTES = 30;
export const ACTIVITY_NUDGE_HOURLY_LIMIT = 3;
export const ACTIVITY_NUDGE_ITEM_COOLDOWN_HOURS = 4;

export type MealReminderPhase = "after" | "snooze";
export type WorkoutReminderLocalTime = "primary";
export const WORKOUT_REMINDER_SLOT: WorkoutReminderLocalTime = "primary";
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
    case "checkin_reviewed":
      return "checkin";
    case "plan_published":
    case "coach_answered":
    case "reminders_paused":
    case "relationship_ended":
    case "trainer_note_shared":
    case "reactivation_requested":
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_critical_digest":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "admin_whatsapp_budget":
      return "coaching_relationship";
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
    case "plan_published":
    case "checkin_reviewed":
    case "coach_answered":
    case "reminders_paused":
    case "relationship_ended":
    case "trainer_note_shared":
    case "reactivation_requested":
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_critical_digest":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "admin_whatsapp_budget":
      return null;
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

export type ReminderBackoffMode =
  | "normal"
  | "self_logger"
  | "soft_ignorer"
  | "paused"
  | "push_failed";

/** Higher priority reminders are delivered first when the daily push cap applies. */
export function reminderDeliveryPriority(type: NotificationType): number {
  switch (type) {
    case "activity_nudge":
      return 0;
    case "meal_reminder":
      return 1;
    case "workout_reminder":
      return 2;
    case "checkin_reminder":
      return 3;
    case "daily_summary":
      return 4;
    case "subscription_renewal_reminder":
      return 5;
    case "plan_published":
    case "checkin_reviewed":
    case "coach_answered":
    case "reminders_paused":
    case "relationship_ended":
    case "trainer_note_shared":
    case "reactivation_requested":
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_critical_digest":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "admin_whatsapp_budget":
      return 10;
    default:
      return 9;
  }
}

export function shouldSkipReminderForBackoff(input: {
  mode: ReminderBackoffMode | string;
  preferenceType: ReminderType | null;
  pausedUntil?: string | null;
  nowIso: string;
  softIgnorerSkipTick?: boolean;
}): boolean {
  if (input.mode === "paused") {
    if (input.pausedUntil && input.pausedUntil > input.nowIso) {
      return true;
    }
  }
  if (input.mode === "push_failed") return true;
  if (input.mode === "self_logger") {
    return (
      input.preferenceType === "meal_reminder" ||
      input.preferenceType === "workout_reminder"
    );
  }
  if (input.mode === "soft_ignorer" && input.softIgnorerSkipTick) {
    return input.preferenceType !== null;
  }
  return false;
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
 * Timed meals: one reminder MEAL_REMINDER_AFTER_MINUTES after the slot time.
 * Meals without a local time have no clock reminder.
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
  const afterClock = addMinutesToLocalClock({
    localDate: input.localDate,
    localTime: input.localTime,
    deltaMinutes: MEAL_REMINDER_AFTER_MINUTES,
  });
  const afterAt = localClockToUtcIso({
    ...afterClock,
    timeZone: input.timeZone,
  });
  const snoozeClock = addMinutesToLocalClock({
    localDate: input.localDate,
    localTime: input.localTime,
    deltaMinutes: MEAL_REMINDER_AFTER_MINUTES + MEAL_REMINDER_SNOOZE_MINUTES,
  });
  const snoozeAt = localClockToUtcIso({
    ...snoozeClock,
    timeZone: input.timeZone,
  });
  if (input.nowIso > input.windowEndsAt) return [];
  if (input.nowIso < afterAt) return [];
  if (input.nowIso >= snoozeAt) {
    return ["snooze"];
  }
  return ["after"];
}

/** Workout reminder WORKOUT_REMINDER_OFFSET_MINUTES before the anchor start time. */
export function dueWorkoutReminderTimes(input: {
  nowIso: string;
  assignmentLocalDate: string;
  timeZone: string;
  resolved: boolean;
  workoutStartLocalTime?: string | null;
}): WorkoutReminderLocalTime[] {
  if (input.resolved) return [];
  const today = formatLocalDate(new Date(input.nowIso), input.timeZone);
  if (today !== input.assignmentLocalDate) return [];
  const anchor = input.workoutStartLocalTime ?? WORKOUT_FALLBACK_ANCHOR;
  const reminderClock = addMinutesToLocalClock({
    localDate: input.assignmentLocalDate,
    localTime: anchor,
    deltaMinutes: -WORKOUT_REMINDER_OFFSET_MINUTES,
  });
  const reminderAt = localClockToUtcIso({
    ...reminderClock,
    timeZone: input.timeZone,
  });
  if (input.nowIso >= reminderAt) {
    return [WORKOUT_REMINDER_SLOT];
  }
  return [];
}

/** End-of-day summary at min(lastMeal+60, 21:30) trainee-local. */
export function isAtOrAfterHardStopLocal(
  nowIso: string,
  timeZone: string,
): boolean {
  const local = localTimeHhMm(nowIso, timeZone);
  if (local === null) return false;
  return local >= HARD_STOP_LOCAL_TIME;
}

export function isDailySummaryClockDue(input: {
  nowIso: string;
  timeZone: string;
  lastMealLocalTime?: string | null;
}): boolean {
  if (isAtOrAfterHardStopLocal(input.nowIso, input.timeZone)) return false;
  const local = localTimeHhMm(input.nowIso, input.timeZone);
  if (local === null) return false;
  let target = DAILY_SUMMARY_CAP_LOCAL_TIME;
  if (input.lastMealLocalTime) {
    const plus60 = addMinutesToLocalClock({
      localDate: formatLocalDate(new Date(input.nowIso), input.timeZone),
      localTime: input.lastMealLocalTime,
      deltaMinutes: 60,
    }).localTime;
    target = plus60 < DAILY_SUMMARY_CAP_LOCAL_TIME ? plus60 : DAILY_SUMMARY_CAP_LOCAL_TIME;
  }
  return local >= target;
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
  if (start === end) return false;
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
    case "plan_published":
    case "checkin_reviewed":
    case "coach_answered":
    case "reminders_paused":
    case "relationship_ended":
    case "trainer_note_shared":
    case "reactivation_requested":
    case "trainer_ask_coach":
    case "trainer_checkin_submitted":
    case "trainer_intake_submitted":
    case "trainer_critical_digest":
    case "trainer_renewal":
    case "trainer_meal_times_changed":
    case "admin_whatsapp_budget":
      return { tab: "today", ...target };
  }
}
