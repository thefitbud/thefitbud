import { describe, expect, it } from "vitest";


import type { MealAssignment, MeDayResponse, WorkoutAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE } from "@fitbud/contracts";
import { buildNutritionRings, dayKcalSummary, isMealLoggedForCount } from "../nutrition";
import { kcalLeftText } from "./TodaySummaryCard";
import {
  buildOutboxOverlay,
  overlayMeals,
  overlayWorkout,
  summariseQueuedLogs,
  type OverlayRow,
} from "./queuedLogs";

/**
 * Z14-2 outbox overlay: the phone's queued logs on top of the cached day, so
 * meal status, rings, "kcal left" and "N of M logged" never contradict
 * "N logs waiting to send".
 */

const REL = "00000000-0000-4000-8000-0000000000a1";
const PLAN_VERSION = "00000000-0000-4000-8000-0000000000a2";
const DAY = "2026-11-24";

function id(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

function meal(
  n: number,
  name: string,
  kcal: number,
  status: MealAssignment["status"],
): MealAssignment {
  return {
    id: id(100 + n),
    coachingRelationshipId: REL,
    planId: id(90),
    planVersionId: PLAN_VERSION,
    mealPrescriptionId: id(200 + n),
    mealName: name,
    localDate: DAY,
    windowStartsAt: `${DAY}T0${n}:00:00.000Z`,
    windowEndsAt: `${DAY}T0${n + 1}:00:00.000Z`,
    photoRequired: false,
    status,
    scheduleStatus: "scheduled",
    prescription: {
      id: id(200 + n),
      mealSlotKey: name.toLowerCase().replace(/\s+/g, "_"),
      items: [
        {
          id: id(300 + n),
          foodId: id(400 + n),
          servingId: id(500 + n),
          quantity: 1,
          label: name,
          calculated: {
            energyKcalScaled: kcal * NUTRIENT_SCALE,
            proteinScaled: 10 * NUTRIENT_SCALE,
            carbsScaled: 20 * NUTRIENT_SCALE,
            fatScaled: 5 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    },
    compliance: null,
    loggingLocked: false,
    createdAt: `${DAY}T00:00:00.000Z`,
    updatedAt: `${DAY}T00:00:00.000Z`,
  } as unknown as MealAssignment;
}

function row(
  operation: string,
  payload: Record<string, unknown>,
  overrides: Partial<OverlayRow> = {},
): OverlayRow {
  const mutationId = overrides.mutationId ?? id(900 + Math.floor(Math.random() * 99));
  return {
    mutationId,
    operation,
    recordId: String(payload.assignmentId ?? payload.executionId ?? mutationId),
    status: "pending",
    payloadJson: JSON.stringify(payload),
    attempts: 0,
    createdAt: `${DAY}T12:00:00.000Z`,
    ...overrides,
  };
}

describe("the inconsistent home (diagnosis #1): one queued meal, failed refresh", () => {
  // The day as last answered by the server: four meals logged, dinner not.
  // The plan's goal is 1,745 kcal; dinner is 453 of it.
  const cachedMeals = [
    meal(1, "Early morning", 50, "confirmed"),
    meal(2, "Breakfast", 412, "confirmed"),
    meal(3, "Lunch", 610, "confirmed"),
    meal(4, "Evening snack", 220, "confirmed"),
    meal(5, "Dinner", 453, "pending"),
  ];
  const cachedTotals: MeDayResponse["totals"] = {
    kcalScaled: (50 + 412 + 610 + 220) * NUTRIENT_SCALE,
    perMeal: cachedMeals.slice(0, 4).map((m) => ({
      slotKey: m.prescription.id,
      kcalScaled:
        (m.prescription.items[0] as { calculated: { energyKcalScaled: number } }).calculated
          .energyKcalScaled,
    })),
  };
  // Dinner eaten as planned while the phone could not reach FitBud; the
  // refresh failed, so the cached day above is what the screen has.
  const outbox = [
    row(
      "meal.confirm",
      { assignmentId: cachedMeals[4]!.id, mealName: "Dinner", body: { photoIntent: null } },
      { attempts: 1 },
    ),
  ];

  it("without the overlay the screen contradicts itself (the defect)", () => {
    const summary = dayKcalSummary(cachedMeals, cachedTotals, DAY);
    expect(summariseQueuedLogs(outbox).count).toBe(1);
    expect(summary.loggedTotal).toBe(1292);
    expect(cachedMeals.filter((m) => isMealLoggedForCount(m.status))).toHaveLength(4);
  });

  it("with the overlay: 1,745 eaten, 0 kcal left, 5 of 5 logged, beside 1 log waiting", () => {
    const overlay = buildOutboxOverlay(outbox, { offline: true });
    const meals = overlayMeals(cachedMeals, overlay);
    const summary = dayKcalSummary(meals, cachedTotals, DAY);
    const rings = buildNutritionRings(meals, cachedTotals);
    const kcalRing = rings.find((ring) => ring.key === "kcal")!;

    expect(summariseQueuedLogs(outbox).count).toBe(1);
    expect(meals[4]!.status).toBe("confirmed");
    expect(summary.loggedTotal).toBe(1745);
    expect(summary.plannedTotal).toBe(1745);
    expect(kcalRing.logged).toBe(1745);
    expect(kcalRing.assigned).toBe(1745);
    expect(kcalLeftText(summary.loggedTotal, kcalRing.assigned)).toEqual({
      value: "0",
      unit: "kcal left",
      goal: "Goal 1,745",
    });
    expect(meals.filter((m) => isMealLoggedForCount(m.status))).toHaveLength(5);
    // The pending row is the one that reads "Not sent yet".
    const entry = overlay.meals.get(cachedMeals[4]!.id)!;
    expect(entry).toMatchObject({ status: "confirmed", unsent: true, waiting: true });
  });
});

describe("buildOutboxOverlay / overlayMeals", () => {
  const lunch = meal(3, "Lunch", 610, "pending");

  it("applies a queued skip: skipped, adds no kcal", () => {
    const overlay = buildOutboxOverlay([
      row("meal.skip", { assignmentId: lunch.id, body: { notes: null } }),
    ]);
    const [shown] = overlayMeals([lunch], overlay);
    expect(shown!.status).toBe("skipped");
    expect(dayKcalSummary([shown!], null).loggedTotal).toBe(0);
  });

  it("applies a queued deviate with the foods' own figures", () => {
    const overlay = buildOutboxOverlay([
      row("meal.deviate", {
        assignmentId: lunch.id,
        body: {
          deviationKind: "restaurant",
          notes: "Thali at the office canteen",
          items: [{ customFood: { name: "Ate out", kcal: 820 } }],
        },
      }),
    ]);
    const [shown] = overlayMeals([lunch], overlay);
    expect(shown!.status).toBe("modified");
    expect(shown!.compliance?.deviationKind).toBe("restaurant");
    expect(shown!.compliance?.loggedTotals?.energyKcal).toBe(820);
    expect(dayKcalSummary([shown!], null).loggedTotal).toBe(820);
  });

  it("a deviate naming a library food has unknown figures, never a guess", () => {
    const overlay = buildOutboxOverlay([
      row("meal.deviate", {
        assignmentId: lunch.id,
        body: { deviationKind: "logged_foods", items: [{ foodId: id(77), quantity: 2 }] },
      }),
    ]);
    const [shown] = overlayMeals([lunch], overlay);
    expect(shown!.status).toBe("modified");
    expect(shown!.compliance?.loggedTotals).toBeUndefined();
    const rings = buildNutritionRings([shown!], null);
    expect(rings.find((ring) => ring.key === "kcal")!.unknown).toBe(true);
  });

  it("the latest queued log for a meal wins", () => {
    const overlay = buildOutboxOverlay([
      row("meal.confirm", { assignmentId: lunch.id }, { createdAt: `${DAY}T12:00:00.000Z` }),
      row("meal.skip", { assignmentId: lunch.id }, { createdAt: `${DAY}T12:05:00.000Z` }),
    ]);
    expect(overlayMeals([lunch], overlay)[0]!.status).toBe("skipped");
  });

  it("a refused log is not applied", () => {
    const overlay = buildOutboxOverlay([
      row("meal.confirm", { assignmentId: lunch.id }, { status: "rejected" }),
      row("meal.confirm", { assignmentId: lunch.id }, { status: "conflicted" }),
    ]);
    expect(overlayMeals([lunch], overlay)[0]).toBe(lunch);
  });

  it("is replaced by the server's state once the server has the log", () => {
    const sent = row("meal.confirm", { assignmentId: lunch.id });
    const overlay = buildOutboxOverlay([], { sent: [sent] });
    // The refresh after the send has not answered yet: still logged.
    expect(overlayMeals([lunch], overlay)[0]!.status).toBe("confirmed");
    expect(overlay.meals.get(lunch.id)).toMatchObject({ unsent: false, waiting: false });
    // The server's copy has it: the server's copy is shown, untouched.
    const server = { ...lunch, status: "logged_later" as const };
    expect(overlayMeals([server], overlay)[0]).toBe(server);
  });

  it("says 'waiting' only with evidence the log is held up", () => {
    const fresh = row("meal.confirm", { assignmentId: lunch.id }, { attempts: 0 });
    expect(buildOutboxOverlay([fresh]).meals.get(lunch.id)!.waiting).toBe(false);
    expect(buildOutboxOverlay([fresh], { offline: true }).meals.get(lunch.id)!.waiting).toBe(
      true,
    );
    const tried = { ...fresh, attempts: 1 };
    expect(buildOutboxOverlay([tried]).meals.get(lunch.id)!.waiting).toBe(true);
    const sending = { ...fresh, status: "in_flight", attempts: 1 };
    expect(buildOutboxOverlay([sending]).meals.get(lunch.id)!.waiting).toBe(false);
  });
});

describe("overlayWorkout", () => {
  const execution = {
    id: id(600),
    status: "started",
    completedAt: null,
  };
  const workout = {
    id: id(700),
    status: "in_progress",
    localDate: DAY,
    execution,
  } as unknown as WorkoutAssignment;

  it("applies a queued finish", () => {
    const overlay = buildOutboxOverlay([
      row("workout.complete", { executionId: execution.id, body: { sessionRpe: 7 } }),
    ]);
    const shown = overlayWorkout(workout, overlay)!;
    expect(shown.status).toBe("completed");
    expect(shown.execution?.status).toBe("completed");
  });

  it("a set queued after the finish never undoes it", () => {
    const overlay = buildOutboxOverlay([
      row(
        "workout.complete",
        { executionId: execution.id, body: { sessionRpe: null } },
        { createdAt: `${DAY}T12:00:00.000Z` },
      ),
      row(
        "workout.complete_set",
        { executionId: execution.id, setExecutionId: id(601) },
        { createdAt: `${DAY}T12:01:00.000Z` },
      ),
    ]);
    expect(overlayWorkout(workout, overlay)!.status).toBe("completed");
  });

  it("applies a queued skip and a queued start", () => {
    const assigned = { ...workout, status: "assigned", execution: null } as unknown as WorkoutAssignment;
    expect(
      overlayWorkout(
        assigned,
        buildOutboxOverlay([row("workout.skip", { assignmentId: workout.id })]),
      )!.status,
    ).toBe("skipped");
    expect(
      overlayWorkout(
        assigned,
        buildOutboxOverlay([row("workout.start", { assignmentId: workout.id })]),
      )!.status,
    ).toBe("in_progress");
  });

  it("the server's finished workout wins over a sent start", () => {
    const done = { ...workout, status: "completed" } as unknown as WorkoutAssignment;
    const overlay = buildOutboxOverlay([], {
      sent: [row("workout.start", { assignmentId: workout.id })],
    });
    expect(overlayWorkout(done, overlay)).toBe(done);
  });
});
