import { describe, expect, it } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { canLogMealOnDate } from "./mealHelpers";

function meal(partial: Partial<MealAssignment> & Pick<MealAssignment, "id">): MealAssignment {
  const { id, prescription: prescriptionOverride, ...rest } = partial;
  return {
    id,
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    planId: "00000000-0000-4000-8000-000000000002",
    planVersionId: "00000000-0000-4000-8000-000000000003",
    mealPrescriptionId: "00000000-0000-4000-8000-000000000004",
    mealName: "Lunch",
    localDate: "2026-10-17",
    windowStartsAt: "2026-10-17T06:00:00.000Z",
    windowEndsAt: "2026-10-17T12:00:00.000Z",
    photoRequired: false,
    status: partial.status ?? "pending",
    scheduleStatus: "scheduled",
    prescription: prescriptionOverride ?? {
      id: "00000000-0000-4000-8000-000000000005",
      order: 1,
      name: "Lunch",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
      required: true,
    },
    compliance: null,
    createdAt: "2026-10-17T00:00:00.000Z",
    updatedAt: "2026-10-17T00:00:00.000Z",
    ...rest,
  };
}

describe("canLogMealOnDate", () => {
  it("allows logging on today for pending meals", () => {
    expect(
      canLogMealOnDate({
        selectedDate: "2026-10-17",
        today: "2026-10-17",
        meal: meal({ id: "a", status: "pending" }),
        unresolvedExceptionCount: 0,
      }),
    ).toBe(true);
  });

  it("blocks future days", () => {
    expect(
      canLogMealOnDate({
        selectedDate: "2026-10-18",
        today: "2026-10-17",
        meal: meal({ id: "b", status: "pending" }),
        unresolvedExceptionCount: 1,
      }),
    ).toBe(false);
  });

  it("allows late logging on past required meals when exceptions are open", () => {
    expect(
      canLogMealOnDate({
        selectedDate: "2026-10-16",
        today: "2026-10-17",
        meal: meal({ id: "c", status: "overdue" }),
        unresolvedExceptionCount: 2,
      }),
    ).toBe(true);
  });

  it("blocks optional meals on past days", () => {
    expect(
      canLogMealOnDate({
        selectedDate: "2026-10-16",
        today: "2026-10-17",
        meal: meal({
          id: "d",
          status: "pending",
          prescription: {
            id: "00000000-0000-4000-8000-000000000005",
            order: 1,
            name: "Snack",
            scheduleHint: null,
            instructions: null,
            photoRequired: false,
            items: [],
            required: false,
          },
        }),
        unresolvedExceptionCount: 3,
      }),
    ).toBe(false);
  });
});
