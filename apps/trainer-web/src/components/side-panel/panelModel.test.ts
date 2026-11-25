import { describe, expect, it } from "vitest";
import {
  allDoneSummary,
  buildPanelList,
  itemTitle,
  moreOpenText,
} from "./panelModel";
import { REVIEW_ORDER_IDS, REVIEW_ORDER_ROWS } from "./reviewOrder.fixture";

describe("buildPanelList review order (D-W13-21)", () => {
  it("Critical first, then newest first, noted kept, resolved left out", () => {
    const list = buildPanelList(REVIEW_ORDER_ROWS);
    expect(list.items.map((item) => item.id)).toEqual(REVIEW_ORDER_IDS);
    expect(list.moreCount).toBe(0);
  });

  it("does not depend on the API order for different rows", () => {
    const reversed = [...REVIEW_ORDER_ROWS].reverse();
    const ids = buildPanelList(reversed).items.map((item) => item.id);
    // Only the two equal rows (6, 7) follow the API order.
    expect(ids.slice(0, 4)).toEqual(REVIEW_ORDER_IDS.slice(0, 4));
  });
});

describe("itemTitle (W13-13)", () => {
  const base = {
    type: "overdue_meal" as const,
    summary: "Overdue meal",
    details: null,
  };

  it("names the meal and the day so rows can be told apart", () => {
    expect(itemTitle(base, { name: "Dinner", localDate: "2026-11-24" })).toBe(
      "Overdue meal · Dinner · Tue 24 Nov",
    );
    expect(itemTitle(base, { name: "Lunch", localDate: "2026-11-23" })).toBe(
      "Overdue meal · Lunch · Mon 23 Nov",
    );
  });

  it("prefers the item's own details and never repeats the name", () => {
    expect(
      itemTitle({
        type: "missed_workout",
        summary: "Missed Upper body A",
        details: { workoutDayName: "Upper body A", localDate: "2026-10-21" },
      }),
    ).toBe("Missed Upper body A · Wed 21 Oct");
  });

  it("falls back to the type label without a summary", () => {
    expect(itemTitle({ ...base, summary: "" })).toBe("Overdue meal");
  });
});

describe("panel copy", () => {
  it("more open line (RP-04)", () => {
    expect(moreOpenText(2, "Rohan")).toBe("2 more open for Rohan");
    expect(moreOpenText(0, "Rohan")).toBeNull();
  });

  it("all-done line (RP-05)", () => {
    expect(allDoneSummary(2, 1)).toBe("2 resolved · 1 noted, still open");
    expect(allDoneSummary(3, 0)).toBe("3 resolved");
    expect(allDoneSummary(0, 2)).toBe("2 noted, still open");
  });
});
