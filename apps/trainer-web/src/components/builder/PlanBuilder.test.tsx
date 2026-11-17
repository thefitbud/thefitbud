/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PlanContent } from "@fitbud/contracts";
import { PlanBuilder } from "./PlanBuilder";

const media = vi.hoisted(() => ({
  /** Queries that currently match. Empty = wide (≥1280). */
  matching: new Set<string>(),
}));

vi.mock("../../hooks/useMediaQuery", () => ({
  useMediaQuery: (query: string) => media.matching.has(query),
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
  mealPrescriptions: [
    {
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      order: 1,
      name: "Lunch",
      mealType: "lunch",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "13:30",
      scheduleHint: null,
      instructions: "Bajra roti, Moong dal",
      photoRequired: false,
      required: true,
      items: [
        {
          snapshotKind: "legacy",
          name: "Jowar roti",
          classification: null,
          basis: null,
          canonical: null,
          serving: { label: "2 roti", unit: "portion", conversionScaled: null },
          quantityScaled: 1000,
          calculated: {
            energyKcalScaled: 220_000,
            proteinScaled: null,
            carbsScaled: null,
            fatScaled: null,
            partial: true,
          },
        },
      ],
    },
  ],
};

function setMode(mode: "wide" | "narrow" | "small") {
  media.matching.clear();
  if (mode === "small") {
    media.matching.add("(max-width: 1023px)");
    media.matching.add("(max-width: 1279px)");
  } else if (mode === "narrow") {
    media.matching.add("(max-width: 1279px)");
  }
}

function renderBuilder(
  over: Partial<Parameters<typeof PlanBuilder>[0]> = {},
  tab: "workout" | "nutrition" = "workout",
) {
  const save = vi.fn(async () => undefined);
  render(
    <MemoryRouter>
      <PlanBuilder
        backTo="/clients/r/plan"
        backLabel="Back to plan"
        initialTitle="Marathon strength"
        initialContent={workoutContent}
        statusLabel="Draft v3"
        tab={tab}
        save={save}
        online
        clientName="Vikram"
        onPublish={() => undefined}
        screenId={tab === "nutrition" ? "screen-TW-14" : "screen-TW-13"}
        {...over}
      />
    </MemoryRouter>,
  );
  return { save };
}

beforeEach(() => {
  setMode("wide");
});

afterEach(() => {
  cleanup();
});

describe("PlanBuilder Z12-11 chrome", () => {
  it("shows library left, day tabs, properties, Publish & schedule", () => {
    renderBuilder();
    expect(screen.getByTestId("library-drawer").textContent).toMatch(/Exercises/);
    expect(screen.getByRole("tab", { name: /Tue · Lower A/i })).toBeTruthy();
    expect(screen.getByTestId("exercise-properties").textContent).toMatch(/Back squat/);
    expect(screen.getByRole("button", { name: "Publish & schedule" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Preview" })).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText(/· Vikram/)).toBeTruthy();
  });

  it("shows nutrition macros, meal cards and swaps field", () => {
    renderBuilder({}, "nutrition");
    expect(screen.getByTestId("macro-tiles").textContent).toMatch(/Calories/);
    expect(screen.getByTestId("meals-board").textContent).toMatch(/Lunch/);
    expect(screen.getByTestId("meal-properties").textContent).toMatch(/Swaps allowed/);
    expect(screen.getByDisplayValue("Bajra roti, Moong dal")).toBeTruthy();
    expect(screen.getByTestId("library-drawer").textContent).toMatch(/Foods/);
  });
});

describe("PlanBuilder Z12-12 iPad", () => {
  it("narrow (1024): day tabs + properties, library as toggle drawer", () => {
    setMode("narrow");
    renderBuilder();
    expect(screen.getByRole("tab", { name: /Tue · Lower A/i })).toBeTruthy();
    expect(screen.getByTestId("exercise-properties").textContent).toMatch(/Back squat/);
    expect(screen.getByRole("button", { name: "Library" })).toBeTruthy();
    expect(screen.queryByTestId("library-drawer")).toBeNull();
    expect(screen.getByRole("button", { name: "Publish & schedule" })).toBeTruthy();
  });

  it("small (<1024): read-only week card and larger-screen notice", () => {
    setMode("small");
    renderBuilder();
    const notice = screen.getByTestId("builder-small-screen");
    expect(notice.textContent).toMatch(/Open on a larger screen to edit/);
    expect(notice.textContent).toMatch(/1024 px/);
    const summary = screen.getByTestId("builder-readonly-summary");
    expect(summary.textContent).toMatch(/Marathon strength · Vikram/);
    expect(summary.textContent).toMatch(/Tue/);
    expect(summary.textContent).toMatch(/Lower A/);
    expect(summary.textContent).toMatch(/Rest/);
    expect(
      (screen.getByRole("button", { name: "Publish & schedule" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole("tab", { name: /Tue · Lower A/i })).toBeNull();
  });
});
