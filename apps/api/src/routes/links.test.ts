import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createId, nowIso } from "../lib/crypto.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
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
  const trainer = await createTrainerSession(`link-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-link-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `link-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `link-trainee-${suffix}`,
    `link-trainee-${suffix}@example.com`,
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

function authHeaders(
  cookieOrToken: { cookie: string } | { token: string },
  role: "trainer" | "trainee",
): Record<string, string> {
  if ("cookie" in cookieOrToken) {
    return { Cookie: cookieOrToken.cookie, "x-fitbud-role": role };
  }
  return {
    Authorization: `Bearer ${cookieOrToken.token}`,
    "x-fitbud-role": role,
  };
}

async function linkResolveBody(response: Response) {
  return (await response.json()) as {
    data: {
      available: boolean;
      reason?: string;
      role?: string;
      route?: string;
    };
  };
}

describe("links resolve", () => {
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

  it("resolves client links for available, not_yours, and ended", async () => {
    const ctx = await reachCoachingReady("client");
    const otherTrainer = await createTrainerSession("link-other@example.com");

    const available = await app.request(
      `/links/resolve?kind=client&id=${ctx.relationshipId}`,
      { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
      testEnv(),
    );
    expect(available.status).toBe(200);
    expect((await linkResolveBody(available)).data).toMatchObject({
      available: true,
      role: "trainer",
    });

    const notYours = await app.request(
      `/links/resolve?kind=client&id=${ctx.relationshipId}`,
      { headers: authHeaders({ cookie: otherTrainer.cookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(notYours)).data).toMatchObject({
      available: false,
      reason: "not_yours",
    });

    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));

    const ended = await app.request(
      `/links/resolve?kind=client&id=${ctx.relationshipId}`,
      { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(ended)).data).toMatchObject({
      available: false,
      reason: "ended",
    });
  });

  it("resolves ask links for available and not_yours", async () => {
    const ctx = await reachCoachingReady("ask");
    const askId = createId();
    const now = nowIso();
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
      topic: "Timing",
      askedAt: now,
      lastAskedAt: now,
      askCount: 1,
      status: "open",
      answeredAt: null,
      answeredBy: null,
      trainerNoteId: null,
    });

    const available = await app.request(
      `/links/resolve?kind=ask&id=${askId}`,
      { headers: authHeaders({ token: ctx.traineeToken }, "trainee") },
      testEnv(),
    );
    expect((await linkResolveBody(available)).data).toMatchObject({ available: true });

    const otherTrainer = await createTrainerSession("link-ask-other@example.com");
    const notYours = await app.request(
      `/links/resolve?kind=ask&id=${askId}`,
      { headers: authHeaders({ cookie: otherTrainer.cookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(notYours)).data).toMatchObject({
      available: false,
      reason: "not_yours",
    });
  });

  it("resolves exception links for available and not_yours", async () => {
    const ctx = await reachCoachingReady("exception");
    const exceptionId = createId();
    const now = nowIso();
    await db.insert(schema.exceptions).values({
      id: exceptionId,
      coachingRelationshipId: ctx.relationshipId,
      type: "skipped_meal",
      severity: "attention",
      status: "active",
      ruleVersion: "test",
      sourceEntityType: "meal_assignment",
      sourceEntityId: createId(),
      summary: "Skipped meal",
      detectedAt: now,
      resolvedAt: null,
      resolutionOutcome: null,
      createdAt: now,
      updatedAt: now,
    });

    const available = await app.request(
      `/links/resolve?kind=exception&id=${exceptionId}`,
      { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(available)).data).toMatchObject({ available: true });

    const otherTrainer = await createTrainerSession("link-ex-other@example.com");
    const notYours = await app.request(
      `/links/resolve?kind=exception&id=${exceptionId}`,
      { headers: authHeaders({ cookie: otherTrainer.cookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(notYours)).data).toMatchObject({
      available: false,
      reason: "not_yours",
    });
  });

  it("resolves reactivate links for ended relationships owned by the trainer", async () => {
    const ctx = await reachCoachingReady("reactivate");
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));

    const reactivate = await app.request(
      `/links/resolve?kind=reactivate&id=${ctx.relationshipId}`,
      { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(reactivate)).data).toMatchObject({
      available: true,
      role: "trainer",
    });

    const asClientKind = await app.request(
      `/links/resolve?kind=client&id=${ctx.relationshipId}`,
      { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(asClientKind)).data).toMatchObject({
      available: false,
      reason: "ended",
    });
  });

  it("resolves plan and today links for the authenticated actor", async () => {
    const ctx = await reachCoachingReady("static");
    for (const kind of ["plan", "today"] as const) {
      const response = await app.request(
        `/links/resolve?kind=${kind}&id=${ctx.relationshipId}`,
        { headers: authHeaders({ token: ctx.traineeToken }, "trainee") },
        testEnv(),
      );
      const body = (await response.json()) as { data: { available: boolean; route: string } };
      expect(body.data.available).toBe(true);
      expect(body.data.route.length).toBeGreaterThan(0);
    }
  });

  it("resolves note links for client-visible notes", async () => {
    const ctx = await reachCoachingReady("note");
    const noteId = createId();
    const now = nowIso();
    await db.insert(schema.trainerNotes).values({
      id: noteId,
      coachingRelationshipId: ctx.relationshipId,
      trainerUserId: (
        await db
          .select()
          .from(schema.coachingRelationships)
          .where(eq(schema.coachingRelationships.id, ctx.relationshipId))
      )[0]!.trainerUserId,
      visibility: "client",
      body: "Hydrate",
      createdAt: now,
      updatedAt: now,
    });

    const available = await app.request(
      `/links/resolve?kind=note&id=${noteId}`,
      { headers: authHeaders({ token: ctx.traineeToken }, "trainee") },
      testEnv(),
    );
    expect((await linkResolveBody(available)).data).toMatchObject({ available: true });

    const otherTrainer = await createTrainerSession("link-note-other@example.com");
    const notYours = await app.request(
      `/links/resolve?kind=note&id=${noteId}`,
      { headers: authHeaders({ cookie: otherTrainer.cookie }, "trainer") },
      testEnv(),
    );
    expect((await linkResolveBody(notYours)).data).toMatchObject({
      available: false,
      reason: "not_yours",
    });
  });

  it("returns not_found for missing meal, workout, and checkin ids", async () => {
    const ctx = await reachCoachingReady("entities");
    for (const kind of ["meal", "workout", "checkin"] as const) {
      const response = await app.request(
        `/links/resolve?kind=${kind}&id=${createId()}`,
        { headers: authHeaders({ cookie: ctx.trainerCookie }, "trainer") },
        testEnv(),
      );
      expect((await linkResolveBody(response)).data).toMatchObject({
        available: false,
        reason: "not_found",
      });
    }
  });
});
