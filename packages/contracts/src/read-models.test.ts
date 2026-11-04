import { describe, expect, it } from "vitest";
import { meDayResponseSchema } from "./read-models.js";

/**
 * Two real UUID assignment ids, listed in an order that is not
 * lexicographic. Parse must keep that order: ids are not a sequence.
 */
const workoutIds = [
  "f5c1a8e2-6d34-4b70-9a11-2e8c0d7b4a63",
  "1a90c4e7-2b58-4f13-8d66-9c3e5a1b7d04",
] as const;

const mealId = "c8e2b014-9a47-4d55-b3e1-70f6a2c8d919";

function dayPayload(state: "done" | "partial" | "missed" | "rest" | "future") {
  return {
    date: "2026-11-04",
    state,
    assignments: {
      workouts: [
        { id: workoutIds[0], name: "Upper A" },
        { id: workoutIds[1], name: "Lower B" },
      ],
      meals: [{ id: mealId, slotKey: "lunch" }],
    },
    logs: { workouts: 1, meals: 0 },
    totals: {
      kcalScaled: 0,
      perMeal: [] as { slotKey: string; kcalScaled: number }[],
    },
  };
}

describe("meDayResponseSchema", () => {
  it("keeps state and the assignment ids in the order given", () => {
    const parsed = meDayResponseSchema.parse(dayPayload("partial"));
    expect(parsed.state).toBe("partial");
    expect(parsed.assignments.workouts.map((workout) => workout.id)).toEqual([
      workoutIds[0],
      workoutIds[1],
    ]);
    expect(parsed.assignments.meals.map((meal) => meal.id)).toEqual([mealId]);
  });

  it("rejects an assignment id that is not a uuid", () => {
    const payload = dayPayload("rest");
    expect(() =>
      meDayResponseSchema.parse({
        ...payload,
        assignments: {
          ...payload.assignments,
          workouts: [
            { id: "workout-1", name: "Upper A" },
            payload.assignments.workouts[1],
          ],
        },
      }),
    ).toThrow();
  });
});
