import { describe, expect, it } from "vitest";
import {
  NUDGE_BODY_MAX,
  NUDGE_CHIPS,
  isNudgeableExceptionType,
  bodyLooksLikeLink,
  nudgeChipBody,
  nudgeLimitLine,
  nudgeOutcome,
  nudgePreState,
  nudgeTargetFromException,
  nudgeTargetSubtitle,
  type NudgeTarget,
} from "./nudgeContent";

const REL = "11111111-1111-4111-8111-111111111111";
const ACT = "22222222-2222-4222-8222-222222222222";

const workout: NudgeTarget = {
  relationshipId: REL,
  activityType: "workout",
  activityId: ACT,
  kindLabel: "Missed workout",
  sourceName: "Lower body A",
  dayLabel: "Tue",
};
const meal: NudgeTarget = {
  ...workout,
  activityType: "meal",
  kindLabel: "Dinner not logged",
  sourceName: "Dinner",
  dayLabel: "Fri",
};
const checkin: NudgeTarget = {
  ...workout,
  activityType: "checkin",
  kindLabel: "Check-in overdue",
  sourceName: null,
  dayLabel: null,
};

describe("nudge chips", () => {
  it("every chip body for every activity is 1-200 characters with no link", () => {
    for (const target of [workout, meal, checkin]) {
      for (const chip of NUDGE_CHIPS) {
        const body = nudgeChipBody(chip.id, target);
        expect(body.length).toBeGreaterThan(0);
        expect(body.length).toBeLessThanOrEqual(NUDGE_BODY_MAX);
        expect(bodyLooksLikeLink(body)).toBe(false);
      }
    }
  });

  it("Gentle names the item the exception carries and invents nothing", () => {
    expect(nudgeChipBody("gentle", workout)).toBe(
      "Lower body A is waiting. Can you fit it in soon?",
    );
    expect(nudgeChipBody("gentle", meal)).toBe(
      "Dinner wasn't logged on Fri. Can you add it, even roughly?",
    );
  });

  it("falls back to generic text when the item has no name", () => {
    expect(nudgeChipBody("gentle", { ...workout, sourceName: null })).toBe(
      "Your workout is waiting. Can you fit it in soon?",
    );
  });

  it("the three chips differ", () => {
    const bodies = NUDGE_CHIPS.map((c) => nudgeChipBody(c.id, workout));
    expect(new Set(bodies).size).toBe(3);
  });
});

describe("nudge target", () => {
  it("maps an exception to the activity the API takes", () => {
    const target = nudgeTargetFromException({
      type: "overdue_meal",
      details: { localDate: "2026-11-13", mealName: "Dinner" },
      sourceEntityType: "meal_assignment",
      sourceEntityId: ACT,
      coachingRelationshipId: REL,
    });
    expect(target).toMatchObject({
      activityType: "meal",
      activityId: ACT,
      relationshipId: REL,
      kindLabel: "Dinner not logged",
      dayLabel: "Fri",
    });
    expect(nudgeTargetSubtitle(target)).toBe("Dinner not logged · Fri");
  });
});

describe("link check", () => {
  it.each([
    "https://example.com/x",
    "wa.me/919999999999",
    "bit.ly/abc",
    "see www.fitbud.in",
    "mailto:a@b.co",
  ])("flags %s", (text) => {
    expect(bodyLooksLikeLink(text)).toBe(true);
  });
  it("lets plain sentences through", () => {
    expect(bodyLooksLikeLink("Can you fit it in soon? Thanks.")).toBe(false);
  });
});

describe("pre-send state", () => {
  const base = { label: "responds" as const };
  it("push off from the client's preference", () => {
    expect(nudgePreState({ ...base, pushEnabled: false }, "Asia/Kolkata")).toEqual({
      kind: "push_off",
    });
  });
  it("reminders paused beats push", () => {
    expect(
      nudgePreState({ label: "reminders_paused", pushEnabled: true }, null),
    ).toEqual({ kind: "reminders_paused" });
  });
  it("quiet hours at 22:40 client time, ending 07:00", () => {
    // 22:40 IST = 17:10 UTC
    const now = new Date("2026-11-13T17:10:00.000Z");
    expect(
      nudgePreState(
        { ...base, quietHoursStart: "22:00", quietHoursEnd: "07:00" },
        "Asia/Kolkata",
        now,
      ),
    ).toEqual({ kind: "quiet_hours", localTime: "10:40 pm", endsAt: "7:00 am" });
  });
  it("ready in the afternoon and when nothing is known", () => {
    const now = new Date("2026-11-13T08:00:00.000Z");
    expect(nudgePreState(base, "Asia/Kolkata", now)).toEqual({ kind: "ready" });
    expect(nudgePreState(null, null)).toEqual({ kind: "ready" });
  });
});

describe("outcomes", () => {
  const notification = {} as never;
  it("a repeat about the same item is the TM-04n line with the stored time", () => {
    const out = nudgeOutcome(
      {
        notification,
        deduped: true,
        nudgedAt: "2026-11-13T04:42:00.000Z",
      },
      "Rohan",
    );
    expect(out.kind).toBe("limit");
    expect(nudgeLimitLine("Rohan", "2026-11-13T04:42:00.000Z")).toMatch(
      /^You reminded Rohan about this at .* You can remind again tomorrow\.$/,
    );
  });
  it("inbox, held and push", () => {
    expect(
      nudgeOutcome(
        { notification, deduped: false, delivery: "inbox", inboxReason: "push_off" },
        "Ishita",
      ),
    ).toEqual({ kind: "inbox", toast: "Reminder sent to Ishita's inbox. Push is off" });
    expect(
      nudgeOutcome(
        {
          notification,
          deduped: false,
          delivery: "push",
          deferredForQuietHours: true,
          quietHoursEnd: "07:00",
        },
        "Rohan",
      ),
    ).toEqual({ kind: "held", toast: "Reminder sent. The push arrives at 7:00 am" });
    expect(
      nudgeOutcome({ notification, deduped: false, delivery: "push" }, "Rohan"),
    ).toEqual({ kind: "sent", toast: "Reminder sent to Rohan" });
  });
});

describe("nudgeable exception types", () => {
  it("allows only unlogged items", () => {
    for (const type of ["missed_workout", "overdue_meal", "overdue_checkin"]) {
      expect(isNudgeableExceptionType(type)).toBe(true);
    }
    for (const type of ["meal_deviation", "meal_logged_later", "skipped_meal", "skipped_workout"]) {
      expect(isNudgeableExceptionType(type)).toBe(false);
    }
  });
});
