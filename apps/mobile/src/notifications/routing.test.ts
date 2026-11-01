import { describe, expect, it } from "vitest";
import type { NotificationType, PushPayload } from "@fitbud/contracts";
import {
  deepLinkFromNotificationPayload,
  notificationAudience,
  TRAINEE_NOTIFICATION_TYPES,
  TRAINER_NOTIFICATION_TYPES,
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

  describe("trainer types (X4g)", () => {
    const route = (
      notificationType: NotificationType,
      domainEntityType: PushPayload["domainEntityType"],
    ) =>
      deepLinkFromNotificationPayload({
        ...base,
        notificationType,
        domainEntityType,
      });

    it("check-in submitted opens the check-in review", () => {
      expect(route("trainer_checkin_submitted", "checkin")?.trainerRoute).toEqual({
        kind: "checkin",
        checkinId: base.domainEntityId,
      });
    });

    it("intake submitted and meal times changed open the client", () => {
      for (const type of [
        "trainer_intake_submitted",
        "trainer_meal_times_changed",
      ] as const) {
        expect(route(type, "coaching_relationship")?.trainerRoute, type).toEqual({
          kind: "client",
          relationshipId: base.domainEntityId,
        });
      }
    });

    it("ask opens by ask id (the client is resolved from the server)", () => {
      expect(
        route("trainer_ask_coach", "coaching_relationship")?.trainerRoute,
      ).toEqual({ kind: "ask", askId: base.domainEntityId });
    });

    it("never reads a mismatched entity type as a client or check-in id", () => {
      expect(
        route("trainer_checkin_submitted", "coaching_relationship")?.trainerRoute,
      ).toEqual({ kind: "attention" });
      expect(
        route("trainer_intake_submitted", "checkin")?.trainerRoute,
      ).toEqual({ kind: "attention" });
    });

    it("every trainer type has a route and trainee types have none", () => {
      for (const type of TRAINER_NOTIFICATION_TYPES) {
        const link = route(type, entityFor(type));
        expect(link?.trainerRoute, type).not.toBeNull();
        expect(notificationAudience(type)).toBe("trainer");
      }
      for (const type of TRAINEE_NOTIFICATION_TYPES) {
        expect(route(type, entityFor(type))?.trainerRoute, type).toBeNull();
        expect(notificationAudience(type)).toBe("trainee");
      }
    });

    it("trainee and trainer allow-lists do not overlap; digest/renewal/admin route nowhere", () => {
      for (const type of TRAINER_NOTIFICATION_TYPES) {
        expect(TRAINEE_NOTIFICATION_TYPES).not.toContain(type);
      }
      for (const type of [
        "trainer_critical_digest",
        "trainer_renewal",
        "admin_whatsapp_budget",
      ] as const) {
        expect(notificationAudience(type)).toBeNull();
      }
    });
  });
});
