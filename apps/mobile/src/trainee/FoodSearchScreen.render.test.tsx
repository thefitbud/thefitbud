import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mealAssignmentSchema,
  NUTRIENT_SCALE,
  type MealAssignment,
  type TraineeFoodDetail,
  type TraineeFoodSearchResponse,
} from "@fitbud/contracts";
import { act, fireEvent, mockAuth, render, screen, waitFor } from "../test/render";

vi.mock("../lib/reportError", () => ({ reportError: vi.fn() }));
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));
vi.mock("../sync/SyncProvider", () => ({ useSyncEngine: () => ({}) }));

const deviate = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("./mealActions", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("./mealActions");
  return { ...actual, deviateMealAssignment: deviate };
});

const REL = "1b65e3ad-84cf-4fe1-a546-0d62656c2c79";
const DATE = "2026-11-14";
const CHAPATI = "f1000001-0000-4000-8000-000000000001";
const CHAPATI_SERVING = "f2000001-0000-4000-8000-000000000001";
const CHAPATI_100G = "f2000001-0000-4000-8000-000000000002";
const PHULKA = "f1000002-0000-4000-8000-000000000002";

type SearchItem = TraineeFoodSearchResponse["items"][number];

const chapati: SearchItem = {
  id: CHAPATI,
  name: "Chapati / roti",
  energyKcalScaled: 202 * NUTRIENT_SCALE,
  defaultServingId: CHAPATI_SERVING,
  source: "library",
  serving: {
    label: "1 medium chapati (40 g)",
    kcalScaled: 81 * NUTRIENT_SCALE,
    proteinScaled: 3 * NUTRIENT_SCALE,
    carbsScaled: 15 * NUTRIENT_SCALE,
    fatScaled: 1 * NUTRIENT_SCALE,
  },
};
// A hit the API sent without its serving: the line starts as "1 serving" and
// takes the real default serving once the detail arrives.
const phulka: SearchItem = {
  id: PHULKA,
  name: "Phulka (no ghee)",
  energyKcalScaled: 175 * NUTRIENT_SCALE,
  defaultServingId: null,
  source: "library",
  serving: null,
};

const chapatiDetail: TraineeFoodDetail = {
  id: CHAPATI,
  name: "Chapati / roti",
  energyKcalScaled: 202 * NUTRIENT_SCALE,
  proteinScaled: 8 * NUTRIENT_SCALE,
  carbsScaled: 37 * NUTRIENT_SCALE,
  fatScaled: 2 * NUTRIENT_SCALE,
  defaultServingId: CHAPATI_SERVING,
  servings: [
    { id: CHAPATI_SERVING, label: "1 medium chapati (40 g)", unit: "piece", conversionScaled: 40 * NUTRIENT_SCALE },
    { id: CHAPATI_100G, label: "100 g", unit: "g", conversionScaled: 100 * NUTRIENT_SCALE },
  ],
} as unknown as TraineeFoodDetail;

const phulkaDetail = {
  id: PHULKA,
  name: "Phulka (no ghee)",
  energyKcalScaled: 175 * NUTRIENT_SCALE,
  proteinScaled: null,
  carbsScaled: null,
  fatScaled: null,
  defaultServingId: "f2000002-0000-4000-8000-000000000001",
  servings: [
    {
      id: "f2000002-0000-4000-8000-000000000001",
      label: "1 phulka (40 g)",
      unit: "piece",
      conversionScaled: 40 * NUTRIENT_SCALE,
    },
  ],
} as unknown as TraineeFoodDetail;

let searchItems: SearchItem[] = [];
let releasePhulka: (() => void) | null = null;
const api = {
  searchMeFoods: vi.fn(async () => ({ items: searchItems, nextCursor: null })),
  request: vi.fn(async () => ({ items: [], nextCursor: null })),
  getTraineeFood: vi.fn(async (id: string) => {
    if (id === PHULKA) {
      // Held until the test releases it: the add must not wait for it.
      await new Promise<void>((resolve) => {
        releasePhulka = resolve;
      });
      return phulkaDetail;
    }
    return chapatiDetail;
  }),
};
const auth = mockAuth({
  api: api as never,
  me: { id: "a0a69e20-297d-4101-a5e2-ecce9b8491cb", email: "aarav.ontrack@demo.fitbud.test", timezone: "Asia/Kolkata" },
});
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));

const { FoodSearchScreen, linesFromLoggedItems } = await import("./FoodSearchScreen");
const { peekMealSaved, resetMealSavedNotice } = await import("./food/mealSavedNotice");

const assignment: MealAssignment = mealAssignmentSchema.parse({
  id: "c3333333-3333-4333-8333-333333333333",
  coachingRelationshipId: REL,
  planId: "3c1e4f2a-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
  planVersionId: "4d2f5a3b-6c7e-4f80-9bac-1d2e3f4a5b6c",
  mealPrescriptionId: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
  mealName: "Evening snack",
  localDate: DATE,
  windowStartsAt: `${DATE}T11:30:00.000Z`,
  windowEndsAt: `${DATE}T12:29:00.000Z`,
  photoRequired: false,
  status: "pending",
  scheduleStatus: "scheduled",
  prescription: {
    id: "5e306b4c-7d8f-4091-8cbd-2e3f4a5b6c7d",
    order: 4,
    name: "Evening snack",
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    mealType: "snack",
    items: [
      { name: "Roasted chana", portionLabel: "1 katori", calories: 180, proteinGrams: 9, carbsGrams: 27, fatGrams: 3 },
    ],
  },
  compliance: null,
  createdAt: `${DATE}T00:00:00.000Z`,
  updatedAt: `${DATE}T00:00:00.000Z`,
});

function renderSearch(onSaved = vi.fn()) {
  render(
    <FoodSearchScreen
      assignment={assignment}
      relationshipId={REL}
      coachName="Rahul Verma"
      onBack={vi.fn()}
      onSaved={onSaved}
    />,
  );
  return onSaved;
}

async function typeQuery(text: string) {
  fireEvent.change(screen.getByLabelText("Search foods"), { target: { value: text } });
  await waitFor(() => expect(api.searchMeFoods).toHaveBeenCalled(), { timeout: 2000 });
}

beforeEach(() => {
  deviate.mockClear();
  api.searchMeFoods.mockClear();
  api.getTraineeFood.mockClear();
  resetMealSavedNotice();
  searchItems = [chapati, phulka];
  releasePhulka = null;
});

describe("Food search v3 (TR-26a–d)", () => {
  it("before typing: from your plan, the hint, and Save disabled (TR-26a)", () => {
    renderSearch();
    expect(screen.getByText("Evening snack")).toBeTruthy();
    expect(screen.getByText("Plan 180 kcal")).toBeTruthy();
    expect(screen.getByText("From your plan")).toBeTruthy();
    expect(screen.getByText("Roasted chana")).toBeTruthy();
    expect(screen.getByText("1 katori · 180 kcal")).toBeTruthy();
    expect(screen.getByText("Tap a food to set katori, piece, cup or grams.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save" }).getAttribute("aria-disabled")).toBe("true");
  });

  it("results show the real default serving with its kcal, not a fixed “1 piece”", async () => {
    renderSearch();
    await typeQuery("roti");
    expect(await screen.findByText("1 medium chapati (40 g) · 81 kcal")).toBeTruthy();
  });

  it("+ adds at once, before the food's servings load, then shows ✓ and the count (TR-26b)", async () => {
    renderSearch();
    await typeQuery("roti");
    await screen.findByText("Phulka (no ghee)");
    fireEvent.click(screen.getByRole("button", { name: "Add Phulka (no ghee)" }));
    // The detail request is still held: the line is already in the log.
    expect(releasePhulka).not.toBeNull();
    expect(screen.getByText("In this log · 1")).toBeTruthy();
    expect(screen.getByText("1 added")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add another Phulka (no ghee)" })).toBeTruthy();
    expect(screen.getByText("Added Phulka (no ghee) · 1 serving")).toBeTruthy();
    await act(async () => {
      releasePhulka?.();
    });
    // The real default serving replaces the placeholder once it arrives.
    await waitFor(() => expect(screen.getByText("70 kcal")).toBeTruthy());
  });

  it("a double tap adds one line; a later tap adds one more of it", async () => {
    renderSearch();
    await typeQuery("roti");
    await screen.findByText("Chapati / roti");
    const add = screen.getByRole("button", { name: "Add Chapati / roti" });
    fireEvent.click(add);
    fireEvent.click(screen.getByRole("button", { name: "Add another Chapati / roti" }));
    expect(screen.getByText("In this log · 1")).toBeTruthy();
    expect(screen.getByText("1 added")).toBeTruthy();
    expect(screen.getByText("81 kcal")).toBeTruthy();
  });

  it("Save logs the foods by id and leaves a saved notice for Diet (TR-26f)", async () => {
    const onSaved = renderSearch();
    await typeQuery("roti");
    await screen.findByText("Chapati / roti");
    fireEvent.click(screen.getByRole("button", { name: "Add Chapati / roti" }));
    fireEvent.click(screen.getByRole("button", { name: "Save evening snack" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2];
    expect(body).toEqual({
      deviationKind: "logged_foods",
      notes: null,
      photoIntent: null,
      items: [{ foodId: CHAPATI, servingId: CHAPATI_SERVING, quantity: 1 }],
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(peekMealSaved(REL)).toMatchObject({
      mealName: "Evening snack",
      kcal: 81,
      kind: "logged_foods",
      assignmentId: assignment.id,
    });
  });

  it("a row opens the amount picker; grams are sent as servings of the gram unit (TR-26c)", async () => {
    renderSearch();
    await typeQuery("roti");
    fireEvent.click(await screen.findByRole("button", { name: "Chapati / roti" }));
    expect(await screen.findByTestId("food-amount-picker")).toBeTruthy();
    fireEvent.click(await screen.findByRole("radio", { name: "Grams" }));
    fireEvent.click(screen.getByRole("radio", { name: "150 g" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to evening snack · 303 kcal" }));
    expect(await screen.findByText("Chapati / roti · 150 g")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save evening snack" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2] as { items: unknown[] };
    expect(body.items).toEqual([{ foodId: CHAPATI, servingId: CHAPATI_100G, quantity: 1.5 }]);
  });

  it("no match offers Create and Ate out (TR-26d); Create opens the form with the query", async () => {
    searchItems = [];
    renderSearch();
    await typeQuery("ragi dosa");
    expect(await screen.findByText("No foods match “ragi dosa”")).toBeTruthy();
    expect(screen.getByText("Try a shorter word, like “dosa”. Or create it with its kcal.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Log as Ate out" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create “Ragi dosa”" }));
    expect(await screen.findByTestId("custom-food-screen")).toBeTruthy();
    expect((screen.getByLabelText("Food name") as HTMLInputElement).value).toBe("Ragi dosa");
  });

  it("Add on a created food logs it with the meal, saved to my foods (TR-26e → TR-26f)", async () => {
    searchItems = [];
    const onSaved = renderSearch();
    await typeQuery("ragi dosa");
    fireEvent.click(await screen.findByRole("button", { name: "Create “Ragi dosa”" }));
    fireEvent.change(screen.getByLabelText("Calories"), { target: { value: "120" } });
    fireEvent.change(screen.getByLabelText("Protein"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Carbs"), { target: { value: "22" } });
    fireEvent.click(screen.getByRole("button", { name: "Add to evening snack · 120 kcal" }));
    await waitFor(() => expect(deviate).toHaveBeenCalledTimes(1));
    const body = (deviate.mock.calls[0] as unknown[])[2] as { items: unknown[] };
    expect(body.items).toEqual([
      {
        customFood: {
          name: "Ragi dosa",
          kcal: 120,
          protein: 3,
          carbs: 22,
          fat: 0,
          servingLabel: "1 piece",
        },
        saveToMyFoods: true,
      },
    ]);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("Log as Ate out opens the kcal form (TR-08c)", async () => {
    searchItems = [];
    renderSearch();
    await typeQuery("party food");
    fireEvent.click(await screen.findByRole("button", { name: "Log as Ate out" }));
    expect(await screen.findByTestId("ate-out-form")).toBeTruthy();
    expect(screen.getByText("Rahul’s plan for evening snack: 180 kcal")).toBeTruthy();
  });
});

describe("FoodSearchScreen change this log (Z14-13b)", () => {
  it("opens the tray with the logged foods and their amounts", () => {
    const lines = linesFromLoggedItems(
      [
        { name: "Chapati / roti", quantity: 2, servingLabel: "1 piece", energyKcal: 160, proteinG: 6, carbsG: 30, fatG: 2 },
        { name: "Masala dosa", quantity: 1, servingLabel: "1 plate", energyKcal: 400, custom: true },
      ],
      [],
    );
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ name: "Chapati / roti", quantity: 2, unitLabel: "1 piece", kcalPerUnit: 80 });
    expect(lines[0]?.macrosPerUnit).toEqual({ protein: 3, carbs: 15, fat: 1 });
    expect(lines[1]?.source).toEqual({ kind: "custom", saveToMyFoods: false });
  });
});
