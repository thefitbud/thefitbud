import { describe, expect, it } from "vitest";
import type { Notification } from "@fitbud/contracts";
import { logEditBellItems } from "./bellItems";

const REL = "11111111-1111-4111-8111-111111111111";
const ENTRY = "33333333-3333-4333-8333-333333333333";

function row(n: number, patch: Partial<Notification> = {}): Notification {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    type: "trainer_client_log_edited",
    coachingRelationshipId: REL,
    readAt: null,
    createdAt: `2026-11-14T0${n}:00:00.000Z`,
    clientDisplayName: "Aarav Mehta",
    logEdit: {
      entryId: ENTRY,
      action: "edited",
      mealName: "Lunch",
      mealDate: "2026-11-14",
      fromKcal: 610,
      toKcal: 690,
      fromOutcome: "modified",
      toOutcome: "modified",
      fields: ["portion"],
    },
    ...patch,
  } as Notification;
}

describe("logEditBellItems (Z14-16)", () => {
  it("shows the shared title and links to the day and entry", () => {
    const [item] = logEditBellItems([row(1)], new Map(), "2026-11-14");
    expect(item!.title).toBe("Aarav edited lunch");
    expect(item!.href).toBe(`/clients/${REL}/activity?date=2026-11-14&entry=${ENTRY}`);
  });

  it("opens only the day for a removed entry", () => {
    const removed = row(1, {
      logEdit: { ...row(1).logEdit!, action: "removed", toKcal: null, toOutcome: null, fields: [] },
    });
    const [item] = logEditBellItems([removed], new Map(), "2026-11-14");
    expect(item!.title).toBe("Aarav removed their lunch log");
    expect(item!.href).toBe(`/clients/${REL}/activity?date=2026-11-14`);
  });

  it("lists unread rows only, newest first, at most five", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7].map((n) => row(n));
    rows.push(row(8, { readAt: "2026-11-14T09:00:00.000Z" }));
    rows.push(row(9, { type: "trainer_ask_coach" }));
    const items = logEditBellItems(rows, new Map(), "2026-11-14");
    expect(items).toHaveLength(5);
    expect(items[0]!.id).toBe("log-00000000-0000-4000-8000-000000000007");
  });
});
