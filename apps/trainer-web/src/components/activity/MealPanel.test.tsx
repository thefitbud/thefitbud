/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NUTRIENT_SCALE, type MealAssignment, type MealFoodItem } from "@fitbud/contracts";
import { formatKcal } from "@fitbud/core";
import { MealPanel } from "./MealPanel";

const PLAN_KCAL = 520;

function scaledItem(name: string, kcal: number): MealFoodItem {
  return {
    snapshotKind: "calculated",
    name,
    classification: "prepared_food",
    basis: "per_100_g",
    canonical: {
      energyKcalScaled: kcal * NUTRIENT_SCALE,
      proteinScaled: NUTRIENT_SCALE,
      carbsScaled: NUTRIENT_SCALE,
      fatScaled: NUTRIENT_SCALE,
    },
    serving: {
      label: "1 serving",
      unit: "g",
      conversionScaled: 100 * NUTRIENT_SCALE,
    },
    quantityScaled: NUTRIENT_SCALE,
    calculated: {
      energyKcalScaled: kcal * NUTRIENT_SCALE,
      proteinScaled: NUTRIENT_SCALE,
      carbsScaled: NUTRIENT_SCALE,
      fatScaled: NUTRIENT_SCALE,
      partial: false,
    },
  } as MealFoodItem;
}

function assignment(items: MealFoodItem[]): MealAssignment {
  return {
    mealName: "Lunch",
    localDate: "2026-10-17",
    windowEndsAt: "2026-10-17T08:30:00.000Z",
    prescription: { items },
    compliance: {
      notes: null,
      mediaAssetId: null,
      loggedItems: [
        {
          name: "Rajma",
          quantity: 1,
          servingLabel: "katori",
          energyKcal: 610,
          proteinG: 24,
          carbsG: 80,
          fatG: 12,
        },
      ],
      loggedTotals: {
        energyKcal: 610,
        proteinG: 24,
        carbsG: 80,
        fatG: 12,
      },
    },
  } as MealAssignment;
}

describe("MealPanel plan kcal", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows the plan total in kcal, not the raw energyKcalScaled sum", () => {
    render(
      <MealPanel
        assignment={assignment([
          scaledItem("Roti", 200),
          scaledItem("Dal", 320),
        ])}
        clientTimezone="Asia/Kolkata"
      />,
    );

    const plan = screen.getByText(/Plan ≥/);
    const planText = (plan.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(planText).toBe(`Plan ≥ ${formatKcal(PLAN_KCAL)}`);
    expect(planText).not.toContain(String(PLAN_KCAL * NUTRIENT_SCALE));

    const logged = screen.getByText(/Totals ≥/);
    const loggedText = (logged.textContent ?? "").replace(/\s+/g, " ").trim();
    expect(loggedText).toContain("610 kcal");
    expect(loggedText).toContain("+90 kcal");
    expect(loggedText).not.toContain(String(PLAN_KCAL * NUTRIENT_SCALE));
  });
});
