import { describe, expect, it } from "vitest";
import { deepLinkFromNotificationPayload } from "./routing.js";

describe("notification routing", () => {
  it("routes workout/meal/check-in opens without treating payload as state", () => {
    expect(
      deepLinkFromNotificationPayload({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "workout_reminder",
        domainEntityType: "workout_assignment",
        domainEntityId: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-09-26T00:00:00.000Z",
      }),
    ).toEqual({
      tab: "workout",
      domainEntityType: "workout_assignment",
      domainEntityId: "22222222-2222-4222-8222-222222222222",
      refetchRequired: true,
    });

    expect(
      deepLinkFromNotificationPayload({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "meal_reminder",
        domainEntityType: "meal_assignment",
        domainEntityId: "33333333-3333-4333-8333-333333333333",
        createdAt: "2026-09-26T00:00:00.000Z",
      })?.tab,
    ).toBe("diet");

    expect(
      deepLinkFromNotificationPayload({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
        domainEntityId: "44444444-4444-4444-8444-444444444444",
        createdAt: "2026-09-26T00:00:00.000Z",
      })?.tab,
    ).toBe("today");
  });

  it("rejects sensitive extra payload fields", () => {
    expect(
      deepLinkFromNotificationPayload({
        notificationId: "11111111-1111-4111-8111-111111111111",
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
        domainEntityId: "44444444-4444-4444-8444-444444444444",
        createdAt: "2026-09-26T00:00:00.000Z",
        answers: { wellbeing: "secret" },
      }),
    ).toBeNull();
  });
});
