import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearDayViews } from "./dataCache";
import {
  coachingRelationshipSchema,
  mealAssignmentSchema,
  NUTRIENT_SCALE,
  type MealAssignment,
} from "@fitbud/contracts";
import { ApiClientError } from "@fitbud/api-client";
import { reportError } from "../lib/reportError";
import { fireEvent, mockAuth, render, screen, waitFor } from "../test/render";
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
let listFails = false;
let listError: unknown = null;
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
          if (listFails) throw listError ?? new Error("boom");
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

const { DietTab, RING_NUMBER_FIT } = await import("./DietTab");

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

describe("Diet day v3 (Z12-42)", () => {
  it("a locked, changed meal has no Change button; an unlocked one has it", async () => {
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Breakfast",
        "modified",
        [-6, -5],
        {
          loggingLocked: true,
          loggingLockReason: "edit_window_closed",
        },
      ),
      mealAt(
        "b2222222-2222-4222-8222-222222222222",
        "Lunch",
        "modified",
        [-4, -3],
        {
          compliance: {
            loggedByRole: "trainee",
            loggedTotals: {
              energyKcal: 320,
              proteinG: 10,
              carbsG: 40,
              fatG: 8,
            },
          },
        },
      ),
    ];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("2 of 2 logged")).toBeTruthy());
    expect(screen.queryByLabelText("Change Breakfast")).toBeNull();
    expect(screen.getByLabelText("Change Lunch")).toBeTruthy();
  });

  it("the Log {meal} ellipsis on a missed meal is a 44 pt target", async () => {
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Breakfast",
        "overdue",
        [-6, -5],
      ),
      mealAt(
        "b2222222-2222-4222-8222-222222222222",
        "Lunch",
        "overdue",
        [-4, -3],
      ),
    ];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("0 of 2 logged")).toBeTruthy());
    // The first missed meal is the focus card; the other is a row with the ellipsis.
    const button = await screen.findByLabelText(/^Log (Breakfast|Lunch)$/);
    const style = getComputedStyle(button);
    expect(parseFloat(style.width)).toBeGreaterThanOrEqual(44);
    expect(parseFloat(style.height)).toBeGreaterThanOrEqual(44);
  });

  it("offers Eaten as planned only once the meal's window has opened", async () => {
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Dinner",
        "pending",
        [5, 6],
      ),
    ];
    const view = render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByText("0 of 1 logged")).toBeTruthy());
    expect(screen.queryByLabelText("Eaten as planned")).toBeNull();
    view.unmount();
    clearDayViews();
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Dinner",
        "pending",
        [-1, 1],
      ),
    ];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Eaten as planned")).toBeTruthy(),
    );
  });

  it("a row opens its planned meal; actions only once its window is open", async () => {
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Lunch",
        "pending",
        [-1, 1],
      ),
      mealAt(
        "b2222222-2222-4222-8222-222222222222",
        "Dinner",
        "pending",
        [5, 6],
      ),
    ];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Dinner, planned")).toBeTruthy(),
    );
    fireEvent.click(screen.getByLabelText("Dinner, planned"));
    await waitFor(() => expect(screen.getByLabelText("Close")).toBeTruthy());
    // Dinner has not opened: read-only. Only Lunch's card carries the action.
    expect(screen.getAllByLabelText("Eaten as planned").length).toBe(1);
  });

  it("the ring number fits on one line at 1,771 and 12,345", async () => {
    for (const [kcal, label] of [
      [1771, "1,771"],
      [12345, "12,345"],
    ] as const) {
      clearDayViews();
      items = [
        mealAt(
          "a1111111-1111-4111-8111-111111111111",
          "Breakfast",
          "confirmed",
          [-6, -5],
          {},
          kcal,
        ),
      ];
      const view = render(
        <DietTab
          relationship={relationship}
          selectedDate={DATE}
          onSelectDate={() => undefined}
          onOpenOverlay={() => undefined}
        />,
      );
      await waitFor(() =>
        expect(screen.getByTestId("kcal-ring-number")).toBeTruthy(),
      );
      const number = screen.getByTestId("kcal-ring-number");
      expect(number.textContent).toBe(label);
      // RN-web drops these props; they are what native uses to fit the number.
      expect(RING_NUMBER_FIT).toMatchObject({
        numberOfLines: 1,
        adjustsFontSizeToFit: true,
        maxFontSizeMultiplier: 1.2,
      });
      view.unmount();
    }
  });

  it("macros read on one line as logged / goal g", async () => {
    items = [
      mealAt(
        "a1111111-1111-4111-8111-111111111111",
        "Breakfast",
        "confirmed",
        [-6, -5],
      ),
    ];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("macro-protein")).toBeTruthy(),
    );
    expect(screen.getByTestId("macro-protein").textContent).toBe(
      "Protein20 / 20 g",
    );
    expect(screen.getByTestId("macro-carbs").textContent).toBe(
      "Carbs40 / 40 g",
    );
  });

  function renderDiet() {
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
  }
  const CONNECTION_COPY =
    "Check your connection. Anything you logged is saved on your phone.";

  it("a non-network load failure shows a neutral body, never the connection copy or raw text", async () => {
    items = [];
    listFails = true;
    renderDiet();
    await waitFor(() =>
      expect(screen.getByText("Couldn’t load your meals")).toBeTruthy(),
    );
    expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
    expect(screen.queryByText(CONNECTION_COPY)).toBeNull();
    expect(screen.getByLabelText("Try again")).toBeTruthy();
    expect(screen.queryByText(/boom/)).toBeNull();
    expect(screen.queryByTestId("diet-summary")).toBeNull();
    expect(reportError).toHaveBeenCalledWith("DietTab.load", expect.anything());
  });

  it("a ZodError never reads as a connection problem", async () => {
    items = [];
    listFails = true;
    // A real contract-parse failure: the client and server disagree.
    try {
      mealAssignmentSchema.parse({});
    } catch (err) {
      listError = err;
    }
    expect(listError).toBeInstanceOf(Error);
    renderDiet();
    await waitFor(() =>
      expect(screen.getByText("Couldn’t load your meals")).toBeTruthy(),
    );
    expect(screen.getByText("Something went wrong. Try again.")).toBeTruthy();
    expect(screen.queryByText(CONNECTION_COPY)).toBeNull();
    expect(screen.queryByText(/invalid_type|Required/i)).toBeNull();
  });

  it("an ApiClientError shows its own curated message", async () => {
    items = [];
    listFails = true;
    listError = new ApiClientError({
      code: "SERVER_BUSY",
      message: "The server is busy. Try again in a moment.",
      requestId: "r1",
      status: 503,
    });
    renderDiet();
    await waitFor(() =>
      expect(
        screen.getByText("The server is busy. Try again in a moment."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(CONNECTION_COPY)).toBeNull();
  });

  it("a programming TypeError never reads as a connection problem", async () => {
    items = [];
    listFails = true;
    listError = new TypeError(
      "Cannot read properties of undefined (reading 'items')",
    );
    renderDiet();
    await waitFor(() =>
      expect(screen.getByText("Couldn’t load your meals")).toBeTruthy(),
    );
    expect(
      screen.getByText("Cannot read properties of undefined (reading 'items')"),
    ).toBeTruthy();
    expect(screen.queryByText(CONNECTION_COPY)).toBeNull();
  });

  it("a 500 whose message mentions the network shows its own message, not the connection copy", async () => {
    items = [];
    listFails = true;
    listError = new ApiClientError({
      code: "UPSTREAM_FAILED",
      message: "The network provider failed. Try again.",
      requestId: "r2",
      status: 500,
    });
    renderDiet();
    await waitFor(() =>
      expect(
        screen.getByText("The network provider failed. Try again."),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(CONNECTION_COPY)).toBeNull();
  });

  it("a connection failure with nothing cached shows the connection copy", async () => {
    items = [];
    listFails = true;
    listError = new TypeError("Network request failed");
    renderDiet();
    await waitFor(() => expect(screen.getByText(CONNECTION_COPY)).toBeTruthy());
  });

  it("no meals planned today shows the centred state with no ring", async () => {
    items = [];
    render(
      <DietTab
        relationship={relationship}
        selectedDate={DATE}
        onSelectDate={() => undefined}
        onOpenOverlay={() => undefined}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("No meals planned today")).toBeTruthy(),
    );
    expect(screen.getByText(/hasn’t set meals for today/)).toBeTruthy();
    // "Log what I ate" arrives with Z12-43; until then no promise of it.
    expect(screen.queryByText(/you can still log it/)).toBeNull();
    expect(screen.queryByTestId("diet-summary")).toBeNull();
  });
});

beforeEach(() => {
  clearDayViews();
  listFails = false;
  listError = null;
});
