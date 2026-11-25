/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { NUTRIENT_SCALE, type FoodLibraryItem } from "@fitbud/contracts";
import type { ExerciseLibraryItem } from "@fitbud/contracts";

const api = vi.hoisted(() => ({
  listExerciseLibrary: vi.fn(),
  listFoodLibrary: vi.fn(),
  createExerciseLibraryItem: vi.fn(),
  createFoodLibraryItem: vi.fn(),
  updateExerciseLibraryItem: vi.fn(),
  updateFoodLibraryItem: vi.fn(),
  deleteExerciseLibraryItem: vi.fn(),
  deleteFoodLibraryItem: vi.fn(),
}));

vi.mock("../../lib/api", () => ({ apiClient: api }));
vi.mock("../../hooks/useOnline", () => ({ useOnline: () => true }));

import { foodServingKcal, LibrariesPanel } from "./LibrariesPanel";

const now = "2026-11-17T10:00:00.000Z";

function food(overrides: Partial<FoodLibraryItem> = {}): FoodLibraryItem {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    ownership: "global",
    trainerUserId: null,
    name: "Paneer bhurji",
    cuisineRegion: "indian",
    classification: "prepared_food",
    basis: "per_100_g",
    energyKcalScaled: 265 * NUTRIENT_SCALE,
    proteinScaled: 18 * NUTRIENT_SCALE,
    carbsScaled: 6 * NUTRIENT_SCALE,
    fatScaled: 19 * NUTRIENT_SCALE,
    servings: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        label: "100 g",
        unit: "g",
        conversionScaled: 100 * NUTRIENT_SCALE,
      },
    ],
    notes: null,
    description: null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function exercise(
  overrides: Partial<ExerciseLibraryItem> = {},
): ExerciseLibraryItem {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ownership: "global",
    trainerUserId: null,
    name: "Back squat",
    instructions: null,
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    equipment: ["barbell"],
    difficulty: "intermediate",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function renderLibraries(segment: "foods" | "exercises" = "foods") {
  return render(
    <MemoryRouter initialEntries={[`/templates/libraries/${segment}`]}>
      <Routes>
        <Route
          path="/templates/libraries/:segment"
          element={<LibrariesPanel />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  api.listFoodLibrary.mockResolvedValue({
    items: [food()],
    nextCursor: null,
  });
  api.listExerciseLibrary.mockResolvedValue({
    items: [exercise()],
    nextCursor: null,
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("foodServingKcal", () => {
  it("scales per-100g energy to a non-100g serving", () => {
    // 265 kcal / 100 g × 150 g = 398 kcal for 1 katori
    expect(
      foodServingKcal(
        food({
          servings: [
            {
              id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              label: "1 katori",
              unit: "g",
              conversionScaled: 150 * NUTRIENT_SCALE,
            },
          ],
        }),
      ),
    ).toBe("1 katori · 398 kcal");
  });
});

describe("LibrariesPanel", () => {
  it("shows foods as Food + Serving · kcal with Source filter", async () => {
    renderLibraries("foods");
    expect(await screen.findByTestId("screen-TW-26")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Library" })).toBeTruthy();
    expect(
      screen.getByText("Foods and exercises you can add to any plan"),
    ).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Food" })).toBeTruthy();
    expect(
      screen.getByRole("columnheader", { name: "Serving · kcal" }),
    ).toBeTruthy();
    expect(screen.getByText("Paneer bhurji")).toBeTruthy();
    expect(screen.getByText("Prepared")).toBeTruthy();
    expect(screen.getByText(/100 g · 265 kcal/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Source/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Basis" })).toBeNull();
  });

  it("shows serving-scaled kcal in the list and drawer for non-100g servings", async () => {
    api.listFoodLibrary.mockResolvedValue({
      items: [
        food({
          servings: [
            {
              id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              label: "1 katori",
              unit: "g",
              conversionScaled: 150 * NUTRIENT_SCALE,
            },
          ],
        }),
      ],
      nextCursor: null,
    });
    renderLibraries("foods");
    expect(await screen.findByText(/1 katori · 398 kcal/)).toBeTruthy();
    fireEvent.click(screen.getByText("Paneer bhurji"));
    const dialog = await screen.findByRole("dialog", { name: "Paneer bhurji" });
    expect(within(dialog).getByText("1 katori")).toBeTruthy();
    expect(within(dialog).getByText("398 kcal")).toBeTruthy();
    // 18 / 6 / 19 g per 100g → 27 / 9 / 29 g for 150 g
    expect(within(dialog).getByText("27 g")).toBeTruthy();
    expect(within(dialog).getByText("9 g")).toBeTruthy();
    expect(within(dialog).getByText("29 g")).toBeTruthy();
  });

  it("opens the food detail drawer on row click", async () => {
    renderLibraries("foods");
    await screen.findByText("Paneer bhurji");
    fireEvent.click(screen.getByText("Paneer bhurji"));
    const dialog = await screen.findByRole("dialog", { name: "Paneer bhurji" });
    expect(within(dialog).getByText("FitBud base")).toBeTruthy();
    expect(within(dialog).getByText("265 kcal")).toBeTruthy();
    expect(within(dialog).getByText(/can't be edited/i)).toBeTruthy();
    expect(
      within(dialog).getByRole("button", { name: /Make my copy/ }),
    ).toBeTruthy();
  });

  it("shows exercises with Equipment / Source columns and logged card", async () => {
    renderLibraries("exercises");
    expect(await screen.findByRole("columnheader", { name: "Exercise" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Equipment" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Source" })).toBeTruthy();
    expect(screen.getByText("Back squat")).toBeTruthy();
    expect(screen.getByText("Quads")).toBeTruthy();
    const table = screen.getByRole("table");
    expect(within(table).getByText("Barbell")).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Logged by clients, not in library",
      }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /Equipment/ })).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "Primary muscles" })).toBeNull();
  });

  it("filters by Source: Mine", async () => {
    api.listFoodLibrary.mockResolvedValue({
      items: [
        food(),
        food({
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          name: "Rahul's protein oats",
          ownership: "trainer",
          trainerUserId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        }),
      ],
      nextCursor: null,
    });
    renderLibraries("foods");
    await screen.findByText("Paneer bhurji");
    fireEvent.click(screen.getByRole("button", { name: /Source/ }));
    fireEvent.click(screen.getByRole("option", { name: "You" }));
    await waitFor(() => {
      expect(screen.getByText("Rahul's protein oats")).toBeTruthy();
      expect(screen.queryByText("Paneer bhurji")).toBeNull();
    });
  });
});
