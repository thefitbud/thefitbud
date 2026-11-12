import { describe, expect, it } from "vitest";
import type { MealAssignment } from "@fitbud/contracts";
import { NUTRIENT_SCALE, type MeDayResponse } from "@fitbud/contracts";
import { dayKcalSummary } from "./nutrition";
import type { SyncEngine } from "../sync/engine";
import { isMealLogPending, pendingMealLogIds, plannedUntilSentNote } from "./mealActions";

const SLOT = "00000000-0000-4000-8000-0000000000a1";

function lunch(status: MealAssignment["status"]): MealAssignment {
  return {
    id: "00000000-0000-4000-8000-0000000000b1",
    mealName: "Lunch",
    status,
    compliance: null,
    prescription: {
      id: SLOT,
      mealSlotKey: "lunch",
      items: [
        {
          id: "00000000-0000-4000-8000-0000000000c1",
          foodId: "00000000-0000-4000-8000-0000000000c2",
          servingId: "00000000-0000-4000-8000-0000000000c3",
          quantity: 1,
          label: "Dal",
          calculated: {
            energyKcalScaled: 620 * NUTRIENT_SCALE,
            proteinScaled: 20 * NUTRIENT_SCALE,
            carbsScaled: 60 * NUTRIENT_SCALE,
            fatScaled: 10 * NUTRIENT_SCALE,
            partial: false,
          },
        },
      ],
    },
  } as unknown as MealAssignment;
}

describe("offline meal log: optimistic add and reconcile", () => {
  it("an unsent Eaten as planned adds the planned kcal at once", () => {
    expect(dayKcalSummary([lunch("pending")], null).loggedTotal).toBe(0);
    expect(dayKcalSummary([lunch("confirmed")], null).loggedTotal).toBe(620);
  });

  it("after sync the server per-meal total replaces the planned figure", () => {
    const totals = {
      kcalScaled: 600 * NUTRIENT_SCALE,
      perMeal: [{ slotKey: SLOT, kcalScaled: 600 * NUTRIENT_SCALE }],
    } as unknown as MeDayResponse["totals"];
    const out = dayKcalSummary([lunch("confirmed")], totals);
    expect(out.loggedTotal).toBe(600);
  });
});

describe("pending outbox helpers", () => {
  const row = (operation: string, status: string, recordId: string) => ({
    operation,
    status,
    recordId,
  });

  it("collects only unsent meal logs", () => {
    const ids = pendingMealLogIds([
      row("meal.confirm", "pending", "a"),
      row("meal.skip", "in_flight", "b"),
      row("meal.confirm", "applied", "c"),
      row("workout.start", "pending", "d"),
    ]);
    expect([...ids].sort()).toEqual(["a", "b"]);
  });

  it("names the meals counted as planned until sent", () => {
    const m = lunch("confirmed");
    expect(plannedUntilSentNote([m], new Set([m.id]))).toBe(
      "Lunch is counted as planned until it's sent",
    );
    expect(plannedUntilSentNote([m], new Set())).toBeNull();
    expect(plannedUntilSentNote([{ ...m, status: "skipped" }], new Set([m.id]))).toBeNull();
  });
});

describe("isMealLogPending", () => {
  const engine = (rows: unknown[] | "throw") =>
    ({
      store: {
        listOutbox: async () => {
          if (rows === "throw") throw new Error("store unavailable");
          return rows;
        },
      },
    }) as unknown as SyncEngine;

  it("is true while the confirm is still in the outbox", async () => {
    const rows = [{ operation: "meal.confirm", status: "pending", recordId: "m1" }];
    expect(await isMealLogPending(engine(rows), "m1")).toBe(true);
    expect(await isMealLogPending(engine(rows), "m2")).toBe(false);
  });

  it("is false once sent, or when the store cannot be read", async () => {
    const sent = [{ operation: "meal.confirm", status: "applied", recordId: "m1" }];
    expect(await isMealLogPending(engine(sent), "m1")).toBe(false);
    expect(await isMealLogPending(engine("throw"), "m1")).toBe(false);
  });
});
