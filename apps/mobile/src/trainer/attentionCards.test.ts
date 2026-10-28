import { describe, expect, it } from "vitest";
import type { AttentionGroupsResponse } from "@fitbud/contracts";
import {
  acknowledgeAttentionItem,
  acknowledgeAttentionItems,
  attentionSectionModel,
  attentionSubtitle,
  ATTENTION_SCREEN_TITLE,
  buildClientAttentionCards,
  formatAttentionAge,
  markReviewedToastMessage,
  needsYouRowModel,
  openItemsLabel,
  partitionAttentionGroups,
  restoreAttentionItem,
  restoreAttentionItems,
  reviewedProgressFooter,
  reviewedRowModel,
  unreviewedItemsForRelationship,
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
    expect(needsYouRowModel({
      items: before.needsYou[0]!.items,
      issue: "Missed 2 workouts",
    })).toMatchObject({
      severityLabel: "Critical",
      openLabel: "2 open",
      trailing: "chevron",
    });

    const partial = partitionAttentionGroups(
      acknowledgeAttentionItem(before.groups, first),
    );
    expect(partial.needsYou).toHaveLength(1);
    expect(partial.reviewed).toHaveLength(0);
    expect(partial.needsYou[0]?.items.map((entry) => entry.id)).toEqual([
      second,
    ]);
    expect(openItemsLabel(partial.needsYou[0]!.items.length)).toBeNull();

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
    expect(
      reviewedRowModel({
        items: [
          { status: "acknowledged", acknowledgedAt: "2026-10-17T04:30:00.000Z" },
          { status: "active" },
        ],
        issue: "Lunch not logged",
        timeZone: "Asia/Kolkata",
      }),
    ).toEqual({
      issue: "Lunch not logged",
      chip: "Reviewed, still open",
      footer: "Reviewed Sat 17 Oct · 1 of 2 resolved",
      trailing: "chevron",
      expanded: true,
    });

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
  });

  it("does not keep a resolved-only client in either section", () => {
    const lists = partitionAttentionGroups([
      client(relationshipId, "Meera Iyer", [item(first, "resolved")]),
    ]);
    expect(lists.needsYou).toHaveLength(0);
    expect(lists.reviewed).toHaveLength(0);
  });

  it("matches frame 05 section copy and keeps Reviewed expanded", () => {
    expect(ATTENTION_SCREEN_TITLE).toBe("Needs you");
    expect(attentionSubtitle("Sun 18 Oct")).toBe(
      "Sun 18 Oct · most urgent first",
    );
    expect(
      attentionSectionModel({
        dateLabel: "Sun 18 Oct",
        needsYouCount: 4,
        reviewedCount: 2,
      }),
    ).toEqual({
      title: "Needs you",
      subtitle: "Sun 18 Oct · most urgent first",
      needsYou: {
        title: "Needs you",
        count: 4,
        hint: "Swipe left to mark reviewed",
        layout: "list-card",
      },
      reviewed: {
        title: "Reviewed",
        count: 2,
        hint: "Stay here until every item is resolved",
        expanded: true,
        layout: "list-card",
      },
    });
    expect(
      attentionSectionModel({
        dateLabel: "Sun 18 Oct",
        needsYouCount: 0,
        reviewedCount: 0,
      }).needsYou,
    ).toBeNull();
  });

  it("uses today for same-day age and hides a single open count", () => {
    expect(formatAttentionAge(30)).toBe("today");
    expect(formatAttentionAge(5 * 24 * 60)).toBe("since 5 d");
    expect(openItemsLabel(1)).toBeNull();
    expect(openItemsLabel(3)).toBe("3 open");
    expect(
      reviewedProgressFooter({
        when: "Sat 17 Oct",
        acknowledged: 2,
        open: 2,
      }),
    ).toBe("Reviewed Sat 17 Oct · 2 of 2 resolved");
  });
});

describe("swipe Mark reviewed + Undo toast", () => {
  const rohanId = "44444444-4444-4444-8444-444444444444";
  const arjunId = "55555555-5555-4555-8555-555555555555";
  const nehaId = "66666666-6666-4666-8666-666666666666";
  const priyaId = "77777777-7777-4777-8777-777777777777";
  const a = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const b = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const c = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("formats the toast with the client first name and Needs you count", () => {
    expect(markReviewedToastMessage("Rohan Mehta", 3)).toBe(
      "Rohan moved to Reviewed · 3 still open",
    );
    expect(markReviewedToastMessage("neha reddy", 1)).toBe(
      "Neha moved to Reviewed · 1 still open",
    );
  });

  it("swipe Mark reviewed acknowledges every open item and moves the client", () => {
    const open = [
      client(rohanId, "Rohan Mehta", [
        item(a, "active", "critical"),
        item(b, "detected"),
        item(c, "active"),
      ]),
      client(arjunId, "Arjun Kapoor", [item("d1", "active", "critical")]),
      client(nehaId, "Neha Reddy", [item("e1", "active"), item("e2", "active")]),
      client(priyaId, "Priya Sharma", [item("f1", "detected")]),
    ];
    const before = partitionAttentionGroups(open);
    expect(before.needsYou).toHaveLength(4);

    const targets = unreviewedItemsForRelationship(before.groups, rohanId);
    expect(targets.map((entry) => entry.id).sort()).toEqual([a, b, c].sort());

    const after = partitionAttentionGroups(
      acknowledgeAttentionItems(
        before.groups,
        targets.map((entry) => entry.id),
      ),
    );
    expect(after.needsYou.map((group) => group.relationshipId)).toEqual([
      arjunId,
      nehaId,
      priyaId,
    ]);
    expect(after.reviewed.map((group) => group.relationshipId)).toEqual([
      rohanId,
    ]);
    expect(
      after.reviewed[0]?.items.every((entry) => entry.status === "acknowledged"),
    ).toBe(true);
    expect(markReviewedToastMessage("Rohan Mehta", after.needsYou.length)).toBe(
      "Rohan moved to Reviewed · 3 still open",
    );

    const undone = partitionAttentionGroups(
      restoreAttentionItems(after.groups, targets),
    );
    expect(undone.needsYou.map((group) => group.relationshipId)).toContain(
      rohanId,
    );
    expect(undone.reviewed.map((group) => group.relationshipId)).not.toContain(
      rohanId,
    );
    expect(
      undone.needsYou
        .find((group) => group.relationshipId === rohanId)
        ?.items.map((entry) => entry.id)
        .sort(),
    ).toEqual([a, b, c].sort());
  });
});
