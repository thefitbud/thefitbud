/**
 * Z12-39 / D-W12-7: future days are view only, on Today, Diet and Workout.
 *
 * On a day after the trainee's today (their stored zone) each tab shows the
 * plan with no log action: no Start workout, Eaten as planned, Something
 * different, Not today or ⋯ options. Diet and Workout say "Opens on {day}",
 * Today keeps "Logging opens on the day.", and a planned meal opens the
 * read-only planned meal. The same fixtures on today do show the actions, so
 * the gate is the date and nothing else.
 *
 * DOM-shaped harness (react-native-web): it proves text, roles and labels,
 * not layout. The device flow F29 covers the rest.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  NUTRIENT_SCALE,
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  mealAssignmentSchema,
  workoutAssignmentSchema,
  type MealAssignment,
  type WorkoutAssignment,
} from "@fitbud/contracts";
import { formatCivilDate } from "@fitbud/core";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
import { addDays, localDateInTimezone } from "../lib/dates";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const TZ = "Asia/Kolkata";
const TODAY = localDateInTimezone(TZ);
const TOMORROW = addDays(TODAY, 1);
const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const PLAN = "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60";
const VERSION = "5c6d7e8f-9a0b-41c2-83d4-e5f607182930";

const relationship = coachingRelationshipSchema.parse({
  id: REL,
  trainerUserId: "a00ed048-8bac-4010-b641-dd888c8a8730",
  traineeUserId: USER,
  status: "active",
  onboardingStatus: "coaching_ready",
  invitationId: null,
  startedAt: "2026-09-01T06:30:00.000Z",
  endedAt: null,
  createdAt: "2026-09-01T06:30:00.000Z",
  updatedAt: "2026-11-01T06:30:00.000Z",
  trainerDisplayName: "Rahul Verma",
});

const livePlan = effectivePlanResponseSchema.parse({
  plan: {
    id: PLAN,
    coachingRelationshipId: REL,
    title: "Strength block",
    createdAt: "2026-09-01T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
  version: {
    id: VERSION,
    planId: PLAN,
    versionNumber: 3,
    status: "effective",
    recordVersion: 4,
    content: {
      workoutDays: [
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", order: 1, name: "Upper body A", exercises: [] },
      ],
      mealPrescriptions: [],
    },
    creationSource: "blank",
    sourceTemplateId: null,
    publishedAt: "2026-10-28T06:30:00.000Z",
    effectiveFrom: "2026-10-28T06:30:00.000Z",
    effectiveTo: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
});

/** Local midnight of a civil date in Kolkata, as the API's windows start. */
const localMidnight = (date: string) => `${addDays(date, -1)}T18:30:00.000Z`;

function breakfast(id: string, localDate: string): MealAssignment {
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: PLAN,
    planVersionId: VERSION,
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: "Breakfast",
    localDate,
    windowStartsAt: localMidnight(localDate),
    windowEndsAt: `${localDate}T18:29:00.000Z`,
    photoRequired: false,
    status: "pending",
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name: "Breakfast",
      localTime: "08:30",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [
        {
          snapshotKind: "legacy",
          name: "Moong dal chilla",
          classification: null,
          basis: null,
          canonical: null,
          serving: { label: "2 pieces", unit: "piece", conversionScaled: null },
          quantityScaled: NUTRIENT_SCALE,
          calculated: {
            energyKcalScaled: 380 * NUTRIENT_SCALE,
            proteinScaled: 18 * NUTRIENT_SCALE,
            carbsScaled: 44 * NUTRIENT_SCALE,
            fatScaled: 12 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    },
    compliance: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  });
}

function upperBody(id: string, localDate: string): WorkoutAssignment {
  return workoutAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: PLAN,
    planVersionId: VERSION,
    workoutDayId: "7a8b9c0d-1e2f-4304-9516-273849506172",
    workoutDayName: "Upper body A",
    localDate,
    windowStartsAt: localMidnight(localDate),
    windowEndsAt: `${localDate}T18:29:00.000Z`,
    status: "assigned",
    scheduleStatus: "scheduled",
    workoutDay: {
      id: "7a8b9c0d-1e2f-4304-9516-273849506172",
      order: 1,
      name: "Upper body A",
      exercises: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          order: 1,
          name: "Bench press",
          instructions: null,
          setTargets: [
            { id: "33333333-3333-4333-8333-333333333331", order: 1, reps: 8, loadLabel: "30kg", rpe: 7 },
          ],
        },
      ],
    },
    execution: null,
    createdAt: "2026-10-28T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  });
}

const meals = [
  breakfast("a1111111-1111-4111-8111-111111111111", TODAY),
  breakfast("b2222222-2222-4222-8222-222222222222", TOMORROW),
];
const workouts = [
  upperBody("c3333333-3333-4333-8333-333333333333", TODAY),
  upperBody("d4444444-4444-4444-8444-444444444444", TOMORROW),
];

type Range = { fromDate?: string; toDate?: string };
const inRange = <T extends { localDate: string }>(items: T[], range?: Range) =>
  items.filter(
    (item) =>
      (!range?.fromDate || item.localDate >= range.fromDate) &&
      (!range?.toDate || item.localDate <= range.toDate),
  );

const api = new Proxy(
  {},
  {
    get(_target, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments") {
        return async (_rel: string, range?: Range) => ({ items: inRange(meals, range), nextCursor: null });
      }
      if (key === "listWorkoutAssignments") {
        return async (_rel: string, range?: Range) => ({ items: inRange(workouts, range), nextCursor: null });
      }
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "getMeDay" || key === "getMeWeek") return async () => null;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);
const auth = mockAuth({ api, me: { id: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: TZ } });

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
// One engine for the whole file, as the real provider gives: the tabs' loads
// depend on its identity, so a new object per render would reload for ever.
const syncEngine = {
  pullAndApply: async () => undefined,
  store: {
    upsertLocal: async () => undefined,
    listLocal: async () => [],
    listOutbox: async () => [],
    getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
  },
  enqueue: async () => undefined,
};
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return { ...actual, useSyncEngine: () => syncEngine };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return { ...actual, useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }) };
});

const { TodayTab } = await import("./TodayTab");
const { DietTab } = await import("./DietTab");
const { WorkoutTab } = await import("./WorkoutTab");
const { invalidateRelationshipDayData } = await import("./dataCache");

const LOG_ACTIONS = ["Start workout", "Eaten as planned", "Something different", "More options"];
const OPENS_ON = `Opens on ${formatCivilDate(TOMORROW)}`;
const WEEKDAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(
  new Date(`${TOMORROW}T00:00:00.000Z`),
);

function expectNoLogActions() {
  for (const label of LOG_ACTIONS) {
    expect(screen.queryByLabelText(label), label).toBeNull();
    expect(screen.queryByText(label), label).toBeNull();
  }
}

beforeEach(() => {
  invalidateRelationshipDayData(REL);
});

function renderToday(selectedDate: string, onOpenOverlay = vi.fn()) {
  render(
    <TodayTab
      relationship={relationship}
      planState={{ status: "loaded", plan: livePlan }}
      planCacheError={null}
      selectedDate={selectedDate}
      onSelectDate={() => undefined}
      onStartWorkout={() => undefined}
      onOpenDiet={() => undefined}
      onOpenCheckin={() => undefined}
      onRefreshPlan={() => undefined}
      onOpenOverlay={onOpenOverlay}
    />,
  );
  return onOpenOverlay;
}

describe("Today on a future day (TR-06d)", () => {
  it("keeps 'Logging opens on the day.', previews the workout and offers nothing to log", async () => {
    const onOpenOverlay = renderToday(TOMORROW);
    await waitFor(() =>
      expect(
        screen.getByLabelText(`This is Rahul’s plan for ${WEEKDAY}. Logging opens on the day.`),
      ).toBeTruthy(),
    );
    expect(screen.getByText("Upper body A")).toBeTruthy();
    expectNoLogActions();

    fireEvent.click(screen.getByLabelText("Preview exercises"));
    expect(onOpenOverlay).toHaveBeenCalledWith({
      screen: "workout_overview",
      assignmentId: workouts[1]!.id,
      viewOnly: true,
    });

    // The planned meal opens read-only: the plan, and no way to log it.
    fireEvent.click(screen.getByLabelText("Breakfast, planned"));
    await waitFor(() => expect(screen.getByText("Moong dal chilla")).toBeTruthy());
    expect(screen.getByText(/^Planned for /)).toBeTruthy();
    expect(screen.getByText(/from Rahul’s plan$/)).toBeTruthy();
    expectNoLogActions();
  });

  it("today's same plan still has its log actions", async () => {
    renderToday(TODAY);
    await waitFor(() => expect(screen.getByLabelText("Start workout")).toBeTruthy());
    expect(screen.queryByText(/Logging opens on the day\./)).toBeNull();
    expect(screen.queryByLabelText("Preview exercises")).toBeNull();
  });
});

describe("Diet on a future day (TR-07k)", () => {
  function renderDiet(selectedDate: string) {
    render(
      <DietTab
        relationship={relationship}
        selectedDate={selectedDate}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
  }

  it("says 'Opens on {day}', lists the plan and logs nothing", async () => {
    renderDiet(TOMORROW);
    await waitFor(() =>
      expect(
        screen.getByLabelText(`${OPENS_ON}. You can see Rahul’s plan now and log it on the day.`),
      ).toBeTruthy(),
    );
    await waitFor(() => expect(screen.getByLabelText("Breakfast, planned")).toBeTruthy());
    expectNoLogActions();

    fireEvent.click(screen.getByLabelText("Breakfast, planned"));
    await waitFor(() => expect(screen.getByText("Moong dal chilla")).toBeTruthy());
    expectNoLogActions();
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByText("Moong dal chilla")).toBeNull());
  });

  it("a future day with no meals does not claim to be today", async () => {
    renderDiet(addDays(TODAY, 2));
    // The summary line and the empty card both say it.
    await waitFor(() => expect(screen.getAllByText("No meals planned").length).toBe(2));
    expect(screen.queryByText("No meals planned today.")).toBeNull();
  });

  it("today's meal can still be logged", async () => {
    renderDiet(TODAY);
    await waitFor(() => expect(screen.getByLabelText("Eaten as planned")).toBeTruthy());
    expect(screen.queryByText(/^Opens on /)).toBeNull();
  });
});

describe("Workout on a future day (W-01e)", () => {
  function renderWorkout(selectedDate: string, onOpenOverlay = vi.fn()) {
    render(
      <WorkoutTab
        relationship={relationship}
        selectedDate={selectedDate}
        onOpenOverlay={onOpenOverlay}
      />,
    );
    return onOpenOverlay;
  }

  it("shows 'Opens on {day}' where Start workout was, with no skip", async () => {
    const onOpenOverlay = renderWorkout(TOMORROW);
    await waitFor(() => expect(screen.getByLabelText(OPENS_ON)).toBeTruthy());
    expectNoLogActions();
    expect(screen.queryByText("Not today")).toBeNull();

    // Its overview opens as a preview, with no Start.
    fireEvent.click(screen.getByLabelText("Upper body A, workout details"));
    expect(onOpenOverlay).toHaveBeenCalledWith({
      screen: "workout_overview",
      assignmentId: workouts[1]!.id,
      viewOnly: true,
    });
  });

  it("today's workout can still be started", async () => {
    renderWorkout(TODAY);
    await waitFor(() => expect(screen.getByLabelText("Start workout")).toBeTruthy());
    expect(screen.queryByText(/^Opens on /)).toBeNull();
  });
});
