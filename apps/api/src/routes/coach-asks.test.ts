import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { expireStaleCoachAsks } from "../domain/coach-asks.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

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

async function createTrainerSession(email: string) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`ask-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-ask-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `ask-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `ask-trainee-${suffix}`,
    `ask-trainee-${suffix}@example.com`,
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
    data: { relationship: { id: string } };
  };
  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId: acceptBody.data.relationship.id,
  };
}

describe("coach asks", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("merges repeated asks within 24 hours", async () => {
    const ctx = await reachCoachingReady("merge");
    const itemId = createId();
    const body = {
      relationshipId: ctx.relationshipId,
      itemType: "checkin",
      itemId,
      topic: "Form check",
    };
    const first = await app.request(
      "/coach-asks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
      testEnv(),
    );
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { data: { id: string; askCount: number } };

    const second = await app.request(
      "/coach-asks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, topic: "Follow up" }),
      },
      testEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as { data: { id: string; askCount: number } };
    expect(secondBody.data.id).toBe(firstBody.data.id);
    expect(secondBody.data.askCount).toBe(2);
  });

  it("expires stale open asks after seven days", async () => {
    const ctx = await reachCoachingReady("expire");
    const askId = createId();
    const stale = new Date(Date.now() - 8 * 86_400_000).toISOString();
    const [rel] = await db
      .select()
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
    await db.insert(schema.coachAsks).values({
      id: askId,
      relationshipId: ctx.relationshipId,
      traineeUserId: rel!.traineeUserId,
      itemType: "checkin",
      itemId: createId(),
      topic: "Old ask",
      askedAt: stale,
      lastAskedAt: stale,
      askCount: 1,
      status: "open",
      answeredAt: null,
      answeredBy: null,
      trainerNoteId: null,
    });
    const expired = await expireStaleCoachAsks(db, nowIso());
    expect(expired).toBe(1);
    const rows = await db
      .select()
      .from(schema.coachAsks)
      .where(eq(schema.coachAsks.id, askId));
    expect(rows[0]?.status).toBe("expired");
  });

  it("keeps private answer notes off the trainee note feed", async () => {
    const ctx = await reachCoachingReady("privacy");
    const itemId = createId();
    const create = await app.request(
      "/coach-asks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          relationshipId: ctx.relationshipId,
          itemType: "checkin",
          itemId,
          topic: "portion_size",
        }),
      },
      testEnv(),
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as { data: { id: string } };

    const answer = await app.request(
      `/coach-asks/${created.data.id}/answer`,
      {
        method: "POST",
        headers: {
          Cookie: ctx.trainerCookie,
          "x-fitbud-role": "trainer",
          "Content-Type": "application/json",
          "Idempotency-Key": `answer-private-${created.data.id}`,
        },
        body: JSON.stringify({
          note: "Secret coaching tip — keep private",
          visibleToClient: false,
        }),
      },
      testEnv(),
    );
    expect(answer.status).toBe(200);

    const notes = await app.request(
      "/me/coach-notes",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(notes.status).toBe(200);
    const notesBody = (await notes.json()) as {
      data: { items: Array<{ body: string }> };
    };
    expect(
      notesBody.data.items.some((n) => n.body.includes("Secret coaching tip")),
    ).toBe(false);

    const answeredList = await app.request(
      "/coach-asks?status=answered",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const answeredBody = (await answeredList.json()) as {
      data: { items: Array<{ id: string; coachAnswered?: boolean; answerVisibleToClient?: boolean }> };
    };
    const row = answeredBody.data.items.find((i) => i.id === created.data.id);
    expect(row?.coachAnswered).toBe(true);
    expect(row?.answerVisibleToClient).toBe(false);
  });

  it("blocks new asks when the relationship has ended", async () => {
    const ctx = await reachCoachingReady("ended");
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));

    const response = await app.request(
      "/coach-asks",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ctx.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          relationshipId: ctx.relationshipId,
          itemType: "checkin",
          itemId: createId(),
          topic: "Blocked",
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RELATIONSHIP_ENDED");
  });
});
