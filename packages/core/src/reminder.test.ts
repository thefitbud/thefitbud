import { describe, expect, it } from "vitest";
import {
  DAILY_SUMMARY_LOCAL_TIME,
  MEAL_REMINDER_ADVANCE_MINUTES,
  WORKOUT_REMINDER_LOCAL_TIMES,
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

  it("uses the locked workout, meal, and summary clocks", () => {
    expect(WORKOUT_REMINDER_LOCAL_TIMES).toEqual(["06:00", "18:00"]);
    expect(DAILY_SUMMARY_LOCAL_TIME).toBe("21:00");
    expect(MEAL_REMINDER_ADVANCE_MINUTES).toBe(45);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T05:59:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual([]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T06:00:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual(["06:00"]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T18:00:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual(["06:00", "18:00"]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-10T18:00:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: true,
      }),
    ).toEqual([]);
    expect(
      dueWorkoutReminderTimes({
        nowIso: "2026-10-11T06:00:00.000Z",
        assignmentLocalDate: "2026-10-10",
        timeZone: "UTC",
        resolved: false,
      }),
    ).toEqual([]);
  });

  it("schedules meal advance and follow-ups only when a local time exists", () => {
    const windowEndsAt = "2026-10-11T00:00:00.000Z";
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T07:14:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual([]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T07:15:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual(["advance"]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T08:30:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual(["follow_up_30"]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T09:00:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: false,
        windowEndsAt,
      }),
    ).toEqual(["follow_up_30", "follow_up_60"]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T09:00:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: "08:00",
        logged: true,
        windowEndsAt,
      }),
    ).toEqual([]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T09:00:00.000Z",
        localDate: "2026-10-10",
        timeZone: "UTC",
        localTime: null,
        logged: false,
        windowEndsAt,
      }),
    ).toEqual([]);
    expect(
      dueMealReminderPhases({
        nowIso: "2026-10-10T23:40:00.000Z",
        localDate: "2026-10-11",
        timeZone: "UTC",
        localTime: "00:20",
        logged: false,
        windowEndsAt: "2026-10-12T00:00:00.000Z",
      }),
    ).toEqual(["advance"]);
  });

  it("opens the daily summary at 21:00 local and defers quiet hours without dropping them", () => {
    expect(
      isDailySummaryClockDue({
        nowIso: "2026-10-10T20:59:00.000Z",
        timeZone: "UTC",
      }),
    ).toBe(false);
    expect(
      isDailySummaryClockDue({
        nowIso: "2026-10-10T21:00:00.000Z",
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
    expect(deferredReminderDedupeKey(deliveryKey)).not.toBe(deliveryKey);
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
    expect(
      isCheckinReminderEligible({
        nowIso: "2026-09-26T12:00:00.000Z",
        windowStartsAt: "2026-09-26T10:00:00.000Z",
        windowEndsAt: "2026-09-26T22:00:00.000Z",
        recordStatus: "submitted",
        hasReview: false,
      }),
    ).toBe(false);
  });

  it("detects overnight quiet hours", () => {
    expect(
      isWithinQuietHours({
        localTimeHhMm: "23:30",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      }),
    ).toBe(true);
    expect(
      isWithinQuietHours({
        localTimeHhMm: "08:00",
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
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
    expect(
      routeTargetFromPushPayload(payload),
    ).toEqual({
      tab: "workout",
      domainEntityType: "workout_assignment",
      domainEntityId: "22222222-2222-4222-8222-222222222222",
    });
  });
});
