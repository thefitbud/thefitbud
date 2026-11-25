import { describe, expect, it } from "vitest";
import type { HistoryItem } from "@fitbud/contracts";
import {
  firstName,
  groupHistoryByDay,
  historyLine,
} from "./history-ui";

const NAMES = { client: "Ananya", trainer: "Rahul Verma" };

function item(partial: Partial<HistoryItem> & Pick<HistoryItem, "kind" | "title" | "summary">): HistoryItem {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    occurredAt: "2026-11-18T08:00:00.000Z",
    sourceEntityType: partial.kind,
    sourceEntityId: "11111111-1111-4111-8111-111111111111",
    status: null,
    ...partial,
  };
}

function sentence(line: ReturnType<typeof historyLine>) {
  return `${line.lead}${line.bold}${line.tail}`;
}

describe("groupHistoryByDay", () => {
  const now = new Date("2026-11-18T10:00:00.000Z");
  const rows = [
    item({ kind: "meal_compliance", title: "Meal Confirmed", summary: "x", occurredAt: "2026-11-18T04:40:00.000Z" }),
    item({ kind: "meal_compliance", title: "Meal Confirmed", summary: "x", occurredAt: "2026-11-18T02:40:00.000Z" }),
    item({ kind: "checkin_submitted", title: "Check-in submitted", summary: "x", occurredAt: "2026-11-17T03:00:00.000Z" }),
    item({ kind: "plan_version", title: "Plan", summary: "x", occurredAt: "2026-11-15T04:30:00.000Z" }),
  ];

  it("groups by civil day in the given timezone, newest day first", () => {
    const groups = groupHistoryByDay(rows, "Asia/Kolkata", now);
    expect(groups.map((group) => group.date)).toEqual(["2026-11-18", "2026-11-17", "2026-11-15"]);
    expect(groups[0]!.items).toHaveLength(2);
    expect(groups[0]!.items[0]!.occurredAt > groups[0]!.items[1]!.occurredAt).toBe(true);
  });

  it("reads Today, Yesterday, then dates", () => {
    const groups = groupHistoryByDay(rows, "Asia/Kolkata", now);
    expect(groups.map((group) => group.heading)).toEqual(["Today", "Yesterday", "Sun 15 Nov"]);
    expect(groups[0]!.sub).toBe("Wed 18 Nov");
    expect(groups[2]!.sub).toBe("");
  });

  it("puts an item on the day it happened in that timezone, not in UTC", () => {
    const late = item({ kind: "meal_compliance", title: "t", summary: "s", occurredAt: "2026-11-17T20:00:00.000Z" });
    expect(groupHistoryByDay([late], "Asia/Kolkata", now)[0]!.date).toBe("2026-11-18");
    expect(groupHistoryByDay([late], "UTC", now)[0]!.date).toBe("2026-11-17");
  });
});

describe("historyLine", () => {
  it("writes meals and workouts as the client's own sentences", () => {
    const skipped = historyLine(
      item({ kind: "meal_compliance", title: "Meal Skipped", summary: "Lunch on 2026-11-17 was Skipped.", status: "skipped" }),
      NAMES,
    );
    expect(sentence(skipped)).toBe("Ananya skipped Lunch");
    expect(skipped.actor).toBe("client");
    expect(skipped.meta).toBe("Logged by Ananya");

    const planned = historyLine(
      item({ kind: "meal_compliance", title: "Meal Confirmed", summary: "Breakfast on 2026-11-18 was Confirmed.", status: "confirmed" }),
      NAMES,
    );
    expect(sentence(planned)).toBe("Ananya logged Breakfast as planned");

    const workout = historyLine(
      item({ kind: "workout_execution", title: "Workout Completed", summary: "Lower body A on 2026-11-17 was Completed.", status: "completed" }),
      NAMES,
    );
    expect(sentence(workout)).toBe("Ananya completed Lower body A");
  });

  it("writes trainer actions as You with the trainer on the actor line", () => {
    const plan = historyLine(
      item({
        kind: "plan_version",
        title: "Plan “Fat loss – Phase 2” v3 Published",
        summary: "Plan version 3 is Published.",
        status: "published",
      }),
      NAMES,
    );
    expect(plan.actor).toBe("trainer");
    expect(sentence(plan)).toBe("You changed the plan: Fat loss – Phase 2 is now version 3");
    expect(plan.meta).toBe("Rahul Verma · published");

    const ack = historyLine(
      item({ kind: "intervention", title: "Intervention · Acknowledge", summary: "Noted, will check Friday.", status: "acknowledge" }),
      NAMES,
    );
    expect(sentence(ack)).toBe("You noted an item and kept it open: Noted, will check Friday");
  });

  it("never shows ISO dates, ids or raw enums", () => {
    const rows = [
      item({ kind: "subscription_revision", title: "Subscription v2", summary: "Monthly plan renews 2026-12-01 (Monthly)." }),
      item({ kind: "exception", title: "Exception · Missed workout", summary: "Missed Lower body A (status: Open).", status: "active" }),
      item({ kind: "checkin_reviewed", title: "Check-in reviewed", summary: "r", status: "needs_follow_up" }),
      item({ kind: "measurement", title: "Measurement · Weight", summary: "64.2 kg recorded (Client entry)." }),
    ];
    for (const row of rows) {
      const line = historyLine(row, NAMES);
      const text = `${sentence(line)} ${line.meta}`;
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}/);
      expect(text).not.toMatch(/[a-z]+_[a-z]+/);
    }
    expect(sentence(historyLine(rows[1]!, NAMES))).toBe("Missed workout: Missed Lower body A");
    const repeated = item({ kind: "exception", title: "Exception · Overdue meal", summary: "Overdue meal (status: Open).", status: "active" });
    expect(sentence(historyLine(repeated, NAMES))).toBe("Overdue meal");
  });
});

describe("firstName", () => {
  it("takes the first word and falls back when there is no name", () => {
    expect(firstName("Ananya Bose")).toBe("Ananya");
    expect(firstName(undefined)).toBe("The client");
  });
});
