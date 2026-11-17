import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@fitbud/contracts";
import {
  exerciseSummaryLine,
  formatRestLabel,
  parseRestLabel,
} from "./formatters";

const exercise = (sets: WorkoutExercise["setTargets"]): WorkoutExercise => ({
  id: "11111111-1111-4111-8111-111111111111",
  order: 1,
  name: "Back squat",
  instructions: "Brace",
  primaryMuscles: ["quads"],
  secondaryMuscles: [],
  equipment: ["barbell"],
  difficulty: null,
  setTargets: sets,
});

describe("formatRestLabel / parseRestLabel", () => {
  it("formats whole minutes and odd seconds", () => {
    expect(formatRestLabel(120)).toBe("2 min");
    expect(formatRestLabel(90)).toBe("90 s");
    expect(formatRestLabel(null)).toBe("");
  });

  it("parses min and second labels", () => {
    expect(parseRestLabel("2 min")).toBe(120);
    expect(parseRestLabel("90 s")).toBe(90);
    expect(parseRestLabel("45")).toBe(45);
    expect(parseRestLabel("")).toBeNull();
  });
});

describe("exerciseSummaryLine", () => {
  it("joins sets, reps, load and rest", () => {
    const line = exerciseSummaryLine(
      exercise([
        {
          id: "22222222-2222-4222-8222-222222222222",
          order: 1,
          reps: 6,
          loadLabel: "60 kg",
          rpe: null,
          restSeconds: 120,
        },
        {
          id: "33333333-3333-4333-8333-333333333333",
          order: 2,
          reps: 6,
          loadLabel: "60 kg",
          rpe: null,
          restSeconds: 120,
        },
      ]),
    );
    expect(line).toContain("2 sets × 6 reps");
    expect(line).toContain("60 kg");
    expect(line).toContain("rest 2 min");
  });
});
