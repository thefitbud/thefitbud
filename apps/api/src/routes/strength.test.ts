import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  strengthReadModelSchema,
  type StrengthReadModel,
} from "@fitbud/contracts";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

/**
 * Z6-5: strength read model. The fixtures are the rows the workout logging flow
 * persists (assignment, execution, exercise, set) on a relationship created through
 * the real invitation flow; the endpoint reads them back through the production route.
 */

// 01:30 on Sun 18 Oct in Kolkata, still Sat 17 Oct in UTC: the 4w window must use the
// trainee's local date.
const FROZEN_NOW = "2026-10-17T20:00:00.000Z";

function dummyD1(): D1Database {
  return {
    prepare() {
      throw new Error("D1 should not be used when test DB override is set");
    },
    dump: async () => new ArrayBuffer(0),
    batch: async () => [],
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    ENVIRONMENT: "local",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
  };
}

async function reachCoachingReady(suffix: string) {
  const trainerToken = createTestIdToken(
    `trainer-strength-${suffix}`,
    `strength-coach-${suffix}@example.com`,
  );
  const session = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: trainerToken, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  const trainerCookie = session.headers.get("set-cookie")!.split(";")[0]!;
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainerCookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-strength-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `strength-trainee-${suffix}@example.com`,
        recipientDisplayName: `Strength Trainee ${suffix}`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `strength-trainee-${suffix}`,
    `strength-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: createdBody.data.token }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  return {
    trainer: { Cookie: trainerCookie } as Record<string, string>,
    trainee: {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
    } as Record<string, string>,
    relationshipId: acceptBody.data.relationship.id,
    traineeUserId: acceptBody.data.relationship.traineeUserId,
  };
}

/**
 * The shared D1 test double (`test-support/d1-sqlite.ts`) answers `batch()` with empty
 * `results`, which is enough for write batches but hides every row a read batch
 * returns. Real D1 returns each statement's rows in `results`, so for these tests the
 * double's `batch` is replaced by one that does the same.
 */
function returnRowsFromBatch(db: Db): void {
  const d1 = (db as unknown as { $client: D1Database }).$client;
  d1.batch = (async (statements: D1PreparedStatement[]) =>
    Promise.all(statements.map((statement) => statement.all()))) as typeof d1.batch;
}

type SetFixture = {
  label: string | null;
  kg: number | null;
  kind: "kg" | "bodyweight" | "bodyweight_plus" | "text";
  reps: number | null;
  status?: "completed" | "modified" | "pending" | "skipped";
};
type ExerciseFixture = { exerciseId: string; name: string; sets: SetFixture[] };

async function seedPlan(db: Db, relationshipId: string) {
  const now = nowIso();
  const planId = createId();
  const versionId = createId();
  await db.insert(schema.plans).values({
    id: planId,
    coachingRelationshipId: relationshipId,
    title: "Strength block",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.planVersions).values({
    id: versionId,
    planId,
    versionNumber: 1,
    recordVersion: 0,
    status: "effective",
    contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
    creationSource: "blank",
    publishedAt: now,
    effectiveFrom: now,
    effectiveTo: null,
    createdAt: now,
    updatedAt: now,
  });
  return { planId, versionId };
}

async function seedSession(
  db: Db,
  plan: { planId: string; versionId: string },
  who: { relationshipId: string; traineeUserId: string },
  input: {
    localDate: string;
    status: "completed" | "modified" | "skipped" | "started";
    exercises?: ExerciseFixture[];
  },
): Promise<void> {
  const now = nowIso();
  const assignmentId = createId();
  const workoutDayId = createId();
  await db.insert(schema.workoutAssignments).values({
    id: assignmentId,
    coachingRelationshipId: who.relationshipId,
    planId: plan.planId,
    planVersionId: plan.versionId,
    workoutDayId,
    workoutDayName: "Lower",
    workoutDayJson: JSON.stringify({ id: workoutDayId, order: 1, name: "Lower", exercises: [] }),
    localDate: input.localDate,
    windowStartsAt: `${input.localDate}T00:00:00.000Z`,
    windowEndsAt: `${input.localDate}T23:59:59.000Z`,
    scheduleStatus: "scheduled",
    createdAt: now,
    updatedAt: now,
  });
  const executionId = createId();
  await db.insert(schema.workoutExecutions).values({
    id: executionId,
    assignmentId,
    coachingRelationshipId: who.relationshipId,
    planVersionId: plan.versionId,
    traineeUserId: who.traineeUserId,
    status: input.status,
    recordVersion: 0,
    startedAt: `${input.localDate}T06:00:00.000Z`,
    completedAt:
      input.status === "completed" || input.status === "modified"
        ? `${input.localDate}T07:00:00.000Z`
        : null,
    createdAt: now,
    updatedAt: now,
  });
  let exerciseOrder = 0;
  for (const exercise of input.exercises ?? []) {
    exerciseOrder += 1;
    const exerciseExecutionId = createId();
    await db.insert(schema.exerciseExecutions).values({
      id: exerciseExecutionId,
      workoutExecutionId: executionId,
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      order: exerciseOrder,
      status: "completed",
      createdAt: now,
      updatedAt: now,
    });
    let setOrder = 0;
    for (const set of exercise.sets) {
      setOrder += 1;
      await db.insert(schema.setExecutions).values({
        id: createId(),
        exerciseExecutionId,
        setTargetId: createId(),
        order: setOrder,
        status: set.status ?? "completed",
        prescribedReps: set.reps,
        prescribedLoadLabel: null,
        actualReps: set.reps,
        actualLoadLabel: set.label,
        prescribedLoadKg: null,
        actualLoadKg: set.kg,
        loadKind: set.kind,
        completedAt: `${input.localDate}T06:30:00.000Z`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

const SQUAT = "ex-back-squat";
const BENCH = "ex-bench-press";
const PULL = "ex-pull-up";

const kg = (value: number, reps: number, status?: SetFixture["status"]): SetFixture => ({
  label: `${value} kg`,
  kg: value,
  kind: "kg",
  reps,
  status,
});

async function seedStrengthHistory(
  db: Db,
  who: { relationshipId: string; traineeUserId: string },
) {
  const plan = await seedPlan(db, who.relationshipId);
  const ex = (exerciseId: string, name: string, sets: SetFixture[]) => ({
    exerciseId,
    name,
    sets,
  });
  const days: Array<Parameters<typeof seedSession>[3]> = [
    { localDate: "2026-05-04", status: "completed", exercises: [ex(SQUAT, "Back Squat", [kg(50, 5)])] },
    { localDate: "2026-09-01", status: "completed", exercises: [ex(SQUAT, "Back Squat", [kg(70, 5)])] },
    // 20 Sep is inside a UTC-based 4w window but outside the trainee's local one.
    { localDate: "2026-09-20", status: "completed", exercises: [ex(BENCH, "Bench Press", [kg(40, 8)])] },
    { localDate: "2026-09-21", status: "completed", exercises: [ex(BENCH, "Bench Press", [kg(42.5, 8)])] },
    {
      localDate: "2026-10-12",
      status: "completed",
      exercises: [
        ex(SQUAT, "Back Squat", [
          kg(60, 5),
          kg(80, 3),
          kg(80, 5), // ties on load: more reps wins
          { label: "heavy", kg: null, kind: "text", reps: 3 },
          kg(100, 1, "pending"), // not logged yet
        ]),
        ex(PULL, "Pull-up", [
          { label: "BW+10", kg: 10, kind: "bodyweight_plus", reps: 8 },
          { label: "BW", kg: null, kind: "bodyweight", reps: 12 },
        ]),
      ],
    },
    { localDate: "2026-10-14", status: "modified", exercises: [ex(SQUAT, "Back Squat", [kg(85, 3)])] },
    { localDate: "2026-10-15", status: "skipped", exercises: [ex(SQUAT, "Back Squat", [kg(90, 1, "skipped")])] },
    { localDate: "2026-10-16", status: "started" },
  ];
  for (const day of days) await seedSession(db, plan, who, day);
}

describe("GET /strength/relationships/:relationshipId", () => {
  let handle: MemoryDbHandle;
  let db: Db;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date(FROZEN_NOW));
    handle = await createMemoryDb();
    db = handle.db;
    returnRowsFromBatch(db);
    setTestDbOverride(db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  async function setup() {
    const client = await reachCoachingReady("a");
    await db
      .update(schema.users)
      .set({ timezone: "Asia/Kolkata" })
      .where(eq(schema.users.id, client.traineeUserId));
    await seedStrengthHistory(db, client);
    return client;
  }

  async function get(
    client: { relationshipId: string; trainer: Record<string, string> },
    query = "",
  ) {
    const response = await app.request(
      `/strength/relationships/${client.relationshipId}${query}`,
      { headers: client.trainer },
      testEnv(),
    );
    return response;
  }

  async function model(
    client: { relationshipId: string; trainer: Record<string, string> },
    query = "",
  ): Promise<StrengthReadModel> {
    const response = await get(client, query);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: unknown };
    return strengthReadModelSchema.parse(body.data);
  }

  const pt = (localDate: string, topLoadKg: number, reps: number) => ({
    localDate,
    topLoadKg,
    reps,
  });

  it("12w (the default): top set per day, bodyweight-plus added kg, uncharted text sets", async () => {
    const client = await setup();
    const explicit = await model(client, "?range=12w");
    const byDefault = await model(client);
    expect(byDefault).toEqual(explicit);

    expect(explicit.exercises).toEqual([
      {
        exerciseId: SQUAT,
        name: "Back Squat",
        points: [pt("2026-09-01", 70, 5), pt("2026-10-12", 80, 5), pt("2026-10-14", 85, 3)],
      },
      {
        exerciseId: BENCH,
        name: "Bench Press",
        points: [pt("2026-09-20", 40, 8), pt("2026-09-21", 42.5, 8)],
      },
      { exerciseId: PULL, name: "Pull-up", points: [pt("2026-10-12", 10, 8)] },
    ]);
    // Only "heavy" (kind text) is counted. "BW" (plain bodyweight) is neither charted nor
    // counted; the pending and
    // skipped sets were never logged.
    expect(explicit.notCharted).toEqual({ sets: 1 });
  });

  it("counts finished workouts per Monday week, filling empty weeks, started and skipped excluded", async () => {
    const client = await setup();
    const { workoutsPerWeek } = await model(client, "?range=12w");
    const counts = Object.fromEntries(workoutsPerWeek.map((w) => [w.weekStart, w.count]));
    // Trainee-local today is Sun 18 Oct, so the 84-day window starts Mon 27 Jul.
    expect(workoutsPerWeek[0]).toEqual({ weekStart: "2026-07-27", count: 0 });
    expect(workoutsPerWeek.at(-1)).toEqual({ weekStart: "2026-10-12", count: 2 });
    expect(workoutsPerWeek).toHaveLength(12);
    expect(counts["2026-08-31"]).toBe(1);
    expect(counts["2026-09-14"]).toBe(1); // Sun 20 Sep belongs to the week of Mon 14 Sep
    expect(counts["2026-09-21"]).toBe(1);
    expect(counts["2026-10-12"]).toBe(2); // 12 Oct completed + 14 Oct modified; 15 Oct skipped and 16 Oct started not counted
  });

  it("4w uses the trainee's local date: 20 Sep is out, 21 Sep is in", async () => {
    const client = await setup();
    const body = await model(client, "?range=4w");
    expect(body.exercises.map((e) => [e.exerciseId, e.points.map((p) => p.localDate)])).toEqual([
      [SQUAT, ["2026-10-12", "2026-10-14"]],
      [BENCH, ["2026-09-21"]],
      [PULL, ["2026-10-12"]],
    ]);
    expect(body.workoutsPerWeek).toEqual([
      { weekStart: "2026-09-21", count: 1 },
      { weekStart: "2026-09-28", count: 0 },
      { weekStart: "2026-10-05", count: 0 },
      { weekStart: "2026-10-12", count: 2 },
    ]);
    expect(body.notCharted).toEqual({ sets: 1 });
  });

  it("all: starts at the first workout week and includes the oldest set", async () => {
    const client = await setup();
    const body = await model(client, "?range=all");
    expect(body.exercises.find((e) => e.exerciseId === SQUAT)?.points[0]).toEqual(
      pt("2026-05-04", 50, 5),
    );
    expect(body.workoutsPerWeek[0]).toEqual({ weekStart: "2026-05-04", count: 1 });
    expect(body.workoutsPerWeek.at(-1)).toEqual({ weekStart: "2026-10-12", count: 2 });
    expect(body.workoutsPerWeek).toHaveLength(24);
  });

  it("from and to (inclusive, local dates) replace the range", async () => {
    const client = await setup();
    const body = await model(client, "?range=4w&from=2026-10-12&to=2026-10-12");
    expect(body.exercises.map((e) => [e.exerciseId, e.points])).toEqual([
      [SQUAT, [pt("2026-10-12", 80, 5)]],
      [PULL, [pt("2026-10-12", 10, 8)]],
    ]);
    expect(body.workoutsPerWeek).toEqual([{ weekStart: "2026-10-12", count: 1 }]);
    expect(body.notCharted).toEqual({ sets: 1 });
  });

  it("plain bodyweight sets are neither charted nor counted as not charted", async () => {
    const client = await reachCoachingReady("bw");
    const plan = await seedPlan(db, client.relationshipId);
    await seedSession(db, plan, client, {
      localDate: "2026-10-12",
      status: "completed",
      exercises: [
        {
          exerciseId: PULL,
          name: "Pull-up",
          sets: [
            { label: "BW", kg: null, kind: "bodyweight", reps: 12 },
            { label: "BW", kg: null, kind: "bodyweight", reps: 10 },
          ],
        },
      ],
    });
    const body = await model(client, "?range=all");
    expect(body.exercises).toEqual([]);
    expect(body.notCharted).toEqual({ sets: 0 });
  });

  it("another client's sets never appear", async () => {
    const client = await setup();
    const other = await reachCoachingReady("b");
    await seedStrengthHistory(db, other);
    await seedSession(db, await seedPlan(db, other.relationshipId), other, {
      localDate: "2026-10-13",
      status: "completed",
      exercises: [{ exerciseId: SQUAT, name: "Back Squat", sets: [kg(300, 1)] }],
    });
    const body = await model(client, "?range=all");
    const squatTops = body.exercises.find((e) => e.exerciseId === SQUAT)!.points.map((p) => p.topLoadKg);
    expect(squatTops).not.toContain(300);
  });

  it("a client with no sets gets empty exercises and zero counts", async () => {
    const empty = await reachCoachingReady("empty");
    const body = await model(empty, "?range=4w");
    expect(body.exercises).toEqual([]);
    expect(body.notCharted).toEqual({ sets: 0 });
    expect(body.workoutsPerWeek.every((w) => w.count === 0)).toBe(true);
  });

  it("rejects an invalid range or dates with a static 400", async () => {
    const client = await setup();
    for (const query of [
      "?range=1y",
      "?from=2026-10-14&to=2026-10-12",
      "?from=2026-02-31",
      "?to=14-10-2026",
    ]) {
      const response = await get(client, query);
      expect(response.status, query).toBe(400);
      const body = (await response.json()) as { error: { code: string; message: string } };
      expect(body.error.code).toBe("INVALID_REQUEST");
      expect(body.error.message).toBe("Invalid strength filter.");
    }
  });

  it("reads through one D1 batch of three statements and no other query", async () => {
    const client = await setup();
    const d1 = (db as unknown as { $client: D1Database }).$client;
    const batchSizes: number[] = [];
    const originalBatch = d1.batch.bind(d1);
    d1.batch = (async (statements: D1PreparedStatement[]) => {
      batchSizes.push(statements.length);
      return originalBatch(statements);
    }) as typeof d1.batch;
    try {
      // The invalid request pays only the auth cost, so the difference is the route's own queries.
      handle.queryCounter.reset();
      expect((await get(client, "?range=1y")).status).toBe(400);
      const authOnly = handle.queryCounter.count;
      batchSizes.length = 0;

      handle.queryCounter.reset();
      expect((await get(client, "?range=all")).status).toBe(200);
      const total = handle.queryCounter.count;

      expect(total - authOnly).toBe(3);
      expect(batchSizes).toEqual([3]);
    } finally {
      d1.batch = originalBatch;
    }
  });
});
