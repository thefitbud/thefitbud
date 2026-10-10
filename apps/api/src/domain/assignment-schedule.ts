import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import type {
  DietAdjustmentScope,
  PlanContent,
} from "@fitbud/contracts";
import {
  clipInclusiveLocalRange,
  formatLocalDate,
  localDatesInRange,
  mealsOnDates,
  mealWindowForLocalDate,
  resolveAssignmentWindow,
  resolveMealPhotoRequired,
  supersedeFromLocalDate,
  workoutSchedulesMatch,
  workoutSessionsOnDates,
  workoutWindowForLocalDate,
  type AssignmentWindowMode,
} from "@fitbud/core";
import type { createDb } from "../db/client";
import {
  coachingConfigurations,
  coachingRelationships,
  mealAssignments,
  mealCompliance,
  nutritionExpectations,
  planAssignmentPolicies,
  plans,
  planVersions,
  users,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
} from "../db/schema";
import { parsePlanContentJson } from "./mappers";
import { createId } from "../lib/crypto";
import { writeStructuredLog } from "../lib/log";

type Db = ReturnType<typeof createDb>;
type PlanVersionRow = typeof planVersions.$inferSelect;
type WorkoutAssignmentRow = typeof workoutAssignments.$inferSelect;
type MealAssignmentRow = typeof mealAssignments.$inferSelect;

export type AssignmentPolicy = {
  planVersionId: string;
  dietAdjustmentScope: DietAdjustmentScope | null;
  dietScopeLocalDate: string | null;
  futureMealPlanVersionId: string | null;
  consistencyAckFingerprint: string | null;
};

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

export async function loadTraineeTimezone(
  db: Db,
  traineeUserId: string,
): Promise<string> {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, traineeUserId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
}

export function resolveGenerationRange(input: {
  window?: AssignmentWindowMode;
  today: string;
  fromDate?: string;
  toDate?: string;
  version: PlanVersionRow;
  timeZone: string;
}): { ok: true; dates: string[] } | { ok: false; message: string } {
  const resolved = resolveAssignmentWindow(input);
  if (!resolved.ok) return resolved;
  const clipped = clipInclusiveLocalRange(
    resolved.range,
    effectiveLocalBounds(input.version, input.timeZone),
  );
  if (!clipped) return { ok: true, dates: [] };
  return { ok: true, dates: localDatesInRange(clipped) };
}

export async function saveAssignmentPolicy(
  db: Db,
  policy: AssignmentPolicy,
): Promise<void> {
  const existing = await db
    .select()
    .from(planAssignmentPolicies)
    .where(eq(planAssignmentPolicies.planVersionId, policy.planVersionId))
    .limit(1);
  if (existing[0]) {
    await db
      .update(planAssignmentPolicies)
      .set({
        dietAdjustmentScope: policy.dietAdjustmentScope,
        dietScopeLocalDate: policy.dietScopeLocalDate,
        futureMealPlanVersionId: policy.futureMealPlanVersionId,
        consistencyAckFingerprint: policy.consistencyAckFingerprint,
      })
      .where(eq(planAssignmentPolicies.planVersionId, policy.planVersionId));
    return;
  }
  await db.insert(planAssignmentPolicies).values(policy);
}

export async function loadAssignmentPolicy(
  db: Db,
  planVersionId: string,
): Promise<AssignmentPolicy | null> {
  const rows = await db
    .select()
    .from(planAssignmentPolicies)
    .where(eq(planAssignmentPolicies.planVersionId, planVersionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    planVersionId: row.planVersionId,
    dietAdjustmentScope: row.dietAdjustmentScope,
    dietScopeLocalDate: row.dietScopeLocalDate,
    futureMealPlanVersionId: row.futureMealPlanVersionId,
    consistencyAckFingerprint: row.consistencyAckFingerprint,
  };
}

async function workoutRowExists(
  db: Db,
  input: {
    relationshipId: string;
    planVersionId: string;
    workoutDayId: string;
    localDate: string;
  },
): Promise<boolean> {
  const rows = await db
    .select({ id: workoutAssignments.id })
    .from(workoutAssignments)
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.planVersionId, input.planVersionId),
        eq(workoutAssignments.workoutDayId, input.workoutDayId),
        eq(workoutAssignments.localDate, input.localDate),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function otherScheduledWorkoutExists(
  db: Db,
  input: {
    relationshipId: string;
    planVersionId: string;
    localDate: string;
  },
): Promise<boolean> {
  const rows = await db
    .select({ id: workoutAssignments.id })
    .from(workoutAssignments)
    .where(
      and(
        eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
        eq(workoutAssignments.localDate, input.localDate),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
        ne(workoutAssignments.planVersionId, input.planVersionId),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function insertWorkoutAssignments(
  db: Db,
  input: {
    relationshipId: string;
    planId: string;
    planVersionId: string;
    content: PlanContent;
    timeZone: string;
    completionWindowHours: number;
    dates: readonly string[];
    now: string;
  },
): Promise<WorkoutAssignmentRow[]> {
  const created: WorkoutAssignmentRow[] = [];
  const placed = workoutSessionsOnDates(input.content.workoutDays, input.dates);
  for (const placement of placed) {
    const exists = await workoutRowExists(db, {
      relationshipId: input.relationshipId,
      planVersionId: input.planVersionId,
      workoutDayId: placement.day.id,
      localDate: placement.localDate,
    });
    if (exists) continue;
    const blocked = await otherScheduledWorkoutExists(db, {
      relationshipId: input.relationshipId,
      planVersionId: input.planVersionId,
      localDate: placement.localDate,
    });
    if (blocked) continue;
    const window = workoutWindowForLocalDate({
      localDate: placement.localDate,
      timeZone: input.timeZone,
      completionWindowHours: input.completionWindowHours,
    });
    const row: WorkoutAssignmentRow = {
      id: createId(),
      coachingRelationshipId: input.relationshipId,
      planId: input.planId,
      planVersionId: input.planVersionId,
      workoutDayId: placement.day.id,
      workoutDayName: placement.day.name,
      workoutDayJson: JSON.stringify(placement.day),
      localDate: placement.localDate,
      windowStartsAt: window.windowStartsAt,
      windowEndsAt: window.windowEndsAt,
      scheduleStatus: "scheduled",
      supersededAt: null,
      supersededByPlanVersionId: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    await db.insert(workoutAssignments).values(row);
    created.push(row);
  }
  return created;
}

async function mealRowExists(
  db: Db,
  input: {
    relationshipId: string;
    planVersionId: string;
    mealPrescriptionId: string;
    localDate: string;
  },
): Promise<boolean> {
  const rows = await db
    .select({ id: mealAssignments.id })
    .from(mealAssignments)
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.planVersionId, input.planVersionId),
        eq(mealAssignments.mealPrescriptionId, input.mealPrescriptionId),
        eq(mealAssignments.localDate, input.localDate),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

async function otherScheduledMealExists(
  db: Db,
  input: {
    relationshipId: string;
    planVersionId: string;
    localDate: string;
  },
): Promise<boolean> {
  const rows = await db
    .select({ id: mealAssignments.id })
    .from(mealAssignments)
    .where(
      and(
        eq(mealAssignments.coachingRelationshipId, input.relationshipId),
        eq(mealAssignments.localDate, input.localDate),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        ne(mealAssignments.planVersionId, input.planVersionId),
      ),
    )
    .limit(1);
  return Boolean(rows[0]);
}

export async function insertMealAssignments(
  db: Db,
  input: {
    relationshipId: string;
    planId: string;
    planVersionId: string;
    content: PlanContent;
    timeZone: string;
    confirmationWindowHours: number;
    photoRequirement: "none" | "selected_meals" | "all_meals";
    dates: readonly string[];
    now: string;
  },
): Promise<MealAssignmentRow[]> {
  const created: MealAssignmentRow[] = [];
  const placed = mealsOnDates(input.content.mealPrescriptions, input.dates);
  for (const placement of placed) {
    const exists = await mealRowExists(db, {
      relationshipId: input.relationshipId,
      planVersionId: input.planVersionId,
      mealPrescriptionId: placement.meal.id,
      localDate: placement.localDate,
    });
    if (exists) continue;
    const blocked = await otherScheduledMealExists(db, {
      relationshipId: input.relationshipId,
      planVersionId: input.planVersionId,
      localDate: placement.localDate,
    });
    if (blocked) continue;
    const window = mealWindowForLocalDate({
      localDate: placement.localDate,
      timeZone: input.timeZone,
      confirmationWindowHours: input.confirmationWindowHours,
    });
    const photoRequired = resolveMealPhotoRequired({
      photoRequirement: input.photoRequirement,
      prescriptionPhotoRequired: placement.meal.photoRequired,
    });
    const row: MealAssignmentRow = {
      id: createId(),
      coachingRelationshipId: input.relationshipId,
      planId: input.planId,
      planVersionId: input.planVersionId,
      mealPrescriptionId: placement.meal.id,
      mealName: placement.meal.name,
      mealPrescriptionJson: JSON.stringify(placement.meal),
      localDate: placement.localDate,
      windowStartsAt: window.windowStartsAt,
      windowEndsAt: window.windowEndsAt,
      photoRequired,
      scheduleStatus: "scheduled",
      supersededAt: null,
      supersededByPlanVersionId: null,
      createdAt: input.now,
      updatedAt: input.now,
    };
    await db.insert(mealAssignments).values(row);
    created.push(row);
  }
  return created;
}

function dateInSupersedeRange(
  localDate: string,
  range: { fromDate: string; toDate: string | null },
): boolean {
  if (localDate < range.fromDate) return false;
  if (range.toDate && localDate > range.toDate) return false;
  return true;
}

async function supersedeWorkoutRows(
  db: Db,
  input: {
    relationshipId: string;
    previousVersionId: string;
    supersededByPlanVersionId: string;
    range: { fromDate: string; toDate: string | null };
    now: string;
  },
): Promise<void> {
  const conditions = [
    eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
    eq(workoutAssignments.planVersionId, input.previousVersionId),
    eq(workoutAssignments.scheduleStatus, "scheduled"),
    gte(workoutAssignments.localDate, input.range.fromDate),
  ];
  if (input.range.toDate) {
    conditions.push(lte(workoutAssignments.localDate, input.range.toDate));
  }
  const rows = await db
    .select()
    .from(workoutAssignments)
    .where(and(...conditions));
  for (const row of rows) {
    if (!dateInSupersedeRange(row.localDate, input.range)) continue;
    const executions = await db
      .select({ id: workoutExecutions.id })
      .from(workoutExecutions)
      .where(eq(workoutExecutions.assignmentId, row.id))
      .limit(1);
    if (executions[0]) continue;
    await db
      .update(workoutAssignments)
      .set({
        scheduleStatus: "superseded",
        supersededAt: input.now,
        supersededByPlanVersionId: input.supersededByPlanVersionId,
        updatedAt: input.now,
      })
      .where(eq(workoutAssignments.id, row.id));
  }
}

async function supersedeMealRows(
  db: Db,
  input: {
    relationshipId: string;
    previousVersionId: string;
    supersededByPlanVersionId: string;
    range: { fromDate: string; toDate: string | null };
    now: string;
  },
): Promise<void> {
  const conditions = [
    eq(mealAssignments.coachingRelationshipId, input.relationshipId),
    eq(mealAssignments.planVersionId, input.previousVersionId),
    eq(mealAssignments.scheduleStatus, "scheduled"),
    gte(mealAssignments.localDate, input.range.fromDate),
  ];
  if (input.range.toDate) {
    conditions.push(lte(mealAssignments.localDate, input.range.toDate));
  }
  const rows = await db
    .select()
    .from(mealAssignments)
    .where(and(...conditions));
  for (const row of rows) {
    const compliance = await db
      .select({ id: mealCompliance.id })
      .from(mealCompliance)
      .where(eq(mealCompliance.assignmentId, row.id))
      .limit(1);
    if (compliance[0]) continue;
    await db
      .update(mealAssignments)
      .set({
        scheduleStatus: "superseded",
        supersededAt: input.now,
        supersededByPlanVersionId: input.supersededByPlanVersionId,
        updatedAt: input.now,
      })
      .where(eq(mealAssignments.id, row.id));
  }
}

export async function reconcilePublishedPlan(
  db: Db,
  input: {
    relationshipId: string;
    traineeUserId: string;
    newVersion: PlanVersionRow;
    previousVersions: PlanVersionRow[];
    dietScope: DietAdjustmentScope;
    now: string;
  },
): Promise<void> {
  const timeZone = await loadTraineeTimezone(db, input.traineeUserId);
  const today = formatLocalDate(new Date(input.now), timeZone);
  const effectiveLocalDate = input.newVersion.effectiveFrom
    ? formatLocalDate(new Date(input.newVersion.effectiveFrom), timeZone)
    : today;
  const newContent = parsePlanContentJson(input.newVersion.contentJson);
  const previous = [...input.previousVersions].sort(
    (left, right) => right.versionNumber - left.versionNumber,
  )[0];
  const workoutRange = supersedeFromLocalDate({
    scope: "today_onward",
    today,
    effectiveLocalDate,
  });
  const mealRange = supersedeFromLocalDate({
    scope: input.dietScope,
    today,
    effectiveLocalDate,
  });

  const previousPolicy = previous
    ? await loadAssignmentPolicy(db, previous.id)
    : null;

  if (previous) {
    const previousContent = parsePlanContentJson(previous.contentJson);
    if (!workoutSchedulesMatch(previousContent.workoutDays, newContent.workoutDays)) {
      await supersedeWorkoutRows(db, {
        relationshipId: input.relationshipId,
        previousVersionId: previous.id,
        supersededByPlanVersionId: input.newVersion.id,
        range: workoutRange,
        now: input.now,
      });
    }
    if (
      previousContent.mealPrescriptions.length > 0 ||
      newContent.mealPrescriptions.length > 0
    ) {
      await supersedeMealRows(db, {
        relationshipId: input.relationshipId,
        previousVersionId: previous.id,
        supersededByPlanVersionId: input.newVersion.id,
        range: mealRange,
        now: input.now,
      });
      if (
        input.dietScope === "today_onward" &&
        previousPolicy?.futureMealPlanVersionId &&
        previousPolicy.futureMealPlanVersionId !== previous.id
      ) {
        await supersedeMealRows(db, {
          relationshipId: input.relationshipId,
          previousVersionId: previousPolicy.futureMealPlanVersionId,
          supersededByPlanVersionId: input.newVersion.id,
          range: mealRange,
          now: input.now,
        });
      }
    }
  }

  const existing = await loadAssignmentPolicy(db, input.newVersion.id);
  await saveAssignmentPolicy(db, {
    planVersionId: input.newVersion.id,
    dietAdjustmentScope: input.dietScope,
    dietScopeLocalDate: today,
    futureMealPlanVersionId:
      input.dietScope === "today_only"
        ? (previousPolicy?.futureMealPlanVersionId ?? previous?.id ?? null)
        : null,
    consistencyAckFingerprint: existing?.consistencyAckFingerprint ?? null,
  });
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

export async function replenishRollingHorizons(
  db: Db,
  now: string,
): Promise<{ relationships: number; workoutsCreated: number; mealsCreated: number }> {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(eq(coachingRelationships.status, "active"));
  let workoutsCreated = 0;
  let mealsCreated = 0;
  for (const relationship of relationships) {
    try {
      const created = await replenishRelationship(db, relationship.id, relationship.traineeUserId, now);
      workoutsCreated += created.workoutsCreated;
      mealsCreated += created.mealsCreated;
    } catch (error) {
      writeStructuredLog({
        level: "error",
        message: "Assignment replenishment failed for a relationship",
        relationshipId: relationship.id,
        errorName: error instanceof Error ? error.name : "Error",
      });
    }
  }
  return {
    relationships: relationships.length,
    workoutsCreated,
    mealsCreated,
  };
}

async function loadEffectiveVersion(db: Db, relationshipId: string) {
  const rows = await db
    .select({ plan: plans, version: planVersions })
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
  return rows[0] ?? null;
}

async function replenishRelationship(
  db: Db,
  relationshipId: string,
  traineeUserId: string,
  now: string,
): Promise<{ workoutsCreated: number; mealsCreated: number }> {
  const effective = await loadEffectiveVersion(db, relationshipId);
  if (!effective) return { workoutsCreated: 0, mealsCreated: 0 };
  const timeZone = await loadTraineeTimezone(db, traineeUserId);
  const today = formatLocalDate(new Date(now), timeZone);
  const horizon = resolveAssignmentWindow({ window: "next_7_days", today });
  if (!horizon.ok) return { workoutsCreated: 0, mealsCreated: 0 };
  const clipped = clipInclusiveLocalRange(
    horizon.range,
    effectiveLocalBounds(effective.version, timeZone),
  );
  if (!clipped) return { workoutsCreated: 0, mealsCreated: 0 };
  const dates = localDatesInRange(clipped);
  const content = parsePlanContentJson(effective.version.contentJson);
  let workoutsCreated = 0;
  let mealsCreated = 0;
  const hours = await loadActiveWorkoutHours(db, relationshipId);
  if (hours != null && content.workoutDays.length > 0) {
    const created = await insertWorkoutAssignments(db, {
      relationshipId,
      planId: effective.plan.id,
      planVersionId: effective.version.id,
      content,
      timeZone,
      completionWindowHours: hours,
      dates,
      now,
    });
    workoutsCreated += created.length;
  }
  const nutrition = await loadActiveNutrition(db, relationshipId);
  if (nutrition && content.mealPrescriptions.length > 0) {
    const policy = await loadAssignmentPolicy(db, effective.version.id);
    if (
      policy?.dietAdjustmentScope === "today_only" &&
      policy.dietScopeLocalDate &&
      policy.futureMealPlanVersionId
    ) {
      const todayDates = dates.filter((date) => date === policy.dietScopeLocalDate);
      const futureDates = dates.filter((date) => date > policy.dietScopeLocalDate!);
      if (todayDates.length > 0) {
        const created = await insertMealAssignments(db, {
          relationshipId,
          planId: effective.plan.id,
          planVersionId: effective.version.id,
          content,
          timeZone,
          confirmationWindowHours: nutrition.confirmationWindowHours,
          photoRequirement: nutrition.photoRequirement,
          dates: todayDates,
          now,
        });
        mealsCreated += created.length;
      }
      if (futureDates.length > 0) {
        const previousRows = await db
          .select()
          .from(planVersions)
          .where(eq(planVersions.id, policy.futureMealPlanVersionId))
          .limit(1);
        const previous = previousRows[0];
        if (previous) {
          const previousContent = parsePlanContentJson(previous.contentJson);
          const created = await insertMealAssignments(db, {
            relationshipId,
            planId: effective.plan.id,
            planVersionId: previous.id,
            content: previousContent,
            timeZone,
            confirmationWindowHours: nutrition.confirmationWindowHours,
            photoRequirement: nutrition.photoRequirement,
            dates: futureDates,
            now,
          });
          mealsCreated += created.length;
        }
      }
    } else {
      const created = await insertMealAssignments(db, {
        relationshipId,
        planId: effective.plan.id,
        planVersionId: effective.version.id,
        content,
        timeZone,
        confirmationWindowHours: nutrition.confirmationWindowHours,
        photoRequirement: nutrition.photoRequirement,
        dates,
        now,
      });
      mealsCreated += created.length;
    }
  }
  return { workoutsCreated, mealsCreated };
}
