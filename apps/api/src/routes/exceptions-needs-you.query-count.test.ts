import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, desc, eq, isNull } from "drizzle-orm";
import { formatLocalDate } from "@fitbud/core";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createId } from "../lib/crypto.js";
import { isCoachLogWrite } from "../domain/exceptions.js";
import type { MemoryDbHandle } from "../test-support/memory-db.js";
import { createDemoSeededDb, prepareDemoSeededDb } from "../test-support/seeded-db.js";
import {
  DEMO_TRAINEE,
  DEMO_TRAINER,
  describeTrips,
  installRoundTripCounter,
  loginHeaders,
  measureRequest,
  type RoundTripCounter,
} from "../test-support/query-count.js";

/**
 * Z14-1 / D-W14-8: Needs you reads stored exceptions. It re-evaluates only
 * relationships last evaluated more than 15 minutes ago, all in one batched
 * pass, so even a cold load (every client due) is a fixed number of D1 round
 * trips however many clients the trainer has. Writes evaluate right after
 * they land.
 */
const SEED = "2026-10-26T00:30:00.000Z";
const NOW = "2026-10-27T09:00:00.000Z";
const ATTENTION = "/exceptions/attention?groupBy=relationship&limit=50";
const CAP = 12;

type Groups = { data: { needsYou: Array<{ relationshipId: string; items: Array<{ type: string }> }>; reviewed: unknown[] } };

async function trainerUserId(db: Db): Promise<string> {
  const [row] = await db
    .select({ userId: schema.userIdentities.userId })
    .from(schema.userIdentities)
    .where(eq(schema.userIdentities.emailNorm, DEMO_TRAINER));
  return row!.userId;
}

async function activeRelationships(db: Db, trainer: string) {
  return db
    .select({ id: schema.coachingRelationships.id })
    .from(schema.coachingRelationships)
    .where(
      and(
        eq(schema.coachingRelationships.trainerUserId, trainer),
        eq(schema.coachingRelationships.status, "active"),
      ),
    )
    .orderBy(schema.coachingRelationships.id);
}

/** Ends all but `keep` of the trainer's active clients (ended clients are not in Needs you). */
async function keepClients(db: Db, keep: number): Promise<void> {
  const trainer = await trainerUserId(db);
  const rels = await activeRelationships(db, trainer);
  for (const rel of rels.slice(keep)) {
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt: SEED, endedByUserId: trainer, updatedAt: SEED })
      .where(eq(schema.coachingRelationships.id, rel.id));
  }
}

function columnsOf(handle: MemoryDbHandle, table: string): string[] {
  const [result] = handle.sqlite.exec(`SELECT name FROM pragma_table_info('${table}')`);
  const columns = (result?.values ?? []).map((row) => String(row[0]));
  if (columns.length === 0) throw new Error(`no columns read for ${table}`);
  return columns;
}

/**
 * Adds clients to the demo trainer until they have `total` active ones. Each
 * new client is a real trainee (user, identity, role, profile, relationship)
 * whose last few days of meal and workout assignments mirror an existing demo
 * client's plan, so detection has real work to do for every one of them.
 */
async function growClients(handle: MemoryDbHandle, total: number): Promise<void> {
  const db = handle.db;
  const trainer = await trainerUserId(db);
  const rels = await activeRelationships(db, trainer);
  const source = rels[0]!.id;
  const mealColumns = columnsOf(handle, "meal_assignments");
  const workoutColumns = columnsOf(handle, "workout_assignments");
  const copy = (table: string, columns: string[], relationshipId: string) => {
    const select = columns
      .map((column) =>
        column === "id"
          ? "lower(hex(randomblob(16)))"
          : column === "coaching_relationship_id"
            ? `'${relationshipId}'`
            : `"${column}"`,
      )
      .join(", ");
    handle.sqlite.run(
      `INSERT INTO ${table} (${columns.map((c) => `"${c}"`).join(", ")})
       SELECT ${select} FROM ${table}
       WHERE coaching_relationship_id = ? AND local_date >= '2026-10-24'`,
      [source],
    );
  };
  for (let i = rels.length; i < total; i += 1) {
    const userId = createId();
    await db.insert(schema.users).values({
      id: userId,
      firebaseUid: `growth-${i}`,
      accountState: "active",
      timezone: "Asia/Kolkata",
      createdAt: SEED,
      updatedAt: SEED,
    });
    await db.insert(schema.userIdentities).values({
      userId,
      email: `growth.${i}@example.test`,
      emailNorm: `growth.${i}@example.test`,
      mobileE164: `+919800${String(100000 + i)}`,
      passwordHash: null,
      passwordUpdatedAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: SEED,
      updatedAt: SEED,
    });
    await db.insert(schema.userRoles).values({ id: createId(), userId, role: "trainee", createdAt: SEED });
    await db.insert(schema.traineeProfiles).values({
      id: createId(),
      userId,
      displayName: `Growth Client ${i}`,
      dateOfBirth: null,
      gender: null,
      createdAt: SEED,
      updatedAt: SEED,
    });
    const relationshipId = createId();
    await db.insert(schema.coachingRelationships).values({
      id: relationshipId,
      trainerUserId: trainer,
      traineeUserId: userId,
      status: "active",
      startedAt: SEED,
      createdAt: SEED,
      updatedAt: SEED,
    });
    copy("meal_assignments", mealColumns, relationshipId);
    copy("workout_assignments", workoutColumns, relationshipId);
  }
}

describe("Needs you: stored exceptions, flat round trips (Z14-1)", () => {
  let handle: MemoryDbHandle;
  let counter: RoundTripCounter;

  beforeAll(async () => {
    await prepareDemoSeededDb(SEED);
  }, 120_000);

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(NOW));
    handle = await createDemoSeededDb(SEED);
    counter = installRoundTripCounter(handle);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  /** `clients`: active clients to measure with; null = the demo seed as is. */
  async function coldAndWarm(clients: number | null) {
    const seeded = (await activeRelationships(handle.db, await trainerUserId(handle.db))).length;
    if (clients !== null && clients < seeded) await keepClients(handle.db, clients);
    if (clients !== null && clients > seeded) await growClients(handle, clients);
    const active = await activeRelationships(handle.db, await trainerUserId(handle.db));
    expect(active).toHaveLength(clients ?? seeded);
    const headers = await loginHeaders(DEMO_TRAINER, "trainer");
    const cold = await measureRequest(counter, ATTENTION, { headers });
    expect(cold.status).toBe(200);
    const warm = await measureRequest(counter, ATTENTION, { headers });
    expect(warm.status).toBe(200);
    return { cold, warm };
  }

  // The demo trainer has 21 clients, 19 of them active (Needs you lists active ones).
  it("answers a cold load (every client due) in the same number of round trips for 5, the demo's 21 and 40 clients", async () => {
    const counts: Record<string, { cold: number; warm: number; groups: number }> = {};
    for (const [key, clients] of [["5", 5], ["demo", null], ["40", 40]] as const) {
      if (key !== "5") {
        handle.close();
        handle = await createDemoSeededDb(SEED);
        counter = installRoundTripCounter(handle);
      }
      const { cold, warm } = await coldAndWarm(clients);
      expect(cold.roundTrips, describeTrips(cold.trips)).toBeLessThanOrEqual(CAP);
      expect(warm.roundTrips, describeTrips(warm.trips)).toBeLessThan(cold.roundTrips);
      expect(warm.body).toEqual(cold.body);
      const body = cold.body as Groups;
      counts[key] = {
        cold: cold.roundTrips,
        warm: warm.roundTrips,
        groups: body.data.needsYou.length + body.data.reviewed.length,
      };
    }
    expect(counts["5"]!.cold).toBe(counts.demo!.cold);
    expect(counts["40"]!.cold).toBe(counts.demo!.cold);
    expect(counts["5"]!.warm).toBe(counts.demo!.warm);
    expect(counts["40"]!.warm).toBe(counts.demo!.warm);
    // The added clients really were evaluated: their missed items show up.
    expect(counts["40"]!.groups).toBeGreaterThan(counts.demo!.groups);
  });

  it("re-evaluates only relationships last evaluated more than 15 minutes ago", async () => {
    const headers = await loginHeaders(DEMO_TRAINER, "trainer");
    const first = await measureRequest(counter, ATTENTION, { headers });
    const evaluates = (trips: typeof first.trips) =>
      trips.some((trip) => trip.sql.some((sql) => /insert into "scheduled_jobs"/i.test(sql)));
    expect(evaluates(first.trips)).toBe(true);

    vi.setSystemTime(new Date(Date.parse(NOW) + 10 * 60_000));
    const tenMinutes = await measureRequest(counter, ATTENTION, { headers });
    expect(evaluates(tenMinutes.trips)).toBe(false);

    vi.setSystemTime(new Date(Date.parse(NOW) + 16 * 60_000));
    const sixteenMinutes = await measureRequest(counter, ATTENTION, { headers });
    expect(evaluates(sixteenMinutes.trips)).toBe(true);
    expect(sixteenMinutes.roundTrips).toBe(first.roundTrips);
  });

  it("shows a trainee's skipped workout at once: the write evaluates, the read does not", async () => {
    const trainerHeaders = await loginHeaders(DEMO_TRAINER, "trainer");
    const traineeHeaders = await loginHeaders(DEMO_TRAINEE, "trainee");
    expect((await measureRequest(counter, ATTENTION, { headers: trainerHeaders })).status).toBe(200);

    const [rel] = await handle.db
      .select({ id: schema.coachingRelationships.id })
      .from(schema.coachingRelationships)
      .innerJoin(
        schema.userIdentities,
        eq(schema.userIdentities.userId, schema.coachingRelationships.traineeUserId),
      )
      .where(eq(schema.userIdentities.emailNorm, DEMO_TRAINEE));
    const today = formatLocalDate(new Date(NOW), "Asia/Kolkata");
    // A scheduled workout today or later that the trainee has not started.
    const [assignment] = await handle.db
      .select({ id: schema.workoutAssignments.id, localDate: schema.workoutAssignments.localDate })
      .from(schema.workoutAssignments)
      .leftJoin(
        schema.workoutExecutions,
        eq(schema.workoutExecutions.assignmentId, schema.workoutAssignments.id),
      )
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, rel!.id),
          eq(schema.workoutAssignments.localDate, today),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          isNull(schema.workoutExecutions.id),
        ),
      )
      .limit(1);
    expect(assignment, "demo trainee has an open workout today").toBeDefined();

    const resolvedCount = async (relationshipId: string) =>
      (
        await handle.db
          .select({ id: schema.exceptions.id })
          .from(schema.exceptions)
          .where(
            and(
              eq(schema.exceptions.coachingRelationshipId, relationshipId),
              eq(schema.exceptions.status, "resolved"),
            ),
          )
      ).length;
    const resolvedBefore = await resolvedCount(rel!.id);

    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));
    const skip = await measureRequest(counter, `/workouts/assignments/${assignment!.id}/skip`, {
      method: "POST",
      headers: { ...traineeHeaders, "Content-Type": "application/json", "Idempotency-Key": createId() },
      body: JSON.stringify({}),
    });
    expect(skip.status, JSON.stringify(skip.body)).toBe(200);

    vi.setSystemTime(new Date(Date.parse(NOW) + 2 * 60_000));
    const after = await measureRequest(counter, ATTENTION, { headers: trainerHeaders });
    const evaluated = after.trips.some((trip) =>
      trip.sql.some((sql) => /insert into "scheduled_jobs"/i.test(sql)),
    );
    expect(evaluated).toBe(false);
    const group = (after.body as Groups).data.needsYou.find((g) => g.relationshipId === rel!.id);
    expect(group?.items.map((item) => item.type)).toContain("skipped_workout");

    // Only the trainer resolves: the write and the read resolved nothing.
    expect(await resolvedCount(rel!.id)).toBe(resolvedBefore);
  });

  it("shows a trainer's coach-logged meal as logged later at once (the coach log evaluates)", async () => {
    const trainerHeaders = await loginHeaders(DEMO_TRAINER, "trainer");
    const first = await measureRequest(counter, ATTENTION, { headers: trainerHeaders });
    expect(first.status).toBe(200);
    const trainer = await trainerUserId(handle.db);

    // An open "Required meal still unlogged" item on one of the trainer's clients.
    const [open] = await handle.db
      .select({
        id: schema.exceptions.id,
        relationshipId: schema.exceptions.coachingRelationshipId,
        assignmentId: schema.exceptions.sourceEntityId,
        localDate: schema.mealAssignments.localDate,
      })
      .from(schema.exceptions)
      .innerJoin(
        schema.coachingRelationships,
        eq(schema.coachingRelationships.id, schema.exceptions.coachingRelationshipId),
      )
      .innerJoin(schema.mealAssignments, eq(schema.mealAssignments.id, schema.exceptions.sourceEntityId))
      .leftJoin(schema.mealCompliance, eq(schema.mealCompliance.assignmentId, schema.mealAssignments.id))
      .where(
        and(
          eq(schema.coachingRelationships.trainerUserId, trainer),
          eq(schema.coachingRelationships.status, "active"),
          eq(schema.exceptions.type, "overdue_meal"),
          eq(schema.exceptions.status, "active"),
          isNull(schema.mealCompliance.id),
        ),
      )
      // The most recent one: inside the detection window (the last 3 days).
      .orderBy(desc(schema.mealAssignments.localDate))
      .limit(1);
    expect(open, "demo seed has an unlogged required meal").toBeDefined();
    const itemsOf = (body: unknown) =>
      (body as Groups).data.needsYou
        .concat((body as { data: { reviewed: Groups["data"]["needsYou"] } }).data.reviewed)
        .flatMap((group) => group.items as Array<{ id: string; type: string; summary?: string }>);
    expect(itemsOf(first.body).find((item) => item.id === open!.id)?.summary).toMatch(
      /^Required meal still unlogged/,
    );
    const resolvedBefore = (
      await handle.db
        .select({ id: schema.exceptions.id })
        .from(schema.exceptions)
        .where(
          and(
            eq(schema.exceptions.coachingRelationshipId, open!.relationshipId),
            eq(schema.exceptions.status, "resolved"),
          ),
        )
    ).length;

    vi.setSystemTime(new Date(Date.parse(NOW) + 60_000));
    const log = await measureRequest(
      counter,
      `/meals/compliance/${open!.assignmentId}/${open!.localDate}`,
      {
        method: "PUT",
        headers: { ...trainerHeaders, "Content-Type": "application/json", "Idempotency-Key": createId() },
        body: JSON.stringify({ outcome: "confirmed" }),
      },
    );
    expect([200, 201], JSON.stringify(log.body)).toContain(log.status);

    // Well inside the 15 minutes: only the coach log's evaluation can explain a change.
    vi.setSystemTime(new Date(Date.parse(NOW) + 2 * 60_000));
    const after = await measureRequest(counter, ATTENTION, { headers: trainerHeaders });
    const readEvaluated = after.trips.some((trip) =>
      trip.sql.some((sql) => /insert into "scheduled_jobs"/i.test(sql)),
    );
    expect(readEvaluated).toBe(false);
    const item = itemsOf(after.body).find((entry) => entry.id === open!.id);
    expect(item?.type).toBe("meal_logged_later");
    expect(item?.summary).toMatch(/^Meal logged later: /);

    const resolvedAfter = (
      await handle.db
        .select({ id: schema.exceptions.id })
        .from(schema.exceptions)
        .where(
          and(
            eq(schema.exceptions.coachingRelationshipId, open!.relationshipId),
            eq(schema.exceptions.status, "resolved"),
          ),
        )
    ).length;
    expect(resolvedAfter).toBe(resolvedBefore);
  });
});

describe("which trainer writes evaluate (Z14-1, D-W14-8)", () => {
  it("coach logs evaluate; schedules, plans and notes stay on the 15-minute rule", () => {
    const id = "6f1c2a7e-0b3d-4e8f-9a1b-2c3d4e5f6a7b";
    expect(isCoachLogWrite("PUT", `/meals/compliance/${id}/2026-10-27`)).toBe(true);
    expect(isCoachLogWrite("POST", `/workouts/assignments/${id}/log`)).toBe(true);
    expect(isCoachLogWrite("PATCH", `/workouts/executions/${id}`)).toBe(true);
    expect(isCoachLogWrite("POST", `/checkins/relationships/${id}/schedule`)).toBe(false);
    expect(isCoachLogWrite("POST", `/checkins/relationships/${id}/notes`)).toBe(false);
    expect(isCoachLogWrite("POST", `/meals/relationships/${id}/assignments/generate`)).toBe(false);
    expect(isCoachLogWrite("GET", `/workouts/executions/${id}`)).toBe(false);
  });
});
