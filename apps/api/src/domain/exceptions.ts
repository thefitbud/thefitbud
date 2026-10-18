import { and, desc, eq, gte, inArray } from "drizzle-orm";
import {
  ADHERENCE_WINDOW_DAYS,
  MVP_EXCEPTION_RULE_VERSION,
  addDaysToLocalDate,
  canActivateException,
  deriveCheckinStatus,
  exceptionKey,
  filterNewExceptionCandidates,
  formatLocalDate,
  isOpenExceptionStatus,
  mealAdherenceCandidate,
  overdueCheckinCandidate,
  workoutAdherenceCandidate,
  type ExceptionCandidate,
} from "@fitbud/core";
import { mapException } from "./mappers";
import type { createDb } from "../db/client";
import {
  checkinReviews,
  checkins,
  coachingRelationships,
  exceptions,
  mealAssignments,
  mealCompliance,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { createId, nowIso } from "../lib/crypto";

type Db = ReturnType<typeof createDb>;
type ExceptionRow = typeof exceptions.$inferSelect;

/** Look back a short window so detection volume stays realistic (~a few/client). */
const DETECTION_LOOKBACK_DAYS = 3;

function detectionWindowStartLocalDate(nowIsoValue: string): string {
  const today = formatLocalDate(new Date(nowIsoValue), "UTC");
  return addDaysToLocalDate(today, -(DETECTION_LOOKBACK_DAYS - 1));
}

void ADHERENCE_WINDOW_DAYS;

async function collectCandidatesForRelationship(
  db: Db,
  relationshipId: string,
  now: string,
): Promise<ExceptionCandidate[]> {
  const candidates: ExceptionCandidate[] = [];
  const windowStart = detectionWindowStartLocalDate(now);

  const workoutRows = await db
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
        eq(workoutAssignments.coachingRelationshipId, relationshipId),
        eq(workoutAssignments.scheduleStatus, "scheduled"),
        gte(workoutAssignments.localDate, windowStart),
      ),
    );

  for (const row of workoutRows) {
    const candidate = workoutAdherenceCandidate({
      assignmentId: row.assignment.id,
      localDate: row.assignment.localDate,
      windowEndsAt: row.assignment.windowEndsAt,
      nowIso: now,
      executionStatus: row.execution?.status ?? null,
    });
    if (candidate) candidates.push(candidate);
  }

  const mealRows = await db
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
        eq(mealAssignments.coachingRelationshipId, relationshipId),
        eq(mealAssignments.scheduleStatus, "scheduled"),
        gte(mealAssignments.localDate, windowStart),
      ),
    );

  for (const row of mealRows) {
    const candidate = mealAdherenceCandidate({
      assignmentId: row.assignment.id,
      localDate: row.assignment.localDate,
      mealName: row.assignment.mealName,
      windowEndsAt: row.assignment.windowEndsAt,
      nowIso: now,
      complianceOutcome: row.compliance?.outcome ?? null,
      loggedAt: row.compliance?.loggedAt ?? null,
      deviationKind: row.compliance?.deviationKind ?? null,
    });
    if (candidate) candidates.push(candidate);
  }

  const checkinRows = await db
    .select({
      checkin: checkins,
      review: checkinReviews,
    })
    .from(checkins)
    .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
    .where(
      and(
        eq(checkins.coachingRelationshipId, relationshipId),
        gte(checkins.localDate, windowStart),
      ),
    );

  for (const row of checkinRows) {
    const status = deriveCheckinStatus({
      nowIso: now,
      windowStartsAt: row.checkin.windowStartsAt,
      windowEndsAt: row.checkin.windowEndsAt,
      recordStatus: row.checkin.recordStatus,
      hasReview: Boolean(row.review),
    });
    if (status === "overdue") {
      candidates.push(
        overdueCheckinCandidate({
          checkinId: row.checkin.id,
          localDate: row.checkin.localDate,
          windowEndsAt: row.checkin.windowEndsAt,
        }),
      );
    }
  }

  return candidates;
}

/**
 * Deterministic exception detection for one coaching relationship.
 * Creates Detected exceptions, promotes them to Active, and resolves an open
 * exception only when its condition is gone. Acknowledged exceptions that are
 * still true stay acknowledged. Does not rewrite workout, meal, or check-in
 * source records.
 */
export async function evaluateRelationshipExceptions(
  db: Db,
  relationshipId: string,
  now = nowIso(),
): Promise<{
  created: number;
  activated: number;
  resolved: number;
  exceptions: ReturnType<typeof mapException>[];
  resolvedExceptions: ReturnType<typeof mapException>[];
}> {
  const existingRows = await db
    .select()
    .from(exceptions)
    .where(eq(exceptions.coachingRelationshipId, relationshipId));

  const candidates = await collectCandidatesForRelationship(
    db,
    relationshipId,
    now,
  );
  const candidateKeys = new Set(candidates.map((candidate) => exceptionKey(candidate)));

  const resolvedRows: ExceptionRow[] = [];
  for (const row of existingRows) {
    if (!isOpenExceptionStatus(row.status)) continue;
    if (candidateKeys.has(exceptionKey(row))) continue;
    await db
      .update(exceptions)
      .set({
        status: "resolved",
        resolvedAt: now,
        updatedAt: now,
      })
      .where(eq(exceptions.id, row.id));
    resolvedRows.push({
      ...row,
      status: "resolved",
      resolvedAt: now,
      updatedAt: now,
    });
  }

  const openKeys = new Set(
    existingRows
      .filter(
        (row) =>
          isOpenExceptionStatus(row.status) &&
          candidateKeys.has(exceptionKey(row)),
      )
      .map((row) => exceptionKey(row)),
  );

  const freshCandidates = filterNewExceptionCandidates(candidates, openKeys);

  const createdRows: ExceptionRow[] = [];
  for (const candidate of freshCandidates) {
    const row: ExceptionRow = {
      id: createId(),
      coachingRelationshipId: relationshipId,
      type: candidate.type,
      severity: candidate.severity,
      status: "detected",
      ruleVersion: MVP_EXCEPTION_RULE_VERSION,
      sourceEntityType: candidate.sourceEntityType,
      sourceEntityId: candidate.sourceEntityId,
      summary: candidate.summary,
      detailsJson: candidate.details
        ? JSON.stringify(candidate.details)
        : null,
      detectedAt: now,
      activatedAt: null,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionOutcome: null,
      resolutionNote: null,
      closedReason: null,
      sourceLoggedLateAt: null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(exceptions).values(row);
    createdRows.push(row);
  }

  const detectedRows = [
    ...createdRows,
    ...existingRows.filter(
      (row) =>
        canActivateException(row.status) &&
        candidateKeys.has(exceptionKey(row)),
    ),
  ];

  let activated = 0;
  const activatedMapped: ExceptionRow[] = [];
  for (const row of detectedRows) {
    if (!canActivateException(row.status)) continue;
    await db
      .update(exceptions)
      .set({
        status: "active",
        activatedAt: now,
        updatedAt: now,
      })
      .where(eq(exceptions.id, row.id));
    activated += 1;
    activatedMapped.push({
      ...row,
      status: "active",
      activatedAt: now,
      updatedAt: now,
    });
  }

  return {
    created: createdRows.length,
    activated,
    resolved: resolvedRows.length,
    exceptions: [
      ...createdRows.map((row) =>
        mapException({
          ...row,
          status: "active",
          activatedAt: now,
          updatedAt: now,
        }),
      ),
      ...activatedMapped
        .filter((row) => !createdRows.some((created) => created.id === row.id))
        .map(mapException),
    ],
    resolvedExceptions: resolvedRows.map(mapException),
  };
}

export async function detectExceptionsForRelationship(
  db: Db,
  relationshipId: string,
  now = nowIso(),
): Promise<ExceptionRow[]> {
  await evaluateRelationshipExceptions(db, relationshipId, now);
  return listActiveExceptionsForRelationship(db, relationshipId);
}

export async function listActiveExceptionsForRelationship(
  db: Db,
  relationshipId: string,
): Promise<ExceptionRow[]> {
  const rows = await db
    .select()
    .from(exceptions)
    .where(eq(exceptions.coachingRelationshipId, relationshipId))
    .orderBy(desc(exceptions.detectedAt));
  return rows.filter((row) => isOpenExceptionStatus(row.status));
}

export async function listAttentionExceptionsForTrainer(
  db: Db,
  trainerUserId: string,
  limit: number,
  now = nowIso(),
  options?: { groupByRelationship?: boolean },
): Promise<
  Array<{
    exception: ExceptionRow;
    coachingRelationshipId: string;
    traineeUserId: string;
  }>
> {
  const relationships = await db
    .select()
    .from(coachingRelationships)
    .where(
      and(
        eq(coachingRelationships.trainerUserId, trainerUserId),
        eq(coachingRelationships.status, "active"),
      ),
    );

  for (const relationship of relationships) {
    await evaluateRelationshipExceptions(db, relationship.id, now);
  }

  if (relationships.length === 0) return [];

  const relationshipIds = relationships.map((r) => r.id);
  const relationshipById = new Map(relationships.map((r) => [r.id, r]));

  // When grouping by relationship, fetch enough rows to form groups; `limit`
  // counts groups in the route handler, not raw exception rows.
  const rowLimit = options?.groupByRelationship
    ? Math.min(Math.max(limit, 1) * 40, 500)
    : limit;

  const rows = await db
    .select()
    .from(exceptions)
    .where(
      and(
        inArray(exceptions.coachingRelationshipId, relationshipIds),
        inArray(exceptions.status, ["detected", "active", "acknowledged"]),
      ),
    )
    .orderBy(desc(exceptions.detectedAt))
    .limit(rowLimit);

  return rows.flatMap((exception) => {
    const relationship = relationshipById.get(exception.coachingRelationshipId);
    if (!relationship) return [];
    return [
      {
        exception,
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
      },
    ];
  });
}
