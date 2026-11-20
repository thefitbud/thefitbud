/**
 * Z12-45 must-fix #4: never open an empty How to. Show How to only when
 * the plan exercise carries a coach note, muscles or equipment; otherwise
 * open on History and hide the How to tab.
 */
import { describe, expect, it, vi } from "vitest";
import type { WorkoutExercise } from "@fitbud/contracts";
import { render, screen } from "../../test/render";

vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () => null,
  requireNativeModule: () => null,
  NativeModulesProxy: {},
  EventEmitter: class {},
}));

const { ExerciseDetailScreen, exerciseHasHowTo } = await import("./ExerciseDetailScreen");

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function exercise(
  over: Partial<WorkoutExercise> = {},
): WorkoutExercise {
  return {
    id: uuid(1),
    order: 1,
    name: "Romanian deadlift",
    instructions: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    equipment: [],
    difficulty: null,
    setTargets: [],
    ...over,
  };
}

const baseProps = {
  name: "Romanian deadlift",
  onTabChange: () => undefined,
  onBack: () => undefined,
  coachInitials: "RV",
  best: null,
  sessions: [] as const,
  historyLoading: false,
};

describe("exerciseHasHowTo", () => {
  it("is false with nothing and true with a note or tags", () => {
    expect(exerciseHasHowTo(null)).toBe(false);
    expect(exerciseHasHowTo(exercise())).toBe(false);
    expect(exerciseHasHowTo(exercise({ instructions: "Soft knees." }))).toBe(true);
    expect(exerciseHasHowTo(exercise({ primaryMuscles: ["Hamstrings"] }))).toBe(true);
    expect(exerciseHasHowTo(exercise({ equipment: ["Barbell"] }))).toBe(true);
  });
});

describe("ExerciseDetailScreen How to", () => {
  it("has note: shows How to with the coach cue and tags", () => {
    render(
      <ExerciseDetailScreen
        {...baseProps}
        tab="how_to"
        exercise={exercise({
          instructions: "Soft knees, push the hips back.",
          primaryMuscles: ["Hamstrings"],
          equipment: ["Barbell"],
        })}
      />,
    );
    expect(screen.getByRole("tab", { name: "How to" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "History" })).toBeTruthy();
    expect(screen.getByText("Soft knees, push the hips back.")).toBeTruthy();
    expect(screen.getByText("Hamstrings")).toBeTruthy();
    expect(screen.getByText("Barbell")).toBeTruthy();
    expect(
      screen.queryByText("Your coach hasn’t added notes for this exercise."),
    ).toBeNull();
  });

  it("has nothing: hides How to and shows History content", () => {
    render(
      <ExerciseDetailScreen
        {...baseProps}
        tab="how_to"
        exercise={exercise()}
      />,
    );
    expect(screen.queryByRole("tab", { name: "How to" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "History" })).toBeNull();
    expect(screen.getByText("No logged sets for this exercise yet.")).toBeTruthy();
    expect(
      screen.queryByText("Your coach hasn’t added notes for this exercise."),
    ).toBeNull();
  });
});
