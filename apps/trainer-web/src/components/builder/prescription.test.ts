import { describe, expect, it } from "vitest";
import type { PlanContent } from "@fitbud/contracts";
import { applyExercisePrescription } from "./prescription";

const content: PlanContent = {
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
          instructions: null,
          primaryMuscles: ["quads"],
          secondaryMuscles: [],
          equipment: ["barbell"],
          difficulty: null,
          setTargets: [
            {
              id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
              order: 1,
              reps: 8,
              loadLabel: "40 kg",
              rpe: null,
              restSeconds: 90,
            },
          ],
        },
      ],
    },
  ],
  mealPrescriptions: [],
};

describe("applyExercisePrescription", () => {
  it("expands sets and copies reps/load/rest/cue", () => {
    const next = applyExercisePrescription(
      content,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      {
        setCount: 4,
        reps: 6,
        loadLabel: "60 kg",
        restSeconds: 120,
        instructions: "Brace, sit between the hips, knees out.",
      },
    );
    const exercise = next.workoutDays[0]!.exercises[0]!;
    expect(exercise.setTargets).toHaveLength(4);
    expect(exercise.setTargets.every((set) => set.reps === 6)).toBe(true);
    expect(exercise.setTargets.every((set) => set.loadLabel === "60 kg")).toBe(true);
    expect(exercise.setTargets.every((set) => set.restSeconds === 120)).toBe(true);
    expect(exercise.instructions).toBe("Brace, sit between the hips, knees out.");
  });
});
