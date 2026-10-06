import type {
  NotificationDomainEntityType,
  NotificationType,
  PushPayload,
} from "@fitbud/contracts";
import {
  SAFE_PUSH_PAYLOAD_KEYS,
  pushPayloadSchema,
} from "@fitbud/contracts";
import { deriveCheckinStatus } from "./checkin.js";
import { deriveMealAssignmentStatus } from "./meal.js";
import {
  deriveWorkoutAssignmentStatus,
  isQualifyingWorkoutExecution,
} from "./workout.js";
import type { WorkoutExecutionStatus } from "@fitbud/contracts";
import type { MealComplianceOutcome } from "@fitbud/contracts";

export const DEFAULT_REMINDER_TYPES: readonly NotificationType[] = [
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

export function domainEntityTypeForReminder(
  type: NotificationType,
): NotificationDomainEntityType {
  switch (type) {
    case "workout_reminder":
      return "workout_assignment";
    case "meal_reminder":
      return "meal_assignment";
    case "checkin_reminder":
      return "checkin";
    case "subscription_renewal_reminder":
      return "coaching_relationship";
    default: {
      const _exhaustive: never = type;
      return _exhaustive;
    }
  }
}

/**
 * Workout reminder when the window has opened and there is no qualifying completion.
 * Missed after window end is still eligible once (deduped) so trainees get one nudge.
 */
export function isWorkoutReminderEligible(input: {
  nowIso: string;
  windowStartsAt: string;
  windowEndsAt: string;
  executionStatus: WorkoutExecutionStatus | null;
}): boolean {
  if (input.nowIso < input.windowStartsAt) return false;
  if (
    input.executionStatus &&
    isQualifyingWorkoutExecution(input.executionStatus)
  ) {
    return false;
  }
  const status = deriveWorkoutAssignmentStatus({
    nowIso: input.nowIso,
    windowEndsAt: input.windowEndsAt,
    executionStatus: input.executionStatus,
  });
  return (
    status === "assigned" ||
    status === "in_progress" ||
    status === "paused" ||
    status === "missed"
  );
}

/** Meal reminder when the confirmation window has opened and compliance is absent. */
export function isMealReminderEligible(input: {
  nowIso: string;
  windowStartsAt: string;
  windowEndsAt: string;
  complianceOutcome: MealComplianceOutcome | null;
  loggedAt: string | null;
}): boolean {
  if (input.nowIso < input.windowStartsAt) return false;
  if (input.complianceOutcome && input.loggedAt) return false;
  const status = deriveMealAssignmentStatus({
    nowIso: input.nowIso,
    windowEndsAt: input.windowEndsAt,
    complianceOutcome: input.complianceOutcome,
    loggedAt: input.loggedAt,
  });
  return status === "pending" || status === "overdue";
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
  type: NotificationType;
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
  switch (payload.notificationType) {
    case "workout_reminder":
      return {
        tab: "workout",
        domainEntityType: payload.domainEntityType,
        domainEntityId: payload.domainEntityId,
      };
    case "meal_reminder":
      return {
        tab: "diet",
        domainEntityType: payload.domainEntityType,
        domainEntityId: payload.domainEntityId,
      };
    case "checkin_reminder":
      return {
        tab: "today",
        domainEntityType: payload.domainEntityType,
        domainEntityId: payload.domainEntityId,
      };
    case "subscription_renewal_reminder":
      return {
        tab: "today",
        domainEntityType: payload.domainEntityType,
        domainEntityId: payload.domainEntityId,
      };
    default: {
      const _exhaustive: never = payload.notificationType;
      return _exhaustive;
    }
  }
}
