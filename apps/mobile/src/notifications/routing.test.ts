import { describe, expect, it } from "vitest";
import type { NotificationType, PushPayload } from "@fitbud/contracts";
import {
  deepLinkFromNotificationPayload,
  TRAINEE_NOTIFICATION_TYPES,
} from "./routing.js";

const base = {
  notificationId: "11111111-1111-4111-8111-111111111111",
  domainEntityId: "22222222-2222-4222-8222-222222222222",
  createdAt: "2026-09-26T00:00:00.000Z",
} as const;

function entityFor(type: NotificationType): PushPayload["domainEntityType"] {
  switch (type) {
    case "workout_reminder":
      return "workout_assignment";
    case "meal_reminder":
    case "activity_nudge":
      return "meal_assignment";
    case "checkin_reminder":
    case "checkin_reviewed":
      return "checkin";
    default:
      return "coaching_relationship";
  }
}

describe("notification routing", () => {
  it("routes workout/meal/check-in opens without treating payload as state", () => {
    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "workout_reminder",
        domainEntityType: "workout_assignment",
      }),
    ).toMatchObject({
      tab: "workout",
      domainEntityType: "workout_assignment",
      domainEntityId: base.domainEntityId,
      refetchRequired: true,
      route: { type: "workout_overview", assignmentId: base.domainEntityId },
    });

    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "meal_reminder",
        domainEntityType: "meal_assignment",
      })?.route,
    ).toEqual({ type: "meal", assignmentId: base.domainEntityId });

    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
      })?.route,
    ).toEqual({ type: "checkin", checkinId: base.domainEntityId });
  });

  it("maps every trainee notification type in §4 to an exact route", () => {
    for (const notificationType of TRAINEE_NOTIFICATION_TYPES) {
      const link = deepLinkFromNotificationPayload({
        ...base,
        notificationType,
        domainEntityType: entityFor(notificationType),
      });
      expect(link, notificationType).not.toBeNull();
      expect(link!.route, notificationType).toBeTruthy();
      expect(link!.refetchRequired).toBe(true);
    }
  });

  it("opens note and reactivation routes", () => {
    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "trainer_note_shared",
        domainEntityType: "coaching_relationship",
      })?.route,
    ).toEqual({ type: "note", noteId: base.domainEntityId });

    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "reactivation_requested",
        domainEntityType: "coaching_relationship",
      })?.route,
    ).toEqual({ type: "reactivate", requestId: base.domainEntityId });
  });

  it("rejects sensitive extra payload fields", () => {
    expect(
      deepLinkFromNotificationPayload({
        ...base,
        notificationType: "checkin_reminder",
        domainEntityType: "checkin",
        answers: { wellbeing: "secret" },
      }),
    ).toBeNull();
  });
});
