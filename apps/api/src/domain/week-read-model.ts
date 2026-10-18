import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  type WeekDayState,
  type WeekReadModel,
  type WeekTodayNutrition,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  dayMacrosFromScaledItems,
  deriveMealAssignmentStatus,
  deriveWorkoutAssignmentStatus,
  formatLocalDate,
  mealsOnDates,
  unscaleNutrient,
} from "@fitbud/core";
import type { Db } from "../db/client.js";
import {
  mealAssignments,
  mealCompliance,
  plans,
  planVersions,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";
import { parsePlanContentJson } from "./mappers.js";

function macrosFromPrescriptionItems(
  items: Array<{
    calculated?: {
      energyKcalScaled: number | null;
      proteinScaled: number | null;
      carbsScaled: number | null;
      fatScaled: number | null;
      partial: boolean;
    } | null;
  }>,
) {
  return dayMacrosFromScaledItems(items.map((item) => item.calculated ?? null));
}

async function loadAssignedTodayNutrition(
  db: Db,
  relationshipId: string,
  today: string,
): Promise<WeekTodayNutrition["assigned"]> {
  const rows = await db
    .select({ contentJson: planVersions.contentJson })
    .from(plans)
    .innerJoin(planVersions, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "effective"),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
    .limit(1);
  const contentJson = rows[0]?.contentJson;
  if (!contentJson) return null;

  const content = parsePlanContentJson(contentJson);
  const placed = mealsOnDates(content.mealPrescriptions, [today]);
  if (placed.length === 0) return null;

  const allItems = placed.flatMap(({ meal }) => meal.items ?? []);
  const part = macrosFromPrescriptionItems(allItems);
  if (part.unknown) return null;
  return {
    kcal: part.kcal,
    proteinG: part.proteinG,
    carbsG: part.carbsG,
    fatG: part.fatG,
  };
}

function loggedTodayNutrition(
  meals: Array<{
    assignment: { localDate: string };
    compliance: {
      kcalScaled: number | null;
      proteinScaled: number | null;
      carbsScaled: number | null;
      fatScaled: number | null;
    } | null;
  }>,
  today: string,
): WeekTodayNutrition["logged"] {
  let kcalScaled = 0;
  let proteinScaled = 0;
  let carbsScaled = 0;
  let fatScaled = 0;
  let hasUnknown = false;

  for (const row of meals) {
    if (row.assignment.localDate !== today) continue;
    const compliance = row.compliance;
    if (!compliance) continue;

    const scaled = [
      compliance.kcalScaled,
      compliance.proteinScaled,
      compliance.carbsScaled,
      compliance.fatScaled,
    ];
    if (scaled.some((v) => v == null)) {
      hasUnknown = true;
    }
    // Sum scaled first, unscale once — matches /me/day totals.
    kcalScaled += compliance.kcalScaled ?? 0;
    proteinScaled += compliance.proteinScaled ?? 0;
    carbsScaled += compliance.carbsScaled ?? 0;
    fatScaled += compliance.fatScaled ?? 0;
  }

  const macros = {
    kcal: unscaleNutrient(kcalScaled),
    proteinG: unscaleNutrient(proteinScaled),
    carbsG: unscaleNutrient(carbsScaled),
    fatG: unscaleNutrient(fatScaled),
  };
  return hasUnknown ? { ...macros, hasUnknown: true } : macros;
}

export async function buildWeekReadModel(
  db: Db,
  input: {
    relationshipId: string;
    start: string;
    timeZone: string;
    nowIso: string;
  },
): Promise<WeekReadModel> {
  const end = addDaysToLocalDate(input.start, 6);
  const dates = Array.from({ length: 7 }, (_, i) =>
    addDaysToLocalDate(input.start, i),
  );
  const today = formatLocalDate(new Date(input.nowIso), input.timeZone);

  const workouts = await db
    .select({
      assignment: workoutAssignments,
      execution: workoutExecutions,
    })
    .from(workoutAssignments)
    .leftJoin(
      workoutExecutions,
      eq(workoutExecutions.assignmentId, workoutAssignments.id),
    )
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        gte(workoutAssignments.localDate, input.start),
        lte(workoutAssignments.localDate, end),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
      ),
    );

  const meals = await db
    .select({
      assignment: mealAssignments,
      compliance: mealCompliance,
    })
    .from(mealAssignments)
    .leftJoin(
      mealCompliance,
      eq(mealCompliance.assignmentId, mealAssignments.id),
    )
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        gte(mealAssignments.localDate, input.start),
        lte(mealAssignments.localDate, end),
        eq(mealAssignments.scheduleStatus, "scheduled"),
      ),
    );

  const nowMs = Date.parse(input.nowIso);

  let workoutsAssigned = 0;
  let workoutsCompleted = 0;
  for (const row of workouts) {
    // Exclude future workout slots from "so far" counts.
    if (Date.parse(row.assignment.windowStartsAt) > nowMs) continue;
    workoutsAssigned += 1;
    const status = deriveWorkoutAssignmentStatus({
      nowIso: input.nowIso,
      windowEndsAt: row.assignment.windowEndsAt,
      executionStatus: row.execution?.status ?? null,
    });
    if (status === "completed" || status === "modified") {
      workoutsCompleted += 1;
    }
  }

  let mealsAssigned = 0;
  let mealsLogged = 0;
  for (const row of meals) {
    // Exclude future meal slots from "Meals logged so far".
    if (Date.parse(row.assignment.windowStartsAt) > nowMs) continue;
    mealsAssigned += 1;
    const status = deriveMealAssignmentStatus({
      nowIso: input.nowIso,
      windowEndsAt: row.assignment.windowEndsAt,
      complianceOutcome: row.compliance?.outcome ?? null,
      loggedAt: row.compliance?.loggedAt ?? null,
    });
    if (
      status === "confirmed" ||
      status === "modified" ||
      status === "logged_later"
    ) {
      mealsLogged += 1;
    }
  }

  const days = dates.map((date) => {
    const dayWorkouts = workouts.filter((w) => w.assignment.localDate === date);
    const dayMeals = meals
      .filter((m) => m.assignment.localDate === date)
      .sort((a, b) =>
        a.assignment.windowStartsAt < b.assignment.windowStartsAt ? -1 : 1,
      );

    const mealSlots = dayMeals.map((m) => {
      const status = deriveMealAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: m.assignment.windowEndsAt,
        complianceOutcome: m.compliance?.outcome ?? null,
        loggedAt: m.compliance?.loggedAt ?? null,
      });
      if (
        status === "confirmed" ||
        status === "modified" ||
        status === "logged_later" ||
        status === "skipped"
      ) {
        return "logged" as const;
      }
      if (Date.parse(m.assignment.windowStartsAt) > nowMs) {
        return date === today ? ("later" as const) : ("upcoming" as const);
      }
      if (date < today || Date.parse(m.assignment.windowEndsAt) < nowMs) {
        return "missed" as const;
      }
      return "later" as const;
    });

    const mealsLoggedDay = mealSlots.filter((s) => s === "logged").length;
    const mealsAssignedDay =
      date > today
        ? dayMeals.length
        : dayMeals.filter((m) => Date.parse(m.assignment.windowStartsAt) <= nowMs)
            .length;

    let workoutLabel = "Rest";
    let workoutState: WeekDayState = "rest";
    if (dayWorkouts.length === 0) {
      workoutState = date > today ? "future" : "rest";
      workoutLabel = "Rest";
    } else if (date > today) {
      workoutState = "future";
      workoutLabel = dayWorkouts[0]!.assignment.workoutDayName;
    } else {
      workoutLabel = dayWorkouts[0]!.assignment.workoutDayName;
      const woStatuses = dayWorkouts.map((w) =>
        deriveWorkoutAssignmentStatus({
          nowIso: input.nowIso,
          windowEndsAt: w.assignment.windowEndsAt,
          executionStatus: w.execution?.status ?? null,
        }),
      );
      const allDone = woStatuses.every(
        (s) => s === "completed" || s === "modified" || s === "skipped",
      );
      const anyDone = woStatuses.some(
        (s) => s === "completed" || s === "modified" || s === "skipped",
      );
      const allMissed = woStatuses.every((s) => s === "missed");
      if (allDone) workoutState = "done";
      else if (allMissed || (!anyDone && date < today)) workoutState = "missed";
      else if (anyDone) workoutState = "partial";
      else workoutState = date < today ? "missed" : "partial";
    }

    return {
      date,
      state: workoutState,
      workoutLabel,
      mealsLogged: mealsLoggedDay,
      mealsAssigned: mealsAssignedDay,
      mealSlots,
    };
  });

  const assigned = await loadAssignedTodayNutrition(
    db,
    input.relationshipId,
    today,
  );
  const todayNutrition: WeekTodayNutrition = {
    date: today,
    logged: loggedTodayNutrition(meals, today),
    assigned,
  };

  return {
    start: input.start,
    workouts: { assigned: workoutsAssigned, completed: workoutsCompleted },
    meals: { assigned: mealsAssigned, logged: mealsLogged },
    days,
    todayNutrition,
  };
}
