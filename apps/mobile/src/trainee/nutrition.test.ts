import { describe, expect, it } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import {
  buildNutritionRings,
  isMealLoggedForCount,
  mealsLoggedSummary,
} from "./nutrition";

function meal(
  partial: Partial<MealAssignment> & Pick<MealAssignment, "id" | "status">,
): MealAssignment {
  const kcalScaled = 500 * NUTRIENT_SCALE;
  const { id, status, ...rest } = partial;
  return {
    id,
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    planId: "00000000-0000-4000-8000-000000000002",
    planVersionId: "00000000-0000-4000-8000-000000000003",
    mealPrescriptionId: "00000000-0000-4000-8000-000000000004",
    mealName: partial.mealName ?? "Lunch",
    localDate: partial.localDate ?? "2026-10-17",
    windowStartsAt: "2026-10-17T06:00:00.000Z",
    windowEndsAt: "2026-10-17T08:00:00.000Z",
    photoRequired: false,
    status,
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
    compliance: rest.compliance ?? null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...rest,
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

  it("uses something-different loggedTotals for modified meals", () => {
    const rings = buildNutritionRings([
      meal({
        id: "a",
        status: "modified",
        compliance: {
          id: "c1",
          assignmentId: "a",
          coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
          planVersionId: "00000000-0000-4000-8000-000000000003",
          traineeUserId: "00000000-0000-4000-8000-000000000009",
          outcome: "modified",
          recordVersion: 1,
          loggedAt: "2026-10-17T07:00:00.000Z",
          deviationKind: "restaurant",
          notes: null,
          photoRequired: false,
          photoIntent: null,
          mediaAssetId: null,
          loggedTotals: {
            energyKcal: 610,
            proteinG: 24,
            carbsG: 80,
            fatG: 20,
          },
          createdAt: "2026-10-17T07:00:00.000Z",
          updatedAt: "2026-10-17T07:00:00.000Z",
        },
      }),
      meal({ id: "b", status: "pending" }),
    ]);
    const kcal = rings.find((r) => r.key === "kcal");
    expect(kcal?.logged).toBe(610);
    expect(kcal?.assigned).toBe(1000);
  });

  it("does not add skipped meal macros but counts the meal as logged", () => {
    const meals = [
      meal({ id: "a", status: "skipped" }),
      meal({ id: "b", status: "pending" }),
    ];
    expect(isMealLoggedForCount("skipped")).toBe(true);
    expect(mealsLoggedSummary(meals)).toBe("1 of 2 meals logged");
    const rings = buildNutritionRings(meals);
    expect(rings.find((r) => r.key === "kcal")?.logged).toBe(0);
  });

  it("marks unknown when loggedTotals omit nutrients", () => {
    const rings = buildNutritionRings([
      meal({
        id: "a",
        status: "modified",
        compliance: {
          id: "c1",
          assignmentId: "a",
          coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
          planVersionId: "00000000-0000-4000-8000-000000000003",
          traineeUserId: "00000000-0000-4000-8000-000000000009",
          outcome: "modified",
          recordVersion: 1,
          loggedAt: "2026-10-17T07:00:00.000Z",
          deviationKind: null,
          notes: null,
          photoRequired: false,
          photoIntent: null,
          mediaAssetId: null,
          loggedTotals: {
            energyKcal: 200,
            proteinG: null,
            carbsG: null,
            fatG: null,
          },
          createdAt: "2026-10-17T07:00:00.000Z",
          updatedAt: "2026-10-17T07:00:00.000Z",
        },
      }),
    ]);
    expect(rings.every((r) => r.unknown)).toBe(true);
    expect(rings.find((r) => r.key === "kcal")?.logged).toBe(200);
  });
});
