/**
 * The week strip's day states must come from `GET /me/week` or from nothing
 * at all (CU23, D-W3b-25).
 *
 * All three trainee screens used to answer a failed week load with
 * `catch { setWeekModel(null) }` and then fill the strip in from the date
 * alone — `future` ahead of today, `missed` behind it. Since the route had
 * never been implemented, every call threw, so every trainee saw every past
 * day as `missed` whether or not it was. These tests pin that the fallback is
 * gone: a failure is `unavailable` and reported, and an unknown day carries
 * no claim about what happened on it.
 */
import type { WeekReadModel } from "@fitbud/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  loadWeekModel,
  navigatorDaysFor,
  type WeekModelState,
} from "./TraineeDateNavigator";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const { reportError } = await import("../lib/reportError");

const DATES = [
  "2026-10-12",
  "2026-10-13",
  "2026-10-14",
  "2026-10-15",
  "2026-10-16",
  "2026-10-17",
  "2026-10-18",
] as const;

function week(
  days: Array<{ date: string; state: WeekReadModel["days"][number]["state"] }>,
): WeekReadModel {
  return {
    start: DATES[0],
    workouts: { assigned: 0, completed: 0 },
    meals: { assigned: 0, logged: 0 },
    days: days.map((day) => ({
      ...day,
      workoutLabel: "Rest",
      mealsLogged: 0,
      mealsAssigned: 0,
      mealSlots: [],
    })),
    todayNutrition: {
      date: "2026-10-17",
      logged: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
      assigned: null,
    },
  };
}

const labels = {
  timeZone: "Asia/Kolkata",
  weekdayShortOf: (_tz: string, date: string) => date.slice(8),
  dayOfMonthOf: (_tz: string, date: string) => date.slice(8),
};

describe("loadWeekModel", () => {
  it("settles on loaded when the call succeeds", async () => {
    const model = week([{ date: DATES[0], state: "done" }]);
    const state = await loadWeekModel(async () => model, DATES[0], "test");
    expect(state).toEqual({ status: "loaded", week: model });
  });

  it("reports a failure and settles on unavailable, inventing nothing", async () => {
    const state = await loadWeekModel(
      async () => {
        throw new Error("boom");
      },
      DATES[0],
      "test.getMeWeek",
    );
    expect(state).toEqual({ status: "unavailable" });
    // The failure surfaces to the reporter; it is not swallowed.
    expect(reportError).toHaveBeenCalled();
  });

  it("treats a client that resolves nothing as unavailable, not an empty week", async () => {
    const state = await loadWeekModel(async () => null, DATES[0], "test");
    expect(state).toEqual({ status: "unavailable" });
  });
});

describe("navigatorDaysFor", () => {
  it("uses the server's state for each day it knows", () => {
    const state: WeekModelState = {
      status: "loaded",
      week: week([
        { date: DATES[0], state: "done" },
        { date: DATES[1], state: "missed" },
        { date: DATES[2], state: "rest" },
        { date: DATES[6], state: "future" },
      ]),
    };
    const days = navigatorDaysFor({ weekState: state, dates: DATES, ...labels });
    const byDate = new Map(days.map((d) => [d.localDate, d.state]));
    expect(byDate.get(DATES[0])).toBe("done");
    // `missed` maps onto the strip's actionable dot.
    expect(byDate.get(DATES[1])).toBe("open");
    expect(byDate.get(DATES[2])).toBe("rest");
    expect(byDate.get(DATES[6])).toBe("future");
  });

  it("claims nothing about a past day when the week is unavailable", () => {
    const days = navigatorDaysFor({
      weekState: { status: "unavailable" },
      dates: DATES,
      ...labels,
    });
    // The defect: past days read `missed` (strip state `open`) and days
    // ahead of today read `future`, both from the date alone. Neither may
    // appear, and every day carries the same no-information dot.
    expect(days.map((d) => d.state)).not.toContain("open");
    expect(days.map((d) => d.state)).not.toContain("future");
    expect(days.map((d) => d.state)).not.toContain("done");
    expect(new Set(days.map((d) => d.state)).size).toBe(1);
    expect(days).toHaveLength(DATES.length);
  });

  it("claims nothing while the week is still loading", () => {
    const days = navigatorDaysFor({
      weekState: { status: "loading" },
      dates: DATES,
      ...labels,
    });
    expect(days.map((d) => d.state)).not.toContain("open");
    expect(days.map((d) => d.state)).not.toContain("future");
  });

  it("leaves a day the server omitted unclaimed rather than guessing", () => {
    const days = navigatorDaysFor({
      weekState: {
        status: "loaded",
        week: week([{ date: DATES[0], state: "done" }]),
      },
      dates: DATES,
      ...labels,
    });
    expect(days[0]?.state).toBe("done");
    // Not `open`, which is what the old `?? (date > today ? ... : "missed")`
    // produced for every day the response did not carry.
    expect(days.slice(1).map((d) => d.state)).not.toContain("open");
  });
});
