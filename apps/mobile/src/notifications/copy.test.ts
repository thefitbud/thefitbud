import { describe, expect, it, vi } from "vitest";

// copy.ts reads the v2 channel ids from androidChannels.ts, which imports the native modules.
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-notifications", () => ({
  setNotificationChannelAsync: vi.fn(),
  deleteNotificationChannelAsync: vi.fn(),
  AndroidImportance: { DEFAULT: 3, HIGH: 4 },
}));

import { notificationTypeSchema, type Notification, type NotificationType } from "@fitbud/contracts";
import {
  PUSH_BODY_MAX,
  PUSH_GROUPS,
  PUSH_TITLE_MAX,
  pushGroupFor,
  checkinPushCopy,
  mealPushCopy,
  noteBannerCopy,
  notePushCopy,
  notificationRowBody,
  notificationRowTitle,
} from "./copy";
import {
  ANDROID_CHANNEL_ID_BY_GROUP,
  LEGACY_ANDROID_CHANNEL_IDS,
} from "./androidChannels";

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
    expect(notificationRowTitle(base)).toBe("Lunch is due");
    expect(notificationRowBody(base)).toBe("Tap to log it.");
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
      "Rahul left a note",
    );
    expect(notificationRowBody(note, { coachName: "Rahul Verma" })).toBe(
      "Tap to read.",
    );
    expect(notePushCopy("Rahul Verma").body).toBe("Tap to read.");
    expect(noteBannerCopy("Rahul Verma")).toEqual({
      title: "Rahul left a note",
    });
  });

  it("names the client on trainer inbox and push copy", () => {
    const cases = [
      ["trainer_ask_coach", "Priya asked you"],
      ["trainer_checkin_submitted", "Priya sent their check-in"],
      ["trainer_intake_submitted", "Priya finished their intake"],
      ["trainer_renewal", "Priya's renewal is due"],
      ["trainer_meal_times_changed", "Priya changed meal times"],
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

  it("uses the shared copy for a client's meal-log change (Z14-16)", () => {
    const edit = {
      entryId: "99999999-9999-4999-8999-999999999999",
      action: "edited" as const,
      mealName: "Lunch",
      mealDate: "2026-11-14",
      fromKcal: 610,
      toKcal: 690,
      fromOutcome: "modified",
      toOutcome: "modified",
      fields: ["portion" as const],
    };
    const row = {
      ...base,
      type: "trainer_client_log_edited" as const,
      notificationType: "trainer_client_log_edited" as const,
      clientDisplayName: "Aarav Mehta",
      logEdit: edit,
    };
    const context = { today: "2026-11-14" };
    expect(notificationRowTitle(row, context)).toBe("Aarav edited lunch");
    expect(notificationRowBody(row, context)).toBe("610 → 690 kcal · changed portion");
    expect(notificationRowTitle(row, { today: "2026-11-16" })).toBe(
      "Aarav edited lunch · Sat 14 Nov",
    );
    const removed = {
      ...row,
      logEdit: { ...edit, action: "removed" as const, toKcal: null, toOutcome: null, fields: [] },
    };
    expect(notificationRowTitle(removed, context)).toBe("Aarav removed their lunch log");
    expect(notificationRowBody(removed, context)).toBe(
      "Today · was 610 kcal. It's back to not logged.",
    );
    // An older row without the payload keeps a plain line.
    expect(notificationRowTitle({ ...row, logEdit: undefined })).toBe(
      "Aarav changed a meal log",
    );
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

describe("coach log updates (Z6-19, D-W6-33)", () => {
  const eventId = "55555555-5555-4555-8555-555555555555";
  function coachRow(dedupeKey: string): Notification {
    return {
      ...base,
      type: "coach_log_updated",
      notificationType: "coach_log_updated",
      domainEntityType: "workout_assignment",
      dedupeKey,
      route: "/workout/44444444-4444-4444-8444-444444444444",
      routing: {
        ...base.routing,
        notificationType: "coach_log_updated",
        domainEntityType: "workout_assignment",
      },
    };
  }

  it("uses Firoz's copy for a coach create and a coach edit", () => {
    const created = coachRow(`coach_log_updated:create:workout_execution:${eventId}`);
    expect(notificationRowTitle(created)).toBe("Logged by your coach");
    expect(notificationRowBody(created)).toBe("Your coach logged a workout for you.");

    const edited = coachRow(`coach_log_updated:edit:workout_execution:${eventId}`);
    expect(notificationRowTitle(edited)).toBe("Edited by your coach");
    expect(notificationRowBody(edited)).toBe("Your coach updated one of your workouts.");
  });

  it("uses the meal and measurement wording from D-W6-33 (Z6-20)", () => {
    const meal = (action: string) => coachRow(`coach_log_updated:${action}:meal_compliance:${eventId}`);
    expect(notificationRowTitle(meal("create"))).toBe("Logged by your coach");
    expect(notificationRowBody(meal("create"))).toBe("Your coach logged a meal for you.");
    expect(notificationRowTitle(meal("edit"))).toBe("Edited by your coach");
    expect(notificationRowBody(meal("edit"))).toBe("Your coach updated one of your meals.");

    const measurement = (action: string) =>
      coachRow(`coach_log_updated:${action}:measurement:${eventId}`);
    expect(notificationRowTitle(measurement("create"))).toBe("Logged by your coach");
    expect(notificationRowBody(measurement("create"))).toBe(
      "Your coach logged a measurement for you.",
    );
    expect(notificationRowTitle(measurement("edit"))).toBe("Edited by your coach");
    expect(notificationRowBody(measurement("edit"))).toBe(
      "Your coach updated one of your measurements.",
    );
  });

  it("falls back to the plain label for a key it does not know", () => {
    const unknown = coachRow(`coach_log_updated:delete:workout_execution:${eventId}`);
    expect(notificationRowTitle(unknown)).toBe("Update from your coach");
    expect(notificationRowBody(unknown)).toBe("");
    expect(notificationRowTitle(unknown)).not.toContain("_");
  });
});

/** A routing payload entity type each type plausibly carries (for the meal label). */
function rowFor(type: NotificationType, overrides: Partial<Notification> = {}): Notification {
  return {
    ...base,
    type,
    notificationType: type,
    route: type === "meal_reminder" ? "/meal/evening-snack" : "/today",
    routing: { ...base.routing, notificationType: type },
    ...overrides,
  };
}

describe("every push type reads well on the lock screen (Z12-47, TR-15c, TM-13a)", () => {
  const types = notificationTypeSchema.options;
  // A long-ish coach and client name, and the fallbacks when there is none.
  const contexts = [
    { coachName: "Rahul Verma", clientName: "Aarav Shah" },
    { coachName: "Venkataraman Iyer", clientName: "Shreyashree Nair" },
    {},
  ];

  it.each(types)("%s: short title, two-line body, no enum, no FitBud prefix", (type) => {
    for (const context of contexts) {
      const row = rowFor(type);
      const title = notificationRowTitle(row, context);
      const body = notificationRowBody(row, context);
      expect(title.length, `${type} title "${title}"`).toBeGreaterThan(0);
      expect(title.length, `${type} title "${title}"`).toBeLessThanOrEqual(PUSH_TITLE_MAX);
      expect(body.length, `${type} body "${body}"`).toBeLessThanOrEqual(PUSH_BODY_MAX);
      for (const text of [title, body]) {
        expect(text).not.toMatch(/_/);
        expect(text).not.toMatch(/^FitBud\s*·/);
        expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
        expect(text).not.toMatch(/%/);
      }
    }
  });

  it("names the coach on coach rows and the client by first name on trainer rows", () => {
    const ctx = { coachName: "Rahul Verma" };
    expect(notificationRowTitle(rowFor("plan_published"), ctx)).toBe("Rahul changed your plan");
    expect(notificationRowTitle(rowFor("trainer_note_shared"), ctx)).toBe("Rahul left a note");
    expect(notificationRowTitle(rowFor("coach_answered"), ctx)).toBe("Rahul answered your question");
    expect(notificationRowTitle(rowFor("reactivation_requested"), ctx)).toBe("Restart coaching?");
    expect(notificationRowBody(rowFor("reactivation_requested"), ctx)).toBe(
      "Rahul wants to restart coaching. Tap to review.",
    );
    expect(notificationRowBody(rowFor("checkin_reviewed"), ctx)).toBe("See Rahul's review.");
    expect(notificationRowTitle(rowFor("plan_published"))).toBe("Your coach changed your plan");
    expect(
      notificationRowTitle(rowFor("trainer_ask_coach", { clientDisplayName: "Aarav Shah" })),
    ).toBe("Aarav asked you");
    expect(notificationRowTitle(rowFor("trainer_ask_coach"))).toBe("A client asked you");
    expect(notificationRowTitle(rowFor("meal_reminder"))).toBe("Snack is due");
  });

  it("hides coaching detail on the lock screen when asked", () => {
    for (const type of ["meal_reminder", "workout_reminder", "trainer_note_shared"] as const) {
      expect(notificationRowBody(rowFor(type), { hideLockDetails: true })).toBe(
        "You have something to log in FitBud.",
      );
    }
  });

  it("every type has one group; every group has a channel, a category and a summary", () => {
    for (const type of types) {
      expect(PUSH_GROUPS, type).toContain(pushGroupFor(type));
    }
    const categories = new Set<string>();
    for (const group of PUSH_GROUPS) {
      // Z14-6 deleted the old ids; the group's channel is the v2 id the app creates.
      expect(group.channelId).toBe(ANDROID_CHANNEL_ID_BY_GROUP[group.id]);
      expect(LEGACY_ANDROID_CHANNEL_IDS as readonly string[]).not.toContain(
        group.channelId,
      );
      expect(pushGroupFor("meal_reminder").channelId).toBe("meal_v2");
      expect(pushGroupFor("trainer_client_log_edited").channelId).toBe("clients_v2");
      // Expo category ids cannot contain ":" or "-".
      expect(group.categoryId).toMatch(/^[a-z_]+$/);
      expect(group.summary).toMatch(/^%u more /);
      categories.add(group.categoryId);
    }
    expect(categories.size).toBe(PUSH_GROUPS.length);
    expect(pushGroupFor("meal_reminder").categoryId).toBe("meal_actions");
    expect(pushGroupFor("trainer_ask_coach").id).toBe("clients");
    expect(pushGroupFor("activity_nudge").id).toBe("coach");
  });
});

describe("activity_nudge copy (Z12-50, D-W12-9)", () => {
  const nudge: Notification = { ...base, type: "activity_nudge", notificationType: "activity_nudge" };

  it("shows the server title and body, as the push carried them", () => {
    const row = { ...nudge, title: "Rahul nudged you", body: "Lower body A is waiting. Can you fit it in soon?" };
    expect(notificationRowTitle(row, { coachName: "Rahul Verma" })).toBe("Rahul nudged you");
    expect(notificationRowBody(row)).toBe("Lower body A is waiting. Can you fit it in soon?");
  });

  it("an older row without them still reads '{Coach} nudged you'", () => {
    expect(notificationRowTitle(nudge, { coachName: "Rahul Verma" })).toBe("Rahul nudged you");
    expect(notificationRowTitle(nudge)).toBe("Your coach nudged you");
    expect(notificationRowBody(nudge)).toBe("Log it when you can.");
  });
});
