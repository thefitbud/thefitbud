import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

/** Z6-5 authorization: who may read a relationship's strength read model. */

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
    `trainer-sauthz-${suffix}`,
    `sauthz-coach-${suffix}@example.com`,
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
        "Idempotency-Key": `inv-sauthz-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `sauthz-trainee-${suffix}@example.com`,
        recipientDisplayName: `Authz Trainee ${suffix}`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `sauthz-trainee-${suffix}`,
    `sauthz-trainee-${suffix}@example.com`,
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

/** One finished workout with one logged 80 kg set, on the relationship. */
async function seedLoggedSet(db: Db, who: { relationshipId: string; traineeUserId: string }) {
  const now = nowIso();
  const planId = createId();
  const versionId = createId();
  const workoutDayId = createId();
  const localDate = "2026-10-12";
  await db.insert(schema.plans).values({
    id: planId,
    coachingRelationshipId: who.relationshipId,
    title: "Block",
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
  const assignmentId = createId();
  await db.insert(schema.workoutAssignments).values({
    id: assignmentId,
    coachingRelationshipId: who.relationshipId,
    planId,
    planVersionId: versionId,
    workoutDayId,
    workoutDayName: "Lower",
    workoutDayJson: JSON.stringify({ id: workoutDayId, order: 1, name: "Lower", exercises: [] }),
    localDate,
    windowStartsAt: `${localDate}T00:00:00.000Z`,
    windowEndsAt: `${localDate}T23:59:59.000Z`,
    scheduleStatus: "scheduled",
    createdAt: now,
    updatedAt: now,
  });
  const executionId = createId();
  await db.insert(schema.workoutExecutions).values({
    id: executionId,
    assignmentId,
    coachingRelationshipId: who.relationshipId,
    planVersionId: versionId,
    traineeUserId: who.traineeUserId,
    status: "completed",
    recordVersion: 0,
    startedAt: `${localDate}T06:00:00.000Z`,
    completedAt: `${localDate}T07:00:00.000Z`,
    createdAt: now,
    updatedAt: now,
  });
  const exerciseExecutionId = createId();
  await db.insert(schema.exerciseExecutions).values({
    id: exerciseExecutionId,
    workoutExecutionId: executionId,
    exerciseId: "ex-back-squat",
    name: "Back Squat",
    order: 1,
    status: "completed",
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(schema.setExecutions).values({
    id: createId(),
    exerciseExecutionId,
    setTargetId: createId(),
    order: 1,
    status: "completed",
    actualReps: 5,
    actualLoadLabel: "80 kg",
    actualLoadKg: 80,
    loadKind: "kg",
    completedAt: `${localDate}T06:30:00.000Z`,
    createdAt: now,
    updatedAt: now,
  });
}

type Body = {
  data?: { exercises: Array<{ points: unknown[] }> };
  error?: { code: string; message: string };
};

describe("GET /strength/relationships/:relationshipId authorization", () => {
  let handle: MemoryDbHandle;
  let db: Db;

  beforeEach(async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-10-17T14:30:00.000Z"));
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

  async function read(relationshipId: string, headers?: Record<string, string>) {
    const response = await app.request(
      `/strength/relationships/${relationshipId}?range=all`,
      { headers },
      testEnv(),
    );
    return { status: response.status, body: (await response.json()) as Body };
  }

  it("the relationship's trainer and trainee both read the same data", async () => {
    const client = await reachCoachingReady("own");
    await seedLoggedSet(db, client);
    const asTrainer = await read(client.relationshipId, client.trainer);
    const asTrainee = await read(client.relationshipId, client.trainee);
    expect(asTrainer.status).toBe(200);
    expect(asTrainee.status).toBe(200);
    expect(asTrainee.body).toEqual(asTrainer.body);
    expect(asTrainer.body.data?.exercises[0]?.points).toHaveLength(1);
  });

  it("an unrelated trainer gets 403 with static text and no data", async () => {
    const client = await reachCoachingReady("owner");
    const stranger = await reachCoachingReady("stranger-trainer");
    await seedLoggedSet(db, client);
    const result = await read(client.relationshipId, stranger.trainer);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({
      error: expect.objectContaining({
        code: "FORBIDDEN",
        message: "You cannot view this client's strength data.",
      }),
    });
    expect(JSON.stringify(result.body)).not.toContain("Back Squat");
  });

  it("a trainee of a different relationship gets 403", async () => {
    const client = await reachCoachingReady("owner2");
    const stranger = await reachCoachingReady("stranger-trainee");
    await seedLoggedSet(db, client);
    const result = await read(client.relationshipId, stranger.trainee);
    expect(result.status).toBe(403);
    expect(result.body.data).toBeUndefined();
  });

  it("the trainer's session does not read through the trainee role of another account, and vice versa", async () => {
    const client = await reachCoachingReady("roles");
    await seedLoggedSet(db, client);
    // The trainee credential acting as trainer for a relationship it does not coach: forbidden role.
    const asWrongRole = await read(client.relationshipId, {
      ...client.trainee,
      "x-fitbud-role": "trainer",
    });
    expect(asWrongRole.status).toBe(403);
    expect(asWrongRole.body.data).toBeUndefined();
  });

  it("unauthenticated callers get 401", async () => {
    const client = await reachCoachingReady("anon");
    const result = await read(client.relationshipId);
    expect(result.status).toBe(401);
    expect(result.body.data).toBeUndefined();
  });

  it("an unknown relationship is 404 for a signed-in trainer", async () => {
    const client = await reachCoachingReady("missing");
    const result = await read(createId(), client.trainer);
    expect(result.status).toBe(404);
    expect(result.body.error?.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("an ended relationship stays readable by its trainer and trainee, and still 403 for others", async () => {
    const client = await reachCoachingReady("ended");
    const stranger = await reachCoachingReady("ended-stranger");
    await seedLoggedSet(db, client);
    const end = await app.request(
      `/relationships/${client.relationshipId}/end`,
      {
        method: "POST",
        headers: {
          ...client.trainer,
          "Content-Type": "application/json",
          "Idempotency-Key": "end-strength-authz",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(end.status).toBe(200);

    const asTrainer = await read(client.relationshipId, client.trainer);
    const asTrainee = await read(client.relationshipId, client.trainee);
    expect(asTrainer.status).toBe(200);
    expect(asTrainee.status).toBe(200);
    expect(asTrainer.body.data?.exercises[0]?.points).toHaveLength(1);
    expect((await read(client.relationshipId, stranger.trainer)).status).toBe(403);
  });
});
