/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import type { ExerciseLibraryItem, FoodLibraryItem, WorkoutDay } from "@fitbud/contracts";
import { BuilderExerciseLibrary, BuilderFoodLibrary } from "./BuilderLibraryList";

const exercise: ExerciseLibraryItem = {
  id: "11111111-1111-4111-8111-111111111111",
  ownership: "global",
  trainerUserId: null,
  name: "Goblet squat",
  instructions: null,
  primaryMuscles: ["legs"],
  secondaryMuscles: [],
  equipment: ["dumbbell"],
  difficulty: "beginner",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const food: FoodLibraryItem = {
  id: "22222222-2222-4222-8222-222222222222",
  ownership: "global",
  trainerUserId: null,
  name: "Jowar roti",
  cuisineRegion: "indian",
  classification: "prepared_food",
  basis: "per_100_g",
  energyKcalScaled: 220_000_000,
  proteinScaled: 8_000_000,
  carbsScaled: 40_000_000,
  fatScaled: 4_000_000,
  servings: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      label: "1 roti",
      unit: "roti",
      conversionScaled: 50_000_000,
    },
  ],
  notes: null,
  description: null,
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const day: WorkoutDay = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  order: 1,
  name: "Lower A",
  weekday: 2,
  required: true,
  exercises: [],
};

vi.mock("../../lib/api", () => ({
  apiClient: {
    listExerciseLibrary: vi.fn(async () => ({ items: [exercise], nextCursor: null })),
    listFoodLibrary: vi.fn(async () => ({ items: [food], nextCursor: null })),
  },
}));

afterEach(() => {
  cleanup();
});

describe("BuilderExerciseLibrary", () => {
  it("renders compact Name + Muscle · equipment cards without Add chrome", async () => {
    const onAdd = vi.fn();
    render(
      <BuilderExerciseLibrary day={day} onAdd={onAdd} searchRef={createRef()} />,
    );
    await waitFor(() => {
      expect(screen.getByText("Goblet squat")).toBeTruthy();
    });
    expect(screen.getByText("Legs · Dumbbell")).toBeTruthy();
    expect(screen.queryByText(/Add to session/i)).toBeNull();
    expect(screen.queryByText(/Global/i)).toBeNull();
    expect(screen.queryByText(/Beginner/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add Goblet squat/i }));
    expect(onAdd).toHaveBeenCalledWith(exercise);
  });
});

describe("BuilderFoodLibrary", () => {
  it("renders compact Name + portion · kcal cards without Add to meal", async () => {
    const onAdd = vi.fn();
    render(
      <BuilderFoodLibrary
        meal={{
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          order: 1,
          name: "Lunch",
          mealType: "lunch",
          applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
          localTime: "13:30",
          scheduleHint: null,
          instructions: null,
          photoRequired: false,
          required: true,
          items: [],
        }}
        onAdd={onAdd}
        searchRef={createRef()}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText("Jowar roti")).toBeTruthy();
    });
    expect(screen.getByText("1 roti · 110 kcal")).toBeTruthy();
    expect(screen.queryByText(/Add to meal/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Add Jowar roti/i }));
    expect(onAdd).toHaveBeenCalledWith(food, food.servings[0]!.id);
  });
});
