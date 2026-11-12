import { describe, expect, it } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE, type MeDayResponse } from "@fitbud/contracts";
import {
  buildNutritionRings,
  dayKcalSummary,
  isMealLoggedForCount,
  mealsForDay,
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

  it("adds kcal for a confirmed meal the server totals have not counted yet", () => {
    const confirmed = meal({ id: "a", status: "confirmed" });
    const totals: MeDayResponse["totals"] = {
      kcalScaled: 100 * NUTRIENT_SCALE,
      perMeal: [],
    };
    const rings = buildNutritionRings([confirmed], totals);
    expect(rings.find((ring) => ring.key === "kcal")?.logged).toBe(600);
  });

  it("does not double count a meal already present in perMeal", () => {
    const confirmed = meal({ id: "a", status: "confirmed" });
    const totals: MeDayResponse["totals"] = {
      kcalScaled: 500 * NUTRIENT_SCALE,
      perMeal: [
        {
          slotKey: confirmed.prescription.id,
          kcalScaled: 500 * NUTRIENT_SCALE,
        },
      ],
    };
    const rings = buildNutritionRings([confirmed], totals);
    expect(rings.find((ring) => ring.key === "kcal")?.logged).toBe(500);
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

describe("dayKcalSummary (D-W11-6)", () => {
  function slot(id: string, slotId: string, status: MealAssignment["status"], extra: Partial<MealAssignment> = {}) {
    const m = meal({ id, status, ...extra });
    return { ...m, prescription: { ...m.prescription, id: slotId } } as MealAssignment;
  }
  const S1 = "00000000-0000-4000-8000-0000000000a1";
  const S2 = "00000000-0000-4000-8000-0000000000a2";
  const S3 = "00000000-0000-4000-8000-0000000000a3";
  const S4 = "00000000-0000-4000-8000-0000000000a4";

  it("logged rows use logged kcal, unlogged rows planned kcal, total is the sum of logged rows", () => {
    const modified = slot("m2", S2, "modified", {
      compliance: { loggedTotals: { energyKcal: 320, proteinG: 10, carbsG: 40, fatG: 8 } },
    } as Partial<MealAssignment>);
    const totals = {
      kcalScaled: 500 * NUTRIENT_SCALE,
      // The server has a stale value for the changed meal; the logged foods win.
      perMeal: [
        { slotKey: S1, kcalScaled: 500 * NUTRIENT_SCALE },
        { slotKey: S2, kcalScaled: 999 * NUTRIENT_SCALE },
      ],
    } as unknown as MeDayResponse["totals"];
    const out = dayKcalSummary(
      [slot("m1", S1, "confirmed"), modified, slot("m3", S3, "pending"), slot("m4", S4, "skipped")],
      totals,
    );
    expect(out.rows).toEqual([
      { id: "m1", kcal: 500, kind: "logged" },
      { id: "m2", kcal: 320, kind: "logged" },
      { id: "m3", kcal: 500, kind: "planned" },
      { id: "m4", kcal: 0, kind: "logged" },
    ]);
    expect(out.loggedTotal).toBe(820);
    expect(out.plannedTotal).toBe(2000);
    const sum = out.rows.filter((r) => r.kind === "logged").reduce((a, r) => a + r.kcal, 0);
    expect(out.loggedTotal).toBe(sum);
  });

  it("falls back to the plan for a confirmed meal the server has not counted", () => {
    const out = dayKcalSummary([slot("m1", S1, "logged_later")], null);
    expect(out.rows).toEqual([{ id: "m1", kcal: 500, kind: "logged" }]);
    expect(out.loggedTotal).toBe(500);
  });

  it("an empty or all-pending day logs nothing", () => {
    expect(dayKcalSummary([], null).loggedTotal).toBe(0);
    const out = dayKcalSummary([slot("m1", S1, "pending"), slot("m2", S2, "overdue")], null);
    expect(out.loggedTotal).toBe(0);
    expect(out.rows.every((r) => r.kind === "planned")).toBe(true);
  });
});

/**
 * Z11b-1: on device the dropped query string made listMealAssignments return
 * every meal since June, and Today/Diet showed "676 of 747 meals logged". Only
 * the selected day's rows may count, whatever the list holds.
 */
describe("selected day only (Z11b-1)", () => {
  const DAY = "2026-11-12";
  function dayMeal(id: string, localDate: string, status: MealAssignment["status"], slotId: string) {
    const m = meal({ id, status, localDate });
    return { ...m, prescription: { ...m.prescription, id: slotId } } as MealAssignment;
  }
  // Four meals today (2 logged) among 30 older days of 4 meals, all confirmed.
  const today = [
    dayMeal("t1", DAY, "confirmed", "slot-1"),
    dayMeal("t2", DAY, "modified", "slot-2"),
    dayMeal("t3", DAY, "pending", "slot-3"),
    dayMeal("t4", DAY, "overdue", "slot-4"),
  ];
  const history = Array.from({ length: 30 }, (_, day) =>
    Array.from({ length: 4 }, (_, n) =>
      dayMeal(`h${day}-${n}`, `2026-10-${String(day + 1).padStart(2, "0")}`, "confirmed", `slot-${n + 1}`),
    ),
  ).flat();
  const listed = [...history.slice(0, 60), ...today, ...history.slice(60)];

  it("mealsForDay keeps only the selected day's rows", () => {
    expect(mealsForDay(listed, DAY).map((m) => m.id)).toEqual(["t1", "t2", "t3", "t4"]);
    expect(mealsLoggedSummary(mealsForDay(listed, DAY))).toBe("2 of 4 meals logged");
    // What the device showed before the fix:
    expect(mealsLoggedSummary(listed)).toBe("122 of 124 meals logged");
  });

  it("the kcal summary and rings count the selected day only", () => {
    const out = dayKcalSummary(listed, null, DAY);
    expect(out.rows.map((r) => r.id)).toEqual(["t1", "t2", "t3", "t4"]);
    // t1 confirmed 500 + t2 "modified" with no logged foods falls back to its plan (500).
    expect(out.loggedTotal).toBe(1000);
    // Before the fix the 120 older confirmed meals were summed in too.
    expect(dayKcalSummary(listed, null).loggedTotal).toBe(61000);
    expect(out.plannedTotal).toBe(2000);
    expect(dayKcalSummary(listed, null).plannedTotal).toBe(62000);
    const kcal = buildNutritionRings(mealsForDay(listed, DAY)).find((r) => r.key === "kcal");
    expect(kcal?.assigned).toBe(2000);
  });
});
