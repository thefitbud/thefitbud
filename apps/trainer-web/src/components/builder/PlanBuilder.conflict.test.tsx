/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlanContent } from "@fitbud/contracts";

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: () => false,
}));

vi.mock("../../pages/templates/LibrarySearch", () => ({
  ExerciseSearchPane: () => <div data-testid="exercise-search">Exercise search</div>,
  FoodSearchPane: () => <div data-testid="food-search">Food search</div>,
}));

vi.mock("../../lib/api", () => ({
  apiClient: {
    listFoodLibrary: vi.fn(async () => ({ items: [], nextCursor: null })),
    listExerciseLibrary: vi.fn(async () => ({ items: [], nextCursor: null })),
  },
}));

const workoutContent: PlanContent = {
  workoutDays: [
    {
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      order: 1,
      name: "Lower A",
      weekday: 2,
      required: true,
      exercises: [
        {
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          order: 1,
          name: "Back squat",
          instructions: "Brace",
          primaryMuscles: ["quads"],
          secondaryMuscles: [],
          equipment: ["barbell"],
          difficulty: null,
          setTargets: [
            {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              order: 1,
              reps: 6,
              loadLabel: "60 kg",
              rpe: null,
              restSeconds: 120,
            },
          ],
        },
      ],
    },
  ],
  mealPrescriptions: [],
};

const keepMine = vi.fn(async () => true);
const loadRemote = vi.fn(async () => ({
  title: "Marathon strength",
  content: workoutContent,
}));

vi.mock("./useBuilderDraft", () => ({
  isConflictError: () => true,
  useBuilderDraft: () => ({
    content: workoutContent,
    setContent: vi.fn(),
    undo: vi.fn(),
    canUndo: false,
    saveState: { kind: "conflict", at: new Date("2026-10-21T03:39:00.000Z") },
    flush: vi.fn(async () => false),
    keepMine,
    takeTheirs: vi.fn(),
  }),
}));

import { PlanBuilder } from "./PlanBuilder";

afterEach(() => {
  cleanup();
  keepMine.mockClear();
  loadRemote.mockClear();
});

describe("PlanBuilder conflict banner", () => {
  it("renders Compare versions / Keep mine and opens compare", async () => {
    render(
      <MemoryRouter>
        <PlanBuilder
          backTo="/clients/r/plan"
          backLabel="Back to plan"
          initialTitle="Marathon strength"
          initialContent={workoutContent}
          statusLabel="Draft v3"
          tab="workout"
          save={async () => undefined}
          online
          clientName="Vikram"
          onPublish={() => undefined}
          conflictHandlers={{
            prepareKeepMine: async () => undefined,
            loadRemote,
          }}
          screenId="screen-TW-13"
        />
      </MemoryRouter>,
    );

    const banner = screen.getByTestId("builder-conflict");
    expect(banner.textContent).toMatch(/Couldn't save/);
    expect(banner.textContent).toMatch(/another device/);
    expect(screen.getByRole("button", { name: "Compare versions" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Keep mine" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Compare versions" }));
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Compare versions" })).toBeTruthy();
    });
    expect(loadRemote).toHaveBeenCalled();
  });
});
