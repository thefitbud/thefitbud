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
import { mockAuth, render, screen } from "../test/render";
import {
  TraineeDateNavigator,
  WEEK_UNAVAILABLE_MESSAGE,
  loadWeekModel,
  navigatorDaysFor,
  type WeekModelState,
} from "./TraineeDateNavigator";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const auth = mockAuth({
  me: { timezone: "Asia/Kolkata" },
  // Any call through the api client is a failure in these tests: the strip
  // must read the week it is handed and fetch nothing of its own.
  api: new Proxy(
    {},
    {
      get(_target, key) {
        if (key === "then") return undefined;
        return () => {
          throw new Error(`the date strip must not call api.${String(key)}`);
        };
      },
    },
  ),
});
vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

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

/**
 * The retry the screen promises has to work (CU23 review fix).
 *
 * `TraineeDateNavigator` used to fetch `GET /me/week` itself, in a
 * `useCallback` keyed on the api client and the selected week — neither of
 * which changes on a pull-to-refresh — behind an effect that depended only on
 * that callback, in a component the host renders without a `key`. So it
 * mounted once and never re-fetched. When the API was briefly unreachable the
 * strip showed seven no-information dots and told the trainee to pull down;
 * they pulled down, the host's own week load succeeded and rendered the real
 * "This week" rollup, and the strip above it still said the week could not be
 * loaded. Nothing short of changing week or leaving the screen cleared it:
 * two components on one screen asserting opposite things about the same week,
 * with an on-screen remedy that could not work (D-W3b-32; CU24's "Neither
 * screen promises a retry it cannot perform", `TodayTab.tsx`).
 *
 * The fix makes the host's week the single source of truth and this component
 * presentational. These tests fail if it ever reads its own copy again: the
 * mocked api client throws on any call, and the strip must follow a new
 * `weekState` prop without being remounted.
 */
describe("the date strip follows the host's week", () => {
  const props = {
    selectedDate: "2026-10-15",
    onSelectDate: () => {},
    showPreviewBanner: false,
  };

  function dotCount(container: HTMLElement): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const node of container.querySelectorAll("div")) {
      const bg = (node as HTMLElement).style.backgroundColor;
      if (!bg) continue;
      counts[bg] = (counts[bg] ?? 0) + 1;
    }
    return counts;
  }

  it("fetches nothing of its own", () => {
    // The api client throws on every call, so a render that completes is
    // proof the strip made none.
    const view = render(
      <TraineeDateNavigator
        {...props}
        weekState={{ status: "unavailable" }}
      />,
    );
    expect(screen.getAllByRole("button").length).toBeGreaterThan(0);
    view.unmount();
  });

  it("clears a stale unavailable strip when the host reloads the week, without remounting", () => {
    const view = render(
      <TraineeDateNavigator
        {...props}
        weekState={{ status: "unavailable" }}
      />,
    );
    // Seven days, all carrying the same no-information dot.
    const unavailableDots = dotCount(view.container);
    expect(Object.keys(unavailableDots)).toHaveLength(1);

    // The same element tree, re-rendered with the week the host's retry
    // loaded. No `key` change and no unmount: this is exactly what a
    // pull-to-refresh does to this component.
    view.rerender(
      <TraineeDateNavigator
        {...props}
        weekState={{
          status: "loaded",
          week: week([
            { date: "2026-10-12", state: "done" },
            { date: "2026-10-13", state: "done" },
            { date: "2026-10-14", state: "missed" },
            { date: "2026-10-15", state: "rest" },
          ]),
        }}
      />,
    );
    const loadedDots = dotCount(view.container);
    // The strip now shows the real week: more than one distinct dot, and not
    // the single no-information colour it was stuck on.
    expect(Object.keys(loadedDots).length).toBeGreaterThan(1);
    expect(loadedDots).not.toEqual(unavailableDots);
    view.unmount();
  });

  it("says nothing about a failed week itself, leaving that to the host's card and its retry", () => {
    const view = render(
      <TraineeDateNavigator
        {...props}
        weekState={{ status: "unavailable" }}
      />,
    );
    // The host carries the one copy of this sentence, next to the control
    // that performs the retry. A second copy here, with no control, is the
    // duplication the review flagged.
    expect(screen.queryByText(WEEK_UNAVAILABLE_MESSAGE)).toBeNull();
    expect(view.container.textContent).not.toContain("Pull down to try again");
    view.unmount();
  });
});
