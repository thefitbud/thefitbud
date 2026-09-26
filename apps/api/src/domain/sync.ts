import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type {
  SyncChangeRecord,
  SyncEntityType,
  SyncMutationResult,
} from "@fitbud/contracts";
import { createDb } from "../db/client";
import {
  changeLog,
  checkinReviews,
  checkins,
  coachingRelationships,
  exerciseExecutions,
  mealAssignments,
  mealCompliance,
  measurements,
  plans,
  planVersions,
  setExecutions,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema";
import {
  mapCheckin,
  mapMealAssignment,
  mapMealCompliance,
  mapMeasurement,
  mapPlanVersion,
  mapWorkoutAssignment,
  mapWorkoutExecution,
} from "./mappers";
import { createId, nowIso } from "../lib/crypto";
import { decodeCursor, encodeCursor } from "../lib/cursor";

type Db = ReturnType<typeof createDb>;

export function encodeSyncCursor(seq: number): string {
  return encodeCursor({ k: String(seq), id: "sync" });
}

export function decodeSyncCursor(cursor: string | undefined | null): number {
  if (!cursor) return 0;
  const decoded = decodeCursor(cursor);
  if (!decoded) return -1;
  const seq = Number(decoded.k);
  if (!Number.isFinite(seq) || seq < 0) return -1;
  return seq;
}

export async function nextChangeSequence(db: Db): Promise<number> {
  const rows = await db
    .select({ sequence: changeLog.sequence })
    .from(changeLog)
    .orderBy(desc(changeLog.sequence))
    .limit(1);
  return (rows[0]?.sequence ?? 0) + 1;
}

export async function appendChangeLog(
  db: Db,
  input: {
    entityType: SyncEntityType;
    recordId: string;
    changeKind: "upsert" | "tombstone";
    serverVersion: number | null;
    coachingRelationshipId: string;
    traineeUserId: string;
    changedAt?: string;
  },
): Promise<number> {
  const sequence = await nextChangeSequence(db);
  await db.insert(changeLog).values({
    id: createId(),
    sequence,
    entityType: input.entityType,
    recordId: input.recordId,
    changeKind: input.changeKind,
    serverVersion: input.serverVersion,
    coachingRelationshipId: input.coachingRelationshipId,
    traineeUserId: input.traineeUserId,
    changedAt: input.changedAt ?? nowIso(),
  });
  return sequence;
}

export async function listTraineeRelationshipIds(
  db: Db,
  traineeUserId: string,
): Promise<string[]> {
  const rows = await db
    .select({ id: coachingRelationships.id })
    .from(coachingRelationships)
    .where(eq(coachingRelationships.traineeUserId, traineeUserId));
  return rows.map((row) => row.id);
}

async function loadWorkoutExecutionPayload(db: Db, executionId: string) {
  const execRows = await db
    .select()
    .from(workoutExecutions)
    .where(eq(workoutExecutions.id, executionId))
    .limit(1);
  const execution = execRows[0];
  if (!execution) return null;
  const exercises = await db
    .select()
    .from(exerciseExecutions)
    .where(eq(exerciseExecutions.workoutExecutionId, executionId));
  const sets =
    exercises.length === 0
      ? []
      : await db
          .select()
          .from(setExecutions)
          .where(
            inArray(
              setExecutions.exerciseExecutionId,
              exercises.map((exercise) => exercise.id),
            ),
          );
  return mapWorkoutExecution(execution, exercises, sets);
}

async function loadMealCompliancePayload(db: Db, complianceId: string) {
  const rows = await db
    .select()
    .from(mealCompliance)
    .where(eq(mealCompliance.id, complianceId))
    .limit(1);
  const row = rows[0];
  return row ? mapMealCompliance(row) : null;
}

async function loadCheckinPayload(db: Db, checkinId: string) {
  const rows = await db
    .select()
    .from(checkins)
    .where(eq(checkins.id, checkinId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const reviews = await db
    .select()
    .from(checkinReviews)
    .where(eq(checkinReviews.checkinId, checkinId))
    .limit(1);
  return mapCheckin(row, reviews[0] ?? null, nowIso());
}

async function loadMeasurementPayload(db: Db, measurementId: string) {
  const rows = await db
    .select()
    .from(measurements)
    .where(eq(measurements.id, measurementId))
    .limit(1);
  const row = rows[0];
  return row ? mapMeasurement(row) : null;
}

async function loadEffectivePlanPayload(db: Db, planVersionId: string) {
  const rows = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.id, planVersionId))
    .limit(1);
  const row = rows[0];
  return row ? mapPlanVersion(row) : null;
}

async function loadWorkoutAssignmentPayload(db: Db, assignmentId: string) {
  const rows = await db
    .select()
    .from(workoutAssignments)
    .where(eq(workoutAssignments.id, assignmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const exec = await db
    .select()
    .from(workoutExecutions)
    .where(eq(workoutExecutions.assignmentId, row.id))
    .limit(1);
  return mapWorkoutAssignment(row, exec[0] ?? null, nowIso());
}

async function loadMealAssignmentPayload(db: Db, assignmentId: string) {
  const rows = await db
    .select()
    .from(mealAssignments)
    .where(eq(mealAssignments.id, assignmentId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const complianceRows = await db
    .select()
    .from(mealCompliance)
    .where(eq(mealCompliance.assignmentId, row.id))
    .limit(1);
  return mapMealAssignment(row, complianceRows[0] ?? null, nowIso());
}

export async function loadChangePayload(
  db: Db,
  entityType: SyncEntityType,
  recordId: string,
): Promise<unknown | null> {
  switch (entityType) {
    case "workout_execution":
      return loadWorkoutExecutionPayload(db, recordId);
    case "meal_compliance":
      return loadMealCompliancePayload(db, recordId);
    case "checkin":
      return loadCheckinPayload(db, recordId);
    case "measurement":
      return loadMeasurementPayload(db, recordId);
    case "effective_plan":
      return loadEffectivePlanPayload(db, recordId);
    case "workout_assignment":
      return loadWorkoutAssignmentPayload(db, recordId);
    case "meal_assignment":
      return loadMealAssignmentPayload(db, recordId);
    default:
      return null;
  }
}

/**
 * Seeds change_log with current offline-capable records when the trainee has
 * never pulled before, so reconnect can start from an opaque cursor.
 */
export async function bootstrapChangeLogForTrainee(
  db: Db,
  traineeUserId: string,
  relationshipIds: string[],
): Promise<void> {
  if (relationshipIds.length === 0) return;

  const existing = await db
    .select({ id: changeLog.id })
    .from(changeLog)
    .where(eq(changeLog.traineeUserId, traineeUserId))
    .limit(1);
  if (existing[0]) return;

  const now = nowIso();

  for (const relationshipId of relationshipIds) {
    const planRows = await db
      .select({ version: planVersions })
      .from(plans)
      .innerJoin(planVersions, eq(planVersions.planId, plans.id))
      .where(
        and(
          eq(plans.coachingRelationshipId, relationshipId),
          eq(planVersions.status, "effective"),
        ),
      )
      .limit(1);
    if (planRows[0]) {
      await appendChangeLog(db, {
        entityType: "effective_plan",
        recordId: planRows[0].version.id,
        changeKind: "upsert",
        serverVersion: planRows[0].version.recordVersion,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: planRows[0].version.updatedAt,
      });
    }

    const workoutRows = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.coachingRelationshipId, relationshipId));
    for (const row of workoutRows) {
      await appendChangeLog(db, {
        entityType: "workout_assignment",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: 0,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt,
      });
    }

    const executionRows = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.coachingRelationshipId, relationshipId));
    for (const row of executionRows) {
      await appendChangeLog(db, {
        entityType: "workout_execution",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt,
      });
    }

    const mealRows = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.coachingRelationshipId, relationshipId));
    for (const row of mealRows) {
      await appendChangeLog(db, {
        entityType: "meal_assignment",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: 0,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt,
      });
    }

    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.coachingRelationshipId, relationshipId));
    for (const row of complianceRows) {
      await appendChangeLog(db, {
        entityType: "meal_compliance",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt,
      });
    }

    const checkinRows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.coachingRelationshipId, relationshipId));
    for (const row of checkinRows) {
      await appendChangeLog(db, {
        entityType: "checkin",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt,
      });
    }

    const measurementRows = await db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationshipId));
    for (const row of measurementRows) {
      await appendChangeLog(db, {
        entityType: "measurement",
        recordId: row.id,
        changeKind: "upsert",
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        traineeUserId,
        changedAt: row.updatedAt ?? now,
      });
    }
  }
}

export async function pullChangesForTrainee(
  db: Db,
  input: {
    traineeUserId: string;
    cursor: string | null;
    limit: number;
  },
): Promise<{
  changes: SyncChangeRecord[];
  nextCursor: string | null;
  hasMore: boolean;
  invalidCursor: boolean;
}> {
  const afterSeq = decodeSyncCursor(input.cursor);
  if (afterSeq < 0) {
    return {
      changes: [],
      nextCursor: null,
      hasMore: false,
      invalidCursor: true,
    };
  }

  const relationshipIds = await listTraineeRelationshipIds(
    db,
    input.traineeUserId,
  );
  await bootstrapChangeLogForTrainee(db, input.traineeUserId, relationshipIds);

  if (relationshipIds.length === 0) {
    return {
      changes: [],
      nextCursor: null,
      hasMore: false,
      invalidCursor: false,
    };
  }

  const rows = await db
    .select()
    .from(changeLog)
    .where(
      and(
        eq(changeLog.traineeUserId, input.traineeUserId),
        gt(changeLog.sequence, afterSeq),
        inArray(changeLog.coachingRelationshipId, relationshipIds),
      ),
    )
    .orderBy(asc(changeLog.sequence))
    .limit(input.limit + 1);

  const hasMore = rows.length > input.limit;
  const page = hasMore ? rows.slice(0, input.limit) : rows;

  const changes: SyncChangeRecord[] = [];
  for (const row of page) {
    const payload =
      row.changeKind === "tombstone"
        ? null
        : await loadChangePayload(
            db,
            row.entityType as SyncEntityType,
            row.recordId,
          );
    changes.push({
      sequence: row.sequence,
      entityType: row.entityType as SyncEntityType,
      recordId: row.recordId,
      changeKind: row.changeKind as "upsert" | "tombstone",
      serverVersion: row.serverVersion,
      coachingRelationshipId: row.coachingRelationshipId,
      changedAt: row.changedAt,
      payload,
    });
  }

  const last = page[page.length - 1];
  return {
    changes,
    nextCursor: last ? encodeSyncCursor(last.sequence) : null,
    hasMore,
    invalidCursor: false,
  };
}

export function mutationResultFromStored(body: string): SyncMutationResult {
  return JSON.parse(body) as SyncMutationResult;
}
