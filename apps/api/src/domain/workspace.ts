import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import {
  activeExceptionSummarySchema,
  clientWorkspaceSchema,
  subscriptionSchema,
  workspaceActivityItemSchema,
  type WorkspaceActivityItem,
  type WorkspaceActivityType,
} from "@fitbud/contracts";
import {
  deriveCheckinStatus,
  deriveMealAssignmentStatus,
  deriveRenewalState,
  deriveWorkoutAssignmentStatus,
  formatLocalDate,
} from "@fitbud/core";
import type { Db } from "../db/client";
import {
  checkinReviews,
  checkins,
  coachingConfigurations,
  coachingRelationships,
  exceptions,
  mealAssignments,
  mealCompliance,
  measurements,
  mediaAssets,
  nutritionExpectations,
  progressEntries,
  plans,
  planVersions,
  subscriptionVersions,
  checkinSchedules,
  trackingRequirements,
  traineeProfiles,
  users,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
} from "../db/schema";
import { buildPage } from "../lib/cursor";
import { onboardingStatusForRelationship } from "./client-status";
import {
  mapCheckin,
  mapCoachingConfiguration,
  mapMeasurement,
  mapMediaAsset,
  mapPlan,
  mapPlanVersion,
  mapProgressEntry,
} from "./mappers";

const RECENT_ACTIVITY_LIMIT = 5;
const PROGRESS_SUMMARY_LIMIT = 50;

type Cursor = { k: string; id: string } | null;

export type ActivityListInput = {
  relationshipId: string;
  type: WorkspaceActivityType;
  state?: string;
  occurredFrom?: string;
  occurredTo?: string;
  limit: number;
  cursor: Cursor;
  nowIso: string;
};

function olderThanCursor(
  dateColumn: Parameters<typeof eq>[0],
  idColumn: Parameters<typeof eq>[0],
  cursor: Cursor,
) {
  if (!cursor) return undefined;
  return or(
    lt(dateColumn, cursor.k),
    and(eq(dateColumn, cursor.k), lt(idColumn, cursor.id)),
  );
}

function workoutStateCondition(state: string, nowIso: string): SQL | undefined {
  switch (state) {
    case "in_progress":
      return eq(workoutExecutions.status, "started");
    case "paused":
      return eq(workoutExecutions.status, "paused");
    case "completed":
    case "modified":
    case "skipped":
      return eq(workoutExecutions.status, state);
    case "missed":
      return and(
        isNull(workoutExecutions.id),
        lt(workoutAssignments.windowEndsAt, nowIso),
      );
    case "assigned":
      return and(
        isNull(workoutExecutions.id),
        gte(workoutAssignments.windowEndsAt, nowIso),
      );
    default:
      return undefined;
  }
}

function mealStateCondition(state: string, nowIso: string): SQL | undefined {
  switch (state) {
    case "confirmed":
    case "modified":
    case "skipped":
      return and(
        eq(mealCompliance.outcome, state),
        lte(mealCompliance.loggedAt, mealAssignments.windowEndsAt),
      );
    case "logged_later":
      return and(
        isNotNull(mealCompliance.id),
        gt(mealCompliance.loggedAt, mealAssignments.windowEndsAt),
      );
    case "overdue":
      return and(
        isNull(mealCompliance.id),
        lt(mealAssignments.windowEndsAt, nowIso),
      );
    case "pending":
      return and(
        isNull(mealCompliance.id),
        gte(mealAssignments.windowEndsAt, nowIso),
      );
    default:
      return undefined;
  }
}

function checkinStateCondition(state: string, nowIso: string): SQL | undefined {
  switch (state) {
    case "reviewed":
      return isNotNull(checkinReviews.id);
    case "submitted":
      return and(
        eq(checkins.recordStatus, "submitted"),
        isNull(checkinReviews.id),
      );
    case "overdue":
      return and(
        eq(checkins.recordStatus, "draft"),
        isNull(checkinReviews.id),
        lt(checkins.windowEndsAt, nowIso),
      );
    case "due":
      return and(
        eq(checkins.recordStatus, "draft"),
        isNull(checkinReviews.id),
        lte(checkins.windowStartsAt, nowIso),
        gte(checkins.windowEndsAt, nowIso),
      );
    case "scheduled":
      return and(
        eq(checkins.recordStatus, "draft"),
        isNull(checkinReviews.id),
        gt(checkins.windowStartsAt, nowIso),
      );
    default:
      return undefined;
  }
}

function pageActivity(
  items: WorkspaceActivityItem[],
  limit: number,
): { items: WorkspaceActivityItem[]; nextCursor: string | null } {
  return buildPage(items, limit, (item) => item.localDate);
}

async function listWorkoutActivity(
  db: Db,
  input: ActivityListInput,
): Promise<WorkspaceActivityItem[]> {
  const conditions = [
    eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
  ];
  if (input.occurredFrom) {
    conditions.push(gte(workoutAssignments.localDate, input.occurredFrom));
  }
  if (input.occurredTo) {
    conditions.push(lte(workoutAssignments.localDate, input.occurredTo));
  }
  const cursor = olderThanCursor(
    workoutAssignments.localDate,
    workoutAssignments.id,
    input.cursor,
  );
  if (cursor) conditions.push(cursor);
  if (input.state) {
    const state = workoutStateCondition(input.state, input.nowIso);
    if (state) conditions.push(state);
  }

  const rows = await db
    .select({
      assignment: workoutAssignments,
      execution: workoutExecutions,
    })
    .from(workoutAssignments)
    .leftJoin(
      workoutExecutions,
      eq(workoutExecutions.assignmentId, workoutAssignments.id),
    )
    .where(and(...conditions))
    .orderBy(desc(workoutAssignments.localDate), desc(workoutAssignments.id))
    .limit(input.limit + 1);

  return rows.map((row) => {
    const execution = row.execution?.id ? row.execution : null;
    return workspaceActivityItemSchema.parse({
      id: row.assignment.id,
      type: "workout",
      state: deriveWorkoutAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: row.assignment.windowEndsAt,
        executionStatus: execution?.status ?? null,
      }),
      occurredAt: row.assignment.windowStartsAt,
      localDate: row.assignment.localDate,
      title: row.assignment.workoutDayName,
      planVersionId: execution?.planVersionId ?? row.assignment.planVersionId,
    });
  });
}

async function listMealActivity(
  db: Db,
  input: ActivityListInput,
): Promise<WorkspaceActivityItem[]> {
  const conditions = [
    eq(mealAssignments.coachingRelationshipId, input.relationshipId),
  ];
  if (input.occurredFrom) {
    conditions.push(gte(mealAssignments.localDate, input.occurredFrom));
  }
  if (input.occurredTo) {
    conditions.push(lte(mealAssignments.localDate, input.occurredTo));
  }
  const cursor = olderThanCursor(
    mealAssignments.localDate,
    mealAssignments.id,
    input.cursor,
  );
  if (cursor) conditions.push(cursor);
  if (input.state) {
    const state = mealStateCondition(input.state, input.nowIso);
    if (state) conditions.push(state);
  }

  const rows = await db
    .select({
      assignment: mealAssignments,
      compliance: mealCompliance,
    })
    .from(mealAssignments)
    .leftJoin(
      mealCompliance,
      eq(mealCompliance.assignmentId, mealAssignments.id),
    )
    .where(and(...conditions))
    .orderBy(desc(mealAssignments.localDate), desc(mealAssignments.id))
    .limit(input.limit + 1);

  return rows.map((row) => {
    const compliance = row.compliance?.id ? row.compliance : null;
    return workspaceActivityItemSchema.parse({
      id: row.assignment.id,
      type: "meal",
      state: deriveMealAssignmentStatus({
        nowIso: input.nowIso,
        windowEndsAt: row.assignment.windowEndsAt,
        complianceOutcome: compliance?.outcome ?? null,
        loggedAt: compliance?.loggedAt ?? null,
      }),
      occurredAt: row.assignment.windowStartsAt,
      localDate: row.assignment.localDate,
      title: row.assignment.mealName,
      planVersionId: compliance?.planVersionId ?? row.assignment.planVersionId,
    });
  });
}

async function listCheckinActivity(
  db: Db,
  input: ActivityListInput,
): Promise<WorkspaceActivityItem[]> {
  const conditions = [
    eq(checkins.coachingRelationshipId, input.relationshipId),
  ];
  if (input.occurredFrom) {
    conditions.push(gte(checkins.localDate, input.occurredFrom));
  }
  if (input.occurredTo) {
    conditions.push(lte(checkins.localDate, input.occurredTo));
  }
  const cursor = olderThanCursor(checkins.localDate, checkins.id, input.cursor);
  if (cursor) conditions.push(cursor);
  if (input.state) {
    const state = checkinStateCondition(input.state, input.nowIso);
    if (state) conditions.push(state);
  }

  const rows = await db
    .select({
      checkin: checkins,
      review: checkinReviews,
    })
    .from(checkins)
    .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
    .where(and(...conditions))
    .orderBy(desc(checkins.localDate), desc(checkins.id))
    .limit(input.limit + 1);

  return rows.map((row) => {
    const review = row.review?.id ? row.review : null;
    return workspaceActivityItemSchema.parse({
      id: row.checkin.id,
      type: "checkin",
      state: deriveCheckinStatus({
        nowIso: input.nowIso,
        windowStartsAt: row.checkin.windowStartsAt,
        windowEndsAt: row.checkin.windowEndsAt,
        recordStatus: row.checkin.recordStatus,
        hasReview: Boolean(review),
      }),
      occurredAt: row.checkin.windowStartsAt,
      localDate: row.checkin.localDate,
      title: `Check-in ${row.checkin.localDate}`,
      planVersionId: null,
    });
  });
}

export async function listRelationshipActivity(
  db: Db,
  input: ActivityListInput,
): Promise<{ items: WorkspaceActivityItem[]; nextCursor: string | null }> {
  const items =
    input.type === "workout"
      ? await listWorkoutActivity(db, input)
      : input.type === "meal"
        ? await listMealActivity(db, input)
        : await listCheckinActivity(db, input);
  return pageActivity(items, input.limit);
}

async function loadRecentActivity(
  db: Db,
  relationshipId: string,
  nowIso: string,
): Promise<WorkspaceActivityItem[]> {
  const shared = {
    relationshipId,
    limit: RECENT_ACTIVITY_LIMIT,
    cursor: null,
    nowIso,
  };
  const [workouts, meals, checkinItems] = await Promise.all([
    listRelationshipActivity(db, { ...shared, type: "workout" }),
    listRelationshipActivity(db, { ...shared, type: "meal" }),
    listRelationshipActivity(db, { ...shared, type: "checkin" }),
  ]);
  return [...workouts.items, ...meals.items, ...checkinItems.items]
    .sort((left, right) => {
      if (left.localDate !== right.localDate) {
        return left.localDate < right.localDate ? 1 : -1;
      }
      if (left.occurredAt !== right.occurredAt) {
        return left.occurredAt < right.occurredAt ? 1 : -1;
      }
      if (left.id === right.id) return 0;
      return left.id < right.id ? 1 : -1;
    })
    .slice(0, RECENT_ACTIVITY_LIMIT);
}

async function loadActiveConfiguration(db: Db, relationshipId: string) {
  const rows = await db
    .select()
    .from(coachingConfigurations)
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    )
    .limit(1);
  const configuration = rows[0];
  if (!configuration) return null;

  const [workout] = await db
    .select()
    .from(workoutExpectations)
    .where(eq(workoutExpectations.coachingConfigurationId, configuration.id))
    .limit(1);
  const [nutrition] = await db
    .select()
    .from(nutritionExpectations)
    .where(eq(nutritionExpectations.coachingConfigurationId, configuration.id))
    .limit(1);
  const [checkin] = await db
    .select()
    .from(checkinSchedules)
    .where(eq(checkinSchedules.coachingConfigurationId, configuration.id))
    .limit(1);
  const [tracking] = await db
    .select()
    .from(trackingRequirements)
    .where(eq(trackingRequirements.coachingConfigurationId, configuration.id))
    .limit(1);
  if (!workout || !nutrition || !checkin || !tracking) return null;

  return mapCoachingConfiguration({
    configuration,
    workout,
    nutrition,
    checkin,
    tracking,
  });
}

async function loadEffectivePlan(db: Db, relationshipId: string) {
  const rows = await db
    .select({
      plan: plans,
      version: planVersions,
    })
    .from(planVersions)
    .innerJoin(plans, eq(planVersions.planId, plans.id))
    .where(
      and(
        eq(plans.coachingRelationshipId, relationshipId),
        eq(planVersions.status, "effective"),
      ),
    )
    .orderBy(desc(planVersions.effectiveFrom), desc(planVersions.versionNumber))
    .limit(1);
  const row = rows[0];
  if (!row) return { plan: null, version: null };
  return {
    plan: mapPlan(row.plan),
    version: mapPlanVersion(row.version),
  };
}

async function trainerToday(db: Db, trainerUserId: string, nowIso: string) {
  const rows = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, trainerUserId))
    .limit(1);
  return formatLocalDate(new Date(nowIso), rows[0]?.timezone ?? "UTC");
}

async function loadLatestSubscription(
  db: Db,
  relationshipId: string,
  trainerUserId: string,
  nowIso: string,
) {
  const rows = await db
    .select()
    .from(subscriptionVersions)
    .where(eq(subscriptionVersions.coachingRelationshipId, relationshipId))
    .orderBy(desc(subscriptionVersions.versionNumber))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const today = await trainerToday(db, trainerUserId, nowIso);
  return subscriptionSchema.parse({
    id: row.id,
    coachingRelationshipId: row.coachingRelationshipId,
    versionNumber: row.versionNumber,
    planName: row.planName,
    paymentFrequency: row.paymentFrequency,
    startsOn: row.startsOn,
    renewsOn: row.renewsOn,
    renewalState: deriveRenewalState({ today, renewsOn: row.renewsOn }),
    createdAt: row.createdAt,
  });
}

async function loadOpenException(db: Db, relationshipId: string) {
  const rows = await db
    .select()
    .from(exceptions)
    .where(
      and(
        eq(exceptions.coachingRelationshipId, relationshipId),
        inArray(exceptions.status, ["detected", "active"]),
      ),
    )
    .orderBy(desc(exceptions.detectedAt), desc(exceptions.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return activeExceptionSummarySchema.parse({
    id: row.id,
    type: row.type,
    status: row.status,
    summary: row.summary,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    detectedAt: row.detectedAt,
  });
}

async function loadNextCheckin(db: Db, relationshipId: string, nowIso: string) {
  const rows = await db
    .select({
      checkin: checkins,
      review: checkinReviews,
    })
    .from(checkins)
    .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
    .where(
      and(
        eq(checkins.coachingRelationshipId, relationshipId),
        eq(checkins.recordStatus, "draft"),
        isNull(checkinReviews.id),
      ),
    )
    .orderBy(asc(checkins.localDate), asc(checkins.id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return mapCheckin(row.checkin, null, nowIso);
}

async function loadProgressSummary(db: Db, relationshipId: string) {
  const [measurementRows, entryRows, mediaRows] = await Promise.all([
    db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationshipId))
      .orderBy(desc(measurements.observedAt))
      .limit(PROGRESS_SUMMARY_LIMIT),
    db
      .select()
      .from(progressEntries)
      .where(eq(progressEntries.coachingRelationshipId, relationshipId))
      .orderBy(desc(progressEntries.observedAt))
      .limit(PROGRESS_SUMMARY_LIMIT),
    db
      .select()
      .from(mediaAssets)
      .where(
        and(
          eq(mediaAssets.coachingRelationshipId, relationshipId),
          eq(mediaAssets.status, "ready"),
        ),
      )
      .orderBy(desc(mediaAssets.createdAt))
      .limit(PROGRESS_SUMMARY_LIMIT),
  ]);
  return {
    measurements: measurementRows.map(mapMeasurement),
    entries: entryRows.map(mapProgressEntry),
    media: mediaRows.map(mapMediaAsset),
  };
}

export async function loadClientWorkspace(
  db: Db,
  relationship: typeof coachingRelationships.$inferSelect,
  nowIso: string,
) {
  const [
    profile,
    onboardingStatus,
    configuration,
    effectivePlan,
    subscription,
    openException,
    nextCheckin,
    recentActivity,
    progress,
  ] = await Promise.all([
    db
      .select({ displayName: traineeProfiles.displayName })
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, relationship.traineeUserId))
      .limit(1),
    onboardingStatusForRelationship(db, relationship),
    loadActiveConfiguration(db, relationship.id),
    loadEffectivePlan(db, relationship.id),
    loadLatestSubscription(
      db,
      relationship.id,
      relationship.trainerUserId,
      nowIso,
    ),
    loadOpenException(db, relationship.id),
    loadNextCheckin(db, relationship.id, nowIso),
    loadRecentActivity(db, relationship.id, nowIso),
    loadProgressSummary(db, relationship.id),
  ]);

  const displayName = profile[0]?.displayName;
  if (!displayName) {
    throw new Error("Trainee profile is missing for this coaching relationship.");
  }

  return clientWorkspaceSchema.parse({
    header: {
      relationshipId: relationship.id,
      traineeDisplayName: displayName,
      onboardingStatus,
      effectivePlan: effectivePlan.plan
        ? {
            id: effectivePlan.plan.id,
            title: effectivePlan.plan.title,
            effectiveFrom: effectivePlan.version?.effectiveFrom ?? null,
          }
        : null,
      primaryGoal: configuration?.primaryGoal ?? null,
      renewalState: subscription?.renewalState ?? null,
    },
    overview: {
      openException,
      nextCheckin,
      recentActivity,
      progress,
    },
    plan: effectivePlan,
    configuration: {
      configuration,
      subscription,
    },
    history: {
      relationshipId: relationship.id,
    },
  });
}
