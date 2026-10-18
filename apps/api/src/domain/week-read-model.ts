import { and, desc, eq, gte, lte } from "drizzle-orm";
import {
  NUTRIENT_SCALE,
  type WeekDayState,
  type WeekReadModel,
  type WeekTodayNutrition,
} from "@fitbud/contracts";
import {
  addDaysToLocalDate,
  deriveMealAssignmentStatus,
  deriveWorkoutAssignmentStatus,
  formatLocalDate,
  mealsOnDates,
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

function unscaleNutrient(scaled: number | null | undefined): number {
  if (scaled == null) return 0;
  return Math.round(scaled / NUTRIENT_SCALE);
}

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
): {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  unknown: boolean;
} {
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let unknown = false;
  for (const item of items) {
    const calculated = item.calculated ?? null;
    if (!calculated) {
      unknown = true;
      continue;
    }
    if (calculated.partial) unknown = true;
    if (
      calculated.energyKcalScaled == null ||
      calculated.proteinScaled == null ||
      calculated.carbsScaled == null ||
      calculated.fatScaled == null
    ) {
      unknown = true;
    }
    kcal += unscaleNutrient(calculated.energyKcalScaled);
    proteinG += unscaleNutrient(calculated.proteinScaled);
    carbsG += unscaleNutrient(calculated.carbsScaled);
    fatG += unscaleNutrient(calculated.fatScaled);
  }
  return { kcal, proteinG, carbsG, fatG, unknown };
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

  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  for (const { meal } of placed) {
    const part = macrosFromPrescriptionItems(meal.items ?? []);
    if (part.unknown) return null;
    kcal += part.kcal;
    proteinG += part.proteinG;
    carbsG += part.carbsG;
    fatG += part.fatG;
  }
  return { kcal, proteinG, carbsG, fatG };
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
  let kcal = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
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
    kcal += unscaleNutrient(compliance.kcalScaled);
    proteinG += unscaleNutrient(compliance.proteinScaled);
    carbsG += unscaleNutrient(compliance.carbsScaled);
    fatG += unscaleNutrient(compliance.fatScaled);
  }

  return hasUnknown
    ? { kcal, proteinG, carbsG, fatG, hasUnknown: true }
    : { kcal, proteinG, carbsG, fatG };
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

  let workoutsAssigned = 0;
  let workoutsCompleted = 0;
  for (const row of workouts) {
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
    const dayMeals = meals.filter((m) => m.assignment.localDate === date);
    if (dayWorkouts.length === 0 && dayMeals.length === 0) {
      return { date, state: "rest" as WeekDayState };
    }
    if (date > today) {
      return { date, state: "future" as WeekDayState };
    }
    const woDone = dayWorkouts.filter((w) => {
      const status = deriveWorkoutAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: w.assignment.windowEndsAt,
        executionStatus: w.execution?.status ?? null,
      });
      return status === "completed" || status === "modified" || status === "skipped";
    }).length;
    const mealDone = dayMeals.filter((m) => {
      const status = deriveMealAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: m.assignment.windowEndsAt,
        complianceOutcome: m.compliance?.outcome ?? null,
        loggedAt: m.compliance?.loggedAt ?? null,
      });
      return (
        status === "confirmed" ||
        status === "modified" ||
        status === "skipped" ||
        status === "logged_later"
      );
    }).length;
    const total = dayWorkouts.length + dayMeals.length;
    const done = woDone + mealDone;
    if (done === 0 && date < today) {
      return { date, state: "missed" as WeekDayState };
    }
    if (done >= total) {
      return { date, state: "done" as WeekDayState };
    }
    return { date, state: "partial" as WeekDayState };
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
