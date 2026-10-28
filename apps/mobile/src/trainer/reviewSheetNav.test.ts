import { describe, expect, it } from "vitest";
import type { AttentionGroupsResponse } from "@fitbud/contracts";
import {
  canGoNextReviewSheet,
  canGoPrevReviewSheet,
  clampReviewSheetIndex,
  nextReviewClientName,
  reviewSheetAllResolvedLeaveLine,
  reviewSheetAllResolvedTitle,
  reviewSheetAllReviewed,
  reviewSheetDashStates,
  reviewSheetFooterMode,
  reviewSheetIndexForItem,
  reviewSheetItemDate,
  reviewSheetItemLabel,
  reviewSheetItemOutcome,
  reviewSheetItemsForRelationship,
  reviewSheetNextClientLabel,
  reviewSheetNextItemLabel,
  reviewSheetOpenItemsLine,
  reviewSheetOutcomePhrase,
  reviewSheetResolvedBanner,
  reviewSheetResolvedRowLabel,
  reviewSheetStepLabel,
  stepReviewSheetIndex,
  REVIEW_SHEET_BACK_LABEL,
} from "./reviewSheetNav";

type AttentionGroup = AttentionGroupsResponse["groups"][number];

function item(
  id: string,
  status: AttentionGroup["items"][number]["status"],
  severity: AttentionGroup["items"][number]["severity"] = "attention",
  ageMinutes = 60,
): AttentionGroup["items"][number] {
  return {
    id,
    type: "missed_workout",
    severity,
    status,
    ageMinutes,
    summary: `Missed workout ${id}`,
  };
}

const relationshipId = "44444444-4444-4444-8444-444444444444";
const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

describe("review sheet item navigation", () => {
  it("orders open items by severity then age and skips resolved", () => {
    const groups: AttentionGroup[] = [
      {
        relationshipId,
        traineeDisplayName: "Rohan Mehta",
        items: [
          item(c, "active", "attention", 100),
          item(a, "active", "critical", 200),
          item(b, "detected", "critical", 150),
          item("resolved-1", "resolved", "critical", 300),
        ],
      },
    ];
    expect(
      reviewSheetItemsForRelationship(groups, relationshipId).map(
        (entry) => entry.id,
      ),
    ).toEqual([a, b, c]);
  });

  it("formats 1 of 3 / 2 of 3 and clamps the index", () => {
    expect(reviewSheetItemLabel(0, 3)).toBe("1 of 3");
    expect(reviewSheetItemLabel(1, 3)).toBe("2 of 3");
    expect(reviewSheetItemLabel(2, 3)).toBe("3 of 3");
    expect(reviewSheetItemLabel(-1, 3)).toBe("1 of 3");
    expect(reviewSheetItemLabel(9, 3)).toBe("3 of 3");
    expect(reviewSheetItemLabel(0, 0)).toBe("0 of 0");
    expect(clampReviewSheetIndex(5, 3)).toBe(2);
  });

  it("builds progress dashes: ok before current, on for current, idle after", () => {
    expect(reviewSheetDashStates(0, 3)).toEqual(["on", "idle", "idle"]);
    expect(reviewSheetDashStates(1, 3)).toEqual(["ok", "on", "idle"]);
    expect(reviewSheetDashStates(2, 3)).toEqual(["ok", "ok", "on"]);
  });

  it("enables prev/next the way frame 31 item 1 and item 2 do", () => {
    expect(canGoPrevReviewSheet(0)).toBe(false);
    expect(canGoNextReviewSheet(0, 3)).toBe(true);
    expect(canGoPrevReviewSheet(1)).toBe(true);
    expect(canGoNextReviewSheet(1, 3)).toBe(true);
    expect(canGoNextReviewSheet(2, 3)).toBe(false);
    expect(stepReviewSheetIndex(0, 3, 1)).toBe(1);
    expect(stepReviewSheetIndex(1, 3, -1)).toBe(0);
    expect(stepReviewSheetIndex(0, 3, -1)).toBe(0);
    expect(stepReviewSheetIndex(2, 3, 1)).toBe(2);
  });

  it("finds the starting index for a focused exception", () => {
    const items = [{ id: a }, { id: b }, { id: c }];
    expect(reviewSheetIndexForItem(items, b)).toBe(1);
    expect(reviewSheetIndexForItem(items, "missing")).toBe(0);
  });

  it("pluralises the open-items subtitle", () => {
    expect(reviewSheetOpenItemsLine(1)).toBe("1 open item");
    expect(reviewSheetOpenItemsLine(3)).toBe("3 open items");
  });
});

describe("review sheet resolved and all-resolved", () => {
  const open = [
    { status: "active" },
    { status: "detected" },
    { status: "active" },
  ];
  const firstResolved = [
    { status: "acknowledged" },
    { status: "detected" },
    { status: "active" },
  ];
  const allAcknowledged = [
    { status: "acknowledged" },
    { status: "acknowledged" },
    { status: "acknowledged" },
  ];

  it("shows Resolved by you with Undo copy and Next item after Mark reviewed", () => {
    expect(reviewSheetFooterMode(firstResolved, 0, false)).toBe("resolved");
    expect(reviewSheetResolvedBanner("Talked to client", true)).toBe(
      "Resolved by you · just now · Talked to client",
    );
    expect(reviewSheetResolvedBanner(null, true)).toBe(
      "Resolved by you · just now",
    );
    expect(reviewSheetNextItemLabel(0, 3)).toBe("Next item · 2 of 3");
    expect(reviewSheetStepLabel(0, 3, false)).toBe("1 of 3");
    expect(reviewSheetDashStates(0, 3, [true, false, false])).toEqual([
      "ok",
      "idle",
      "idle",
    ]);
    expect(canGoPrevReviewSheet(0)).toBe(false);
    expect(canGoNextReviewSheet(0, 3)).toBe(true);
  });

  it("keeps item 2 navigation when an earlier item is resolved", () => {
    expect(reviewSheetFooterMode(firstResolved, 1, false)).toBe("actions");
    expect(reviewSheetItemLabel(1, 3)).toBe("2 of 3");
    expect(reviewSheetDashStates(1, 3, [true, false, false])).toEqual([
      "ok",
      "on",
      "idle",
    ]);
    expect(canGoPrevReviewSheet(1)).toBe(true);
    expect(canGoNextReviewSheet(1, 3)).toBe(true);
    expect(stepReviewSheetIndex(1, 3, 1)).toBe(2);
    expect(stepReviewSheetIndex(1, 3, -1)).toBe(0);
    expect(reviewSheetFooterMode(firstResolved, 0, false)).toBe("resolved");
    expect(reviewSheetNextItemLabel(2, 3)).toBeNull();
  });

  it("matches the all-resolved frame once every item is acknowledged", () => {
    expect(reviewSheetAllReviewed(allAcknowledged)).toBe(true);
    expect(reviewSheetAllReviewed(firstResolved)).toBe(false);
    expect(reviewSheetAllReviewed(open)).toBe(false);
    expect(reviewSheetFooterMode(allAcknowledged, 2, false)).toBe(
      "all_resolved",
    );
    expect(reviewSheetFooterMode(allAcknowledged, 2, true)).toBe("resolved");
    expect(reviewSheetStepLabel(2, 3, true)).toBe("Done");
    expect(reviewSheetDashStates(2, 3, [true, true, true])).toEqual([
      "ok",
      "ok",
      "ok",
    ]);
    expect(reviewSheetAllResolvedTitle(3, "Rohan")).toBe(
      "All 3 resolved for Rohan",
    );
    expect(reviewSheetAllResolvedLeaveLine("Rohan")).toBe(
      "Rohan leaves Needs you. You'll find this in his History.",
    );
    expect(reviewSheetResolvedRowLabel("Talked to client")).toBe(
      "Resolved · Talked to client",
    );
    expect(reviewSheetResolvedRowLabel("Plan adjusted")).toBe(
      "Resolved · Plan adjusted",
    );
    expect(reviewSheetResolvedRowLabel("No action needed")).toBe(
      "Resolved · No action needed",
    );
    expect(reviewSheetNextClientLabel("Arjun Kapoor")).toBe(
      "Next client: Arjun Kapoor",
    );
    expect(REVIEW_SHEET_BACK_LABEL).toBe("Back to Needs you");
  });

  it("reads frame outcome phrases and item dates from exception details", () => {
    expect(reviewSheetOutcomePhrase("talked")).toBe("Talked to client");
    expect(reviewSheetOutcomePhrase("plan_adjusted")).toBe("Plan adjusted");
    expect(reviewSheetOutcomePhrase("no_action")).toBe("No action needed");
    expect(reviewSheetOutcomePhrase("other")).toBeNull();
    expect(reviewSheetItemOutcome({ outcome: "talked" })).toBe(
      "Talked to client",
    );
    expect(reviewSheetItemOutcome({ resolveOutcome: "no_action" })).toBe(
      "No action needed",
    );
    expect(reviewSheetItemOutcome(null)).toBeNull();
    expect(
      reviewSheetItemDate(
        { localDate: "2026-10-13" },
        new Date("2026-10-28T00:00:00Z"),
      ),
    ).toBe("Tue 13 Oct");
    expect(
      reviewSheetItemDate(
        { localDate: "2026-10-15" },
        new Date("2026-10-28T00:00:00Z"),
      ),
    ).toBe("Thu 15 Oct");
    expect(
      reviewSheetItemDate(
        { localDate: "2026-10-17" },
        new Date("2026-10-28T00:00:00Z"),
      ),
    ).toBe("Sat 17 Oct");
  });

  it("offers the following Needs you client, then the first one left", () => {
    const cards = [
      { relationshipId: "rohan", traineeDisplayName: "Rohan Mehta" },
      { relationshipId: "arjun", traineeDisplayName: "Arjun Kapoor" },
      { relationshipId: "neha", traineeDisplayName: "Neha Reddy" },
    ];
    expect(nextReviewClientName(cards, "rohan")).toBe("Arjun Kapoor");
    expect(nextReviewClientName(cards, "arjun")).toBe("Neha Reddy");
    expect(
      nextReviewClientName(
        cards.filter((card) => card.relationshipId !== "rohan"),
        "rohan",
      ),
    ).toBe("Arjun Kapoor");
    expect(nextReviewClientName([cards[0]!], "rohan")).toBeNull();
  });
});
