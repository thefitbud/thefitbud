import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { app } from "../index.js";
import { schema, setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";
import { createMemoryDb, type MemoryDbHandle } from "../test-support/memory-db.js";

/** Z6-9 authorization: who may read or write a relationship's steps and target. */

const NOW = new Date("2026-11-06T20:00:00.000Z");

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
    `trainer-stauthz-${suffix}`,
    `stauthz-coach-${suffix}@example.com`,
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
        "Idempotency-Key": `inv-stauthz-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `stauthz-trainee-${suffix}@example.com`,
        recipientDisplayName: `Steps Authz ${suffix}`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `stauthz-trainee-${suffix}`,
    `stauthz-trainee-${suffix}@example.com`,
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
    trainer: { Cookie: trainerCookie, "Content-Type": "application/json" } as Record<string, string>,
    trainee: {
      Authorization: `Bearer ${traineeToken}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    } as Record<string, string>,
    relationshipId: acceptBody.data.relationship.id,
    traineeUserId: acceptBody.data.relationship.traineeUserId,
  };
}

/** A configuration row for the relationship, so a target edit has something to write. */
async function addConfiguration(db: Db, relationshipId: string, stepsTarget = 8000) {
  const at = nowIso();
  await db.insert(schema.coachingConfigurations).values({
    id: createId(),
    coachingRelationshipId: relationshipId,
    status: "draft",
    versionNumber: 1,
    recordVersion: 1,
    stepsTarget,
    createdAt: at,
    updatedAt: at,
  });
}

async function targetOf(db: Db, relationshipId: string): Promise<number | undefined> {
  const [row] = await db
    .select({ target: schema.coachingConfigurations.stepsTarget })
    .from(schema.coachingConfigurations)
    .where(eq(schema.coachingConfigurations.coachingRelationshipId, relationshipId));
  return row?.target;
}

async function storedSteps(db: Db, relationshipId: string) {
  return db
    .select()
    .from(schema.dailySteps)
    .where(eq(schema.dailySteps.coachingRelationshipId, relationshipId));
}

type ErrorBody = { error: { code: string; message: string } };

describe("steps authorization", () => {
  let handle: MemoryDbHandle;
  let db: Db;

  beforeEach(async () => {
    handle = await createMemoryDb();
    db = handle.db;
    setTestDbOverride(db);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    handle.close();
  });

  it("answers 401 to every steps endpoint without a session", async () => {
    const uuid = "00000000-0000-4000-8000-000000000000";
    const calls: Array<[string, string, string?]> = [
      ["GET", "/me/steps/today"],
      ["PUT", "/me/steps/days/2026-11-07", JSON.stringify({ steps: 1, source: "manual" })],
      ["GET", `/steps/relationships/${uuid}`],
      ["PUT", `/steps/relationships/${uuid}/target`, JSON.stringify({ target: 9000 })],
    ];
    for (const [method, path, body] of calls) {
      const response = await app.request(
        path,
        { method, headers: { "Content-Type": "application/json" }, body },
        testEnv(),
      );
      expect(response.status, `${method} ${path}`).toBe(401);
    }
  });

  it("refuses another trainer's read and target edit with 403 and changes nothing", async () => {
    const owner = await reachCoachingReady("own");
    const intruder = await reachCoachingReady("int");
    await addConfiguration(db, owner.relationshipId, 8000);
    await db.insert(schema.dailySteps).values({
      id: createId(),
      coachingRelationshipId: owner.relationshipId,
      localDate: "2026-11-07",
      steps: 4321,
      source: "manual",
      syncedAt: NOW.toISOString(),
    });

    const read = await app.request(
      `/steps/relationships/${owner.relationshipId}`,
      { headers: intruder.trainer },
      testEnv(),
    );
    expect(read.status).toBe(403);
    const readBody = (await read.json()) as ErrorBody;
    expect(readBody.error.code).toBe("FORBIDDEN");
    expect(JSON.stringify(readBody)).not.toContain(owner.relationshipId);
    expect(JSON.stringify(readBody)).not.toContain("4321");

    const write = await app.request(
      `/steps/relationships/${owner.relationshipId}/target`,
      { method: "PUT", headers: intruder.trainer, body: JSON.stringify({ target: 30000 }) },
      testEnv(),
    );
    expect(write.status).toBe(403);
    expect(await targetOf(db, owner.relationshipId)).toBe(8000);

    const ownerRead = await app.request(
      `/steps/relationships/${owner.relationshipId}`,
      { headers: owner.trainer },
      testEnv(),
    );
    expect(ownerRead.status).toBe(200);
  });

  it("answers 404 for a relationship that does not exist, with no id in the message", async () => {
    const trainer = await reachCoachingReady("nf");
    const missing = "11111111-1111-4111-8111-111111111111";
    for (const [method, path, body] of [
      ["GET", `/steps/relationships/${missing}`, undefined],
      ["PUT", `/steps/relationships/${missing}/target`, JSON.stringify({ target: 9000 })],
    ] as const) {
      const response = await app.request(
        path,
        { method, headers: trainer.trainer, body },
        testEnv(),
      );
      expect(response.status).toBe(404);
      const parsed = (await response.json()) as ErrorBody;
      expect(parsed.error.code).toBe("RELATIONSHIP_NOT_FOUND");
      expect(parsed.error.message).toBe("Relationship not found.");
    }
  });

  it("keeps the trainer endpoints to trainers and the /me endpoints to trainees", async () => {
    const client = await reachCoachingReady("role");
    await addConfiguration(db, client.relationshipId, 8000);

    const traineeRead = await app.request(
      `/steps/relationships/${client.relationshipId}`,
      { headers: client.trainee },
      testEnv(),
    );
    expect(traineeRead.status).toBe(403);
    const traineeTarget = await app.request(
      `/steps/relationships/${client.relationshipId}/target`,
      { method: "PUT", headers: client.trainee, body: JSON.stringify({ target: 40000 }) },
      testEnv(),
    );
    expect(traineeTarget.status).toBe(403);
    expect(await targetOf(db, client.relationshipId)).toBe(8000);

    const trainerToday = await app.request(
      "/me/steps/today",
      { headers: client.trainer },
      testEnv(),
    );
    expect(trainerToday.status).toBe(403);
    const trainerWrite = await app.request(
      "/me/steps/days/2026-11-07",
      {
        method: "PUT",
        headers: client.trainer,
        body: JSON.stringify({ steps: 9999, source: "manual" }),
      },
      testEnv(),
    );
    expect(trainerWrite.status).toBe(403);
    expect(await storedSteps(db, client.relationshipId)).toEqual([]);
  });

  it("writes a trainee's steps only to their own relationship, whatever the request names", async () => {
    const mine = await reachCoachingReady("mine");
    const theirs = await reachCoachingReady("theirs");
    await addConfiguration(db, mine.relationshipId, 8000);
    await addConfiguration(db, theirs.relationshipId, 20000);

    const response = await app.request(
      "/me/steps/days/2026-11-06",
      {
        method: "PUT",
        headers: mine.trainee,
        body: JSON.stringify({
          steps: 5555,
          source: "manual",
          coachingRelationshipId: theirs.relationshipId,
          relationshipId: theirs.relationshipId,
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    expect((await storedSteps(db, mine.relationshipId)).map((row) => row.steps)).toEqual([5555]);
    expect(await storedSteps(db, theirs.relationshipId)).toEqual([]);

    // Each trainee reads only their own day and their own target.
    const mineToday = await app.request("/me/steps/today", { headers: mine.trainee }, testEnv());
    expect(((await mineToday.json()) as { data: unknown }).data).toEqual({
      localDate: "2026-11-06",
      steps: 5555,
      target: 8000,
    });
    const theirsToday = await app.request(
      "/me/steps/today",
      { headers: theirs.trainee },
      testEnv(),
    );
    expect(((await theirsToday.json()) as { data: unknown }).data).toEqual({
      localDate: "2026-11-06",
      steps: null,
      target: 20000,
    });
  });
});
