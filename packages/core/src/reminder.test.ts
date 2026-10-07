import { describe, expect, it } from "vitest";
import {
  buildSafePushPayload,
  isCheckinReminderEligible,
  isMealReminderEligible,
  isWithinQuietHours,
  isWorkoutReminderEligible,
  pushPayloadContainsSensitiveKeys,
  pushPayloadHasOnlySafeKeys,
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

  it("treats due workouts without completion as eligible", () => {
    expect(
      isWorkoutReminderEligible({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowStartsAt: "2026-09-26T06:00:00.000Z",
        windowEndsAt: "2026-09-26T20:00:00.000Z",
        executionStatus: null,
      }),
    ).toBe(true);
    expect(
      isWorkoutReminderEligible({
        nowIso: "2026-09-26T10:00:00.000Z",
        windowStartsAt: "2026-09-26T06:00:00.000Z",
        windowEndsAt: "2026-09-26T20:00:00.000Z",
        executionStatus: "completed",
      }),
    ).toBe(false);
  });

  it("treats pending/overdue meals without compliance as eligible", () => {
    expect(
      isMealReminderEligible({
        nowIso: "2026-09-26T13:00:00.000Z",
        windowStartsAt: "2026-09-26T12:00:00.000Z",
        windowEndsAt: "2026-09-26T14:00:00.000Z",
        complianceOutcome: null,
        loggedAt: null,
      }),
    ).toBe(true);
    expect(
      isMealReminderEligible({
        nowIso: "2026-09-26T13:00:00.000Z",
        windowStartsAt: "2026-09-26T12:00:00.000Z",
        windowEndsAt: "2026-09-26T14:00:00.000Z",
        complianceOutcome: "confirmed",
        loggedAt: "2026-09-26T12:30:00.000Z",
      }),
    ).toBe(false);
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
