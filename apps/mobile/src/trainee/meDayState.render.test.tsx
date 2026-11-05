/**
 * The trainee's selected day shows the state `GET /me/day/:date` returned
 * (Z5-8, G10; BT17 made `state` part of `MeDayResponse`).
 *
 * Before Z5-8 the mobile app fetched `/me/day` on Today and Diet but never
 * read its `state`: the strip took every day, the selected one included, from
 * `/me/week` alone, so a selected day whose week failed to load showed the
 * no-information dot although the day's own response said what happened on
 * it. These tests render the strip from a parsed `MeDayResponse` and check
 * the selected day says that state, one test per state the contract allows.
 *
 * Harness limits (CU6): happy-dom plus react-native-web. `Platform.OS` is
 * "web" here, so `TraineeDateNavigator` and `TodayTab` render the web strip
 * (`WebDateHeading`), which at this commit shows the state by dot colour only;
 * those tests compare dot colours. The per-state spoken name is read from
 * the native strip (`DateNavigator`) rendered directly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  meDayResponseSchema,
  type MeDayResponse,
  type WeekDayState,
  type WeekReadModel,
} from "@fitbud/contracts";
import { DateNavigator, colors } from "@fitbud/ui-mobile";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone, weekDatesFrom, startOfWeekMonday } from "../lib/dates";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);

/** Realistic `/me/day` body, parsed by the contract the API answers with. */
function meDay(date: string, state: WeekDayState): MeDayResponse {
  return meDayResponseSchema.parse({
    date,
    state,
    assignments: {
      workouts: [
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", name: "Upper body A" },
      ],
      meals: [
        { id: "2b3c4d5e-6f70-4812-9a3b-4c5d6e7f8091", slotKey: "breakfast" },
      ],
    },
    logs: { workouts: state === "done" ? 1 : 0, meals: 1 },
    totals: {
      kcalScaled: 420,
      perMeal: [{ slotKey: "breakfast", kcalScaled: 420 }],
    },
  });
}

let dayResponse: MeDayResponse | null = null;
let weekResponse: WeekReadModel | null = null;

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "then") return undefined;
      if (key === "getMeDay") return async () => dayResponse;
      if (key === "getMeWeek") return async () => weekResponse;
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      return async () => ({ items: [], nextCursor: null });
    },
  },
);

const auth = mockAuth({
  api,
  me: {
    id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
    email: "aarav.ontrack@demo.fitbud.test",
    timezone: TIME_ZONE,
  },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});

const syncEngine = {
  pullAndApply: vi.fn(async () => undefined),
  store: {
    upsertLocal: vi.fn(async () => undefined),
    listLocal: vi.fn(async () => []),
    listOutbox: vi.fn(async () => []),
  },
  enqueue: vi.fn(async () => undefined),
};

vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return { ...actual, useSyncEngine: () => syncEngine };
});

vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../providers/ConfigProvider",
  );
  return {
    ...actual,
    useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }),
  };
});

const { navigatorDaysFor, TraineeDateNavigator } = await import(
  "./TraineeDateNavigator"
);
const { TodayTab, effectivePlanStateFor } = await import("./TodayTab");

const WEEK = weekDatesFrom(startOfWeekMonday(TODAY));
const labels = {
  timeZone: TIME_ZONE,
  weekdayShortOf: () => "Wed",
  dayOfMonthOf: (_tz: string, date: string) => date.slice(8),
};

/** What the native strip says for each server state (BT13's phrases). */
const SPOKEN: Record<WeekDayState, string> = {
  done: "done",
  partial: "partial",
  missed: "open",
  rest: "rest",
  future: "future",
};
const STATES = Object.keys(SPOKEN) as WeekDayState[];

/** react-native-web writes a hex colour inline as `rgba(r, g, b, 1.00)`. */
function hexToRgb(hex: string): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 1.00)`;
}

/**
 * Background colours of the web strip's dots, in day order: the one inline
 * background inside each day button (the pill's own styles are classes).
 */
function dotColours(container: HTMLElement): string[] {
  const out: string[] = [];
  for (const button of container.querySelectorAll('[role="button"]')) {
    for (const node of button.querySelectorAll("div")) {
      const bg = (node as HTMLElement).style.backgroundColor;
      if (bg) out.push(bg);
    }
  }
  return out;
}

const WEB_DOT: Partial<Record<WeekDayState, string>> = {
  done: colors.success,
  partial: colors.warning,
  missed: colors.indigo,
  rest: colors.lightGrey,
};

beforeEach(() => {
  dayResponse = null;
  weekResponse = null;
});

describe("navigatorDaysFor reads MeDayResponse.state", () => {
  it.each(STATES)(
    "the selected day speaks %s when the week did not load",
    (state) => {
      const date = WEEK[2]!;
      const days = navigatorDaysFor({
        weekState: { status: "unavailable" },
        dates: WEEK,
        ...labels,
        day: meDay(date, state),
      });
      render(
        <DateNavigator
          days={days}
          selectedDate={date}
          todayDate={TODAY}
          onSelect={() => {}}
          onToday={() => {}}
        />,
      );
      expect(
        screen.getByRole("button", {
          name: `Wed ${date.slice(8)}, ${SPOKEN[state]}`,
        }),
      ).toBeTruthy();
    },
  );

  it("the day's own state wins over the week's for that date", () => {
    const date = WEEK[1]!;
    const days = navigatorDaysFor({
      weekState: {
        status: "loaded",
        week: {
          start: WEEK[0]!,
          workouts: { assigned: 1, completed: 0 },
          meals: { assigned: 0, logged: 0 },
          days: [
            {
              date,
              state: "missed",
              workoutLabel: "Upper body A",
              mealsLogged: 0,
              mealsAssigned: 0,
              mealSlots: [],
            },
          ],
          todayNutrition: {
            date: TODAY,
            logged: { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
            assigned: null,
          },
        },
      },
      dates: WEEK,
      ...labels,
      day: meDay(date, "done"),
    });
    expect(days[1]?.state).toBe("done");
  });

  it("applies only to the date the response names", () => {
    const days = navigatorDaysFor({
      weekState: { status: "unavailable" },
      dates: WEEK,
      ...labels,
      day: meDay(WEEK[4]!, "done"),
    });
    expect(days.map((d) => d.state)).toEqual([
      "unknown",
      "unknown",
      "unknown",
      "unknown",
      "done",
      "unknown",
      "unknown",
    ]);
  });
});

describe("the strip hosts pass the day through", () => {
  it.each(["done", "partial", "missed", "rest"] as const)(
    "TraineeDateNavigator paints the selected day %s from its day prop",
    (state) => {
      const date = WEEK[3]!;
      const view = render(
        <TraineeDateNavigator
          selectedDate={date}
          onSelectDate={() => {}}
          showPreviewBanner={false}
          weekState={{ status: "unavailable" }}
          day={meDay(date, state)}
        />,
      );
      const dots = dotColours(view.container);
      expect(dots).toHaveLength(7);
      expect(dots[3]).toBe(hexToRgb(WEB_DOT[state]!));
      view.unmount();
    },
  );

  it.each(["done", "partial", "missed", "rest"] as const)(
    "TodayTab shows today's %s from GET /me/day when the week fails",
    async (state) => {
      dayResponse = meDay(TODAY, state);
      weekResponse = null;
      const view = render(
        <TodayTab
          relationship={coachingRelationshipSchema.parse({
            id: "1b65e3ad-84cf-4fe1-a546-0d62656c2c79",
            trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
            traineeUserId: "a0a69e20-297d-4101-a5e2-ecce9b8491cb",
            status: "active",
            onboardingStatus: "coaching_ready",
            invitationId: null,
            startedAt: "2026-09-01T06:30:00.000Z",
            endedAt: null,
            createdAt: "2026-09-01T06:30:00.000Z",
            updatedAt: "2026-11-01T06:30:00.000Z",
            trainerDisplayName: "Rahul Verma",
          })}
          planState={effectivePlanStateFor(
            effectivePlanResponseSchema.parse({ plan: null, version: null }),
          )}
          planCacheError={null}
          selectedDate={TODAY}
          onSelectDate={() => undefined}
          onStartWorkout={() => undefined}
          onOpenDiet={() => undefined}
          onOpenCheckin={() => undefined}
          onRefreshPlan={() => undefined}
          onOpenOverlay={() => undefined}
        />,
      );
      const todayIndex = WEEK.indexOf(TODAY);
      await waitFor(() => {
        expect(dotColours(view.container)[todayIndex]).toBe(
          hexToRgb(WEB_DOT[state]!),
        );
      });
      view.unmount();
    },
  );
});
