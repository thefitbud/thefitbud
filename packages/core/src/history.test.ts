import { describe, expect, it } from "vitest";
import {
  compareHistoryItemsNewestFirst,
  isHistoryItemAfterCursor,
} from "./history.js";

describe("history projection helpers", () => {
  it("orders newer timestamps first", () => {
    const newer = {
      id: "11111111-1111-4111-8111-111111111111",
      occurredAt: "2026-09-27T00:00:00.000Z",
    };
    const older = {
      id: "22222222-2222-4222-8222-222222222222",
      occurredAt: "2026-09-26T00:00:00.000Z",
    };
    expect(compareHistoryItemsNewestFirst(newer, older)).toBeLessThan(0);
    expect(compareHistoryItemsNewestFirst(older, newer)).toBeGreaterThan(0);
  });

  it("filters items after a newest-first cursor", () => {
    const cursor = {
      k: "2026-09-26T12:00:00.000Z",
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    };
    expect(
      isHistoryItemAfterCursor(
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          occurredAt: "2026-09-26T11:00:00.000Z",
        },
        cursor,
      ),
    ).toBe(true);
    expect(
      isHistoryItemAfterCursor(
        {
          id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          occurredAt: "2026-09-26T13:00:00.000Z",
        },
        cursor,
      ),
    ).toBe(false);
  });
});
