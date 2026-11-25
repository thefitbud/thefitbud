import { describe, expect, it } from "vitest";
import { NUTRIENT_SCALE, type MealAssignment, type MealFoodItem } from "@fitbud/contracts";
import {
  activityMealChipLabel,
  dayHeading,
  feedCardTitle,
  mealDetailLine,
  planEnergyKcal,
  rangeLabel,
} from "./activityUtils";

function scaledItem(kcal: number): MealFoodItem {
  return {
    calculated: {
      energyKcalScaled: kcal * NUTRIENT_SCALE,
      proteinScaled: NUTRIENT_SCALE,
      carbsScaled: NUTRIENT_SCALE,
      fatScaled: NUTRIENT_SCALE,
      partial: false,
    },
  } as MealFoodItem;
}

describe("planEnergyKcal", () => {
  it("unscales a sum of energyKcalScaled to the plan kcal", () => {
    expect(planEnergyKcal([scaledItem(200), scaledItem(320)])).toBe(520);
  });

  it("treats a legacy calories value as already-unscaled kcal", () => {
    const legacy = { name: "Roti", calories: 180 } as unknown as MealFoodItem;
    expect(planEnergyKcal([legacy, scaledItem(340)])).toBe(520);
  });
});

describe("mealDetailLine", () => {
  it("prints the plan kcal beside the logged kcal", () => {
    const assignment = {
      status: "modified",
      prescription: { items: [scaledItem(200), scaledItem(320)] },
      compliance: {
        outcome: "modified",
        notes: null,
        loggedItems: [{ name: "Rajma" }],
        loggedTotals: { energyKcal: 610 },
      },
    } as MealAssignment;

    expect(mealDetailLine(assignment)).toBe("Ate: Rajma · 610 kcal (plan 520)");
  });
});

describe("activityMealChipLabel / feedCardTitle (Z12-8)", () => {
  it("uses frame 158 meal chip copy", () => {
    expect(activityMealChipLabel("confirmed")).toBe("As planned");
    expect(activityMealChipLabel("modified")).toBe("Changed");
    expect(activityMealChipLabel("pending")).toBe("Not logged yet");
    expect(activityMealChipLabel("overdue")).toBe("Not logged");
  });

  it("titles the feed card by type and range", () => {
    expect(feedCardTitle("meal", "this_week")).toBe("Meals · this week");
    expect(feedCardTitle("workout", "last_week")).toBe("Workouts · last week");
  });
});

describe("dayHeading / rangeLabel (W13-8)", () => {
  it("reads Today with the date only for the client’s today", () => {
    expect(dayHeading("2026-11-18", "2026-11-18")).toBe("Today · Wed 18 Nov");
    expect(dayHeading("2026-11-17", "2026-11-18")).toBe("Tue 17 Nov");
  });

  it("writes a range as 16 – 22 Nov, across months, or one day", () => {
    expect(rangeLabel("2026-11-16", "2026-11-22")).toBe("16 – 22 Nov");
    expect(rangeLabel("2026-11-29", "2026-12-05")).toBe("29 Nov – 5 Dec");
    expect(rangeLabel("2026-11-18", "2026-11-18")).toBe("18 Nov");
  });
});
