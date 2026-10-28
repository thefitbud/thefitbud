import { describe, expect, it } from "vitest";
import type { AttentionGroupsResponse } from "@fitbud/contracts";
import {
  canGoNextReviewSheet,
  canGoPrevReviewSheet,
  clampReviewSheetIndex,
  reviewSheetDashStates,
  reviewSheetIndexForItem,
  reviewSheetItemLabel,
  reviewSheetItemsForRelationship,
  reviewSheetOpenItemsLine,
  stepReviewSheetIndex,
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
