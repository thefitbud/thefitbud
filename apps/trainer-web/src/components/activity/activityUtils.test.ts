import { describe, expect, it } from "vitest";
import { NUTRIENT_SCALE, type MealAssignment, type MealFoodItem } from "@fitbud/contracts";
import { mealDetailLine, planEnergyKcal } from "./activityUtils";

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
