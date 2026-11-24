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
  notExists,
  or,
  sql,
  count,
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
  ADHERENCE_EXCEPTION_SEVERITIES,
  ADHERENCE_OPEN_EXCEPTION_STATUSES,
  adherenceWindowStart,
  deriveAdherenceState,
  deriveClientOnboardingStatus,
  isQualifyingAdherenceObservation,
  deriveAge,
  deriveCheckinStatus,
  deriveMealAssignmentStatus,
  deriveRenewalState,
  deriveWorkoutAssignmentStatus,
  formatCivilDate,
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
  onboardingFormResponses,
  onboardingReviews,
  checkinSchedules,
  trackingRequirements,
  traineeProfiles,
  trainerProfiles,
  userIdentities,
  mealTimeOverrides,
  reactivationRequests,
  workoutAssignments,
  workoutExecutions,
  workoutExpectations,
} from "../db/schema";
import { buildPage } from "../lib/cursor";
import {
  resolveClientDisplayName,
  resolveClientWhatsappE164,
} from "./client-identity";
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

function workoutActivityItem(
  assignment: typeof workoutAssignments.$inferSelect,
  executionRow: typeof workoutExecutions.$inferSelect | null,
  nowIso: string,
): WorkspaceActivityItem {
  const execution = executionRow?.id ? executionRow : null;
  return workspaceActivityItemSchema.parse({
    id: assignment.id,
    type: "workout",
    state: deriveWorkoutAssignmentStatus({
      nowIso,
      windowEndsAt: assignment.windowEndsAt,
      executionStatus: execution?.status ?? null,
    }),
    occurredAt: assignment.windowStartsAt,
    localDate: assignment.localDate,
    title: assignment.workoutDayName,
    planVersionId: execution?.planVersionId ?? assignment.planVersionId,
  });
}

function mealActivityItem(
  assignment: typeof mealAssignments.$inferSelect,
  complianceRow: typeof mealCompliance.$inferSelect | null,
  nowIso: string,
): WorkspaceActivityItem {
  const compliance = complianceRow?.id ? complianceRow : null;
  return workspaceActivityItemSchema.parse({
    id: assignment.id,
    type: "meal",
    state: deriveMealAssignmentStatus({
      nowIso,
      windowEndsAt: assignment.windowEndsAt,
      complianceOutcome: compliance?.outcome ?? null,
      loggedAt: compliance?.loggedAt ?? null,
    }),
    occurredAt: assignment.windowStartsAt,
    localDate: assignment.localDate,
    title: assignment.mealName,
    planVersionId: compliance?.planVersionId ?? assignment.planVersionId,
  });
}

function checkinActivityItem(
  checkin: typeof checkins.$inferSelect,
  hasReview: boolean,
  nowIso: string,
): WorkspaceActivityItem {
  return workspaceActivityItemSchema.parse({
    id: checkin.id,
    type: "checkin",
    state: deriveCheckinStatus({
      nowIso,
      windowStartsAt: checkin.windowStartsAt,
      windowEndsAt: checkin.windowEndsAt,
      recordStatus: checkin.recordStatus,
      hasReview,
    }),
    occurredAt: checkin.windowStartsAt,
    localDate: checkin.localDate,
    title: `Check-in ${formatCivilDate(checkin.localDate)}`,
    planVersionId: null,
  });
}

async function listWorkoutActivity(
  db: Db,
  input: ActivityListInput,
): Promise<WorkspaceActivityItem[]> {
  const conditions = [
    eq(workoutAssignments.coachingRelationshipId, input.relationshipId),
    eq(workoutAssignments.scheduleStatus, "scheduled"),
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

  return rows.map((row) =>
    workoutActivityItem(row.assignment, row.execution, input.nowIso),
  );
}

async function listMealActivity(
  db: Db,
  input: ActivityListInput,
): Promise<WorkspaceActivityItem[]> {
  const conditions = [
    eq(mealAssignments.coachingRelationshipId, input.relationshipId),
    eq(mealAssignments.scheduleStatus, "scheduled"),
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

  return rows.map((row) =>
    mealActivityItem(row.assignment, row.compliance, input.nowIso),
  );
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

  return rows.map((row) =>
    checkinActivityItem(row.checkin, Boolean(row.review?.id), input.nowIso),
  );
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

const FUTURE_ACTIVITY_STATES = new Set([
  "pending",
  "scheduled",
  "upcoming",
  "due",
]);

/**
 * Newest settled activity across workouts, meals and check-ins, from the rows
 * the workspace batch already read (the newest `RECENT_ACTIVITY_LIMIT * 3` of
 * each type, same page `listRelationshipActivity` would return).
 */
function recentActivityFrom(
  items: WorkspaceActivityItem[],
  nowIso: string,
): WorkspaceActivityItem[] {
  const nowMs = Date.parse(nowIso);
  return items
    .filter((item) => {
      // Exclude future slots and purely scheduled/pending items.
      if (Date.parse(item.occurredAt) > nowMs) return false;
      if (FUTURE_ACTIVITY_STATES.has(item.state)) return false;
      return true;
    })
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

function severityRank(severity: string): number {
  return severity === "critical" ? 0 : 1;
}

function openExceptionSummary(
  rows: Array<typeof exceptions.$inferSelect>,
) {
  // `rows` arrive ordered by detectedAt, id.
  const open = rows.filter(
    (row) => row.status === "detected" || row.status === "active",
  );
  if (open.length === 0) return null;
  const row = [...open].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    // Oldest first within the same severity (matches Home triage).
    if (a.detectedAt !== b.detectedAt) {
      return a.detectedAt < b.detectedAt ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  })[0]!;
  return activeExceptionSummarySchema.parse({
    id: row.id,
    type: row.type,
    severity: row.severity,
    status: row.status,
    summary: row.summary,
    sourceEntityType: row.sourceEntityType,
    sourceEntityId: row.sourceEntityId,
    detectedAt: row.detectedAt,
  });
}

/** Subquery: the relationship's single active configuration (unique index). */
function activeConfigurationId(db: Db, relationshipId: string) {
  return db
    .select({ id: coachingConfigurations.id })
    .from(coachingConfigurations)
    .where(
      and(
        eq(coachingConfigurations.coachingRelationshipId, relationshipId),
        eq(coachingConfigurations.status, "active"),
      ),
    );
}

/** A check-in that has no review row (the old left join + `review.id is null`). */
function checkinWithoutReview() {
  return notExists(
    sql`(select 1 from ${checkinReviews} where ${checkinReviews.checkinId} = ${checkins.id})`,
  );
}

export type ClientWorkspaceTimezones = {
  /** IANA zone of the trainer (civil "today" for renewal, age, adherence). */
  trainer: string;
  /** IANA zone of the trainee (header). */
  trainee: string;
};

/**
 * The trainer client workspace. Every read is independent of the others once
 * the relationship row (and both timezones) are known, so they all go out in
 * one `db.batch` = one D1 round trip, flat in the amount of client history.
 *
 * Batch statements never join two tables that share a column name (D1 batch
 * results are mapped by position over object values, so duplicates collapse);
 * rows that used to come from a join are fetched as two statements and paired
 * in memory.
 */
export async function loadClientWorkspace(
  db: Db,
  relationship: typeof coachingRelationships.$inferSelect,
  nowIso: string,
  timezones: ClientWorkspaceTimezones,
) {
  const relationshipId = relationship.id;
  const today = formatLocalDate(new Date(nowIso), timezones.trainer);
  const adherenceStart = adherenceWindowStart(today);
  const recentLimit = RECENT_ACTIVITY_LIMIT * 3;

  // The newest assignments / check-ins are selected twice: whole rows, and ids
  // for the matching log rows (execution / compliance / review).
  const recentWorkoutScope = and(
    eq(workoutAssignments.coachingRelationshipId, relationshipId),
    eq(workoutAssignments.scheduleStatus, "scheduled"),
  );
  const recentMealScope = and(
    eq(mealAssignments.coachingRelationshipId, relationshipId),
    eq(mealAssignments.scheduleStatus, "scheduled"),
  );
  const recentCheckinScope = eq(checkins.coachingRelationshipId, relationshipId);

  const pendingReviewConditions = [
    eq(checkins.coachingRelationshipId, relationshipId),
    eq(checkins.recordStatus, "submitted"),
    checkinWithoutReview(),
  ];
  // After reactivation, ignore submissions from the prior coaching period.
  if (relationship.reactivatedAt) {
    pendingReviewConditions.push(
      gte(checkins.submittedAt, relationship.reactivatedAt),
    );
  }

  const [
    profileRows,
    trainerProfileRows,
    identityRows,
    mealOverrides,
    responseRows,
    reviewRows,
    configurationRows,
    workoutExpectationRows,
    nutritionExpectationRows,
    checkinScheduleRows,
    trackingRows,
    effectiveVersionRows,
    relationshipPlanRows,
    subscriptionRows,
    exceptionRows,
    nextCheckinRows,
    pendingReviewRows,
    activityWorkoutRows,
    activityWorkoutExecutionRows,
    activityMealRows,
    activityComplianceRows,
    activityCheckinRows,
    activityReviewRows,
    measurementRows,
    entryRows,
    mediaRows,
    pendingReactivationRows,
    adherenceWorkoutRows,
    adherenceMealRows,
    adherenceCheckinRows,
  ] = await db.batch([
    db
      .select({
        displayName: traineeProfiles.displayName,
        dateOfBirth: traineeProfiles.dateOfBirth,
        gender: traineeProfiles.gender,
      })
      .from(traineeProfiles)
      .where(eq(traineeProfiles.userId, relationship.traineeUserId))
      .limit(1),
    db
      .select({ whatsappE164: trainerProfiles.whatsappE164 })
      .from(trainerProfiles)
      .where(eq(trainerProfiles.userId, relationship.trainerUserId))
      .limit(1),
    db
      .select({ mobileE164: userIdentities.mobileE164 })
      .from(userIdentities)
      .where(eq(userIdentities.userId, relationship.traineeUserId))
      .limit(1),
    db
      .select({
        id: mealTimeOverrides.slotKey,
        dayPattern: mealTimeOverrides.dayPattern,
        time: mealTimeOverrides.time,
        updatedAt: mealTimeOverrides.updatedAt,
      })
      .from(mealTimeOverrides)
      .where(eq(mealTimeOverrides.relationshipId, relationshipId)),
    // Onboarding status inputs (see `deriveOnboardingStatusForRelationships`).
    db
      .select({ status: onboardingFormResponses.status })
      .from(onboardingFormResponses)
      .where(eq(onboardingFormResponses.coachingRelationshipId, relationshipId)),
    db
      .select({ id: onboardingReviews.id })
      .from(onboardingReviews)
      .where(eq(onboardingReviews.coachingRelationshipId, relationshipId)),
    // The active configuration (also the "has active configuration" input).
    db
      .select()
      .from(coachingConfigurations)
      .where(
        and(
          eq(coachingConfigurations.coachingRelationshipId, relationshipId),
          eq(coachingConfigurations.status, "active"),
        ),
      )
      .limit(1),
    db
      .select()
      .from(workoutExpectations)
      .where(
        inArray(
          workoutExpectations.coachingConfigurationId,
          activeConfigurationId(db, relationshipId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(nutritionExpectations)
      .where(
        inArray(
          nutritionExpectations.coachingConfigurationId,
          activeConfigurationId(db, relationshipId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(checkinSchedules)
      .where(
        inArray(
          checkinSchedules.coachingConfigurationId,
          activeConfigurationId(db, relationshipId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(trackingRequirements)
      .where(
        inArray(
          trackingRequirements.coachingConfigurationId,
          activeConfigurationId(db, relationshipId),
        ),
      )
      .limit(1),
    // Effective plan: the version, then the plan row, paired below.
    db
      .select()
      .from(planVersions)
      .where(
        and(
          eq(planVersions.status, "effective"),
          inArray(
            planVersions.planId,
            db
              .select({ id: plans.id })
              .from(plans)
              .where(eq(plans.coachingRelationshipId, relationshipId)),
          ),
        ),
      )
      .orderBy(
        desc(planVersions.effectiveFrom),
        desc(planVersions.versionNumber),
      )
      .limit(1),
    db
      .select()
      .from(plans)
      .where(eq(plans.coachingRelationshipId, relationshipId)),
    db
      .select()
      .from(subscriptionVersions)
      .where(eq(subscriptionVersions.coachingRelationshipId, relationshipId))
      .orderBy(desc(subscriptionVersions.versionNumber))
      .limit(1),
    // Open exceptions (open summary and adherence both read these rows).
    db
      .select()
      .from(exceptions)
      .where(
        and(
          eq(exceptions.coachingRelationshipId, relationshipId),
          inArray(exceptions.status, [
            "detected",
            "active",
            ...ADHERENCE_OPEN_EXCEPTION_STATUSES,
          ]),
        ),
      )
      .orderBy(asc(exceptions.detectedAt), asc(exceptions.id)),
    // Next scheduled check-in only (draft). Never past submitted / awaiting review.
    db
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationshipId),
          eq(checkins.recordStatus, "draft"),
          checkinWithoutReview(),
        ),
      )
      .orderBy(asc(checkins.localDate), asc(checkins.id))
      .limit(1),
    // Submitted check-in awaiting trainer review.
    db
      .select()
      .from(checkins)
      .where(and(...pendingReviewConditions))
      .orderBy(desc(checkins.submittedAt), desc(checkins.localDate))
      .limit(1),
    // Recent activity: newest assignments / check-ins plus their logs.
    db
      .select()
      .from(workoutAssignments)
      .where(recentWorkoutScope)
      .orderBy(desc(workoutAssignments.localDate), desc(workoutAssignments.id))
      .limit(recentLimit),
    db
      .select()
      .from(workoutExecutions)
      .where(
        inArray(
          workoutExecutions.assignmentId,
          db
            .select({ id: workoutAssignments.id })
            .from(workoutAssignments)
            .where(recentWorkoutScope)
            .orderBy(
              desc(workoutAssignments.localDate),
              desc(workoutAssignments.id),
            )
            .limit(recentLimit),
        ),
      ),
    db
      .select()
      .from(mealAssignments)
      .where(recentMealScope)
      .orderBy(desc(mealAssignments.localDate), desc(mealAssignments.id))
      .limit(recentLimit),
    db
      .select()
      .from(mealCompliance)
      .where(
        inArray(
          mealCompliance.assignmentId,
          db
            .select({ id: mealAssignments.id })
            .from(mealAssignments)
            .where(recentMealScope)
            .orderBy(desc(mealAssignments.localDate), desc(mealAssignments.id))
            .limit(recentLimit),
        ),
      ),
    db
      .select()
      .from(checkins)
      .where(recentCheckinScope)
      .orderBy(desc(checkins.localDate), desc(checkins.id))
      .limit(recentLimit),
    db
      .select({ checkinId: checkinReviews.checkinId })
      .from(checkinReviews)
      .where(
        inArray(
          checkinReviews.checkinId,
          db
            .select({ id: checkins.id })
            .from(checkins)
            .where(recentCheckinScope)
            .orderBy(desc(checkins.localDate), desc(checkins.id))
            .limit(recentLimit),
        ),
      ),
    // Progress summary.
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
    // Pending reactivation request (only shown for an ended client).
    db
      .select()
      .from(reactivationRequests)
      .where(
        and(
          eq(reactivationRequests.relationshipId, relationshipId),
          eq(reactivationRequests.status, "pending"),
          gt(reactivationRequests.expiresAt, nowIso),
        ),
      )
      .limit(1),
    // Adherence inputs (see `deriveAdherenceForRelationships`).
    db
      .select({
        status: workoutExecutions.status,
        localDate: workoutAssignments.localDate,
      })
      .from(workoutExecutions)
      .innerJoin(
        workoutAssignments,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          eq(workoutExecutions.coachingRelationshipId, relationshipId),
          gte(workoutAssignments.localDate, adherenceStart),
          lte(workoutAssignments.localDate, today),
        ),
      ),
    db
      .select({ logged: count() })
      .from(mealCompliance)
      .where(
        and(
          eq(mealCompliance.coachingRelationshipId, relationshipId),
          gte(mealCompliance.localDate, adherenceStart),
          lte(mealCompliance.localDate, today),
        ),
      ),
    db
      .select({
        recordStatus: checkins.recordStatus,
        localDate: checkins.localDate,
      })
      .from(checkins)
      .where(
        and(
          eq(checkins.coachingRelationshipId, relationshipId),
          gte(checkins.localDate, adherenceStart),
          lte(checkins.localDate, today),
        ),
      ),
  ]);

  const trainee = profileRows[0];
  if (!trainee?.displayName) {
    throw new Error("Trainee profile is missing for this coaching relationship.");
  }

  const configuration = (() => {
    const row = configurationRows[0];
    const workout = workoutExpectationRows[0];
    const nutrition = nutritionExpectationRows[0];
    const checkin = checkinScheduleRows[0];
    const tracking = trackingRows[0];
    if (!row || !workout || !nutrition || !checkin || !tracking) return null;
    return mapCoachingConfiguration({
      configuration: row,
      workout,
      nutrition,
      checkin,
      tracking,
    });
  })();

  const effectivePlan = (() => {
    const version = effectiveVersionRows[0];
    const plan = version
      ? relationshipPlanRows.find((row) => row.id === version.planId)
      : undefined;
    if (!version || !plan) return { plan: null, version: null };
    return { plan: mapPlan(plan), version: mapPlanVersion(version) };
  })();

  const subscription = (() => {
    const row = subscriptionRows[0];
    if (!row) return null;
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
  })();

  const onboardingStatus =
    deriveClientOnboardingStatus({
      relationshipStatus: relationship.status,
      invitationPending: false,
      hasSubmittedResponse: responseRows.some(
        (row) => row.status === "submitted",
      ),
      hasCoachingReadyReview: reviewRows.length > 0,
      hasActiveConfiguration: configurationRows.length > 0,
    }) ?? "onboarding_pending";

  // Adherence only looks at active clients (same rule as the shared helper).
  const adherenceState = (() => {
    const qualifying =
      onboardingStatus === "active" &&
      (adherenceWorkoutRows.some((row) =>
        isQualifyingAdherenceObservation({
          kind: "workout_execution",
          status: row.status,
          localDate: row.localDate,
          today,
        }),
      ) ||
        adherenceMealRows.some((row) => row.logged > 0) ||
        adherenceCheckinRows.some((row) =>
          isQualifyingAdherenceObservation({
            kind: "checkin",
            status: row.recordStatus,
            localDate: row.localDate,
            today,
          }),
        ));
    const hasOpenAdherenceException =
      onboardingStatus === "active" &&
      exceptionRows.some(
        (row) =>
          (ADHERENCE_OPEN_EXCEPTION_STATUSES as readonly string[]).includes(
            row.status,
          ) &&
          (ADHERENCE_EXCEPTION_SEVERITIES as readonly string[]).includes(
            row.severity,
          ),
      );
    return deriveAdherenceState({
      onboardingStatus,
      hasOpenAdherenceException,
      hasQualifyingActivity: qualifying,
    });
  })();

  const executionByAssignment = new Map(
    activityWorkoutExecutionRows.map((row) => [row.assignmentId, row]),
  );
  const complianceByAssignment = new Map(
    activityComplianceRows.map((row) => [row.assignmentId, row]),
  );
  const reviewedCheckinIds = new Set(
    activityReviewRows.map((row) => row.checkinId),
  );
  const recentActivity = recentActivityFrom(
    [
      ...activityWorkoutRows.map((row) =>
        workoutActivityItem(row, executionByAssignment.get(row.id) ?? null, nowIso),
      ),
      ...activityMealRows.map((row) =>
        mealActivityItem(row, complianceByAssignment.get(row.id) ?? null, nowIso),
      ),
      ...activityCheckinRows.map((row) =>
        checkinActivityItem(row, reviewedCheckinIds.has(row.id), nowIso),
      ),
    ],
    nowIso,
  );

  const nextCheckin = nextCheckinRows[0]
    ? mapCheckin(nextCheckinRows[0], null, nowIso)
    : null;
  const pendingReviewCheckin = pendingReviewRows[0]
    ? mapCheckin(pendingReviewRows[0], null, nowIso)
    : null;
  const pendingReactivationRow =
    relationship.status === "ended" ? pendingReactivationRows : [];

  // Z9-18: the header name and WhatsApp number prefer what the trainer set in
  // Client settings; they feed the header WhatsApp button and Reminders drafts.
  const displayName =
    resolveClientDisplayName(relationship, trainee.displayName) ??
    trainee.displayName;

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
      goalShort: configuration?.goalShort ?? null,
      renewalState: subscription?.renewalState ?? null,
      renewsOn: subscription?.renewsOn ?? null,
      startedAt: relationship.startedAt ?? null,
      adherenceState,
      traineeProfile: {
        displayName,
        age: deriveAge(trainee.dateOfBirth, today),
        gender: trainee.gender,
      },
      traineeTimezone: timezones.trainee,
      hasCustomMealTimes: mealOverrides.length > 0,
      mealTimeOverrides: mealOverrides.map((row) => ({
        slotKey: row.id,
        dayPattern: row.dayPattern,
        time: row.time,
        updatedAt: row.updatedAt,
      })),
      trainerWhatsappE164: trainerProfileRows[0]?.whatsappE164 ?? null,
      clientWhatsappE164: resolveClientWhatsappE164(
        relationship,
        identityRows[0]?.mobileE164,
      ),
      endedAt: relationship.endedAt ?? null,
      pendingReactivation: pendingReactivationRow[0]
        ? {
            requestId: pendingReactivationRow[0].id,
            expiresAt: pendingReactivationRow[0].expiresAt,
            sentAt: pendingReactivationRow[0].createdAt,
            intakeUpdateRequested:
              pendingReactivationRow[0].intakeUpdateRequested,
          }
        : null,
    },
    overview: {
      openException: openExceptionSummary(exceptionRows),
      nextCheckin,
      pendingReviewCheckin,
      recentActivity,
      progress: {
        measurements: measurementRows.map(mapMeasurement),
        entries: entryRows.map(mapProgressEntry),
        media: mediaRows.map(mapMediaAsset),
      },
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
