import { describe, expect, it } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { buildNutritionRings } from "./nutrition";

function meal(partial: Partial<MealAssignment> & Pick<MealAssignment, "id" | "status">): MealAssignment {
  const kcalScaled = 500 * NUTRIENT_SCALE;
  return {
    id: partial.id,
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    planId: "00000000-0000-4000-8000-000000000002",
    planVersionId: "00000000-0000-4000-8000-000000000003",
    mealPrescriptionId: "00000000-0000-4000-8000-000000000004",
    mealName: partial.mealName ?? "Lunch",
    localDate: partial.localDate ?? "2026-10-17",
    windowStartsAt: "2026-10-17T06:00:00.000Z",
    windowEndsAt: "2026-10-17T08:00:00.000Z",
    photoRequired: false,
    status: partial.status,
    scheduleStatus: "scheduled",
    prescription: {
      id: "00000000-0000-4000-8000-000000000005",
      mealSlotKey: "lunch",
      items: [
        {
          id: "00000000-0000-4000-8000-000000000006",
          foodId: "00000000-0000-4000-8000-000000000007",
          servingId: "00000000-0000-4000-8000-000000000008",
          quantity: 1,
          label: "Dal",
          calculated: {
            energyKcalScaled: kcalScaled,
            proteinScaled: 20 * NUTRIENT_SCALE,
            carbsScaled: 60 * NUTRIENT_SCALE,
            fatScaled: 10 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
      instructions: null,
      scheduleHint: null,
    },
    compliance: partial.compliance ?? null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...partial,
  } as MealAssignment;
}

describe("buildNutritionRings", () => {
  it("counts confirmed meals toward logged totals", () => {
    const rings = buildNutritionRings([
      meal({ id: "a", status: "confirmed" }),
      meal({ id: "b", status: "pending" }),
    ]);
    const kcal = rings.find((r) => r.key === "kcal");
    expect(kcal?.logged).toBe(500);
    expect(kcal?.assigned).toBe(1000);
  });
});
