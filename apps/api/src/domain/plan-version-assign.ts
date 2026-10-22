import { and, desc, eq, gte, lte } from "drizzle-orm";
import type {
  assignPlanVersionRequestSchema,
  assignPlanVersionResponseSchema,
  planVersionDiffResponseSchema,
  PlanContent,
} from "@fitbud/contracts";
import type { z } from "zod";

type AssignPlanVersionRequest = z.infer<typeof assignPlanVersionRequestSchema>;
type AssignPlanVersionResponse = z.infer<typeof assignPlanVersionResponseSchema>;
type PlanVersionDiffResponse = z.infer<typeof planVersionDiffResponseSchema>;
import {
  addDaysToLocalDate,
  clipInclusiveLocalRange,
  formatLocalDate,
  localDatesInRange,
  mealsOnDates,
  workoutSessionsOnDates,
  workoutSchedulesMatch,
} from "@fitbud/core";
import type { MealPrescription } from "@fitbud/contracts";
import type { Db } from "../db/client";
import {
  coachingConfigurations,
  mealAssignments,
  mealCompliance,
  nutritionExpectations,
  planVersions,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
} from "../db/schema";
import { parsePlanContentJson } from "./mappers";
import {
  insertMealAssignments,
  insertWorkoutAssignments,
  loadAssignmentPolicy,
  loadTraineeTimezone,
  reconcilePublishedPlan,
  saveAssignmentPolicy,
} from "./assignment-schedule";
import { nowIso } from "../lib/crypto";

type PlanVersionRow = typeof planVersions.$inferSelect;

function effectiveLocalBounds(
  version: PlanVersionRow,
  timeZone: string,
): { fromDate: string | null; toDate: string | null } {
  return {
    fromDate: version.effectiveFrom
      ? formatLocalDate(new Date(version.effectiveFrom), timeZone)
      : null,
    toDate: version.effectiveTo
      ? formatLocalDate(new Date(version.effectiveTo), timeZone)
      : null,
  };
}

function assignDateRange(input: {
  request: AssignPlanVersionRequest;
  version: PlanVersionRow;
  timeZone: string;
}): string[] {
  const startLocal =
    input.request.windowFrom ??
    formatLocalDate(new Date(input.request.effectiveFrom), input.timeZone);
  const endLocal =
    input.request.windowTo ??
    (input.request.effectiveTo
      ? formatLocalDate(new Date(input.request.effectiveTo), input.timeZone)
      : addDaysToLocalDate(startLocal, input.request.window - 1));
  const range = clipInclusiveLocalRange(
    { fromDate: startLocal, toDate: endLocal },
    effectiveLocalBounds(input.version, input.timeZone),
  );
  if (!range) {
    return [];
  }
  const dates = localDatesInRange(range);
  return dates.slice(0, input.request.window);
}

async function supersedeEffectiveVersions(
  db: Db,
  planId: string,
  now: string,
  exceptVersionId?: string,
) {
  const effectiveRows = await db
    .select()
    .from(planVersions)
    .where(
      and(eq(planVersions.planId, planId), eq(planVersions.status, "effective")),
    );
  const superseded = [];
  for (const row of effectiveRows) {
    if (exceptVersionId && row.id === exceptVersionId) {
      continue;
    }
    await db
      .update(planVersions)
      .set({
        status: "superseded",
        effectiveTo: now,
        updatedAt: now,
      })
      .where(eq(planVersions.id, row.id));
    superseded.push(row);
  }
  return superseded;
}

async function countSupersededInRange(
  db: Db,
  input: {
    relationshipId: string;
    dates: readonly string[];
    now: string;
  },
): Promise<{ workouts: number; meals: number }> {
  if (input.dates.length === 0) {
    return { workouts: 0, meals: 0 };
  }
  const minDate = [...input.dates].sort()[0]!;
  const maxDate = [...input.dates].sort().at(-1)!;
  const workouts = await db
    .select({ id: workoutAssignments.id })
    .from(workoutAssignments)
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.scheduleStatus, "superseded"),
        gte(workoutAssignments.localDate, minDate),
        lte(workoutAssignments.localDate, maxDate),
        eq(workoutAssignments.supersededAt, input.now),
      ),
    );
  const meals = await db
    .select({ id: mealAssignments.id })
    .from(mealAssignments)
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.scheduleStatus, "superseded"),
        gte(mealAssignments.localDate, minDate),
        lte(mealAssignments.localDate, maxDate),
        eq(mealAssignments.supersededAt, input.now),
      ),
    );
  return { workouts: workouts.length, meals: meals.length };
}

/** Non-mutating: how many unstarted scheduled rows would be replaced in this window. */
async function countWouldReplaceInRange(
  db: Db,
  input: {
    relationshipId: string;
    dates: readonly string[];
    includeWorkouts: boolean;
    includeMeals: boolean;
  },
): Promise<{ workouts: number; meals: number }> {
  if (input.dates.length === 0) {
    return { workouts: 0, meals: 0 };
  }
  const minDate = [...input.dates].sort()[0]!;
  const maxDate = [...input.dates].sort().at(-1)!;
  let workouts = 0;
  let meals = 0;
  if (input.includeWorkouts) {
    const rows = await db
      .select({
        id: workoutAssignments.id,
        executionId: workoutExecutions.id,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
          gte(workoutAssignments.localDate, minDate),
          lte(workoutAssignments.localDate, maxDate),
        ),
      );
    workouts = rows.filter((row) => row.executionId == null).length;
  }
  if (input.includeMeals) {
    const rows = await db
      .select({
        id: mealAssignments.id,
        complianceId: mealCompliance.id,
      })
      .from(mealAssignments)
      .leftJoin(
        mealCompliance,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, input.relationshipId),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          gte(mealAssignments.localDate, minDate),
          lte(mealAssignments.localDate, maxDate),
        ),
      );
    meals = rows.filter((row) => row.complianceId == null).length;
  }
  return { workouts, meals };
}

/**
 * Non-mutating preview of insert* counts after reconcile would run.
 * Matches publish: unlogged/unexecuted scheduled rows are superseded first,
 * so only logged meals (and executed workouts) block recreation.
 */
async function countWouldCreate(
  db: Db,
  input: {
    relationshipId: string;
    planVersionId: string;
    content: PlanContent;
    dates: readonly string[];
    includeWorkouts: boolean;
    includeMeals: boolean;
  },
): Promise<{ workouts: number; meals: number }> {
  if (input.dates.length === 0) {
    return { workouts: 0, meals: 0 };
  }
  let workouts = 0;
  let meals = 0;
  if (input.includeWorkouts && input.content.workoutDays.length > 0) {
    const existing = await db
      .select({
        planVersionId: workoutAssignments.planVersionId,
        workoutDayId: workoutAssignments.workoutDayId,
        localDate: workoutAssignments.localDate,
        scheduleStatus: workoutAssignments.scheduleStatus,
        executionId: workoutExecutions.id,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
          gte(workoutAssignments.localDate, input.dates[0]!),
          lte(
            workoutAssignments.localDate,
            input.dates[input.dates.length - 1]!,
          ),
        ),
      );
    const sameKeys = new Set(
      existing
        .filter((row) => row.planVersionId === input.planVersionId)
        .map((row) => `${row.workoutDayId}:${row.localDate}`),
    );
    // After reconcile, only executed workouts stay scheduled and block the date.
    const blockedDates = new Set(
      existing
        .filter(
          (row) =>
            row.scheduleStatus === "scheduled" &&
            row.planVersionId !== input.planVersionId &&
            row.executionId != null,
        )
        .map((row) => row.localDate),
    );
    for (const placement of workoutSessionsOnDates(
      input.content.workoutDays,
      input.dates,
    )) {
      const key = `${placement.day.id}:${placement.localDate}`;
      if (sameKeys.has(key) || blockedDates.has(placement.localDate)) continue;
      workouts += 1;
    }
  }
  if (input.includeMeals && input.content.mealPrescriptions.length > 0) {
    const existing = await db
      .select({
        planVersionId: mealAssignments.planVersionId,
        mealPrescriptionId: mealAssignments.mealPrescriptionId,
        mealName: mealAssignments.mealName,
        localDate: mealAssignments.localDate,
        scheduleStatus: mealAssignments.scheduleStatus,
        complianceId: mealCompliance.id,
      })
      .from(mealAssignments)
      .leftJoin(
        mealCompliance,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(
        and(
          eq(mealAssignments.coachingRelationshipId, input.relationshipId),
          gte(mealAssignments.localDate, input.dates[0]!),
          lte(
            mealAssignments.localDate,
            input.dates[input.dates.length - 1]!,
          ),
        ),
      );
    const sameKeys = new Set(
      existing
        .filter((row) => row.planVersionId === input.planVersionId)
        .map((row) => `${row.mealPrescriptionId}:${row.localDate}`),
    );
    // After reconcile, only logged meals stay scheduled and keep their slot.
    const keptSlots = new Set(
      existing
        .filter(
          (row) =>
            row.scheduleStatus === "scheduled" &&
            row.planVersionId !== input.planVersionId &&
            row.complianceId != null,
        )
        .map((row) => `${row.mealName.trim().toLowerCase()}:${row.localDate}`),
    );
    for (const placement of mealsOnDates(
      input.content.mealPrescriptions,
      input.dates,
    )) {
      const key = `${placement.meal.id}:${placement.localDate}`;
      const slot = `${placement.meal.name.trim().toLowerCase()}:${placement.localDate}`;
      if (sameKeys.has(key) || keptSlots.has(slot)) continue;
      meals += 1;
    }
  }
  return { workouts, meals };
}

async function loadActiveWorkoutHours(
  db: Db,
  relationshipId: string,
): Promise<number | null> {
  const rows = await db
    .select({ hours: workoutExpectations.completionWindowHours })
    .from(coachingConfigurations)
    .innerJoin(
      workoutExpectations,
      eq(workoutExpectations.coachingConfigurationId, coachingConfigurations.id),
    )
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    )
    .limit(1);
  return rows[0]?.hours ?? null;
}

async function loadActiveNutrition(
  db: Db,
  relationshipId: string,
): Promise<{
  confirmationWindowHours: number;
  photoRequirement: "none" | "selected_meals" | "all_meals";
} | null> {
  const rows = await db
    .select({
      confirmationWindowHours: nutritionExpectations.confirmationWindowHours,
      photoRequirement: nutritionExpectations.photoRequirement,
    })
    .from(coachingConfigurations)
    .innerJoin(
      nutritionExpectations,
      eq(nutritionExpectations.coachingConfigurationId, coachingConfigurations.id),
    )
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function assignPlanVersion(
  db: Db,
  input: {
    planId: string;
    versionId: string;
    relationshipId: string;
    traineeUserId: string;
    request: AssignPlanVersionRequest;
    dryRun: boolean;
  },
): Promise<AssignPlanVersionResponse> {
  const now = nowIso();
  const versions = await db
    .select()
    .from(planVersions)
    .where(
      and(
        eq(planVersions.id, input.versionId),
        eq(planVersions.planId, input.planId),
      ),
    )
    .limit(1);
  let version = versions[0];
  if (!version) {
    throw new Error("PLAN_VERSION_NOT_FOUND");
  }

  const dietScope = input.request.dietChangeScope ?? "today_onward";
  let previousVersions: PlanVersionRow[] = [];

  if (input.dryRun && version.status === "draft") {
    version = {
      ...version,
      effectiveFrom: input.request.effectiveFrom,
      effectiveTo: input.request.effectiveTo ?? null,
    };
  } else if (version.status === "draft") {
    previousVersions = await supersedeEffectiveVersions(
      db,
      input.planId,
      now,
      version.id,
    );
    await db
      .update(planVersions)
      .set({
        status: "effective",
        recordVersion: version.recordVersion + 1,
        publishedAt: now,
        effectiveFrom: input.request.effectiveFrom,
        effectiveTo: input.request.effectiveTo ?? null,
        updatedAt: now,
      })
      .where(eq(planVersions.id, version.id));
    const [updated] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, version.id))
      .limit(1);
    if (!updated) {
      throw new Error("PLAN_VERSION_PERSIST_FAILED");
    }
    version = updated;
    await reconcilePublishedPlan(db, {
      relationshipId: input.relationshipId,
      traineeUserId: input.traineeUserId,
      newVersion: version,
      previousVersions,
      dietScope,
      now,
    });
  } else if (
    !input.dryRun &&
    (version.status === "effective" || version.status === "published")
  ) {
    // Re-assign after end/reactivate (or extend an effective plan): reopen the
    // scheduling horizon with the trainer-picked start/end dates.
    if (version.status === "published") {
      previousVersions = await supersedeEffectiveVersions(
        db,
        input.planId,
        now,
        version.id,
      );
    }
    await db
      .update(planVersions)
      .set({
        status: "effective",
        recordVersion: version.recordVersion + 1,
        publishedAt: version.publishedAt ?? now,
        effectiveFrom: input.request.effectiveFrom,
        effectiveTo: input.request.effectiveTo ?? null,
        updatedAt: now,
      })
      .where(eq(planVersions.id, version.id));
    const [updated] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, version.id))
      .limit(1);
    if (!updated) {
      throw new Error("PLAN_VERSION_PERSIST_FAILED");
    }
    version = updated;
  }

  const existingPolicy = await loadAssignmentPolicy(db, version.id);
  if (!input.dryRun) {
    await saveAssignmentPolicy(db, {
      planVersionId: version.id,
      dietAdjustmentScope: dietScope,
      dietScopeLocalDate: formatLocalDate(
        new Date(input.request.effectiveFrom),
        await loadTraineeTimezone(db, input.traineeUserId),
      ),
      futureMealPlanVersionId:
        dietScope === "today_only"
          ? (previousVersions[0]?.id ?? existingPolicy?.futureMealPlanVersionId ?? null)
          : null,
      consistencyAckFingerprint: existingPolicy?.consistencyAckFingerprint ?? null,
    });
  }

  const timeZone = await loadTraineeTimezone(db, input.traineeUserId);
  const dates = assignDateRange({
    request: input.request,
    version,
    timeZone,
  });

  const content = parsePlanContentJson(version.contentJson);
  const hours = await loadActiveWorkoutHours(db, input.relationshipId);
  const nutrition = await loadActiveNutrition(db, input.relationshipId);
  const includeWorkouts = hours != null && content.workoutDays.length > 0;
  const includeMeals =
    Boolean(nutrition) && content.mealPrescriptions.length > 0;

  if (input.dryRun) {
    const [replaced, created] = await Promise.all([
      countWouldReplaceInRange(db, {
        relationshipId: input.relationshipId,
        dates,
        includeWorkouts,
        includeMeals,
      }),
      countWouldCreate(db, {
        relationshipId: input.relationshipId,
        planVersionId: version.id,
        content,
        dates,
        includeWorkouts,
        includeMeals,
      }),
    ]);
    return { replaced, created, dates };
  }

  const replaced = await countSupersededInRange(db, {
    relationshipId: input.relationshipId,
    dates,
    now,
  });

  let workoutsCreated = 0;
  let mealsCreated = 0;
  if (hours != null && content.workoutDays.length > 0) {
    const created = await insertWorkoutAssignments(db, {
      relationshipId: input.relationshipId,
      planId: input.planId,
      planVersionId: version.id,
      content,
      timeZone,
      completionWindowHours: hours,
      dates,
      now,
    });
    workoutsCreated = created.length;
  }
  if (nutrition && content.mealPrescriptions.length > 0) {
    const policy = await loadAssignmentPolicy(db, version.id);
    if (
      policy?.dietAdjustmentScope === "today_only" &&
      policy.dietScopeLocalDate &&
      policy.futureMealPlanVersionId
    ) {
      const todayDates = dates.filter((date) => date === policy.dietScopeLocalDate);
      const futureDates = dates.filter((date) => date > policy.dietScopeLocalDate!);
      if (todayDates.length > 0) {
        mealsCreated += (
          await insertMealAssignments(db, {
            relationshipId: input.relationshipId,
            planId: input.planId,
            planVersionId: version.id,
            content,
            timeZone,
            confirmationWindowHours: nutrition.confirmationWindowHours,
            photoRequirement: nutrition.photoRequirement,
            dates: todayDates,
            now,
          })
        ).length;
      }
      if (futureDates.length > 0) {
        const previousRows = await db
          .select()
          .from(planVersions)
          .where(eq(planVersions.id, policy.futureMealPlanVersionId))
          .limit(1);
        const previous = previousRows[0];
        if (previous) {
          mealsCreated += (
            await insertMealAssignments(db, {
              relationshipId: input.relationshipId,
              planId: input.planId,
              planVersionId: previous.id,
              content: parsePlanContentJson(previous.contentJson),
              timeZone,
              confirmationWindowHours: nutrition.confirmationWindowHours,
              photoRequirement: nutrition.photoRequirement,
              dates: futureDates,
              now,
            })
          ).length;
        }
      }
    } else {
      mealsCreated += (
        await insertMealAssignments(db, {
          relationshipId: input.relationshipId,
          planId: input.planId,
          planVersionId: version.id,
          content,
          timeZone,
          confirmationWindowHours: nutrition.confirmationWindowHours,
          photoRequirement: nutrition.photoRequirement,
          dates,
          now,
        })
      ).length;
    }
  }

  return {
    replaced,
    created: { workouts: workoutsCreated, meals: mealsCreated },
    dates,
  };
}

function mealKcalTotal(meal: MealPrescription): number {
  return (meal.items ?? []).reduce(
    (sum, item) => sum + (item.calculated?.energyKcalScaled ?? 0),
    0,
  );
}

function mealKcalByPrescriptionId(content: PlanContent): Map<string, number> {
  const map = new Map<string, number>();
  for (const meal of content.mealPrescriptions) {
    map.set(meal.id, mealKcalTotal(meal));
  }
  return map;
}

export async function computePlanVersionDiff(
  db: Db,
  input: { planId: string; versionId: string },
): Promise<PlanVersionDiffResponse> {
  const [current] = await db
    .select()
    .from(planVersions)
    .where(
      and(
        eq(planVersions.id, input.versionId),
        eq(planVersions.planId, input.planId),
      ),
    )
    .limit(1);
  if (!current) {
    throw new Error("PLAN_VERSION_NOT_FOUND");
  }
  const previousRows = await db
    .select()
    .from(planVersions)
    .where(
      and(
        eq(planVersions.planId, input.planId),
        lte(planVersions.versionNumber, current.versionNumber - 1),
      ),
    )
    .orderBy(desc(planVersions.versionNumber))
    .limit(1);
  const previous = previousRows[0];
  const currentContent = parsePlanContentJson(current.contentJson);
  if (!previous) {
    return {
      addedWorkoutDays: currentContent.workoutDays.map((day) => day.name),
      removedWorkoutDays: [],
      changedWorkoutDays: [],
      addedMeals: currentContent.mealPrescriptions.map((meal) => meal.name),
      removedMeals: [],
      changedMeals: [],
      kcalDeltaPerMeal: {},
      kcalDeltaPerDay: {},
    };
  }
  const previousContent = parsePlanContentJson(previous.contentJson);
  const prevWorkoutIds = new Set(previousContent.workoutDays.map((d) => d.id));
  const curWorkoutIds = new Set(currentContent.workoutDays.map((d) => d.id));
  const addedWorkoutDays = currentContent.workoutDays
    .filter((d) => !prevWorkoutIds.has(d.id))
    .map((d) => d.name);
  const removedWorkoutDays = previousContent.workoutDays
    .filter((d) => !curWorkoutIds.has(d.id))
    .map((d) => d.name);
  const changedWorkoutDays = currentContent.workoutDays
    .filter((d) => prevWorkoutIds.has(d.id))
    .filter((d) => {
      const prev = previousContent.workoutDays.find((p) => p.id === d.id);
      return prev && JSON.stringify(prev) !== JSON.stringify(d);
    })
    .map((d) => d.name);

  const prevMealIds = new Set(previousContent.mealPrescriptions.map((m) => m.id));
  const curMealIds = new Set(currentContent.mealPrescriptions.map((m) => m.id));
  const addedMeals = currentContent.mealPrescriptions
    .filter((m) => !prevMealIds.has(m.id))
    .map((m) => m.name);
  const removedMeals = previousContent.mealPrescriptions
    .filter((m) => !curMealIds.has(m.id))
    .map((m) => m.name);
  const changedMeals = currentContent.mealPrescriptions
    .filter((m) => prevMealIds.has(m.id))
    .filter((m) => {
      const prev = previousContent.mealPrescriptions.find((p) => p.id === m.id);
      return prev && JSON.stringify(prev) !== JSON.stringify(m);
    })
    .map((m) => m.name);

  const prevKcal = mealKcalByPrescriptionId(previousContent);
  const curKcal = mealKcalByPrescriptionId(currentContent);
  const kcalDeltaPerMeal: Record<string, number> = {};
  for (const meal of currentContent.mealPrescriptions) {
    const delta = (curKcal.get(meal.id) ?? 0) - (prevKcal.get(meal.id) ?? 0);
    if (delta !== 0) {
      kcalDeltaPerMeal[meal.name] = delta;
    }
  }
  const kcalDeltaPerDay: Record<string, number> = {};
  if (!workoutSchedulesMatch(previousContent.workoutDays, currentContent.workoutDays)) {
    kcalDeltaPerDay.workout_schedule = 0;
  }
  const dayDelta =
    [...curKcal.values()].reduce((a, b) => a + b, 0) -
    [...prevKcal.values()].reduce((a, b) => a + b, 0);
  if (dayDelta !== 0) {
    kcalDeltaPerDay.daily_total = dayDelta;
  }

  return {
    addedWorkoutDays,
    removedWorkoutDays,
    changedWorkoutDays,
    addedMeals,
    removedMeals,
    changedMeals,
    kcalDeltaPerMeal,
    kcalDeltaPerDay,
  };
}

export function stableAssignFingerprint(
  planId: string,
  versionId: string,
  request: AssignPlanVersionRequest,
): string {
  return JSON.stringify({ planId, versionId, ...request });
}
