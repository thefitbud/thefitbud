import { describe, expect, it } from "vitest";
import {
  ACTIVITY_NUDGE_HOURLY_LIMIT,
  DAILY_SUMMARY_CAP_LOCAL_TIME,
  DEFAULT_QUIET_HOURS_END,
  DEFAULT_QUIET_HOURS_START,
  MEAL_REMINDER_AFTER_MINUTES,
  WORKOUT_FALLBACK_ANCHOR,
  WORKOUT_REMINDER_OFFSET_MINUTES,
  WORKOUT_REMINDER_SLOT,
  activityNudgeDedupeKey,
  buildSafePushPayload,
  deferredReminderDedupeKey,
  dueMealReminderPhases,
  dueWorkoutReminderTimes,
  isActivityUnresolved,
  isCheckinReminderEligible,
  isDailySummaryClockDue,
  isWithinQuietHours,
  pushPayloadContainsSensitiveKeys,
  pushPayloadHasOnlySafeKeys,
  reminderDeliveryDecision,
  reminderDedupeKey,
  routeTargetFromPushPayload,
} from "./reminder.js";

describe("reminder eligibility and payload safety", () => {
  it("builds stable dedupe keys per type and entity", () => {
    expect(
      reminderDedupeKey({
        type: "checkin_reminder",
        domainEntityId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toBe("checkin_reminder:11111111-1111-4111-8111-111111111111");
  });

  it("uses v2 workout and meal clocks", () => {
    expect(WORKOUT_REMINDER_OFFSET_MINUTES).toBe(75);
    expect(WORKOUT_FALLBACK_ANCHOR).toBe("18:00");
    expect(MEAL_REMINDER_AFTER_MINUTES).toBe(40);
    expect(DAILY_SUMMARY_CAP_LOCAL_TIME).toBe("21:30");
    expect(DEFAULT_QUIET_HOURS_START).toBe("22:00");
    expect(DEFAULT_QUIET_HOURS_END).toBe("07:00");
    expect(ACTIVITY_NUDGE_HOURLY_LIMIT).toBe(3);

    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T15:00:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual([]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T16:45:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual([WORKOUT_REMINDER_SLOT]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T16:45:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: true,
      }),
    ).toEqual([]);
  });

  it("fires meal reminders 40 minutes after slot time", () => {
    const windowEndsAt = "2026-10-11T00:00:00.000Z";
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T08:39:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual([]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T08:40:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual(["after"]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T08:40:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: true,
        windowEndsAt,
      }),
    ).toEqual([]);
  });

  it("opens the daily summary at 21:30 local by default", () => {
    expect(
      isDailySummaryClockDue({
        nowIso: "2026-10-10T21:29:00.000Z",
        timeZone: "UTC",
      }),
    ).toBe(false);
    expect(
      isDailySummaryClockDue({
        nowIso: "2026-10-10T21:30:00.000Z",
        timeZone: "UTC",
      }),
    ).toBe(true);
    expect(
      reminderDeliveryDecision({
        categoryEnabled: false,
        withinQuietHours: true,
      }),
    ).toBe("suppress");
    expect(
      reminderDeliveryDecision({
        categoryEnabled: true,
        withinQuietHours: true,
      }),
    ).toBe("defer");
    const deliveryKey = reminderDedupeKey({
      type: "checkin_reminder",
      domainEntityId: "11111111-1111-4111-8111-111111111111",
    });
    expect(deferredReminderDedupeKey(deliveryKey)).toBe(`deferred:${deliveryKey}`);
    expect(
      isActivityUnresolved({
        activityType: "workout",
        workoutExecutionStatus: "skipped",
        mealLogged: false,
        checkinRecordStatus: null,
      }),
    ).toBe(false);
    expect(activityNudgeDedupeKey("abc", "2026-10-10")).toBe(
      "activity_nudge:abc:2026-10-10",
    );
  });

  it("treats due and overdue draft check-ins as eligible", () => {
    expect(
      isCheckinReminderEligible({
        nowIso: "2026-09-26T12:00:00.000Z",
        windowStartsAt: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T22:00:00.000Z",
        recordStatus: "draft",
        hasReview: false,
      }),
    ).toBe(true);
  });

  it("detects overnight quiet hours when configured", () => {
    expect(
      isWithinQuietHours({
        localTimeHhMm: "23:30",
        quietHoursStart: DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: DEFAULT_QUIET_HOURS_END,
      }),
    ).toBe(true);
    expect(
      isWithinQuietHours({
        localTimeHhMm: "08:00",
        quietHoursStart: DEFAULT_QUIET_HOURS_START,
        quietHoursEnd: DEFAULT_QUIET_HOURS_END,
      }),
    ).toBe(false);
  });

  it("allows only routing fields in push payloads", () => {
    const payload = buildSafePushPayload({
      notificationId: "11111111-1111-4111-8111-111111111111",
      notificationType: "workout_reminder",
      domainEntityType: "workout_assignment",
      domainEntityId: "22222222-2222-4222-8222-222222222222",
      createdAt: "2026-09-26T00:00:00.000Z",
    });
    expect(pushPayloadHasOnlySafeKeys(payload)).toBe(true);
    expect(
      pushPayloadContainsSensitiveKeys({
        ...payload,
        trainerNote: "secret",
      }),
    ).toBe(true);
    expect(routeTargetFromPushPayload(payload)).toEqual({
      tab: "workout",
      domainEntityType: "workout_assignment",
      domainEntityId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
