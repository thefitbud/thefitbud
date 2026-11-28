import { describe, expect, it } from "vitest";
import type { MealPrescription } from "@fitbud/contracts";
import { appliesEveryDay, tileMeals } from "./MealsPane";

function meal(name: string, applicableWeekdays?: number[]): MealPrescription {
  return {
    id: `00000000-0000-4000-8000-${name.length.toString().padStart(12, "0")}`,
    order: 1,
    name,
    mealType: "lunch",
    applicableWeekdays,
    localTime: "13:00",
    scheduleHint: null,
    instructions: null,
    photoRequired: false,
    required: true,
    items: [],
  } as MealPrescription;
}

describe("Every day tile scope (D-W13-29)", () => {
  const daily = meal("Lunch", [0, 1, 2, 3, 4, 5, 6]);
  const weekday = meal("Banana", [1, 2, 3, 4, 5]);

  it("counts only meals that apply on all seven days", () => {
    expect(appliesEveryDay(daily)).toBe(true);
    expect(appliesEveryDay(weekday)).toBe(false);
    expect(appliesEveryDay(meal("No list"))).toBe(true);
    expect(appliesEveryDay(meal("Nowhere", []))).toBe(false);
  });

  it("Every day excludes the weekday-only meal and says so", () => {
    const result = tileMeals([daily, weekday], "all");
    expect(result.meals).toEqual([daily]);
    expect(result.narrowed).toBe(true);
  });

  it("Training days keeps the listed meals and shows no note", () => {
    const result = tileMeals([daily, weekday], "training");
    expect(result.meals).toEqual([daily, weekday]);
    expect(result.narrowed).toBe(false);
  });

  it("no note when nothing is excluded", () => {
    expect(tileMeals([daily], "all").narrowed).toBe(false);
  });
});
