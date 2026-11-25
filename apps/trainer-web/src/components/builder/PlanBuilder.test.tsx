/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
    const { save } = renderBuilder();
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
    const titleInput = screen.getByRole("textbox", { name: /Plan title/i }) as HTMLInputElement;
    expect(titleInput.disabled).toBe(true);
    expect(screen.queryByRole("tab", { name: /Tue · Lower A/i })).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("PlanBuilder W13-3 fix round", () => {
  it("day tabs: every weekday is a tab; rest days show only the weekday", () => {
    renderBuilder();
    const tabs = screen.getAllByRole("tab").filter((tab) =>
      tab.closest('[aria-label="Training days"]'),
    );
    expect(tabs).toHaveLength(7);
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Mon",
      "Tue · Lower A",
      "Wed",
      "Thu",
      "Fri",
      "Sat",
      "Sun",
    ]);
    const wed = screen.getByRole("tab", { name: "Wed · Rest, add a training day" });
    expect(wed.className).toMatch(/is-rest/);
    fireEvent.click(wed);
    expect(screen.getByRole("tab", { name: /^Wed · Day/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("status pill follows the version state", () => {
    renderBuilder({ versionPill: { state: "draft", versionNumber: 3 } });
    const draft = screen.getAllByTestId("builder-version-pill")[0]!;
    expect(draft.textContent).toBe("Draft · v3");
    expect(draft.querySelector(".ui-p-neutral")).toBeTruthy();
    cleanup();

    renderBuilder({ versionPill: { state: "published", versionNumber: 2 }, readOnly: true });
    const published = screen.getAllByTestId("builder-version-pill")[0]!;
    expect(published.textContent).toBe("Published · v2");
    expect(published.querySelector(".ui-p-done")).toBeTruthy();
    expect(published.querySelector("svg")).toBeTruthy();
    expect(screen.queryByText("Draft")).toBeNull();
    cleanup();

    renderBuilder({ versionPill: null, readOnly: true });
    expect(screen.queryByTestId("builder-version-pill")).toBeNull();
  });

  it("Duplicate day copies the day onto the next free weekday and selects it", () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate day" }));
    const copy = screen.getByRole("tab", { name: "Mon · Lower A" });
    expect(copy.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByTestId("exercise-properties").textContent).toMatch(/Back squat/);
  });

  it("Duplicate day is hidden when read-only or every weekday has a day", () => {
    renderBuilder({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Duplicate day" })).toBeNull();
    cleanup();

    const base = workoutContent.workoutDays[0]!;
    const fullWeek: PlanContent = {
      ...workoutContent,
      workoutDays: [0, 1, 2, 3, 4, 5, 6].map((weekday, index) => ({
        ...base,
        id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`,
        order: index + 1,
        weekday,
        exercises: [],
      })),
    };
    renderBuilder({ initialContent: fullWeek });
    expect(screen.queryByRole("button", { name: "Duplicate day" })).toBeNull();
  });

  it("reps is a 1-100 stepper that can be cleared and added back", () => {
    renderBuilder();
    const props = screen.getByTestId("exercise-properties");
    const reps = within(props).getByLabelText("Reps", { selector: ".ui-stepper" });
    expect(reps.textContent).toBe("6");
    fireEvent.click(within(props).getByRole("button", { name: "Increase Reps" }));
    expect(within(props).getByLabelText("Reps", { selector: ".ui-stepper" }).textContent).toBe(
      "7",
    );
    expect(screen.getByText(/× 7 reps/)).toBeTruthy();

    fireEvent.click(within(props).getByRole("button", { name: "Clear reps" }));
    expect(within(props).queryByLabelText("Reps", { selector: ".ui-stepper" })).toBeNull();
    fireEvent.click(within(props).getByRole("button", { name: "Add reps" }));
    expect(within(props).getByLabelText("Reps", { selector: ".ui-stepper" }).textContent).toBe(
      "10",
    );
  });

  it("diet day row: Every day only without workouts; Training and Rest days split meals", () => {
    const breakfast = {
      ...workoutContent.mealPrescriptions[0]!,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "Pre-workout banana",
      localTime: "07:00",
      applicableWeekdays: [2],
    };
    const restSnack = {
      ...workoutContent.mealPrescriptions[0]!,
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      name: "Rest day poha",
      localTime: "10:00",
      applicableWeekdays: [0, 3],
    };
    const content: PlanContent = {
      ...workoutContent,
      mealPrescriptions: [...workoutContent.mealPrescriptions, breakfast, restSnack],
    };
    renderBuilder({ initialContent: content }, "nutrition");
    const row = screen.getByTestId("meal-day-tabs");
    expect(within(row).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Every day",
      "Training days",
      "Rest days",
    ]);
    const board = screen.getByTestId("meals-board");
    expect(board.textContent).toMatch(/Pre-workout banana/);
    expect(board.textContent).toMatch(/Rest day poha/);

    fireEvent.click(within(row).getByRole("tab", { name: "Training days" }));
    expect(within(row).getByRole("tab", { name: "Training days" }).getAttribute("aria-selected")).toBe("true");
    expect(board.textContent).toMatch(/Pre-workout banana/);
    expect(board.textContent).toMatch(/Lunch/);
    expect(board.textContent).not.toMatch(/Rest day poha/);

    fireEvent.click(within(row).getByRole("tab", { name: "Rest days" }));
    expect(board.textContent).not.toMatch(/Pre-workout banana/);
    expect(board.textContent).toMatch(/Rest day poha/);
    cleanup();

    renderBuilder(
      { initialContent: { workoutDays: [], mealPrescriptions: content.mealPrescriptions } },
      "nutrition",
    );
    expect(
      within(screen.getByTestId("meal-day-tabs")).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual(["Every day"]);
  });

  it("Every day tiles count only the meals that apply every day, with a quiet note", () => {
    const withKcal = (meal: (typeof workoutContent.mealPrescriptions)[number]) => ({
      ...meal,
      items: (meal.items ?? []).map((item) => ({
        ...item,
        calculated: { ...item.calculated, energyKcalScaled: 220_000_000 },
      })),
    });
    const lunch = withKcal(workoutContent.mealPrescriptions[0]!);
    const banana = {
      ...lunch,
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      name: "Pre-workout banana",
      localTime: "07:00",
      applicableWeekdays: [2],
    };
    const content: PlanContent = { ...workoutContent, mealPrescriptions: [lunch, banana] };
    renderBuilder({ initialContent: content }, "nutrition");
    const tiles = () => screen.getByTestId("macro-tiles").textContent ?? "";
    const row = screen.getByTestId("meal-day-tabs");

    // Both meals are listed, only Lunch (220 kcal) is counted.
    expect(screen.getByTestId("meals-board").textContent).toMatch(/Pre-workout banana/);
    expect(tiles()).toMatch(/220\s*kcal/);
    expect(screen.getByTestId("tiles-every-day-note").textContent).toBe(
      "Counts the meals that apply every day.",
    );

    // Training days count what is scoped there (Lunch + banana), with no note.
    fireEvent.click(within(row).getByRole("tab", { name: "Training days" }));
    expect(tiles()).toMatch(/440\s*kcal/);
    expect(screen.queryByTestId("tiles-every-day-note")).toBeNull();
    cleanup();

    // Nothing excluded: no note.
    renderBuilder({ initialContent: workoutContent }, "nutrition");
    expect(screen.queryByTestId("tiles-every-day-note")).toBeNull();
  });

  it("every food row lays out the same: quantity and Remove together in one row", () => {
    renderBuilder({ initialContent: workoutContent }, "nutrition");
    fireEvent.click(screen.getAllByRole("button", { name: /Lunch/ })[0]!);
    const props = screen.getByTestId("meal-properties");
    const row = props.querySelector(".builder-meal-item-controls .builder-meal-item-qty-row");
    expect(row).not.toBeNull();
    expect(
      within(row as HTMLElement).getByRole("button", { name: "Remove Jowar roti" }),
    ).toBeTruthy();
    expect(row!.querySelector(".builder-meal-item-serving")).toBeNull();
  });
});
