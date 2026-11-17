import { describe, expect, it } from "vitest";
import type { WorkoutExercise } from "@fitbud/contracts";
import {
  exerciseMetaLine,
  exerciseSummaryLine,
  formatRestLabel,
  parseRestLabel,
} from "./formatters";
import { foodLibraryMetaLine } from "./BuilderLibraryList";

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

describe("exerciseMetaLine", () => {
  it("formats Muscle · equipment for library cards", () => {
    expect(
      exerciseMetaLine({ primaryMuscles: ["quads"], equipment: ["dumbbell"] }),
    ).toBe("Quads · Dumbbell");
  });
});

describe("foodLibraryMetaLine", () => {
  it("formats portion · kcal for library cards", () => {
    const line = foodLibraryMetaLine({
      id: "44444444-4444-4444-8444-444444444444",
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
          id: "55555555-5555-4555-8555-555555555555",
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
    });
    // 220 kcal/100g × 50 g = 110 kcal
    expect(line).toBe("1 roti · 110 kcal");
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
