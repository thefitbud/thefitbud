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
import { loadTraineeTimezone } from "./assignment-schedule";
import { createId, nowIso } from "../lib/crypto";

type Db = ReturnType<typeof createDb>;
type ExceptionRow = typeof exceptions.$inferSelect;

/** Look back a short window so detection volume stays realistic (~a few/client). */
const DETECTION_LOOKBACK_DAYS = 3;

function detectionWindowStartLocalDate(
  nowIsoValue: string,
  timeZone: string,
): string {
  const today = formatLocalDate(new Date(nowIsoValue), timeZone);
  return addDaysToLocalDate(today, -(DETECTION_LOOKBACK_DAYS - 1));
}

function sourceKey(input: {
  sourceEntityType: string;
  sourceEntityId: string;
}): string {
  return `${input.sourceEntityType}:${input.sourceEntityId}`;
}

/** One open item per type + civil day + slot. Duplicate plan versions share a day. */
function dedupeSameDaySlot<T extends ExceptionCandidate>(candidates: T[]): T[] {
  const seen = new Set<string>();
  const next: T[] = [];
  for (const candidate of candidates) {
    const details = candidate.details ?? {};
    const day = typeof details.localDate === "string" ? details.localDate : "";
    const slot =
      (typeof details.mealName === "string" && details.mealName) ||
      (typeof details.workoutDayName === "string" && details.workoutDayName) ||
      "";
    if (!day || !slot) {
      next.push(candidate);
      continue;
    }
    const key = `${candidate.type}:${day}:${slot}`;
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(candidate);
  }
  return next;
}

void ADHERENCE_WINDOW_DAYS;

async function collectCandidatesForRelationship(
  db: Db,
  relationshipId: string,
  now: string,
  timeZone = "Asia/Kolkata",
): Promise<ExceptionCandidate[]> {
  const candidates: ExceptionCandidate[] = [];
  const windowStart = detectionWindowStartLocalDate(now, timeZone);

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
 * Creates Detected exceptions and promotes them to Active. Does not
 * system-resolve open items when a source condition clears — late logs stay
 * visible as logged-later / attention for a trainer resolve (OQ-23).
 * Acknowledged exceptions that are still true stay acknowledged. Does not
 * rewrite workout, meal, or check-in source records.
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
  const relationship = await db
    .select({
      traineeUserId: coachingRelationships.traineeUserId,
      status: coachingRelationships.status,
    })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.id, relationshipId))
    .limit(1);
  // Rule 5 (EC1b): an ended relationship is read-only. Detection must never
  // create, activate or auto-resolve its exceptions, whoever the caller is.
  if (relationship[0]?.status === "ended") {
    return {
      created: 0,
      activated: 0,
      resolved: 0,
      exceptions: [],
      resolvedExceptions: [],
    };
  }

  const existingRows = await db
    .select()
    .from(exceptions)
    .where(eq(exceptions.coachingRelationshipId, relationshipId));

  const timeZone = relationship[0]
    ? await loadTraineeTimezone(db, relationship[0].traineeUserId)
    : "Asia/Kolkata";
  const candidates = await collectCandidatesForRelationship(
    db,
    relationshipId,
    now,
    timeZone,
  );
  const candidateKeys = new Set(candidates.map((candidate) => exceptionKey(candidate)));
  const candidatesBySource = new Map<string, ExceptionCandidate[]>();
  for (const candidate of candidates) {
    const key = sourceKey(candidate);
    const list = candidatesBySource.get(key);
    if (list) list.push(candidate);
    else candidatesBySource.set(key, [candidate]);
  }

  // Late log (or equivalent meal_logged_later signal): move the existing open
  // item to Client logged later. Never clear it as resolved.
  const openRows: ExceptionRow[] = existingRows.filter((row) =>
    isOpenExceptionStatus(row.status),
  );
  for (const row of openRows) {
    if (row.type === "meal_logged_later") continue;
    const lateCandidate = (candidatesBySource.get(sourceKey(row)) ?? []).find(
      (candidate) => candidate.type === "meal_logged_later",
    );
    if (!lateCandidate) continue;
    await db
      .update(exceptions)
      .set({
        type: lateCandidate.type,
        severity: lateCandidate.severity,
        summary: lateCandidate.summary,
        detailsJson: lateCandidate.details
          ? JSON.stringify(lateCandidate.details)
          : null,
        sourceLoggedLateAt: now,
        updatedAt: now,
      })
      .where(eq(exceptions.id, row.id));
    const morphed: ExceptionRow = {
      ...row,
      type: lateCandidate.type,
      severity: lateCandidate.severity,
      summary: lateCandidate.summary,
      detailsJson: lateCandidate.details
        ? JSON.stringify(lateCandidate.details)
        : null,
      sourceLoggedLateAt: now,
      updatedAt: now,
    };
    const idx = existingRows.findIndex((item) => item.id === row.id);
    if (idx >= 0) existingRows[idx] = morphed;
    const openIdx = openRows.findIndex((item) => item.id === row.id);
    if (openIdx >= 0) openRows[openIdx] = morphed;
  }

  // Skip sources that already have an open, acknowledged, or resolved item so
  // evaluate/detect cannot recreate Critical rows ~ms after a Resolve.
  const blockedKeys = new Set(
    existingRows
      .filter(
        (row) =>
          isOpenExceptionStatus(row.status) || row.status === "resolved",
      )
      .map((row) => exceptionKey(row)),
  );
  // One open item per source entity: keep the morphed/original row instead of
  // inserting a second meal_logged_later (or other) for the same assignment.
  const openSourceKeys = new Set(openRows.map((row) => sourceKey(row)));

  const freshCandidates = dedupeSameDaySlot(
    filterNewExceptionCandidates(candidates, blockedKeys).filter(
      (candidate) => !openSourceKeys.has(sourceKey(candidate)),
    ),
  );

  let room = Math.max(0, 10 - openRows.length);

  const createdRows: ExceptionRow[] = [];
  for (const candidate of freshCandidates) {
    if (room <= 0) break;
    room -= 1;
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
      sourceLoggedLateAt:
        candidate.type === "meal_logged_later" ? now : null,
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
    // Evaluate never system-resolves. Coaching end / trainer resolve are separate.
    resolved: 0,
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
    resolvedExceptions: [],
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
