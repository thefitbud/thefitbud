import { describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@fitbud/api-client";
import { patchMealAssignmentClient } from "./mealAssignmentFallback";

describe("mealAssignmentFallback", () => {
  it("falls back to /me/day when list meal assignments fails validation", async () => {
    const listOriginal = vi.fn().mockRejectedValue(
      new ApiClientError({
        code: "LOCAL_DEV_ERROR",
        message: "energyKcalScaled too_big",
        requestId: "r1",
        status: 500,
      }),
    );
    const getMeDay = vi.fn().mockResolvedValue({
      date: "2026-10-17",
      assignments: {
        workouts: [],
        meals: [
          {
            id: "00000000-0000-4000-8000-000000000020",
            slotKey: "00000000-0000-4000-8000-000000000021",
          },
        ],
      },
      logs: { workouts: 0, meals: 0 },
      totals: { kcalScaled: 0, perMeal: [] },
    });
    const client = {
      listMealAssignments: listOriginal,
      getMealAssignment: vi.fn(),
      getMeDay,
    } as never;
    const patched = patchMealAssignmentClient(client);
    const page = await patched.listMealAssignments("rel-1", {
      fromDate: "2026-10-17",
      toDate: "2026-10-17",
    });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.mealName).toBe("Breakfast");
    expect(getMeDay).toHaveBeenCalledWith("2026-10-17");
  });
});
