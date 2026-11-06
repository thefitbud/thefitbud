import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { SyncChangeRecord, SyncEntityType } from "@fitbud/contracts";
import type { Db } from "../db/client.js";
import {
  changeLog,
  checkins,
  mealAssignments,
  mealCompliance,
  measurements,
  plans,
  planVersions,
  workoutAssignments,
  workoutExecutions,
} from "../db/schema.js";
import { nowIso } from "../lib/crypto.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  appendChangeLog,
  bootstrapChangeLogForTrainee,
  decodeSyncCursor,
  encodeSyncCursor,
  listTraineeRelationshipIds,
  loadChangePayload,
  pullChangesForTrainee,
} from "./sync.js";

/**
 * Z6-21 / D-W6-12: a trainee's first GET /sync/pull bootstraps the change log
 * and loads one page of payloads in a bounded number of D1 queries that does
 * not grow with the trainee's record count, and returns exactly what the old
 * per-record path returned.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const FIXED_NOW = "2026-10-26T09:45:00.000Z";
/** Busiest demo trainee: one relationship, ~2,200 offline-capable records of every entity type. */
const SIDDHARTH = "531dbd10-f453-4793-ad5a-7f85c4ac8b97";
/** A second active demo trainee, bootstrapped after Siddharth to interleave global sequences. */
const RAJESH = "94d70e3b-dbf2-4920-827f-f34b8a0cafbe";
const FIRST_PULL_BUDGET = 50;
/** Before Z6-21, a later pull of a 50-row page took ~107 queries. */
const LATER_PULL_BUDGET = 107;
const PAGE = 50;
/** The reference (per-record) path makes thousands of queries by design; allow for a loaded CI box. */
const SLOW_TEST_MS = 60_000;

type GlobalWithNow = typeof globalThis & { FITBUD_NOW?: string };

// ---------------------------------------------------------------------------
// Reference: the per-record path as it was on `main` before Z6-21 (verbatim
// logic). Used only to prove the batched path returns identical responses
// and to record the "before" query counts.
// ---------------------------------------------------------------------------

async function referenceBootstrap(
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
  const base = { changeKind: "upsert" as const, traineeUserId };
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
        ...base,
        entityType: "effective_plan",
        recordId: planRows[0].version.id,
        serverVersion: planRows[0].version.recordVersion,
        coachingRelationshipId: relationshipId,
        changedAt: planRows[0].version.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(workoutAssignments)
      .where(eq(workoutAssignments.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "workout_assignment",
        recordId: row.id,
        serverVersion: 0,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(workoutExecutions)
      .where(eq(workoutExecutions.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "workout_execution",
        recordId: row.id,
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(mealAssignments)
      .where(eq(mealAssignments.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "meal_assignment",
        recordId: row.id,
        serverVersion: 0,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(mealCompliance)
      .where(eq(mealCompliance.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "meal_compliance",
        recordId: row.id,
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(checkins)
      .where(eq(checkins.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "checkin",
        recordId: row.id,
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt,
      });
    }
    for (const row of await db
      .select()
      .from(measurements)
      .where(eq(measurements.coachingRelationshipId, relationshipId))) {
      await appendChangeLog(db, {
        ...base,
        entityType: "measurement",
        recordId: row.id,
        serverVersion: row.recordVersion,
        coachingRelationshipId: relationshipId,
        changedAt: row.updatedAt ?? now,
      });
    }
  }
}

async function referencePull(
  db: Db,
  input: { traineeUserId: string; cursor: string | null; limit: number },
): Promise<Awaited<ReturnType<typeof pullChangesForTrainee>>> {
  const afterSeq = decodeSyncCursor(input.cursor);
  if (afterSeq < 0) {
    return { changes: [], nextCursor: null, hasMore: false, invalidCursor: true };
  }
  const relationshipIds = await listTraineeRelationshipIds(db, input.traineeUserId);
  await referenceBootstrap(db, input.traineeUserId, relationshipIds);
  if (relationshipIds.length === 0) {
    return { changes: [], nextCursor: null, hasMore: false, invalidCursor: false };
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
        : await loadChangePayload(db, row.entityType as SyncEntityType, row.recordId);
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

type PullFn = typeof pullChangesForTrainee;

/** Pulls every page for the trainee; returns all pages and the final cursor. */
async function drain(pull: PullFn, db: Db, traineeUserId: string, cursor: string | null = null) {
  const pages: Awaited<ReturnType<PullFn>>[] = [];
  let next = cursor;
  for (;;) {
    const page = await pull(db, { traineeUserId, cursor: next, limit: PAGE });
    pages.push(page);
    if (page.nextCursor) next = page.nextCursor;
    if (!page.hasMore) break;
  }
  return { pages, cursor: next };
}

// ---------------------------------------------------------------------------
// Fixture: a fresh trainee with N offline-capable records, cloned from the
// busiest demo client's persisted rows (same plan versions, real workout and
// meal prescriptions), so the rows look like real product data.
// ---------------------------------------------------------------------------

function columnsOf(handle: MemoryDbHandle, table: string): string[] {
  return (handle.sqlite.exec(`select cid, name from pragma_table_info('${table}')`)[0]?.values ?? []).map((row) =>
    String(row[1]),
  );
}

const NEW_ID = "lower(hex(randomblob(16)))";

function cloneRows(
  handle: MemoryDbHandle,
  table: string,
  overrides: Record<string, string>,
  where: string,
  params: unknown[],
  limit?: number,
): void {
  const cols = columnsOf(handle, table);
  const select = cols.map((col) => overrides[col] ?? `src."${col}"`).join(", ");
  handle.sqlite.run(
    `INSERT INTO ${table} (${cols.map((col) => `"${col}"`).join(", ")}) SELECT ${select} FROM ${table} src WHERE ${where} ORDER BY src.rowid${
      limit === undefined ? "" : ` LIMIT ${limit}`
    }`,
    params,
  );
}

function scalar(handle: MemoryDbHandle, query: string): string {
  return String(handle.sqlite.exec(query)[0]?.values[0]?.[0]);
}

/**
 * Creates trainee `traineeId` with one relationship to Siddharth's trainer and
 * `records` change-log-worthy rows: the effective plan, 10 workout
 * assignments, 20 meal assignments, and measurements for the rest.
 */
function seedFreshTrainee(handle: MemoryDbHandle, traineeId: string, records: number): void {
  const sourceRel = scalar(
    handle,
    `select id from coaching_relationships where trainee_user_id = '${SIDDHARTH}'`,
  );
  const relId = `${traineeId}-rel`;
  const planId = `${traineeId}-plan`;
  cloneRows(handle, "users", { id: "?", firebase_uid: "?" }, "src.id = ?", [
    traineeId,
    `fixture-${traineeId}`,
    SIDDHARTH,
  ]);
  cloneRows(
    handle,
    "coaching_relationships",
    { id: "?", trainee_user_id: "?", invitation_id: "NULL" },
    "src.id = ?",
    [relId, traineeId, sourceRel],
  );
  cloneRows(handle, "plans", { id: "?", coaching_relationship_id: "?" }, "src.coaching_relationship_id = ?", [
    planId,
    relId,
    sourceRel,
  ], 1);
  const sourcePlan = scalar(
    handle,
    `select plan_id from plan_versions where status = 'effective' and plan_id in (select id from plans where coaching_relationship_id = '${sourceRel}')`,
  );
  cloneRows(
    handle,
    "plan_versions",
    { id: "?", plan_id: "?" },
    "src.plan_id = ? AND src.status = 'effective'",
    [`${traineeId}-pv`, planId, sourcePlan],
    1,
  );
  // Same head at every size, so the first 50-row page has the same mix of
  // entity types; the size difference is all in the bootstrap.
  const workouts = 10;
  const meals = 20;
  const measures = records - 1 - workouts - meals;
  cloneRows(
    handle,
    "workout_assignments",
    { id: NEW_ID, coaching_relationship_id: "?" },
    "src.coaching_relationship_id = ?",
    [relId, sourceRel],
    workouts,
  );
  cloneRows(
    handle,
    "meal_assignments",
    { id: NEW_ID, coaching_relationship_id: "?" },
    "src.coaching_relationship_id = ?",
    [relId, sourceRel],
    meals,
  );
  // Repeat the source measurements as needed (they carry no unique key besides id).
  let left = measures;
  while (left > 0) {
    const take = Math.min(left, 100);
    cloneRows(
      handle,
      "measurements",
      {
        id: NEW_ID,
        coaching_relationship_id: "?",
        trainee_user_id: "?",
        checkin_id: "NULL",
        media_asset_id: "NULL",
      },
      "src.coaching_relationship_id = ?",
      [relId, traineeId, sourceRel],
      take,
    );
    left -= take;
  }
  const seeded =
    Number(scalar(handle, `select count(*) from workout_assignments where coaching_relationship_id = '${relId}'`)) +
    Number(scalar(handle, `select count(*) from meal_assignments where coaching_relationship_id = '${relId}'`)) +
    Number(scalar(handle, `select count(*) from measurements where coaching_relationship_id = '${relId}'`)) +
    1;
  expect(seeded).toBe(records);
}

async function countQueries<T>(handle: MemoryDbHandle, run: () => Promise<T>) {
  handle.queryCounter.reset();
  const result = await run();
  return { result, count: handle.queryCounter.count };
}

/**
 * Wraps `db` so `hook` runs when the bootstrap builds its change-log
 * INSERT … SELECT, i.e. after the "never pulled" check and the reads, just
 * before the write. Returns how many such inserts were built.
 */
function onBootstrapInsert(db: Db, hook: () => void): { db: Db; built: () => number } {
  let built = 0;
  const wrapped = new Proxy(db, {
    get(target, prop) {
      if (prop === "insert") {
        return (table: Parameters<Db["insert"]>[0]) => {
          const builder = target.insert(table);
          return new Proxy(builder, {
            get(b, p) {
              if (p === "select") {
                return (...args: Parameters<typeof b.select>) => {
                  built += 1;
                  hook();
                  return b.select(...args);
                };
              }
              const value = Reflect.get(b, p, b) as unknown;
              return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(b) : value;
            },
          });
        };
      }
      const value = Reflect.get(target, prop, target) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  });
  return { db: wrapped, built: () => built };
}

function changeLogStats(handle: MemoryDbHandle, traineeUserId: string) {
  const row = handle.sqlite.exec(
    `select count(*), count(distinct entity_type || ':' || record_id), count(distinct sequence)
       from change_log where trainee_user_id = '${traineeUserId}'`,
  )[0]!.values[0]!;
  return { rows: Number(row[0]), records: Number(row[1]), sequences: Number(row[2]) };
}

/** Offline-capable records the bootstrap must cover for the trainee (one relationship). */
function bootstrapRecordCount(handle: MemoryDbHandle, traineeUserId: string): number {
  return Number(
    scalar(
      handle,
      `select 1
          + (select count(*) from workout_assignments where coaching_relationship_id = r.id)
          + (select count(*) from workout_executions where coaching_relationship_id = r.id)
          + (select count(*) from meal_assignments where coaching_relationship_id = r.id)
          + (select count(*) from meal_compliance where coaching_relationship_id = r.id)
          + (select count(*) from checkins where coaching_relationship_id = r.id)
          + (select count(*) from measurements where coaching_relationship_id = r.id)
       from coaching_relationships r where r.trainee_user_id = '${traineeUserId}'`,
    ),
  );
}

describe("sync pull query count (Z6-21)", () => {
  const g = globalThis as GlobalWithNow;
  const previousNow = g.FITBUD_NOW;
  const open: MemoryDbHandle[] = [];
  const openDb = async () => {
    const handle = await createDemoSeededDb(SEED);
    open.push(handle);
    return handle;
  };

  beforeAll(async () => {
    // Payload mappers read "now" (overdue state); pin it so both paths agree.
    g.FITBUD_NOW = FIXED_NOW;
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  afterEach(() => {
    for (const handle of open.splice(0)) handle.close();
  });

  afterAll(() => {
    g.FITBUD_NOW = previousNow;
  });

  it(`first pull stays within ${FIRST_PULL_BUDGET} queries and does not grow from 50 to 500 records`, async () => {
    const counts: Record<number, { batched: number; reference: number }> = {};
    for (const size of [50, 500]) {
      const handle = await openDb();
      const trainee = `fixture-trainee-${size}`;
      seedFreshTrainee(handle, trainee, size);
      const batched = await countQueries(handle, () =>
        pullChangesForTrainee(handle.db, { traineeUserId: trainee, cursor: null, limit: PAGE }),
      );
      expect(batched.result.changes).toHaveLength(Math.min(size, PAGE));
      expect(
        Number(scalar(handle, `select count(*) from change_log where trainee_user_id = '${trainee}'`)),
      ).toBe(size);

      const refHandle = await openDb();
      seedFreshTrainee(refHandle, trainee, size);
      const reference = await countQueries(refHandle, () =>
        referencePull(refHandle.db, { traineeUserId: trainee, cursor: null, limit: PAGE }),
      );
      counts[size] = { batched: batched.count, reference: reference.count };
    }
    console.info(`[Z6-21] first pull D1 queries: ${JSON.stringify(counts)}`);
    expect(counts[50]!.batched).toBeLessThanOrEqual(FIRST_PULL_BUDGET);
    expect(counts[500]!.batched).toBeLessThanOrEqual(FIRST_PULL_BUDGET);
    expect(counts[500]!.batched).toBe(counts[50]!.batched);
    // The per-record path this replaces grew with the record count.
    expect(counts[500]!.reference).toBeGreaterThan(counts[50]!.reference + 400);
  }, SLOW_TEST_MS);

  it("first and later pulls for the busiest demo trainee stay within budget", async () => {
    const handle = await openDb();
    const records = Number(
      scalar(
        handle,
        `select (select count(*) from workout_assignments where coaching_relationship_id = r.id)
              + (select count(*) from workout_executions where coaching_relationship_id = r.id)
              + (select count(*) from meal_assignments where coaching_relationship_id = r.id)
              + (select count(*) from meal_compliance where coaching_relationship_id = r.id)
              + (select count(*) from checkins where coaching_relationship_id = r.id)
              + (select count(*) from measurements where coaching_relationship_id = r.id)
           from coaching_relationships r where r.trainee_user_id = '${SIDDHARTH}'`,
      ),
    );
    expect(records).toBeGreaterThan(2000);

    const first = await countQueries(handle, () =>
      pullChangesForTrainee(handle.db, { traineeUserId: SIDDHARTH, cursor: null, limit: PAGE }),
    );
    const second = await countQueries(handle, () =>
      pullChangesForTrainee(handle.db, {
        traineeUserId: SIDDHARTH,
        cursor: first.result.nextCursor,
        limit: PAGE,
      }),
    );
    // 100-row pages that straddle entity-type boundaries (workout assignments
    // into executions with their exercises and sets; meal compliance into
    // check-ins and measurements).
    const mixedCounts: number[] = [];
    for (const boundary of ["workout_execution", "checkin"]) {
      const cursor = encodeSyncCursor(
        Number(
          scalar(
            handle,
            `select min(sequence) from change_log where trainee_user_id = '${SIDDHARTH}' and entity_type = '${boundary}'`,
          ),
        ) - 50,
      );
      const mixed = await countQueries(handle, () =>
        pullChangesForTrainee(handle.db, { traineeUserId: SIDDHARTH, cursor, limit: 100 }),
      );
      expect(new Set(mixed.result.changes.map((c) => c.entityType)).size).toBeGreaterThanOrEqual(2);
      expect(mixed.count).toBeLessThanOrEqual(FIRST_PULL_BUDGET);
      mixedCounts.push(mixed.count);
    }

    const refHandle = await openDb();
    const refFirst = await countQueries(refHandle, () =>
      referencePull(refHandle.db, { traineeUserId: SIDDHARTH, cursor: null, limit: PAGE }),
    );
    const refSecond = await countQueries(refHandle, () =>
      referencePull(refHandle.db, {
        traineeUserId: SIDDHARTH,
        cursor: refFirst.result.nextCursor,
        limit: PAGE,
      }),
    );
    console.info(
      `[Z6-21] demo trainee (${records} records) D1 queries: first pull ${first.count} (was ${refFirst.count}), later pull ${second.count} (was ${refSecond.count}), mixed 100-row pages ${mixedCounts.join(", ")}`,
    );
    expect(first.count).toBeLessThanOrEqual(FIRST_PULL_BUDGET);
    expect(second.count).toBeLessThanOrEqual(LATER_PULL_BUDGET);
    expect(second.count).toBeLessThanOrEqual(refSecond.count);
  }, SLOW_TEST_MS);

  it("returns exactly what the per-record path returned: records, cursors, ordering, tombstones", async () => {
    const batchedDb = await openDb();
    const referenceDb = await openDb();

    const run = async (handle: MemoryDbHandle, pull: PullFn) => {
      const siddharth = await drain(pull, handle.db, SIDDHARTH);
      const rajesh = await drain(pull, handle.db, RAJESH);

      // Later changes on top of the bootstrap: a tombstone, an upsert of an
      // existing record, and an upsert whose record no longer exists.
      const relId = scalar(
        handle,
        `select id from coaching_relationships where trainee_user_id = '${SIDDHARTH}'`,
      );
      const measurement = scalar(
        handle,
        `select id from measurements where coaching_relationship_id = '${relId}' order by id limit 1`,
      );
      const checkin = scalar(
        handle,
        `select id from checkins where coaching_relationship_id = '${relId}' order by id limit 1`,
      );
      const execution = scalar(
        handle,
        `select id from workout_executions where coaching_relationship_id = '${relId}' order by id limit 1`,
      );
      const common = {
        coachingRelationshipId: relId,
        traineeUserId: SIDDHARTH,
        changedAt: FIXED_NOW,
      };
      await appendChangeLog(handle.db, {
        ...common,
        entityType: "measurement",
        recordId: measurement,
        changeKind: "tombstone",
        serverVersion: null,
      });
      await appendChangeLog(handle.db, {
        ...common,
        entityType: "checkin",
        recordId: checkin,
        changeKind: "upsert",
        serverVersion: 3,
      });
      await appendChangeLog(handle.db, {
        ...common,
        entityType: "workout_execution",
        recordId: execution,
        changeKind: "upsert",
        serverVersion: 4,
      });
      await appendChangeLog(handle.db, {
        ...common,
        entityType: "meal_compliance",
        recordId: "00000000-0000-4000-8000-00000000dead",
        changeKind: "upsert",
        serverVersion: 1,
      });
      const later = await drain(pull, handle.db, SIDDHARTH, siddharth.cursor);
      const caughtUp = await pull(handle.db, {
        traineeUserId: SIDDHARTH,
        cursor: later.cursor,
        limit: PAGE,
      });
      const invalid = await pull(handle.db, {
        traineeUserId: SIDDHARTH,
        cursor: "not-a-cursor",
        limit: PAGE,
      });
      return { siddharth, rajesh, later, caughtUp, invalid };
    };

    const batched = await run(batchedDb, pullChangesForTrainee);
    const reference = await run(referenceDb, referencePull);

    expect(batched.siddharth.pages.length).toBeGreaterThan(40);
    expect(batched.rajesh.pages.length).toBeGreaterThan(30);
    const allEntityTypes = new Set(
      batched.siddharth.pages.flatMap((page) => page.changes.map((change) => change.entityType)),
    );
    expect([...allEntityTypes].sort()).toEqual([
      "checkin",
      "effective_plan",
      "meal_assignment",
      "meal_compliance",
      "measurement",
      "workout_assignment",
      "workout_execution",
    ]);
    const laterChanges = batched.later.pages.flatMap((page) => page.changes);
    expect(laterChanges.map((change) => [change.changeKind, change.payload === null])).toEqual([
      ["tombstone", true],
      ["upsert", false],
      ["upsert", false],
      ["upsert", true],
    ]);
    expect(batched.invalid.invalidCursor).toBe(true);

    // Byte-for-byte: compare the serialized responses, not just deep equality.
    expect(JSON.stringify(batched)).toBe(JSON.stringify(reference));
  }, SLOW_TEST_MS);

  it("keeps the full bootstrap when another change-log write lands between the check and the insert", async () => {
    const handle = await openDb();
    const expected = bootstrapRecordCount(handle, SIDDHARTH);
    expect(expected).toBeGreaterThan(2000); // two insert chunks, so the batch path runs
    const relId = scalar(handle, `select id from coaching_relationships where trainee_user_id = '${SIDDHARTH}'`);
    const checkin = scalar(
      handle,
      `select id from checkins where coaching_relationship_id = '${relId}' order by id limit 1`,
    );
    let interleaved = false;
    const wrapped = onBootstrapInsert(handle.db, () => {
      if (interleaved) return;
      interleaved = true;
      // A sync push for one of the trainee's check-ins commits its change-log
      // row while the bootstrap is in flight (same shape as appendChangeLog).
      handle.sqlite.run(
        `insert into change_log (id, sequence, entity_type, record_id, change_kind, server_version,
           coaching_relationship_id, trainee_user_id, changed_at)
         values ('interleaved-push', (select coalesce(max(sequence), 0) + 1 from change_log),
           'checkin', ?, 'upsert', 2, ?, ?, ?)`,
        [checkin, relId, SIDDHARTH, FIXED_NOW],
      );
    });

    await bootstrapChangeLogForTrainee(wrapped.db, SIDDHARTH, [relId]);

    expect(interleaved).toBe(true);
    expect(wrapped.built()).toBe(2);
    // Every record has exactly one row: the pushed check-in keeps its own row
    // and nothing is lost or duplicated.
    expect(changeLogStats(handle, SIDDHARTH)).toEqual({
      rows: expected,
      records: expected,
      sequences: expected,
    });
    const pushedSeq = Number(scalar(handle, `select sequence from change_log where id = 'interleaved-push'`));
    const minBootstrapSeq = Number(
      scalar(handle, `select min(sequence) from change_log where trainee_user_id = '${SIDDHARTH}' and id <> 'interleaved-push'`),
    );
    expect(pushedSeq).toBeLessThan(minBootstrapSeq);

    // And the trainee's pull delivers every record.
    const { pages } = await drain(pullChangesForTrainee, handle.db, SIDDHARTH);
    const pulled = pages.flatMap((page) => page.changes);
    expect(pulled).toHaveLength(expected);
    expect(pulled.every((change) => change.payload !== null)).toBe(true);
  }, SLOW_TEST_MS);

  it("two concurrent first pulls lose no rows and write no duplicates", async () => {
    const handle = await openDb();
    const expected = bootstrapRecordCount(handle, SIDDHARTH);
    const wrapped = onBootstrapInsert(handle.db, () => undefined);

    const [a, b] = await Promise.all([
      pullChangesForTrainee(wrapped.db, { traineeUserId: SIDDHARTH, cursor: null, limit: PAGE }),
      pullChangesForTrainee(wrapped.db, { traineeUserId: SIDDHARTH, cursor: null, limit: PAGE }),
    ]);

    // Both requests passed the "never pulled" check and built their inserts
    // (two chunks each), so the race really ran.
    expect(wrapped.built()).toBe(4);
    expect(changeLogStats(handle, SIDDHARTH)).toEqual({
      rows: expected,
      records: expected,
      sequences: expected,
    });
    expect(a.changes.length + b.changes.length).toBeGreaterThan(0);
    const { pages } = await drain(pullChangesForTrainee, handle.db, SIDDHARTH);
    expect(pages.flatMap((page) => page.changes)).toHaveLength(expected);
  }, SLOW_TEST_MS);
});
