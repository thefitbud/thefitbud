import { describe, expect, it } from "vitest";
import type { AttentionGroupsResponse } from "@fitbud/contracts";
import {
  acknowledgeAttentionItem,
  buildClientAttentionCards,
  partialReviewLine,
  partitionAttentionGroups,
  restoreAttentionItem,
  reviewedStillOpenSummary,
} from "./attentionCards";

type AttentionGroup = AttentionGroupsResponse["groups"][number];

function item(
  id: string,
  status: AttentionGroup["items"][number]["status"],
  severity: AttentionGroup["items"][number]["severity"] = "attention",
): AttentionGroup["items"][number] {
  return {
    id,
    type: "missed_workout",
    severity,
    status,
    ageMinutes: 60,
    summary: "Missed workout",
  };
}

function client(
  relationshipId: string,
  name: string,
  items: AttentionGroup["items"],
): AttentionGroup {
  return {
    relationshipId,
    traineeDisplayName: name,
    items,
  };
}

describe("buildClientAttentionCards", () => {
  it("orders cards by severity then age", () => {
    const cards = buildClientAttentionCards([
      {
        relationshipId: "11111111-1111-4111-8111-111111111111",
        traineeDisplayName: "Aarav",
        items: [
          {
            id: "a1",
            type: "missed_workout",
            severity: "attention",
            status: "active",
            ageMinutes: 200,
            summary: "Missed workout",
          },
        ],
      },
      {
        relationshipId: "22222222-2222-4222-8222-222222222222",
        traineeDisplayName: "Lakshmi",
        items: [
          {
            id: "b1",
            type: "overdue_meal",
            severity: "critical",
            status: "active",
            ageMinutes: 50,
            summary: "Missed meal",
          },
        ],
      },
    ]);
    expect(cards[0]?.traineeDisplayName).toBe("Lakshmi");
  });
});

describe("Needs you and Reviewed", () => {
  const relationshipId = "33333333-3333-4333-8333-333333333333";
  const first = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const second = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  it("keeps a client in Needs you until every open item is acknowledged", () => {
    const open = [
      client(relationshipId, "Meera Iyer", [
        item(first, "active", "critical"),
        item(second, "active"),
      ]),
    ];

    const before = partitionAttentionGroups(open);
    expect(before.needsYou.map((group) => group.relationshipId)).toEqual([
      relationshipId,
    ]);
    expect(before.reviewed).toHaveLength(0);
    expect(before.groups[0]?.bucket).toBe("needs_you");
    expect(partialReviewLine(before.groups[0]!.items)).toBeNull();

    const partial = partitionAttentionGroups(
      acknowledgeAttentionItem(before.groups, first),
    );
    expect(partial.needsYou).toHaveLength(1);
    expect(partial.reviewed).toHaveLength(0);
    expect(partial.needsYou[0]?.items.map((entry) => entry.id)).toEqual([
      second,
    ]);
    expect(partialReviewLine(partial.groups[0]!.items)).toBe(
      "Reviewed, still open · 1 of 2 reviewed",
    );

    const reviewed = partitionAttentionGroups(
      acknowledgeAttentionItem(partial.groups, second),
    );
    expect(reviewed.needsYou).toHaveLength(0);
    expect(reviewed.reviewed).toHaveLength(1);
    expect(reviewed.reviewed[0]?.bucket).toBe("reviewed");
    expect(
      reviewed.reviewed[0]?.items.every(
        (entry) => entry.status === "acknowledged",
      ),
    ).toBe(true);
    expect(partialReviewLine(reviewed.groups[0]!.items)).toBeNull();
    expect(reviewedStillOpenSummary(reviewed.reviewed.length)).toBe(
      "1 reviewed item still open",
    );

    const undone = partitionAttentionGroups(
      restoreAttentionItem(reviewed.groups, second, "active"),
    );
    expect(undone.needsYou).toHaveLength(1);
    expect(undone.reviewed).toHaveLength(0);
    expect(
      undone.needsYou[0]?.items.some(
        (entry) => entry.id === second && entry.status === "active",
      ),
    ).toBe(true);
    expect(partialReviewLine(undone.groups[0]!.items)).toBe(
      "Reviewed, still open · 1 of 2 reviewed",
    );
  });

  it("does not keep a resolved-only client in either section", () => {
    const lists = partitionAttentionGroups([
      client(relationshipId, "Meera Iyer", [item(first, "resolved")]),
    ]);
    expect(lists.needsYou).toHaveLength(0);
    expect(lists.reviewed).toHaveLength(0);
  });

  it("pluralises the reviewed section summary", () => {
    expect(reviewedStillOpenSummary(4)).toBe("4 reviewed items still open");
  });
});
