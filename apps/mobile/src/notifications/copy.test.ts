import { describe, expect, it } from "vitest";
import type { Notification } from "@fitbud/contracts";
import { notificationRowBody, notificationRowTitle } from "./copy";

const base: Notification = {
  id: "11111111-1111-4111-8111-111111111111",
  recipientUserId: "22222222-2222-4222-8222-222222222222",
  coachingRelationshipId: "33333333-3333-4333-8333-333333333333",
  type: "meal_reminder",
  notificationType: "meal_reminder",
  domainEntityType: "meal_assignment",
  domainEntityId: "44444444-4444-4444-8444-444444444444",
  state: "delivered",
  dedupeKey: "demo",
  createdAt: "2026-10-17T12:00:00.000Z",
  readAt: null,
  route: "/meal/lunch",
  routing: {
    notificationId: "11111111-1111-4111-8111-111111111111",
    notificationType: "meal_reminder",
    domainEntityType: "meal_assignment",
    domainEntityId: "44444444-4444-4444-8444-444444444444",
    createdAt: "2026-10-17T12:00:00.000Z",
  },
};

describe("notificationRowTitle", () => {
  it("uses guide copy for meal reminders", () => {
    expect(notificationRowTitle(base)).toBe("Lunch isn't logged yet");
    expect(notificationRowBody(base)).toContain("ate as planned");
  });
});
