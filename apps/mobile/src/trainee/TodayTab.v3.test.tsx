/**
 * Today v3 (Z9-1): kcal ring, macro bars and Workout / Meals / Steps chips for
 * an empty and a partly logged day. happy-dom + react-native-web: proves the
 * text, roles and labels, not layout (the Expo web captures do that).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  mealAssignmentSchema,
  workoutAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
import { localDateInTimezone } from "../lib/dates";

const TIME_ZONE = "Asia/Kolkata";
const TODAY = localDateInTimezone(TIME_ZONE);

const relationship = coachingRelationshipSchema.parse({
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
});

const livePlan = effectivePlanResponseSchema.parse({
  plan: {
    id: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    coachingRelationshipId: relationship.id,
    title: "Strength block",
    createdAt: "2026-09-01T06:30:00.000Z",
    updatedAt: "2026-10-28T06:30:00.000Z",
  },
  version: {
    id: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    versionNumber: 3,
    status: "effective",
    recordVersion: 4,
    content: {
      workoutDays: [
        { id: "7a8b9c0d-1e2f-4304-9516-273849506172", order: 1, name: "Lower body B", exercises: [] },
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

function meal(
  n: number,
  name: string,
  status: MealAssignment["status"],
): MealAssignment {
  const id = `00000000-0000-4000-8000-0000000001${n}0`;
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: relationship.id,
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    mealPrescriptionId: `00000000-0000-4000-8000-0000000002${n}0`,
    mealName: name,
    localDate: TODAY,
    windowStartsAt: `${TODAY}T0${n}:00:00.000Z`,
    windowEndsAt: `${TODAY}T0${n}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: `00000000-0000-4000-8000-0000000003${n}0`,
      order: n,
      name,
      mealType: "lunch",
      photoRequired: false,
      items: [
        {
          name: "Vegetable poha",
          portionLabel: "1 bowl",
          calories: 400,
          proteinGrams: 20,
          carbsGrams: 60,
          fatGrams: 10,
        },
      ],
      instructions: null,
      scheduleHint: null,
    },
    compliance: null,
    createdAt: `${TODAY}T00:00:00.000Z`,
    updatedAt: `${TODAY}T00:00:00.000Z`,
  });
}

const workoutAssignment = workoutAssignmentSchema.parse({
  id: "00000000-0000-4000-8000-000000000501",
  coachingRelationshipId: relationship.id,
  planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
  planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
  workoutDayId: "7a8b9c0d-1e2f-4304-9516-273849506172",
  workoutDayName: "Lower body B",
  localDate: TODAY,
  windowStartsAt: `${TODAY}T13:00:00.000Z`,
  windowEndsAt: `${TODAY}T15:00:00.000Z`,
  status: "assigned",
  workoutDay: {
    id: "7a8b9c0d-1e2f-4304-9516-273849506172",
    order: 1,
    name: "Lower body B",
    exercises: [1, 2].map((n) => ({
      id: `00000000-0000-4000-8000-00000000060${n}`,
      order: n,
      name: n === 1 ? "Back squat" : "Romanian deadlift",
      instructions: null,
      setTargets: [1, 2, 3].map((o) => ({
        id: `00000000-0000-4000-8000-0000000007${n}${o}`,
        order: o,
        reps: 8,
        loadLabel: null,
        rpe: null,
      })),
    })),
  },
  execution: null,
  createdAt: `${TODAY}T00:00:00.000Z`,
  updatedAt: `${TODAY}T00:00:00.000Z`,
});

let workouts: unknown[] = [];
let meals: MealAssignment[] = [];
let stepsToday: unknown = { localDate: TODAY, steps: null, target: 8000 };

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "listWorkoutAssignments")
        return async () => ({ items: workouts, nextCursor: null });
      if (key === "listMealAssignments")
        return async () => ({ items: meals, nextCursor: null });
      if (key === "listCheckins")
        return async () => ({ items: [], nextCursor: null });
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      if (key === "getStepsToday") return async () => stepsToday;
      if (key === "then") return undefined;
      return async () => null;
    },
  },
);

const auth = mockAuth({
  api,
  me: {
    id: relationship.traineeUserId,
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
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../sync/SyncProvider",
  );
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: vi.fn(async () => undefined),
      store: { upsertLocal: vi.fn(), listLocal: vi.fn(async () => []) },
      enqueue: vi.fn(),
    }),
  };
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

const { TodayTab, effectivePlanStateFor } = await import("./TodayTab");

function renderToday() {
  return render(
    <TodayTab
      relationship={relationship}
      planState={effectivePlanStateFor(livePlan)}
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
}

beforeEach(() => {
  meals = [];
  workouts = [];
  stepsToday = { localDate: TODAY, steps: null, target: 8000 };
});

describe("Today v3 summary", () => {
  it("empty day: zero ring, zero bars, Meals 0 of N, Set up steps", async () => {
    meals = [
      meal(1, "Early morning", "pending"),
      meal(2, "Breakfast", "pending"),
    ];
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByTestId("today-summary")).toBeTruthy();
    });
    expect(screen.getByLabelText("0 of 800 kcal")).toBeTruthy();
    expect(screen.getByLabelText("Protein 0 of 40 g")).toBeTruthy();
    expect(screen.getByLabelText("Meals 0 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Workout 0 of 0")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps: set up steps")).toBeTruthy();
    });
    expect(view.container.textContent).not.toMatch(/%|\bleft\b/);
    // No workout today: the rest line stays until Z9-2 draws the rest card.
    expect(screen.getByText("Rest day. Recovery is part of the plan.")).toBeTruthy();
  });

  it("partial day: logged kcal and macros against the plan, server steps", async () => {
    meals = [
      meal(1, "Early morning", "confirmed"),
      meal(2, "Breakfast", "pending"),
    ];
    stepsToday = { localDate: TODAY, steps: 6240, target: 8000 };
    const view = renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("400 of 800 kcal")).toBeTruthy();
    });
    expect(screen.getByLabelText("Protein 20 of 40 g")).toBeTruthy();
    expect(screen.getByLabelText("Meals 1 of 2")).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps 6,240 of 8,000")).toBeTruthy();
    });
    expect(view.container.textContent).not.toMatch(/%|\bleft\b/);
  });

  it("a failed steps read says unavailable, not 'set up steps'", async () => {
    stepsToday = null;
    meals = [meal(1, "Early morning", "pending")];
    renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Steps unavailable")).toBeTruthy();
    });
  });

  it("scheduled workout: chip reads 0 of 1 and the workout leads as the hero", async () => {
    workouts = [workoutAssignment];
    meals = [meal(1, "Early morning", "pending")];
    renderToday();
    await waitFor(() => {
      expect(screen.getByLabelText("Workout 0 of 1")).toBeTruthy();
    });
    expect(screen.getByText("Lower body B")).toBeTruthy();
    expect(
      screen.getByText(/^2 exercises(?: · about \d+ min)? · 6 sets$/),
    ).toBeTruthy();
    expect(screen.getByLabelText("Start workout")).toBeTruthy();
  });

  it("meals are a flat list with a logged count and a status chip per row", async () => {
    meals = [
      meal(1, "Early morning", "confirmed"),
      meal(2, "Breakfast", "pending"),
    ];
    renderToday();
    await waitFor(() => {
      expect(screen.getByText("1 of 2 logged ›")).toBeTruthy();
    });
    expect(screen.getByText("Logged")).toBeTruthy();
  });
});
