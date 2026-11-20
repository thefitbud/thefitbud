import { describe, expect, it } from "vitest";
import type { AttentionGroupsResponse, CoachAsk } from "@fitbud/contracts";
import {
  askMentionsPain,
  buildNeedsYouScreenModel,
  needsYouEyebrow,
  shortAgeLabel,
} from "./needsYouModel";

type AttentionGroup = AttentionGroupsResponse["groups"][number];

function item(
  partial: Partial<AttentionGroup["items"][number]> & {
    id: string;
    type: AttentionGroup["items"][number]["type"];
  },
): AttentionGroup["items"][number] {
  return {
    severity: "attention",
    status: "active",
    ageMinutes: 60,
    summary: partial.type,
    ...partial,
  };
}

function group(
  relationshipId: string,
  name: string,
  items: AttentionGroup["items"],
): AttentionGroup {
  return { relationshipId, traineeDisplayName: name, items };
}

const REL_A = "11111111-1111-4111-8111-111111111111";
const REL_B = "22222222-2222-4222-8222-222222222222";
const REL_C = "33333333-3333-4333-8333-333333333333";

function ask(
  id: string,
  relationshipId: string,
  topic: string,
  label?: string,
): CoachAsk {
  return {
    id,
    relationshipId,
    itemType: "workout_assignment",
    itemId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    topic,
    status: "open",
    askCount: 1,
    askedAt: "2026-11-14T04:00:00.000Z",
    lastAskedAt: "2026-11-14T04:00:00.000Z",
    itemLabel: label ?? null,
    itemDate: "2026-11-14",
  };
}

describe("needsYouEyebrow", () => {
  it("names how many clients need you", () => {
    expect(
      needsYouEyebrow({
        dateLabel: "Saturday, 14 Nov",
        clientCount: 7,
        offlineClock: null,
      }),
    ).toBe("Saturday, 14 Nov · 7 clients need you");
    expect(
      needsYouEyebrow({
        dateLabel: "Saturday, 14 Nov",
        clientCount: 1,
        offlineClock: null,
      }),
    ).toBe("Saturday, 14 Nov · 1 client needs you");
    expect(
      needsYouEyebrow({
        dateLabel: "Saturday, 14 Nov",
        clientCount: 0,
        offlineClock: null,
      }),
    ).toBe("Saturday, 14 Nov");
  });

  it("uses as-of when offline", () => {
    expect(
      needsYouEyebrow({
        dateLabel: "Saturday, 14 Nov",
        clientCount: 7,
        offlineClock: "9:40 am",
      }),
    ).toBe("Saturday, 14 Nov · as of 9:40 am");
  });
});

describe("askMentionsPain / shortAgeLabel", () => {
  it("flags pain topics", () => {
    expect(askMentionsPain(ask("a", REL_A, "pain"))).toBe(true);
    expect(askMentionsPain(ask("b", REL_A, "swap"))).toBe(false);
    expect(
      askMentionsPain(ask("c", REL_A, "swap", "Lower back feels tight")),
    ).toBe(true);
  });

  it("formats short ages", () => {
    expect(shortAgeLabel(12)).toBe("12 min");
    expect(shortAgeLabel(120)).toBe("2 h");
    expect(shortAgeLabel(60 * 24)).toBe("1 d");
  });
});

describe("buildNeedsYouScreenModel", () => {
  it("builds the four-tile grid and reason sections (TM-01a)", () => {
    const model = buildNeedsYouScreenModel({
      needsYou: [
        group(REL_A, "Rohan Mehta", [
          item({
            id: "w1",
            type: "missed_workout",
            severity: "critical",
            ageMinutes: 5 * 24 * 60,
            summary: "Missed workout",
            details: { localDate: "2026-11-11" },
          }),
        ]),
        group(REL_B, "Neha Reddy", [
          item({
            id: "m1",
            type: "overdue_meal",
            ageMinutes: 3 * 24 * 60,
            summary: "Breakfast not logged",
            details: { localDate: "2026-11-12" },
          }),
        ]),
        group(REL_C, "Priya Nair", [
          item({
            id: "d1",
            type: "meal_deviation",
            ageMinutes: 2 * 24 * 60,
            summary: "Over calories 3 of the last 5 days",
          }),
        ]),
      ],
      reviewed: [],
      asks: [
        ask(
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          REL_A,
          "pain",
          "Lower back feels tight on the last reps. Drop to 40 kg?",
        ),
        ask(
          "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          REL_B,
          "portion_size",
          "Is 1 katori rice too much at dinner?",
        ),
      ],
      checkins: [
        {
          coachingRelationshipId: REL_A,
          traineeUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          traineeDisplayName: "Sneha Kapoor",
          checkin: {
            id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
            coachingRelationshipId: REL_A,
            checkinScheduleId: null,
            localDate: "2026-11-13",
            windowStartsAt: "2026-11-13T00:00:00.000Z",
            windowEndsAt: "2026-11-14T00:00:00.000Z",
            recordStatus: "submitted",
            recordVersion: 1,
            definitionVersion: 1,
            checkinFormVersionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
            answers: null,
            submittedAt: "2026-11-13T04:00:00.000Z",
            status: "submitted",
            review: null,
            createdAt: "2026-11-13T00:00:00.000Z",
            updatedAt: "2026-11-13T04:00:00.000Z",
          },
        },
      ],
      clientNames: {
        [REL_A]: "Aarav Sharma",
        [REL_B]: "Ishita Sen",
      },
      dateLabel: "Saturday, 14 Nov",
      nowMs: Date.parse("2026-11-14T04:12:00.000Z"),
    });

    expect(model.tiles.map((t) => [t.id, t.count, t.sub])).toEqual([
      ["missed", 2, "1 critical"],
      ["asked", 2, "1 with pain"],
      ["checkins", 1, "oldest 1 d"],
      ["off", 1, "3 of 5 days over"],
    ]);
    expect(model.sections.map((s) => s.id)).toEqual([
      "missed",
      "asked",
      "checkins",
      "off",
    ]);
    expect(model.sections[0]!.cards[0]!.action).toBe("Review");
    expect(model.sections[1]!.cards[0]!.chip?.kind).toBe("pain");
    expect(model.sections[1]!.cards[0]!.action).toBe("Reply");
    expect(model.clientCount).toBe(3);
    expect(model.eyebrow).toBe("Saturday, 14 Nov · 3 clients need you");
    expect(model.allCaughtUp).toBe(false);
  });

  it("all-caught-up keeps zero tiles and hides sections (TM-01d)", () => {
    const model = buildNeedsYouScreenModel({
      needsYou: [],
      reviewed: [],
      asks: [],
      checkins: [],
      clientNames: {},
      dateLabel: "Saturday, 14 Nov",
    });
    expect(model.allCaughtUp).toBe(true);
    expect(model.tiles.every((t) => t.count === 0 && t.sub === "none")).toBe(
      true,
    );
    expect(model.sections).toEqual([]);
    expect(model.eyebrow).toBe("Saturday, 14 Nov");
  });
});
