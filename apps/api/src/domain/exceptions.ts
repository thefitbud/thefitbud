import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
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
import { createDb } from "../db/client";
import {
  checkinReviews,
  checkins,
  coachingRelationships,
  exceptions,
  mealAssignments,
  mealCompliance,
  scheduledJobs,
  users,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import { createId, nowIso } from "../lib/crypto";
import { reactivationLocalDate } from "./log-time-bounds";
import { chunkIds, selectInChunks } from "../lib/in-array-chunks";
import { writeStructuredLog } from "../lib/log";
import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import type { Env, Variables } from "../types";
import { internalRequestContext } from "../middleware/auth";

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

type BatchWrite = BatchItem<"sqlite">;

/**
 * Z14-1 / D-W14-8: Needs you reads stored exceptions. A relationship is
 * evaluated again on read only when its last evaluation is older than this.
 * Writes that can change an exception evaluate right after they land
 * (`scheduleExceptionEvaluation`), so this bound only matters for changes that
 * come from time passing (a meal or workout window closing).
 */
export const EXCEPTION_EVALUATION_TTL_MS = 15 * 60 * 1000;

/**
 * The last evaluation time per relationship lives in `scheduled_jobs` (no new
 * table, D-W14-18): one row per relationship, keyed by this dedupe key, with
 * `updated_at` = when it was last evaluated and `due_at` = when it next is.
 */
const EVALUATION_JOB_TYPE = "exception_evaluation";
export function exceptionEvaluationDedupeKey(relationshipId: string): string {
  return `${EVALUATION_JOB_TYPE}:${relationshipId}`;
}

/** True when a relationship last evaluated at `evaluatedAt` must be evaluated again. */
export function isExceptionEvaluationDue(
  evaluatedAt: string | null | undefined,
  now: string,
): boolean {
  if (!evaluatedAt) return true;
  const evaluatedMs = Date.parse(evaluatedAt);
  const nowMs = Date.parse(now);
  if (!Number.isFinite(evaluatedMs) || !Number.isFinite(nowMs)) return true;
  // A clock step backwards (evaluated "in the future") also re-evaluates.
  return evaluatedMs > nowMs || nowMs - evaluatedMs >= EXCEPTION_EVALUATION_TTL_MS;
}

type WorkoutInputRow = {
  assignmentId: string;
  coachingRelationshipId: string;
  localDate: string;
  windowEndsAt: string;
  executionStatus: string | null;
};
type MealInputRow = {
  assignmentId: string;
  coachingRelationshipId: string;
  localDate: string;
  mealName: string;
  windowEndsAt: string;
  complianceOutcome: string | null;
  loggedAt: string | null;
  deviationKind: string | null;
};
type CheckinInputRow = {
  checkinId: string;
  coachingRelationshipId: string;
  localDate: string;
  windowStartsAt: string;
  windowEndsAt: string;
  recordStatus: string;
  hasReview: number;
};

function collectCandidatesFromRows(input: {
  now: string;
  timeZone: string;
  reactivatedAt: string | null;
  workouts: WorkoutInputRow[];
  meals: MealInputRow[];
  checkins: CheckinInputRow[];
}): ExceptionCandidate[] {
  const { now, timeZone, reactivatedAt } = input;
  const candidates: ExceptionCandidate[] = [];
  // EC1 rule 1: after a reactivation, facts dated before the reactivation day
  // belong to the frozen ended period. They are never evaluated again, so no
  // exception is created, reopened or moved for them.
  const lookbackStart = detectionWindowStartLocalDate(now, timeZone);
  const frozenBefore = reactivatedAt
    ? reactivationLocalDate(reactivatedAt, timeZone)
    : null;
  const windowStart =
    frozenBefore && frozenBefore > lookbackStart ? frozenBefore : lookbackStart;

  for (const row of input.workouts) {
    if (row.localDate < windowStart) continue;
    const candidate = workoutAdherenceCandidate({
      assignmentId: row.assignmentId,
      localDate: row.localDate,
      windowEndsAt: row.windowEndsAt,
      nowIso: now,
      executionStatus: (row.executionStatus ?? null) as Parameters<
        typeof workoutAdherenceCandidate
      >[0]["executionStatus"],
    });
    if (candidate) candidates.push(candidate);
  }

  for (const row of input.meals) {
    if (row.localDate < windowStart) continue;
    const candidate = mealAdherenceCandidate({
      assignmentId: row.assignmentId,
      localDate: row.localDate,
      mealName: row.mealName,
      windowEndsAt: row.windowEndsAt,
      nowIso: now,
      complianceOutcome: (row.complianceOutcome ?? null) as Parameters<
        typeof mealAdherenceCandidate
      >[0]["complianceOutcome"],
      loggedAt: row.loggedAt ?? null,
      deviationKind: (row.deviationKind ?? null) as Parameters<
        typeof mealAdherenceCandidate
      >[0]["deviationKind"],
    });
    if (candidate) candidates.push(candidate);
  }

  for (const row of input.checkins) {
    if (row.localDate < windowStart) continue;
    const status = deriveCheckinStatus({
      nowIso: now,
      windowStartsAt: row.windowStartsAt,
      windowEndsAt: row.windowEndsAt,
      recordStatus: row.recordStatus as Parameters<
        typeof deriveCheckinStatus
      >[0]["recordStatus"],
      hasReview: Boolean(row.hasReview),
    });
    if (status === "overdue") {
      candidates.push(
        overdueCheckinCandidate({
          checkinId: row.checkinId,
          localDate: row.localDate,
          windowEndsAt: row.windowEndsAt,
        }),
      );
    }
  }

  return candidates;
}

export type RelationshipEvaluationResult = {
  created: number;
  activated: number;
  resolved: number;
  exceptions: ReturnType<typeof mapException>[];
  resolvedExceptions: ReturnType<typeof mapException>[];
};

const EMPTY_EVALUATION: RelationshipEvaluationResult = {
  created: 0,
  activated: 0,
  resolved: 0,
  exceptions: [],
  resolvedExceptions: [],
};

/**
 * The decision for one relationship, as a pure function of its stored rows:
 * which open items move to "logged later", which candidates become new
 * Active items and which Detected items are activated. Same rules as before
 * Z14-1 (OQ-23, EC1); only the I/O moved out so many relationships share one
 * read and one write round trip.
 */
function planRelationshipEvaluation(input: {
  relationshipId: string;
  now: string;
  existingRows: ExceptionRow[];
  candidates: ExceptionCandidate[];
}): {
  morphs: ExceptionRow[];
  created: ExceptionRow[];
  activated: ExceptionRow[];
  result: RelationshipEvaluationResult;
} {
  const { relationshipId, now, candidates } = input;
  const existingRows = [...input.existingRows];
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
  const morphs: ExceptionRow[] = [];
  for (const row of [...openRows]) {
    if (row.type === "meal_logged_later") continue;
    const lateCandidate = (candidatesBySource.get(sourceKey(row)) ?? []).find(
      (candidate) => candidate.type === "meal_logged_later",
    );
    if (!lateCandidate) continue;
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
    morphs.push(morphed);
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

  // New items are written straight as Active: detection promotes every new
  // item in the same pass, so a Detected row was never observable.
  const created: ExceptionRow[] = [];
  for (const candidate of freshCandidates) {
    if (room <= 0) break;
    room -= 1;
    created.push({
      id: createId(),
      coachingRelationshipId: relationshipId,
      type: candidate.type,
      severity: candidate.severity,
      status: "active",
      ruleVersion: MVP_EXCEPTION_RULE_VERSION,
      sourceEntityType: candidate.sourceEntityType,
      sourceEntityId: candidate.sourceEntityId,
      summary: candidate.summary,
      detailsJson: candidate.details
        ? JSON.stringify(candidate.details)
        : null,
      detectedAt: now,
      activatedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
      resolutionOutcome: null,
      resolutionNote: null,
      closedReason: null,
      sourceLoggedLateAt:
        candidate.type === "meal_logged_later" ? now : null,
      createdAt: now,
      updatedAt: now,
    });
  }

  const activated: ExceptionRow[] = existingRows
    .filter(
      (row) =>
        canActivateException(row.status) &&
        candidateKeys.has(exceptionKey(row)),
    )
    .map((row) => ({
      ...row,
      status: "active" as const,
      activatedAt: now,
      updatedAt: now,
    }));

  return {
    morphs,
    created,
    activated,
    result: {
      created: created.length,
      activated: created.length + activated.length,
      // Evaluate never system-resolves. Coaching end / trainer resolve are separate.
      resolved: 0,
      exceptions: [...created, ...activated].map(mapException),
      resolvedExceptions: [],
    },
  };
}

/** Insert unless another evaluation already stored an item for this source. */
function insertExceptionUnlessPresent(db: Db, row: ExceptionRow): BatchWrite {
  // Two evaluations of one relationship can overlap (a write's evaluation and
  // a Needs you read). Each runs as one D1 batch (one transaction), so this
  // guard makes the second a no-op instead of a duplicate item.
  // Columns in table order (drizzle's insert-select writes every column).
  return db.insert(exceptions).select(sql`
    select ${row.id}, ${row.coachingRelationshipId}, ${row.type}, ${row.severity},
      ${row.status}, ${row.ruleVersion}, ${row.sourceEntityType}, ${row.sourceEntityId},
      ${row.summary}, ${row.detailsJson}, ${row.detectedAt}, ${row.activatedAt},
      ${row.acknowledgedAt}, ${row.resolvedAt}, ${row.resolutionOutcome},
      ${row.resolutionNote}, ${row.closedReason}, ${row.sourceLoggedLateAt},
      ${row.createdAt}, ${row.updatedAt}
    where not exists (
      select 1 from ${exceptions} "e"
      where "e"."coaching_relationship_id" = ${row.coachingRelationshipId}
        and "e"."source_entity_type" = ${row.sourceEntityType}
        and "e"."source_entity_id" = ${row.sourceEntityId}
        and ("e"."status" in ('detected', 'active', 'acknowledged')
          or ("e"."status" = 'resolved' and "e"."type" = ${row.type}))
    )
  `);
}

function markEvaluated(db: Db, relationshipId: string, now: string): BatchWrite {
  const dueAt = new Date(Date.parse(now) + EXCEPTION_EVALUATION_TTL_MS).toISOString();
  return db
    .insert(scheduledJobs)
    .values({
      id: createId(),
      jobType: EVALUATION_JOB_TYPE,
      dedupeKey: exceptionEvaluationDedupeKey(relationshipId),
      dueAt,
      state: "completed",
      domainEntityType: "coaching_relationship",
      domainEntityId: relationshipId,
      attemptCount: 0,
      lastErrorCategory: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: scheduledJobs.dedupeKey,
      set: { dueAt, state: "completed", updatedAt: now },
    });
}

/**
 * Deterministic exception detection for many coaching relationships in a
 * fixed number of D1 round trips (Z14-1): one batched read of every input,
 * the rules in memory, one batched write. Creates Active exceptions, moves
 * open items to "logged later" and activates Detected ones. Never
 * system-resolves (OQ-23): only the trainer resolves. Ended relationships are
 * read-only (EC1b rule 5) and are skipped. Does not rewrite workout, meal or
 * check-in source records.
 */
export async function evaluateExceptionsForRelationships(
  db: Db,
  relationshipIds: readonly string[],
  now = nowIso(),
): Promise<Map<string, RelationshipEvaluationResult>> {
  const results = new Map<string, RelationshipEvaluationResult>();
  const ids = [...new Set(relationshipIds)];
  if (ids.length === 0) return results;

  // Every time zone's "today" is within a day of UTC's, so this lower bound
  // covers each relationship's own lookback window; rows before its window
  // are dropped per relationship below.
  const utcToday = formatLocalDate(new Date(now), "UTC");
  const lowerBound = addDaysToLocalDate(utcToday, -DETECTION_LOOKBACK_DAYS);

  const reads = chunkIds(ids).flatMap((chunk) => [
    db
      .select({
        id: coachingRelationships.id,
        traineeUserId: coachingRelationships.traineeUserId,
        status: coachingRelationships.status,
        reactivatedAt: coachingRelationships.reactivatedAt,
        timezone: users.timezone,
      })
      .from(coachingRelationships)
      .leftJoin(users, eq(users.id, coachingRelationships.traineeUserId))
      .where(inArray(coachingRelationships.id, chunk)),
    db
      .select()
      .from(exceptions)
      .where(inArray(exceptions.coachingRelationshipId, chunk)),
    db
      .select({
        assignmentId: workoutAssignments.id,
        coachingRelationshipId: workoutAssignments.coachingRelationshipId,
        localDate: workoutAssignments.localDate,
        windowEndsAt: workoutAssignments.windowEndsAt,
        executionStatus: workoutExecutions.status,
      })
      .from(workoutAssignments)
      .leftJoin(
        workoutExecutions,
        eq(workoutExecutions.assignmentId, workoutAssignments.id),
      )
      .where(
        and(
          inArray(workoutAssignments.coachingRelationshipId, chunk),
          eq(workoutAssignments.scheduleStatus, "scheduled"),
          gte(workoutAssignments.localDate, lowerBound),
        ),
      ),
    db
      .select({
        assignmentId: mealAssignments.id,
        coachingRelationshipId: mealAssignments.coachingRelationshipId,
        localDate: mealAssignments.localDate,
        mealName: mealAssignments.mealName,
        windowEndsAt: mealAssignments.windowEndsAt,
        complianceOutcome: mealCompliance.outcome,
        loggedAt: mealCompliance.loggedAt,
        deviationKind: mealCompliance.deviationKind,
      })
      .from(mealAssignments)
      .leftJoin(
        mealCompliance,
        eq(mealCompliance.assignmentId, mealAssignments.id),
      )
      .where(
        and(
          inArray(mealAssignments.coachingRelationshipId, chunk),
          eq(mealAssignments.scheduleStatus, "scheduled"),
          gte(mealAssignments.localDate, lowerBound),
        ),
      ),
    db
      .select({
        checkinId: checkins.id,
        coachingRelationshipId: checkins.coachingRelationshipId,
        localDate: checkins.localDate,
        windowStartsAt: checkins.windowStartsAt,
        windowEndsAt: checkins.windowEndsAt,
        recordStatus: checkins.recordStatus,
        // Aliased: a second "id" column would collide in a batch result.
        hasReview: sql<number>`case when ${checkinReviews.id} is null then 0 else 1 end`.as(
          "has_review",
        ),
      })
      .from(checkins)
      .leftJoin(checkinReviews, eq(checkinReviews.checkinId, checkins.id))
      .where(
        and(
          inArray(checkins.coachingRelationshipId, chunk),
          gte(checkins.localDate, lowerBound),
        ),
      ),
  ]);
  const readResults = (await db.batch(
    reads as unknown as [BatchWrite, ...BatchWrite[]],
  )) as unknown[][];

  type RelationshipRow = {
    id: string;
    traineeUserId: string;
    status: "active" | "ended";
    reactivatedAt: string | null;
    timezone: string | null;
  };
  const relationshipRows: RelationshipRow[] = [];
  const existingRows: ExceptionRow[] = [];
  const workoutRows: WorkoutInputRow[] = [];
  const mealRows: MealInputRow[] = [];
  const checkinRows: CheckinInputRow[] = [];
  for (let i = 0; i < readResults.length; i += 5) {
    relationshipRows.push(...(readResults[i] as RelationshipRow[]));
    existingRows.push(...(readResults[i + 1] as ExceptionRow[]));
    workoutRows.push(...(readResults[i + 2] as WorkoutInputRow[]));
    mealRows.push(...(readResults[i + 3] as MealInputRow[]));
    checkinRows.push(...(readResults[i + 4] as CheckinInputRow[]));
  }

  const groupBy = <T extends { coachingRelationshipId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const list = map.get(row.coachingRelationshipId);
      if (list) list.push(row);
      else map.set(row.coachingRelationshipId, [row]);
    }
    return map;
  };
  const relationshipById = new Map(relationshipRows.map((row) => [row.id, row]));
  const existingByRelationship = groupBy(existingRows);
  const workoutsByRelationship = groupBy(workoutRows);
  const mealsByRelationship = groupBy(mealRows);
  const checkinsByRelationship = groupBy(checkinRows);

  const writes: BatchWrite[] = [];
  for (const relationshipId of ids) {
    const relationship = relationshipById.get(relationshipId);
    // Rule 5 (EC1b): an ended relationship is read-only. Detection must never
    // create, activate or auto-resolve its exceptions, whoever the caller is.
    if (relationship?.status === "ended") {
      results.set(relationshipId, EMPTY_EVALUATION);
      continue;
    }
    // Same fallbacks as before: no relationship row → Asia/Kolkata; no user
    // row → UTC (`loadTraineeTimezone`).
    const timeZone = relationship
      ? (relationship.timezone ?? "UTC")
      : "Asia/Kolkata";
    const candidates = collectCandidatesFromRows({
      now,
      timeZone,
      reactivatedAt: relationship?.reactivatedAt ?? null,
      workouts: workoutsByRelationship.get(relationshipId) ?? [],
      meals: mealsByRelationship.get(relationshipId) ?? [],
      checkins: checkinsByRelationship.get(relationshipId) ?? [],
    });
    const plan = planRelationshipEvaluation({
      relationshipId,
      now,
      existingRows: existingByRelationship.get(relationshipId) ?? [],
      candidates,
    });
    for (const row of plan.morphs) {
      writes.push(
        db
          .update(exceptions)
          .set({
            type: row.type,
            severity: row.severity,
            summary: row.summary,
            detailsJson: row.detailsJson,
            sourceLoggedLateAt: row.sourceLoggedLateAt,
            updatedAt: row.updatedAt,
          })
          .where(eq(exceptions.id, row.id)),
      );
    }
    for (const row of plan.created) {
      writes.push(insertExceptionUnlessPresent(db, row));
    }
    for (const row of plan.activated) {
      writes.push(
        db
          .update(exceptions)
          .set({ status: "active", activatedAt: now, updatedAt: now })
          .where(and(eq(exceptions.id, row.id), eq(exceptions.status, "detected"))),
      );
    }
    if (relationship) writes.push(markEvaluated(db, relationshipId, now));
    results.set(relationshipId, plan.result);
  }

  if (writes.length > 0) {
    await db.batch(writes as [BatchWrite, ...BatchWrite[]]);
  }
  return results;
}

/**
 * Deterministic exception detection for one coaching relationship (see
 * `evaluateExceptionsForRelationships`). Kept for single-relationship callers.
 */
export async function evaluateRelationshipExceptions(
  db: Db,
  relationshipId: string,
  now = nowIso(),
): Promise<RelationshipEvaluationResult> {
  const results = await evaluateExceptionsForRelationships(db, [relationshipId], now);
  return results.get(relationshipId) ?? EMPTY_EVALUATION;
}

/**
 * When each relationship was last evaluated (absent = never). One statement
 * per 90 relationships; callers usually fold this into a wider read instead.
 */
export async function loadExceptionEvaluationTimes(
  db: Db,
  relationshipIds: readonly string[],
): Promise<Map<string, string>> {
  const keys = relationshipIds.map(exceptionEvaluationDedupeKey);
  const rows = await selectInChunks(keys, (chunk) =>
    db
      .select({ relationshipId: scheduledJobs.domainEntityId, updatedAt: scheduledJobs.updatedAt })
      .from(scheduledJobs)
      .where(inArray(scheduledJobs.dedupeKey, chunk)),
  );
  return new Map(
    rows.flatMap((row) => (row.relationshipId ? [[row.relationshipId, row.updatedAt]] : [])),
  );
}

/**
 * Evaluates only the active relationships whose last evaluation is older than
 * EXCEPTION_EVALUATION_TTL_MS (or never ran), in one batched pass (D-W14-8).
 * Returns the ids it evaluated.
 */
export async function evaluateDueExceptions(
  db: Db,
  relationships: ReadonlyArray<{ id: string; status: string; evaluatedAt?: string | null }>,
  now = nowIso(),
): Promise<string[]> {
  const due = relationships
    .filter((relationship) => relationship.status === "active")
    .filter((relationship) => isExceptionEvaluationDue(relationship.evaluatedAt, now))
    .map((relationship) => relationship.id);
  if (due.length > 0) {
    await evaluateExceptionsForRelationships(db, due, now);
  }
  return due;
}

type ExecutionContextLike = { waitUntil: (promise: Promise<unknown>) => void };
type HandlerContext = Pick<Context, "executionCtx" | "req">;

/**
 * Re-evaluates relationships' exceptions after writes that can change them
 * (D-W14-8), without holding up the response: on Workers it runs after the
 * response via `waitUntil`; with no execution context (tests, scripts) it runs
 * before returning. Never resolves anything.
 */
export async function scheduleExceptionEvaluations(
  c: HandlerContext,
  db: Db,
  relationshipIds: ReadonlyArray<string | null | undefined>,
): Promise<void> {
  const ids = relationshipIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;
  const run = evaluateExceptionsForRelationships(db, ids).then(
    () => undefined,
    (error: unknown) => {
      writeStructuredLog({
        level: "warn",
        message: "exceptions.evaluate_after_write_failed",
        errorName: error instanceof Error ? error.name : "Error",
      });
    },
  );
  let ctx: ExecutionContextLike | null = null;
  try {
    ctx = c.executionCtx;
  } catch {
    // Hono throws when the request carries no execution context (tests).
    ctx = null;
  }
  if (ctx) {
    ctx.waitUntil(run);
    return;
  }
  await run;
}

/**
 * The write-path hook for one relationship. Inside sync push (an in-process
 * request carrying its caller's actor) the relationship is only collected, and
 * sync push evaluates every collected relationship once for the whole batch.
 */
export async function scheduleExceptionEvaluation(
  c: HandlerContext,
  db: Db,
  relationshipId: string | null | undefined,
): Promise<void> {
  if (!relationshipId) return;
  const internal = internalRequestContext(c);
  if (internal) {
    internal.exceptionEvaluations.add(relationshipId);
    return;
  }
  await scheduleExceptionEvaluations(c, db, [relationshipId]);
}

/** Trainer coach-log writes: the meal entry and the finished workout (log or edit). */
const COACH_LOG_WRITES: ReadonlyArray<[method: string, path: RegExp]> = [
  ["PUT", /^\/meals\/compliance\/[^/]+\/[^/]+\/?$/],
  ["POST", /^\/workouts\/assignments\/[^/]+\/log\/?$/],
  ["PATCH", /^\/workouts\/executions\/[^/]+\/?$/],
];

export function isCoachLogWrite(method: string, path: string): boolean {
  return COACH_LOG_WRITES.some(([m, pattern]) => m === method && pattern.test(path));
}

const RELATIONSHIP_IN_PATH = /\/relationships\/([0-9a-f-]{36})(?:\/|$)/i;

/** The relationship a successful write touched: from its path, else its body. */
async function relationshipOfWrite(c: Context): Promise<string | null> {
  const fromPath = RELATIONSHIP_IN_PATH.exec(c.req.path)?.[1];
  if (fromPath) return fromPath;
  try {
    const body = (await c.res.clone().json()) as {
      data?: { coachingRelationshipId?: unknown; relationshipId?: unknown };
    };
    const id = body?.data?.coachingRelationshipId ?? body?.data?.relationshipId;
    return typeof id === "string" ? id : null;
  } catch {
    return null; // not JSON: nothing to evaluate
  }
}

/**
 * Router middleware (workouts, meals, check-ins): after a trainee's successful
 * write, or a trainer's coach log, re-evaluate that relationship's exceptions
 * behind the response (D-W14-8).
 * One line per router instead of a hook in every handler; reads pass through.
 */
export const evaluateExceptionsAfterWrite = createMiddleware<{
  Bindings: Env;
  Variables: Variables;
}>(async (c, next) => {
  await next();
  if (c.req.method === "GET" || c.req.method === "HEAD" || !c.res.ok) return;
  // Trainee writes (logs, skips, submits) and trainer coach logs (a meal or
  // workout logged or corrected for the client) change exceptions: evaluate.
  // Other trainer writes (schedules, plans, notes) create or adjust
  // expectations whose exceptions come from time passing: the 15-minute rule.
  const role = c.get("actor")?.selectedRole;
  if (role !== "trainee" && !(role === "trainer" && isCoachLogWrite(c.req.method, c.req.path))) {
    return;
  }
  const relationshipId = await relationshipOfWrite(c);
  if (!relationshipId) return;
  await scheduleExceptionEvaluation(c, createDb(c.env.DB), relationshipId);
});

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
    clientDisplayName: string | null;
    contactPhoneE164: string | null;
  }>
> {
  // One read: the trainer's active relationships with when each was last
  // evaluated (Z14-1). Only those older than 15 minutes are evaluated again,
  // all together; the rest are read as stored (D-W14-8).
  const relationshipRows = await db
    .select({
      relationship: coachingRelationships,
      evaluatedAt: scheduledJobs.updatedAt,
    })
    .from(coachingRelationships)
    .leftJoin(
      scheduledJobs,
      eq(
        scheduledJobs.dedupeKey,
        sql`${EVALUATION_JOB_TYPE} || ':' || ${coachingRelationships.id}`,
      ),
    )
    .where(
      and(
        eq(coachingRelationships.trainerUserId, trainerUserId),
        eq(coachingRelationships.status, "active"),
      ),
    );
  const relationships = relationshipRows.map((row) => row.relationship);

  if (relationships.length === 0) return [];

  await evaluateDueExceptions(
    db,
    relationshipRows.map((row) => ({
      id: row.relationship.id,
      status: row.relationship.status,
      evaluatedAt: row.evaluatedAt,
    })),
    now,
  );

  const relationshipIds = relationships.map((r) => r.id);
  const relationshipById = new Map(relationships.map((r) => [r.id, r]));

  // When grouping by relationship, fetch enough rows to form groups; `limit`
  // counts groups in the route handler, not raw exception rows.
  const rowLimit = options?.groupByRelationship
    ? Math.min(Math.max(limit, 1) * 40, 500)
    : limit;

  // Chunked so a trainer with more than 90 clients stays under D1's bound-parameter
  // cap; each chunk keeps its own newest rows, then the merge re-applies the limit.
  const rows = (
    await selectInChunks(relationshipIds, (ids) =>
      db
        .select()
        .from(exceptions)
        .where(
          and(
            inArray(exceptions.coachingRelationshipId, ids),
            inArray(exceptions.status, ["detected", "active", "acknowledged"]),
          ),
        )
        .orderBy(desc(exceptions.detectedAt))
        .limit(rowLimit),
    )
  )
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))
    .slice(0, rowLimit);

  return rows.flatMap((exception) => {
    const relationship = relationshipById.get(exception.coachingRelationshipId);
    if (!relationship) return [];
    return [
      {
        exception,
        coachingRelationshipId: relationship.id,
        traineeUserId: relationship.traineeUserId,
        // Z9-18: the trainer-set name and phone, from the same relationship read.
        clientDisplayName: relationship.clientDisplayName ?? null,
        contactPhoneE164: relationship.contactPhoneE164 ?? null,
      },
    ];
  });
}
