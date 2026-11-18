import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDayViews } from "./dataCache";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  NUTRIENT_SCALE,
  type MealAssignment,
} from "@fitbud/contracts";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
import { enqueueAndPush } from "../sync/actions";
import { announceMealSaved, resetMealSavedNotice } from "./food/mealSavedNotice";
import { localDateInTimezone } from "../lib/dates";
import { createMemorySyncStore, createSyncEngine } from "../sync/engine";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const TZ = "Asia/Kolkata";
const DATE = localDateInTimezone(TZ);
const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const USER = "a0a69e20-297d-4101-a5e2-ecce9b8491cb";

function meal(
  id: string,
  name: string,
  status: "confirmed" | "pending",
  hour: number,
): MealAssignment {
  const hh = String(hour).padStart(2, "0");
  return mealAssignmentSchema.parse({
    id,
    coachingRelationshipId: REL,
    planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
    planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
    mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    mealName: name,
    localDate: DATE,
    windowStartsAt: `${DATE}T${hh}:00:00.000Z`,
    windowEndsAt: `${DATE}T${hh}:59:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
      order: 1,
      name,
      localTime: `${hh}:00`,
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    },
    compliance: null,
    createdAt: `${DATE}T00:00:00.000Z`,
    updatedAt: `${DATE}T00:00:00.000Z`,
  });
}

let items: MealAssignment[] = [];
const HOUR = 3_600_000;
function at(offsetHours: number) {
  return new Date(Date.now() + offsetHours * HOUR).toISOString();
}

function mealAt(
  id: string,
  name: string,
  status: MealAssignment["status"],
  window: [number, number],
  extra: Record<string, unknown> = {},
  kcal = 500,
): MealAssignment {
  const base = meal(id, name, "pending", 3);
  // Built without a second parse: the item and compliance shapes are the API's,
  // and only the fields Diet reads matter here.
  return {
    ...base,
    status,
    windowStartsAt: at(window[0]),
    windowEndsAt: at(window[1]),
    prescription: {
      ...base.prescription,
      items: [
        {
          snapshotKind: "calculated",
          sourceFoodLibraryItemId: "11111111-1111-4111-8111-111111111111",
          sourceServingId: "22222222-2222-4222-8222-222222222222",
          name: "Dal tadka",
          quantityScaled: NUTRIENT_SCALE,
          serving: {
            id: "22222222-2222-4222-8222-222222222222",
            label: "1 katori",
          },
          calculated: {
            energyKcalScaled: kcal * NUTRIENT_SCALE,
            proteinScaled: 20 * NUTRIENT_SCALE,
            carbsScaled: 40 * NUTRIENT_SCALE,
            fatScaled: 10 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    },
    ...extra,
  } as unknown as MealAssignment;
}

const api = new Proxy(
  {},
  {
    get(_t, key: string) {
      if (key === "then") return undefined;
      if (key === "listMealAssignments")
        return async () => {
          return { items, nextCursor: null };
        };
      if (key === "getMeDay") return async () => null;
      if (key === "getMeWeek") return async () => null;
      return async () => ({ items: [], nextCursor: null });
    },
  },
);
const auth = mockAuth({
  api,
  me: { id: USER, email: "aarav.ontrack@demo.fitbud.test", timezone: TZ },
});

vi.mock("../auth/AuthProvider", async () => {
  const actual = await vi.importActual<Record<string, unknown>>(
    "../auth/AuthProvider",
  );
  return { ...actual, useAuth: () => auth };
});
// A real engine and store; the push fails like airplane mode, so a queued
// confirm stays in the outbox.
const syncEngine = createSyncEngine(createMemorySyncStore(), {
  pushSync: async () => {
    throw new Error("offline");
  },
  pullSync: async () => {
    throw new Error("offline");
  },
});
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
    useConfig: () => ({
      config: null,
      loading: false,
      refresh: async () => undefined,
    }),
  };
});

const { DietTab } = await import("./DietTab");

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

const SNACK_ID = "c3333333-3333-4333-8333-333333333333";

function renderDiet() {
  return render(
    <DietTab
      relationship={relationship}
      selectedDate={DATE}
      onSelectDate={() => undefined}
      onOpenOverlay={() => undefined}
    />,
  );
}

beforeEach(() => {
  clearDayViews();
  resetMealSavedNotice();
});

describe("Diet after a manual log (TR-26f, Z12-43)", () => {
  it("shows the saved toast with View, the Logged myself row and its kcal", async () => {
    items = [
      mealAt(SNACK_ID, "Evening snack", "modified", [-1, 1], {
        compliance: {
          loggedByRole: "trainee",
          loggedAt: at(0),
          deviationKind: "logged_foods",
          notes: null,
          loggedItems: [
            { name: "Chapati / roti", quantity: 2, servingLabel: "1 medium chapati (40 g)", energyKcal: 162 },
            { name: "Ragi dosa", servingLabel: "1 piece", energyKcal: 120, custom: true },
          ],
          loggedTotals: { energyKcal: 320, proteinG: 9, carbsG: 50, fatG: 6 },
        },
      }),
    ];
    announceMealSaved({
      relationshipId: REL,
      assignmentId: SNACK_ID,
      localDate: DATE,
      mealName: "Evening snack",
      kcal: 320,
      kind: "logged_foods",
    });
    renderDiet();
    expect(await screen.findByText("Evening snack saved · 320 kcal")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("1 of 1 logged")).toBeTruthy());
    expect(screen.getByText("Logged myself")).toBeTruthy();
    expect(screen.getByText(/Chapati \/ roti × 2, ragi dosa/)).toBeTruthy();
    expect(screen.getByLabelText("Logged")).toBeTruthy();
    expect(screen.getAllByText("320").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "View" }));
    expect(await screen.findByTestId("logged-meal-sheet")).toBeTruthy();
    expect(screen.getByText("2 medium chapati (40 g)")).toBeTruthy();
  });

  it("the toast is shown once: a later visit does not repeat it", async () => {
    items = [mealAt(SNACK_ID, "Evening snack", "pending", [-1, 1])];
    announceMealSaved({
      relationshipId: REL,
      assignmentId: SNACK_ID,
      localDate: DATE,
      mealName: "Evening snack",
      kcal: 320,
      kind: "logged_foods",
    });
    const first = renderDiet();
    expect(await screen.findByText("Evening snack saved · 320 kcal")).toBeTruthy();
    first.unmount();
    renderDiet();
    await waitFor(() => expect(screen.getByText(/of 1 logged/)).toBeTruthy());
    expect(screen.queryByText("Evening snack saved · 320 kcal")).toBeNull();
  });

  it("offline, the changed meal reads Logged myself · not sent yet", async () => {
    items = [mealAt(SNACK_ID, "Evening snack", "pending", [-1, 1])];
    await enqueueAndPush(syncEngine, {
      recordId: SNACK_ID,
      operation: "meal.deviate",
      payload: { assignmentId: SNACK_ID, mealName: "Evening snack", body: {} },
    });
    announceMealSaved({
      relationshipId: REL,
      assignmentId: SNACK_ID,
      localDate: DATE,
      mealName: "Evening snack",
      kcal: 320,
      kind: "logged_foods",
    });
    renderDiet();
    expect(await screen.findByText("Logged myself · not sent yet")).toBeTruthy();
    expect(screen.getByText("Waiting to send 1")).toBeTruthy();
    expect(screen.getByText("1 of 1 logged")).toBeTruthy();
  });
});
