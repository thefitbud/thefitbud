import { describe, expect, it } from "vitest";
import type { Checkin, MealAssignment, WorkoutAssignment } from "@fitbud/contracts";
import { nextUp, nextUpEyebrow } from "./nextUp";

function meal(
  partial: Partial<MealAssignment> & Pick<MealAssignment, "id" | "status">,
): MealAssignment {
  const { id, status, mealName, windowStartsAt, windowEndsAt, ...rest } = partial;
  return {
    id,
    coachingRelationshipId: "00000000-0000-4000-8000-000000000001",
    planId: "00000000-0000-4000-8000-000000000002",
    planVersionId: "00000000-0000-4000-8000-000000000003",
    mealPrescriptionId: "00000000-0000-4000-8000-000000000004",
    mealName: mealName ?? "Breakfast",
    localDate: "2026-10-18",
    windowStartsAt: windowStartsAt ?? "2026-10-18T02:30:00.000Z",
    windowEndsAt: windowEndsAt ?? "2026-10-18T03:30:00.000Z",
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: "00000000-0000-4000-8000-000000000005",
      mealSlotKey: "breakfast",
      items: [],
      instructions: null,
      scheduleHint: null,
    },
    compliance: null,
    createdAt: "2026-10-18T00:00:00.000Z",
    updatedAt: "2026-10-18T00:00:00.000Z",
    ...rest,
  } as MealAssignment;
}

function workout(
  status: WorkoutAssignment["status"],
): WorkoutAssignment {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    status,
    workoutDayName: "Lower body B",
    localDate: "2026-10-18",
    windowStartsAt: "2026-10-18T13:00:00.000Z",
    windowEndsAt: "2026-10-18T15:00:00.000Z",
    workoutDay: { exercises: [] },
  } as unknown as WorkoutAssignment;
}

function checkin(status: Checkin["status"]): Checkin {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    status,
    localDate: "2026-10-18",
  } as Checkin;
}

describe("nextUp", () => {
  it("prefers overdue meal", () => {
    const hero = nextUp({
      meals: [meal({ id: "m1", status: "overdue" })],
      workout: workout("assigned"),
      checkin: checkin("due"),
      now: new Date("2026-10-18T04:00:00.000Z"),
    });
    expect(hero?.kind).toBe("meal");
    if (hero?.kind === "meal") expect(hero.reason).toBe("overdue");
  });

  it("at night prefers the most recently overdue meal over morning breakfast", () => {
    const hero = nextUp({
      meals: [
        meal({
          id: "breakfast",
          status: "overdue",
          mealName: "Breakfast",
          windowStartsAt: "2026-10-18T02:30:00.000Z",
          windowEndsAt: "2026-10-18T03:30:00.000Z",
        }),
        meal({
          id: "dinner",
          status: "overdue",
          mealName: "Dinner",
          windowStartsAt: "2026-10-18T14:30:00.000Z",
          windowEndsAt: "2026-10-18T15:30:00.000Z",
        }),
      ],
      workout: null,
      checkin: null,
      now: new Date("2026-10-18T17:20:00.000Z"), // ~10:50 pm IST
    });
    expect(hero?.kind).toBe("meal");
    if (hero?.kind === "meal") expect(hero.meal.id).toBe("dinner");
  });

  it("prefers meal in ±60 min window over workout", () => {
    const now = new Date("2026-10-18T02:40:00.000Z");
    const hero = nextUp({
      meals: [
        meal({
          id: "m1",
          status: "pending",
          windowStartsAt: "2026-10-18T02:30:00.000Z",
          windowEndsAt: "2026-10-18T03:30:00.000Z",
        }),
      ],
      workout: workout("assigned"),
      checkin: null,
      now,
    });
    expect(hero?.kind).toBe("meal");
  });

  it("falls back to unfinished workout", () => {
    const hero = nextUp({
      meals: [meal({ id: "m1", status: "confirmed" })],
      workout: workout("assigned"),
      checkin: checkin("due"),
      now: new Date("2026-10-18T10:00:00.000Z"),
    });
    expect(hero?.kind).toBe("workout");
  });

  it("falls back to due check-in", () => {
    const hero = nextUp({
      meals: [meal({ id: "m1", status: "confirmed" })],
      workout: workout("completed"),
      checkin: checkin("due"),
      now: new Date("2026-10-18T10:00:00.000Z"),
    });
    expect(hero?.kind).toBe("checkin");
  });

  it("eyebrow shows minutes until meal", () => {
    const hero = nextUp({
      meals: [
        meal({
          id: "m1",
          status: "pending",
          windowStartsAt: "2026-10-18T03:00:00.000Z",
          windowEndsAt: "2026-10-18T04:00:00.000Z",
        }),
      ],
      workout: null,
      checkin: null,
      now: new Date("2026-10-18T02:30:00.000Z"),
    });
    expect(hero).not.toBeNull();
    if (hero) {
      expect(nextUpEyebrow(hero, new Date("2026-10-18T02:30:00.000Z"))).toMatch(
        /in 30 min/,
      );
    }
  });
});
