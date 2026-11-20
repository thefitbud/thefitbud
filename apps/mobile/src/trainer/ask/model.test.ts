import { describe, expect, it } from "vitest";
import type { CoachAsk } from "@fitbud/contracts";
import {
  askPainBanner,
  askQuestionQuote,
  askSubtitle,
  coachingWeekNumber,
} from "./model";

function ask(over: Partial<CoachAsk> = {}): CoachAsk {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    relationshipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    itemType: "workout_assignment",
    itemId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    topic: "pain",
    status: "open",
    askCount: 1,
    askedAt: "2026-11-17T04:00:00.000Z",
    lastAskedAt: "2026-11-17T04:12:00.000Z",
    itemLabel: "Lower back feels tight on the last reps. Should I drop to 40 kg?",
    itemDate: "2026-11-17",
    ...over,
  };
}

describe("ask detail model", () => {
  it("quotes a client question from itemLabel", () => {
    expect(askQuestionQuote(ask())).toContain("Lower back feels tight");
    expect(askQuestionQuote(ask())).toMatch(/^“.*”$/);
  });

  it("builds Fat loss · week N · age ago", () => {
    const now = Date.parse("2026-11-17T04:24:00.000Z");
    expect(
      askSubtitle({
        goalShort: "Fat loss",
        weekNumber: 3,
        lastAskedAt: "2026-11-17T04:12:00.000Z",
        nowMs: now,
      }),
    ).toBe("Fat loss · week 3 · 12 min ago");
  });

  it("computes coaching week from startedAt", () => {
    expect(
      coachingWeekNumber(
        "2026-10-27T00:00:00.000Z",
        Date.parse("2026-11-17T00:00:00.000Z"),
      ),
    ).toBe(4);
  });

  it("returns the fixed pain banner", () => {
    expect(askPainBanner()).toMatch(/Mentions pain/);
  });
});
