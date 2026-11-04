import { describe, expect, it } from "vitest";
import type { MeDayResponse } from "@fitbud/contracts";
import { FitBudApiClient } from "./index.js";

const workoutIds = [
  "f5c1a8e2-6d34-4b70-9a11-2e8c0d7b4a63",
  "1a90c4e7-2b58-4f13-8d66-9c3e5a1b7d04",
] as const;

const mealId = "c8e2b014-9a47-4d55-b3e1-70f6a2c8d919";

const day: MeDayResponse = {
  date: "2026-11-04",
  state: "missed",
  assignments: {
    workouts: [
      { id: workoutIds[0], name: "Upper A" },
      { id: workoutIds[1], name: "Lower B" },
    ],
    meals: [{ id: mealId, slotKey: "lunch" }],
  },
  logs: { workouts: 0, meals: 0 },
  totals: { kcalScaled: 0, perMeal: [] },
};

describe("getMeDay", () => {
  it("keeps state and assignment ids from the response body", async () => {
    const client = new FitBudApiClient({
      baseUrl: "https://example.test",
      getAccessToken: async () => "token",
      fetch: async () =>
        new Response(JSON.stringify({ data: day }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    });

    const parsed = await (
      client as FitBudApiClient & {
        getMeDay: (date: string) => Promise<MeDayResponse>;
      }
    ).getMeDay("2026-11-04");

    expect(parsed.state).toBe("missed");
    expect(parsed.assignments.workouts.map((workout) => workout.id)).toEqual([
      workoutIds[0],
      workoutIds[1],
    ]);
    expect(parsed.assignments.meals.map((meal) => meal.id)).toEqual([mealId]);
  });
});
