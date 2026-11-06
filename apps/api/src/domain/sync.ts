import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
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
 * Binds a list of ids as ONE parameter (`json_each`), so a group load is one
 * query whatever its size and never meets D1's 100-bound-parameter limit.
 */
function inJsonList(column: AnyColumn, ids: readonly string[]): SQL {
  return sql`${column} in (select value from json_each(${JSON.stringify(ids)}))`;
}

type PayloadMap = Map<string, unknown>;

async function loadWorkoutExecutionPayloads(
  db: Db,
  ids: string[],
): Promise<PayloadMap> {
  const out: PayloadMap = new Map();
  const executions = await db
    .select()
    .from(workoutExecutions)
    .where(inJsonList(workoutExecutions.id, ids));
  if (executions.length === 0) return out;
  const executionIds = executions.map((row) => row.id);
  const exercises = await db
    .select()
    .from(exerciseExecutions)
    .where(inJsonList(exerciseExecutions.workoutExecutionId, executionIds));
  const sets =
    exercises.length === 0
      ? []
      : await db
          .select()
          .from(setExecutions)
          .where(
            sql`${setExecutions.exerciseExecutionId} in (select ${exerciseExecutions.id} from ${exerciseExecutions} where ${inJsonList(exerciseExecutions.workoutExecutionId, executionIds)})`,
          );
  for (const execution of executions) {
    // mapWorkoutExecution / mapExerciseExecution filter children by parent id.
    out.set(execution.id, mapWorkoutExecution(execution, exercises, sets));
  }
  return out;
}

async function loadMealCompliancePayloads(
  db: Db,
  ids: string[],
): Promise<PayloadMap> {
  const rows = await db
    .select()
    .from(mealCompliance)
    .where(inJsonList(mealCompliance.id, ids));
  return new Map(rows.map((row) => [row.id, mapMealCompliance(row)]));
}

async function loadCheckinPayloads(
  db: Db,
  ids: string[],
  now: string,
): Promise<PayloadMap> {
  const out: PayloadMap = new Map();
  const rows = await db
    .select()
    .from(checkins)
    .where(inJsonList(checkins.id, ids));
  if (rows.length === 0) return out;
  // checkin_reviews_checkin_uidx: at most one review per check-in.
  const reviews = await db
    .select()
    .from(checkinReviews)
    .where(
      inJsonList(
        checkinReviews.checkinId,
        rows.map((row) => row.id),
      ),
    );
  const reviewByCheckin = new Map(
    reviews.map((review) => [review.checkinId, review]),
  );
  for (const row of rows) {
    out.set(row.id, mapCheckin(row, reviewByCheckin.get(row.id) ?? null, now));
  }
  return out;
}

async function loadMeasurementPayloads(
  db: Db,
  ids: string[],
): Promise<PayloadMap> {
  const rows = await db
    .select()
    .from(measurements)
    .where(inJsonList(measurements.id, ids));
  return new Map(rows.map((row) => [row.id, mapMeasurement(row)]));
}

async function loadEffectivePlanPayloads(
  db: Db,
  ids: string[],
): Promise<PayloadMap> {
  const rows = await db
    .select()
    .from(planVersions)
    .where(inJsonList(planVersions.id, ids));
  return new Map(rows.map((row) => [row.id, mapPlanVersion(row)]));
}

async function loadWorkoutAssignmentPayloads(
  db: Db,
  ids: string[],
  now: string,
): Promise<PayloadMap> {
  const out: PayloadMap = new Map();
  const rows = await db
    .select()
    .from(workoutAssignments)
    .where(inJsonList(workoutAssignments.id, ids));
  if (rows.length === 0) return out;
  // workout_executions_assignment_uidx: at most one execution per assignment.
  const executions = await db
    .select()
    .from(workoutExecutions)
    .where(
      inJsonList(
        workoutExecutions.assignmentId,
        rows.map((row) => row.id),
      ),
    );
  const executionByAssignment = new Map(
    executions.map((execution) => [execution.assignmentId, execution]),
  );
  for (const row of rows) {
    out.set(
      row.id,
      mapWorkoutAssignment(row, executionByAssignment.get(row.id) ?? null, now),
    );
  }
  return out;
}

async function loadMealAssignmentPayloads(
  db: Db,
  ids: string[],
  now: string,
): Promise<PayloadMap> {
  const out: PayloadMap = new Map();
  const rows = await db
    .select()
    .from(mealAssignments)
    .where(inJsonList(mealAssignments.id, ids));
  if (rows.length === 0) return out;
  // meal_compliance_assignment_uidx: at most one compliance row per assignment.
  const complianceRows = await db
    .select()
    .from(mealCompliance)
    .where(
      inJsonList(
        mealCompliance.assignmentId,
        rows.map((row) => row.id),
      ),
    );
  const complianceByAssignment = new Map(
    complianceRows.map((row) => [row.assignmentId, row]),
  );
  for (const row of rows) {
    out.set(
      row.id,
      mapMealAssignment(row, complianceByAssignment.get(row.id) ?? null, now),
    );
  }
  return out;
}

/**
 * Loads the payloads for one page of change rows with a fixed number of
 * queries per entity type present (at most 3), instead of 1–3 per row.
 * Returns a map keyed by `${entityType}:${recordId}`; a missing key means the
 * record no longer exists (payload null, as before).
 */
async function loadChangePayloads(
  db: Db,
  rows: ReadonlyArray<{ entityType: string; recordId: string }>,
  now: string,
): Promise<PayloadMap> {
  const idsByType = new Map<SyncEntityType, string[]>();
  for (const row of rows) {
    const type = row.entityType as SyncEntityType;
    const list = idsByType.get(type) ?? [];
    if (!list.includes(row.recordId)) list.push(row.recordId);
    idsByType.set(type, list);
  }

  const out: PayloadMap = new Map();
  for (const [type, ids] of idsByType) {
    let loaded: PayloadMap;
    switch (type) {
      case "workout_execution":
        loaded = await loadWorkoutExecutionPayloads(db, ids);
        break;
      case "meal_compliance":
        loaded = await loadMealCompliancePayloads(db, ids);
        break;
      case "checkin":
        loaded = await loadCheckinPayloads(db, ids, now);
        break;
      case "measurement":
        loaded = await loadMeasurementPayloads(db, ids);
        break;
      case "effective_plan":
        loaded = await loadEffectivePlanPayloads(db, ids);
        break;
      case "workout_assignment":
        loaded = await loadWorkoutAssignmentPayloads(db, ids, now);
        break;
      case "meal_assignment":
        loaded = await loadMealAssignmentPayloads(db, ids, now);
        break;
      default:
        loaded = new Map();
    }
    for (const [recordId, payload] of loaded) {
      out.set(`${type}:${recordId}`, payload);
    }
  }
  return out;
}

/**
 * One bootstrap change-log row, as a compact JSON tuple:
 * [id, entityType, recordId, serverVersion, coachingRelationshipId, changedAt].
 */
type BootstrapRow = [
  string,
  SyncEntityType,
  string,
  number | null,
  string,
  string,
];

/**
 * Rows per bootstrap INSERT. The whole chunk is bound as one JSON parameter
 * (~120 bytes a row, so ~240 KB a chunk), well under D1's 2 MB value limit and
 * clear of its 100-bound-parameter limit. The demo seed's busiest trainee
 * (~3,500 records) needs two statements.
 */
const BOOTSTRAP_INSERT_CHUNK = 2000;

function bootstrapInsert(
  db: Db,
  traineeUserId: string,
  chunk: BootstrapRow[],
  rowsBefore: number,
) {
  // Sequences continue from the current maximum in array order (json_each
  // `key` is the 0-based index), so the log order equals the read order.
  // The guard makes the chunk a no-op if another request bootstrapped this
  // trainee in the meantime (count differs from what this run has written).
  // Column order follows the table definition (drizzle insert-select):
  // id, sequence, entity_type, record_id, change_kind, server_version,
  // coaching_relationship_id, trainee_user_id, changed_at.
  return db.insert(changeLog).select(sql`
    select
      json_extract(value, '$[0]'),
      (select coalesce(max(${changeLog.sequence}), 0) from ${changeLog}) + key + 1,
      json_extract(value, '$[1]'),
      json_extract(value, '$[2]'),
      'upsert',
      json_extract(value, '$[3]'),
      json_extract(value, '$[4]'),
      ${traineeUserId},
      json_extract(value, '$[5]')
    from json_each(${JSON.stringify(chunk)})
    where (
      select count(*) from ${changeLog}
      where ${changeLog.traineeUserId} = ${traineeUserId}
    ) = ${rowsBefore}
  `);
}

/**
 * Seeds change_log with current offline-capable records when the trainee has
 * never pulled before, so reconnect can start from an opaque cursor.
 *
 * Reads stay one query per entity type per relationship (the same queries,
 * in the same order, as the per-record version), and the change-log rows are
 * written in chunked multi-row INSERTs, so the query count depends on the
 * number of relationships, not on the number of records (Z6-21, D-W6-12).
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
  const pending: BootstrapRow[] = [];

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
      pending.push([
        createId(),
        "effective_plan",
        planRows[0].version.id,
        planRows[0].version.recordVersion,
        relationshipId,
        planRows[0].version.updatedAt,
      ]);
    }

    const workoutRows = await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.coachingRelationshipId, relationshipId));
    for (const row of workoutRows) {
      pending.push([
        createId(),
        "workout_assignment",
        row.id,
        0,
        relationshipId,
        row.updatedAt,
      ]);
    }

    const executionRows = await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.coachingRelationshipId, relationshipId));
    for (const row of executionRows) {
      pending.push([
        createId(),
        "workout_execution",
        row.id,
        row.recordVersion,
        relationshipId,
        row.updatedAt,
      ]);
    }

    const mealRows = await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.coachingRelationshipId, relationshipId));
    for (const row of mealRows) {
      pending.push([
        createId(),
        "meal_assignment",
        row.id,
        0,
        relationshipId,
        row.updatedAt,
      ]);
    }

    const complianceRows = await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.coachingRelationshipId, relationshipId));
    for (const row of complianceRows) {
      pending.push([
        createId(),
        "meal_compliance",
        row.id,
        row.recordVersion,
        relationshipId,
        row.updatedAt,
      ]);
    }

    const checkinRows = await db
      .select()
      .from(checkins)
      .where(eq(checkins.coachingRelationshipId, relationshipId));
    for (const row of checkinRows) {
      pending.push([
        createId(),
        "checkin",
        row.id,
        row.recordVersion,
        relationshipId,
        row.updatedAt,
      ]);
    }

    const measurementRows = await db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationshipId));
    for (const row of measurementRows) {
      pending.push([
        createId(),
        "measurement",
        row.id,
        row.recordVersion,
        relationshipId,
        row.updatedAt ?? now,
      ]);
    }
  }

  if (pending.length === 0) return;

  const statements = [];
  for (let start = 0; start < pending.length; start += BOOTSTRAP_INSERT_CHUNK) {
    statements.push(
      bootstrapInsert(
        db,
        traineeUserId,
        pending.slice(start, start + BOOTSTRAP_INSERT_CHUNK),
        start,
      ),
    );
  }
  const [first, ...rest] = statements;
  if (rest.length === 0) {
    await first!;
  } else {
    // One D1 batch = one transaction: either every chunk lands or none.
    await db.batch([first!, ...rest]);
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

  const payloads = await loadChangePayloads(
    db,
    page.filter((row) => row.changeKind !== "tombstone"),
    nowIso(),
  );

  const changes: SyncChangeRecord[] = page.map((row) => ({
    sequence: row.sequence,
    entityType: row.entityType as SyncEntityType,
    recordId: row.recordId,
    changeKind: row.changeKind as "upsert" | "tombstone",
    serverVersion: row.serverVersion,
    coachingRelationshipId: row.coachingRelationshipId,
    changedAt: row.changedAt,
    payload:
      row.changeKind === "tombstone"
        ? null
        : (payloads.get(`${row.entityType}:${row.recordId}`) ?? null),
  }));

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
