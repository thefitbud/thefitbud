import { describe, expect, it } from "vitest";
import type { Notification } from "@fitbud/contracts";
import {
  checkinPushCopy,
  mealPushCopy,
  noteBannerCopy,
  notePushCopy,
  notificationRowBody,
  notificationRowTitle,
} from "./copy";

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
    expect(notificationRowBody(base)).toBe(
      "Open it in Diet, or snooze for 30 minutes.",
    );
    expect(notificationRowBody(base)).not.toMatch(/chicken|rice|kcal/i);
    expect(mealPushCopy("Lunch", true).title).toBe(
      "You have something to log in FitBud.",
    );
  });

  it("names the coach on a check-in and a note", () => {
    const checkin = {
      ...base,
      type: "checkin_reminder" as const,
      notificationType: "checkin_reminder" as const,
    };
    const note = {
      ...base,
      type: "trainer_note_shared" as const,
      notificationType: "trainer_note_shared" as const,
    };
    expect(notificationRowTitle(checkin, { coachName: "Rahul Verma" })).toBe(
      "Weekly check-in is ready",
    );
    expect(notificationRowBody(checkin, { coachName: "Rahul Verma" })).toBe(
      checkinPushCopy("Rahul Verma").body,
    );
    expect(notificationRowTitle(note, { coachName: "Rahul Verma" })).toBe(
      "Rahul has a note for you!",
    );
    expect(notificationRowBody(note, { coachName: "Rahul Verma" })).toBe(
      "Tap to read.",
    );
    expect(notePushCopy("Rahul Verma").body).toBe("Tap to read.");
    expect(noteBannerCopy("Rahul Verma")).toEqual({
      title: "Rahul has a note for you",
    });
  });

  it("names the client on trainer inbox and push copy", () => {
    const cases = [
      ["trainer_ask_coach", "Priya Shah asked on WhatsApp"],
      ["trainer_checkin_submitted", "Priya Shah sent their check-in"],
      ["trainer_intake_submitted", "Priya Shah finished their intake"],
      ["trainer_renewal", "Priya Shah's renewal is due"],
      ["trainer_meal_times_changed", "Priya Shah changed meal times"],
    ] as const;
    for (const [type, title] of cases) {
      const row = {
        ...base,
        type,
        notificationType: type,
        clientDisplayName: "Priya Shah",
      };
      expect(notificationRowTitle(row)).toBe(title);
      expect(notificationRowTitle(row)).not.toMatch(/_/);
      expect(notificationRowTitle(row)).not.toMatch(/^Client\b/);
      expect(notificationRowBody(row)).not.toMatch(/_/);
      expect(
        notificationRowTitle(
          { ...row, clientDisplayName: undefined },
          { clientName: "Priya Shah" },
        ),
      ).toBe(title);
    }
  });

  it("does not show a raw enum when the client name is missing", () => {
    const row = {
      ...base,
      type: "trainer_meal_times_changed" as const,
      notificationType: "trainer_meal_times_changed" as const,
      clientDisplayName: "trainer_meal_times_changed",
    };
    expect(notificationRowTitle(row)).toBe("Meal times changed");
    expect(notificationRowTitle(row)).not.toContain("_");
  });
});
