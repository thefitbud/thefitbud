import { and, eq } from "drizzle-orm";
import type { LoggedFoodItem } from "@fitbud/contracts";
import { canLog, scaleMacro, sumMacros } from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  coachingRelationships,
  exceptions,
  foodLibraryItems,
  foodLibraryServings,
  mealAssignments,
  traineeCustomFoods,
} from "../db/schema.js";
import { resolveLibraryId } from "./library-redirects.js";
import { createId, nowIso } from "../lib/crypto.js";
import {
  LOG_TIME_ERROR_CODES,
  assertLogTimeWithinBounds,
  isInEndedPeriod,
  type LogTimeRejection,
} from "./log-time-bounds.js";

/** Stable code for a trainee write on a coach-created entry (R1; 409). */
export const COACH_LOGGED_READ_ONLY_CODE = "COACH_LOGGED_READ_ONLY";

export async function assertMealLogAllowed(
  db: Db,
  input: {
    assignmentId: string;
    relationshipId: string;
    relationshipEnded: boolean;
    traineeUserId: string;
    traineeTimezone: string;
    clientLoggedAt?: string;
    nowIso: string;
    alreadyLogged: boolean;
    /** R1 (Z6-20): who wrote the existing entry, when there is one. */
    existingLoggedByRole?: "trainee" | "coach" | null;
  },
): Promise<
  | { ok: true; loggedLate: boolean; loggedAfterResolve: boolean }
  | { ok: false; code: string; reason: LogTimeRejection; status: 422 }
  | { ok: false; code: string; reason: string; status?: undefined }
> {
  const [assignment] = await db
    .select()
    .from(mealAssignments)
    .where(eq(mealAssignments.id, input.assignmentId))
    .limit(1);
  if (!assignment) {
    return { ok: false, code: "ASSIGNMENT_NOT_FOUND", reason: "not_found" };
  }
  // R1 (D-P2-21, Z6-20): an entry the coach created is read-only to the trainee.
  if (input.existingLoggedByRole === "coach") {
    return { ok: false, code: COACH_LOGGED_READ_ONLY_CODE, reason: "coach_logged" };
  }
  // EC1 rule 1: after a reactivation, nothing dated in the frozen period may
  // be logged, so exceptions closed at the end can never be reopened or fed.
  const [relationship] = await db
    .select({ reactivatedAt: coachingRelationships.reactivatedAt })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, input.relationshipId))
    .limit(1);
  if (
    isInEndedPeriod({
      reactivatedAt: relationship?.reactivatedAt ?? null,
      loggedAt: input.clientLoggedAt ?? input.nowIso,
      localDate: assignment.localDate,
      timeZone: input.traineeTimezone,
    })
  ) {
    return {
      ok: false,
      code: LOG_TIME_ERROR_CODES.ended_period,
      reason: "ended_period",
      status: 422,
    };
  }
  const bounds = assertLogTimeWithinBounds({
    clientLoggedAt: input.clientLoggedAt ?? input.nowIso,
    windowStart: assignment.windowStartsAt,
    now: input.nowIso,
  });
  if (!bounds.ok) {
    return {
      ok: false,
      code: LOG_TIME_ERROR_CODES[bounds.reason],
      reason: bounds.reason,
      status: 422,
    };
  }
  const prescription = JSON.parse(assignment.mealPrescriptionJson) as {
    required?: boolean;
  };
  const required = prescription.required !== false;

  const [exception] = await db
    .select()
    .from(exceptions)
    .where(
      and(
        eq(exceptions.coachingRelationshipId, input.relationshipId),
        eq(exceptions.sourceEntityId, input.assignmentId),
      ),
    )
    .limit(1);

  const decision = canLog({
    assignmentScheduleStatus: assignment.scheduleStatus,
    relationshipEnded: input.relationshipEnded,
    exceptionStatus:
      exception?.status === "detected"
        ? "active"
        : (exception?.status ?? null),
    exceptionResolvedAt: exception?.resolvedAt ?? null,
    nowIso: input.nowIso,
    clientLoggedAt: input.clientLoggedAt,
    localDate: assignment.localDate,
    traineeTimezone: input.traineeTimezone,
    required,
    alreadyLogged: input.alreadyLogged,
    windowEndsAt: assignment.windowEndsAt,
  });

  if (decision.decision === "locked" || decision.decision === "superseded" || decision.decision === "ended") {
    return {
      ok: false,
      code: "LOCKED",
      reason: decision.reason ?? decision.decision,
    };
  }

  return {
    ok: true,
    loggedLate: decision.decision === "ok_late",
    loggedAfterResolve: decision.decision === "ok_after_resolve",
  };
}

export async function buildLoggedFoodsCompliance(
  db: Db,
  input: {
    traineeUserId: string;
    relationshipId: string;
    items: LoggedFoodItem[];
  },
): Promise<{
  itemsJson: string;
  kcalScaled: number;
  proteinScaled: number;
  carbsScaled: number;
  fatScaled: number;
}> {
  const stored: unknown[] = [];
  const macroLines = [];
  const now = nowIso();

  for (const item of input.items) {
    if (item.customFood) {
      const customId = createId();
      await db.insert(traineeCustomFoods).values({
        id: customId,
        traineeUserId: input.traineeUserId,
        relationshipId: input.relationshipId,
        name: item.customFood.name,
        kcalScaled: item.customFood.kcal * 1_000_000,
        proteinScaled: scaleMacro(item.customFood.protein ?? 0, 1),
        carbsScaled: scaleMacro(item.customFood.carbs ?? 0, 1),
        fatScaled: scaleMacro(item.customFood.fat ?? 0, 1),
        servingLabel: item.customFood.servingLabel ?? "serving",
        createdAt: now,
      });
      stored.push({ customFoodId: customId, ...item.customFood });
      macroLines.push({
        kcalScaled: item.customFood.kcal * 1_000_000,
        proteinScaled: scaleMacro(item.customFood.protein ?? 0, 1),
        carbsScaled: scaleMacro(item.customFood.carbs ?? 0, 1),
        fatScaled: scaleMacro(item.customFood.fat ?? 0, 1),
      });
      continue;
    }
    if (item.foodId) {
      const foodId = (await resolveLibraryId(db, item.foodId)).id;
      const [food] = await db
        .select()
        .from(foodLibraryItems)
        .where(eq(foodLibraryItems.id, foodId))
        .limit(1);
      const servingId = item.servingId
        ? (await resolveLibraryId(db, item.servingId)).id
        : food?.defaultServingId ?? null;
      const [serving] = servingId
        ? await db
            .select()
            .from(foodLibraryServings)
            .where(eq(foodLibraryServings.id, servingId))
            .limit(1)
        : [];
      const qty = item.quantity ?? 1;
      const kcal = food
        ? Math.round(
            ((food.energyKcalScaled ?? 0) *
              qty *
              (serving?.conversionScaled ?? 100_000_000)) /
              100_000_000,
          )
        : 0;
      stored.push({ foodId, servingId, quantity: qty });
      macroLines.push({
        kcalScaled: kcal,
        proteinScaled: food
          ? Math.round(
              ((food.proteinScaled ?? 0) *
                qty *
                (serving?.conversionScaled ?? 100_000_000)) /
                100_000_000,
            )
          : 0,
        carbsScaled: food
          ? Math.round(
              ((food.carbsScaled ?? 0) *
                qty *
                (serving?.conversionScaled ?? 100_000_000)) /
                100_000_000,
            )
          : 0,
        fatScaled: food
          ? Math.round(
              ((food.fatScaled ?? 0) *
                qty *
                (serving?.conversionScaled ?? 100_000_000)) /
                100_000_000,
            )
          : 0,
      });
    }
  }

  const totals = sumMacros(macroLines);
  return {
    itemsJson: JSON.stringify(stored),
    kcalScaled: totals.kcalScaled,
    proteinScaled: totals.proteinScaled,
    carbsScaled: totals.carbsScaled,
    fatScaled: totals.fatScaled,
  };
}
