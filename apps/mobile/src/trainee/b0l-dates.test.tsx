/**
 * B0L (Z11-3): no ISO date reaches a trainee on Today or Diet in any state, and
 * the Diet day summary kcal equals the sum of the logged meal rows (D-W11-6).
 */
import { describe, expect, it, vi } from "vitest";
import {
  coachingRelationshipSchema,
  effectivePlanResponseSchema,
  mealAssignmentSchema,
  type MealAssignment,
} from "@fitbud/contracts";
import { mockAuth, render, screen, waitFor } from "../test/render";
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
const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";
const ISO = /\d{4}-\d{2}-\d{2}/;

function meal(
  n: number,
  status: MealAssignment["status"],
  date: string,
  loggedKcal?: number,
): MealAssignment {
  const slot = `00000000-0000-4000-8000-0000000003${n}0`;
  return mealAssignmentSchema.parse({
    id: `00000000-0000-4000-8000-0000000001${n}0`,
    coachingRelationshipId: REL,
    planId: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
    mealPrescriptionId: `00000000-0000-4000-8000-0000000002${n}0`,
    mealName: `Meal ${n}`,
    localDate: date,
    windowStartsAt: `${date}T0${n}:00:00.000Z`,
    windowEndsAt: `${date}T0${n}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: slot,
      order: n,
      name: `Meal ${n}`,
      mealType: "lunch",
      photoRequired: false,
      items: [
        { name: "Vegetable poha", portionLabel: "1 bowl", calories: 400, proteinGrams: 20, carbsGrams: 60, fatGrams: 10 },
      ],
      instructions: null,
      scheduleHint: null,
    },
    compliance:
      loggedKcal == null
        ? null
        : {
            id: `00000000-0000-4000-8000-0000000004${n}0`,
            assignmentId: `00000000-0000-4000-8000-0000000001${n}0`,
            coachingRelationshipId: REL,
            planVersionId: "5c6d7e8f-9a0b-41c2-83d4-e5f607182930",
            traineeUserId: USER,
            outcome: "modified",
            recordVersion: 1,
            loggedAt: `${date}T03:00:00.000Z`,
            deviationKind: "portion_adjustment",
            notes: null,
            photoRequired: false,
            photoIntent: null,
            mediaAssetId: null,
            loggedByRole: "trainee",
            lastEditedByRole: null,
            loggedTotals: { energyKcal: loggedKcal, proteinG: 10, carbsG: 30, fatG: 5 },
            createdAt: `${date}T03:00:00.000Z`,
            updatedAt: `${date}T03:00:00.000Z`,
          },
    createdAt: `${date}T00:00:00.000Z`,
    updatedAt: `${date}T00:00:00.000Z`,
  });
}

let meals: MealAssignment[] = [];
let offline = false;

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments")
        return async () => {
          if (offline) throw new Error("offline");
          return { items: meals, nextCursor: null };
        };
      if (key === "listWorkoutAssignments" || key === "listCheckins" || key === "listNotifications")
        return async () => ({ items: [], nextCursor: null });
      if (key === "listMeCoachNotes") return async () => ({ items: [] });
      return async () => null;
    },
  },
);
const auth = mockAuth({ api, me: { id: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: TZ } });

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../auth/AuthProvider");
  return { ...actual, useAuth: () => auth };
});
vi.mock("../sync/SyncProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../sync/SyncProvider");
  return {
    ...actual,
    useSyncEngine: () => ({
      pullAndApply: async () => undefined,
      store: {
        upsertLocal: async () => undefined,
        listLocal: async () => [],
        listOutbox: async () => [],
        getMeta: async () => ({ cursor: null, lastSyncedAt: null }),
      },
      enqueue: async () => undefined,
    }),
  };
});
vi.mock("../providers/ConfigProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("../providers/ConfigProvider");
  return { ...actual, useConfig: () => ({ config: null, loading: false, refresh: async () => undefined }) };
});

const { DietTab } = await import("./DietTab");
const { TodayTab, effectivePlanStateFor } = await import("./TodayTab");

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
    id: "3f4a9b2c-1d5e-4f60-9a71-8b2c3d4e5f60",
    coachingRelationshipId: REL,
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

function renderDiet(date: string) {
  return render(
    <DietTab
      relationship={relationship}
      selectedDate={date}
      onSelectDate={() => undefined}
      onOpenOverlay={() => undefined}
    />,
  );
}
function renderToday(date: string) {
  return render(
    <TodayTab
      relationship={relationship}
      planState={effectivePlanStateFor(livePlan)}
      planCacheError={null}
      selectedDate={date}
      onSelectDate={() => undefined}
      onStartWorkout={() => undefined}
      onOpenDiet={() => undefined}
      onOpenCheckin={() => undefined}
      onRefreshPlan={() => undefined}
      onOpenOverlay={() => undefined}
    />,
  );
}

const PAST = addDays(TODAY, -3);
const states: Array<[string, string, MealAssignment[], boolean]> = [
  ["empty", TODAY, [], false],
  ["partial", TODAY, [meal(1, "confirmed", TODAY), meal(2, "modified", TODAY, 250), meal(3, "pending", TODAY)], false],
  ["done", TODAY, [meal(1, "confirmed", TODAY), meal(2, "confirmed", TODAY)], false],
  ["past", PAST, [meal(1, "confirmed", PAST), meal(2, "pending", PAST)], false],
  ["offline", TODAY, [meal(1, "confirmed", TODAY)], true],
];

describe("no ISO dates on Today or Diet", () => {
  for (const [name, date, items, isOffline] of states) {
    it(`Diet ${name}`, async () => {
      meals = items;
      offline = isOffline;
      const view = renderDiet(date);
      await waitFor(() => expect(view.container.textContent).toMatch(/kcal/));
      expect(view.container.textContent).not.toMatch(ISO);
    });
    it(`Today ${name}`, async () => {
      meals = items;
      offline = isOffline;
      const view = renderToday(date);
      await waitFor(() => expect(view.container.textContent!.length).toBeGreaterThan(20));
      expect(view.container.textContent).not.toMatch(ISO);
    });
  }

  it("Diet summary kcal equals the sum of the logged rows", async () => {
    meals = [meal(1, "confirmed", TODAY), meal(2, "modified", TODAY, 250), meal(3, "pending", TODAY)];
    offline = false;
    const view = renderDiet(TODAY);
    // 400 (confirmed, plan) + 250 (changed, logged); the pending meal adds nothing.
    await waitFor(() => expect(screen.getAllByText(/650/).length).toBeGreaterThan(0));
    expect(view.container.textContent).toMatch(/650\s*of\s*1,?200\s*kcal/);
  });
});
