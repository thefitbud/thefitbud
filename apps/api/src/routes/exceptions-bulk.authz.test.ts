import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import * as schema from "../db/schema.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import { BULK_IDEMPOTENCY_REPLAY_WINDOW_MS } from "../domain/exception-bulk.js";

/**
 * Z6-10 authorization (D-W6-2: this module's cases live here, not in the shared
 * matrix). Only the owning trainer can bulk resolve or undo; trainees,
 * unauthenticated callers and other trainers get nothing and change nothing;
 * an ended relationship rejects the whole call.
 */


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
  const response = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";")[0]!;
}

async function post(
  path: string,
  headers: Record<string, string>,
  body: unknown,
  key?: string,
) {
  return app.request(
    path,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: JSON.stringify(body),
    },
    testEnv(),
  );
}

/** Invite → accept → onboarding → review → configure → activate. */
async function reachActive(trainerEmail: string, suffix: string) {
  const cookie = await createTrainerSession(trainerEmail);
  const trainer = { Cookie: cookie };
  const created = await post(
    "/invitations",
    trainer,
    { recipientEmail: `bulkz-trainee-${suffix}@example.com` },
    `inv-bulkz-${suffix}`,
  );
  const { data: invite } = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `bulkz-trainee-${suffix}`,
    `bulkz-trainee-${suffix}@example.com`,
  );
  const trainee = {
    Authorization: `Bearer ${traineeToken}`,
    "x-fitbud-role": "trainee",
  };
  const accept = await post(
    "/invitations/accept",
    { Authorization: `Bearer ${traineeToken}` },
    { token: invite.token, timezone: "Asia/Kolkata" },
  );
  const relationshipId = (
    (await accept.json()) as { data: { relationship: { id: string } } }
  ).data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: { ...trainee, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 0,
        answers: {
          goals: "Consistency",
          relevant_history: "None",
          preferences: "Home",
          schedule: "Mornings",
          limitations: "None",
        },
      }),
    },
    testEnv(),
  );
  await post(
    `/onboarding/relationships/${relationshipId}/submit`,
    trainee,
    { expectedVersion: 1 },
    `submit-bulkz-${suffix}`,
  );
  await post(
    `/onboarding/relationships/${relationshipId}/review`,
    trainer,
    { outcome: "coaching_ready" },
    `review-bulkz-${suffix}`,
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: { ...trainer, "Content-Type": "application/json" },
      body: JSON.stringify({
        expectedVersion: 0,
        goalShort: "Adherence",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours: 24,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 1 },
        tracking: {
          requireBodyWeight: false,
          requireProgressPhotos: false,
          requireSessionRpe: false,
        },
      }),
    },
    testEnv(),
  );
  await post(
    `/configurations/relationships/${relationshipId}/configure`,
    trainer,
    { expectedVersion: 1 },
    `cfg-bulkz-${suffix}`,
  );
  const activated = await post(
    `/configurations/relationships/${relationshipId}/activate`,
    trainer,
    { expectedVersion: 1 },
    `act-bulkz-${suffix}`,
  );
  expect(activated.status).toBe(200);
  return { trainer, trainee, relationshipId };
}


const at = "2026-01-05T08:00:00.000Z";

function openRow(
  relationshipId: string,
  id: string,
  type: "missed_workout" | "overdue_meal" | "meal_deviation",
  status: "active" | "acknowledged" = "active",
): typeof schema.exceptions.$inferInsert {
  return {
    id,
    coachingRelationshipId: relationshipId,
    type,
    severity: type === "meal_deviation" ? "attention" : "critical",
    status,
    ruleVersion: "mvp.v2",
    sourceEntityType: type === "missed_workout" ? "workout_assignment" : "meal_assignment",
    sourceEntityId: id.replace(/^(.{9})..../, "$1aaaa"),
    summary: type === "missed_workout" ? "Missed workout" : "Meal item",
    detailsJson: null,
    detectedAt: at,
    activatedAt: at,
    acknowledgedAt: status === "acknowledged" ? at : null,
    resolvedAt: null,
    resolutionOutcome: null,
    resolutionNote: null,
    closedReason: null,
    sourceLoggedLateAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

const rid = (n: number) => `0f0f0f0f-0001-4000-8000-${String(n).padStart(12, "0")}`;

describe("Z6-10 bulk resolve authorization", () => {
  let db: Db;
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    db = memory.db;
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    vi.useRealTimers();
    setTestDbOverride(null);
    closeDb();
  });

  async function snapshot() {
    const sortById = <T extends { id: string }>(rows: T[]) =>
      [...rows].sort((a, b) => a.id.localeCompare(b.id));
    return {
      exceptions: sortById(await db.select().from(schema.exceptions)),
      actions: sortById(await db.select().from(schema.exceptionActions)),
      interventions: sortById(await db.select().from(schema.interventions)),
    };
  }

  async function errorOf(response: Response) {
    return ((await response.json()) as { error: { code: string; message: string } }).error;
  }

  async function setup(suffix: string) {
    const owner = await reachActive(`bulkz-owner-${suffix}@example.com`, `${suffix}-a`);
    const stranger = await reachActive(`bulkz-other-${suffix}@example.com`, `${suffix}-b`);
    const mine = [
      openRow(owner.relationshipId, rid(1), "missed_workout"),
      openRow(owner.relationshipId, rid(2), "overdue_meal", "acknowledged"),
      openRow(owner.relationshipId, rid(3), "meal_deviation"),
    ];
    const theirs = openRow(stranger.relationshipId, rid(4), "missed_workout");
    await db.insert(schema.exceptions).values([...mine, theirs]);
    return { owner, stranger, mine, theirs };
  }

  it("another trainer cannot bulk resolve this client's exceptions (404, nothing written)", async () => {
    const { owner, stranger, mine } = await setup("cross");
    const before = await snapshot();
    const response = await post(
      "/exceptions/bulk/resolve",
      stranger.trainer,
      {
        relationshipId: owner.relationshipId,
        exceptionIds: mine.map((row) => row.id),
        outcome: "talked",
      },
      "bulkz-cross-1",
    );
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("RELATIONSHIP_NOT_FOUND");
    expect(error.message).toBe("Coaching relationship not found.");
    expect(await snapshot()).toEqual(before);
  });

  it("another trainer's exception ids sent under my relationship are not_found and untouched", async () => {
    const { owner, theirs, mine } = await setup("smuggle");
    const response = await post(
      "/exceptions/bulk/resolve",
      owner.trainer,
      {
        relationshipId: owner.relationshipId,
        exceptionIds: [theirs.id, mine[0]!.id],
        outcome: "talked",
      },
      "bulkz-smuggle-1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { items: Array<{ id: string; status: string; reason?: string }> };
    };
    expect(body.data.items).toEqual([
      { id: theirs.id, status: "skipped", reason: "not_found" },
      { id: mine[0]!.id, status: "resolved" },
    ]);
    const [theirsAfter] = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, theirs.id));
    expect(theirsAfter).toEqual(theirs);
  });

  it("incompatible types are never resolved in bulk", async () => {
    const { owner, mine } = await setup("types");
    const response = await post(
      "/exceptions/bulk/resolve",
      owner.trainer,
      {
        relationshipId: owner.relationshipId,
        exceptionIds: [mine[2]!.id],
        outcome: "no_action",
      },
      "bulkz-types-1",
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { bulkId: string | null; items: Array<{ reason?: string }> };
    };
    expect(body.data.bulkId).toBeNull();
    expect(body.data.items[0]!.reason).toBe("incompatible_type");
    const [row] = await db
      .select()
      .from(schema.exceptions)
      .where(eq(schema.exceptions.id, mine[2]!.id));
    expect(row).toEqual(mine[2]);
  });

  it("trainee and unauthenticated callers are rejected on resolve and undo", async () => {
    const { owner, mine } = await setup("roles");
    const before = await snapshot();
    const request = {
      relationshipId: owner.relationshipId,
      exceptionIds: [mine[0]!.id],
      outcome: "talked",
    };
    const trainee = await post("/exceptions/bulk/resolve", owner.trainee, request, "bulkz-roles-1");
    expect(trainee.status).toBe(403);
    expect((await errorOf(trainee)).code).toBe("FORBIDDEN_ROLE");
    const anon = await post("/exceptions/bulk/resolve", {}, request, "bulkz-roles-2");
    expect(anon.status).toBe(401);
    expect(await snapshot()).toEqual(before);

    const resolved = await post("/exceptions/bulk/resolve", owner.trainer, request, "bulkz-roles-3");
    expect(resolved.status).toBe(200);
    const { data } = (await resolved.json()) as { data: { bulkId: string } };
    const afterResolve = await snapshot();
    const traineeUndo = await post(
      "/exceptions/bulk/undo",
      owner.trainee,
      { bulkId: data.bulkId },
      "bulkz-roles-4",
    );
    expect(traineeUndo.status).toBe(403);
    const anonUndo = await post("/exceptions/bulk/undo", {}, { bulkId: data.bulkId }, "bulkz-roles-5");
    expect(anonUndo.status).toBe(401);
    expect(await snapshot()).toEqual(afterResolve);
  });

  it("another trainer cannot undo my bulk resolve (404, nothing restored)", async () => {
    const { owner, stranger, mine } = await setup("undo");
    const resolved = await post(
      "/exceptions/bulk/resolve",
      owner.trainer,
      {
        relationshipId: owner.relationshipId,
        exceptionIds: [mine[0]!.id, mine[1]!.id],
        outcome: "talked",
      },
      "bulkz-undo-1",
    );
    expect(resolved.status).toBe(200);
    const { data } = (await resolved.json()) as { data: { bulkId: string } };
    const afterResolve = await snapshot();
    const response = await post(
      "/exceptions/bulk/undo",
      stranger.trainer,
      { bulkId: data.bulkId },
      "bulkz-undo-2",
    );
    expect(response.status).toBe(404);
    const error = await errorOf(response);
    expect(error.code).toBe("BULK_NOT_FOUND");
    expect(error.message).toBe("Bulk action not found.");
    expect(await snapshot()).toEqual(afterResolve);
  });

  it("an ended relationship rejects the whole call with 409, writes nothing, and retries stay 409", async () => {
    const { owner, mine } = await setup("ended");
    const ended = await post(
      `/relationships/${owner.relationshipId}/end`,
      owner.trainer,
      { reason: "paused" },
      "bulkz-ended-end",
    );
    expect(ended.status).toBe(200);
    // Ending closes open items; put them back open (as pre-EC1a rows) so the
    // rejection comes from the relationship, not from the item status.
    for (const row of mine) {
      await db.update(schema.exceptions).set(row).where(eq(schema.exceptions.id, row.id));
    }
    const before = await snapshot();
    const request = {
      relationshipId: owner.relationshipId,
      exceptionIds: mine.map((row) => row.id),
      outcome: "talked",
    };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await post("/exceptions/bulk/resolve", owner.trainer, request, "bulkz-ended-1");
      expect(response.status).toBe(409);
      const error = await errorOf(response);
      expect(error.code).toBe("RELATIONSHIP_ENDED");
      expect(error.message).toBe("Coaching relationship has ended.");
      expect(await snapshot()).toEqual(before);
    }
  });

  it("undo is rejected with 409 once the relationship has ended, even inside the window", async () => {
    const { owner, mine } = await setup("endedundo");
    const resolved = await post(
      "/exceptions/bulk/resolve",
      owner.trainer,
      {
        relationshipId: owner.relationshipId,
        exceptionIds: [mine[0]!.id],
        outcome: "talked",
      },
      "bulkz-endedundo-1",
    );
    expect(resolved.status).toBe(200);
    const { data } = (await resolved.json()) as { data: { bulkId: string } };
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended" })
      .where(eq(schema.coachingRelationships.id, owner.relationshipId));
    const before = await snapshot();
    const response = await post(
      "/exceptions/bulk/undo",
      owner.trainer,
      { bulkId: data.bulkId },
      "bulkz-endedundo-2",
    );
    expect(response.status).toBe(409);
    expect((await errorOf(response)).code).toBe("RELATIONSHIP_ENDED");
    expect(await snapshot()).toEqual(before);
  });

  it("an expired Idempotency-Key is checked per trainer: the owner gets IDEMPOTENCY_KEY_EXPIRED, another trainer's same key still gets their own answer (Z7-21)", async () => {
    const { owner, stranger, mine, theirs } = await setup("expiredkey");
    const t0 = Date.now();
    vi.useFakeTimers({ toFake: ["Date"], now: t0 });
    const request = {
      relationshipId: owner.relationshipId,
      exceptionIds: [mine[0]!.id],
      outcome: "talked",
    };
    const first = await post("/exceptions/bulk/resolve", owner.trainer, request, "bulkz-expired-key");
    expect(first.status).toBe(200);
    vi.setSystemTime(t0 + BULK_IDEMPOTENCY_REPLAY_WINDOW_MS + 1);
    const afterFirst = await snapshot();

    const ownerAgain = await post("/exceptions/bulk/resolve", owner.trainer, request, "bulkz-expired-key");
    expect(ownerAgain.status).toBe(409);
    expect((await errorOf(ownerAgain)).code).toBe("IDEMPOTENCY_KEY_EXPIRED");

    // The stranger sending the owner's request under the same key: still 404, no hint of the key.
    const strangerAsOwner = await post("/exceptions/bulk/resolve", stranger.trainer, request, "bulkz-expired-key");
    expect(strangerAsOwner.status).toBe(404);
    expect((await errorOf(strangerAsOwner)).code).toBe("RELATIONSHIP_NOT_FOUND");
    expect(await snapshot()).toEqual(afterFirst);

    // And the same key on their own client works for them.
    const own = await post(
      "/exceptions/bulk/resolve",
      stranger.trainer,
      { relationshipId: stranger.relationshipId, exceptionIds: [theirs.id], outcome: "no_action" },
      "bulkz-expired-key",
    );
    expect(own.status).toBe(200);
    const [row] = await db.select().from(schema.exceptions).where(eq(schema.exceptions.id, theirs.id));
    expect(row!.status).toBe("resolved");
  });

  it("error bodies are static and carry no ids or request data", async () => {
    const { owner, stranger, mine } = await setup("static");
    const responses = [
      await post(
        "/exceptions/bulk/resolve",
        stranger.trainer,
        { relationshipId: owner.relationshipId, exceptionIds: [mine[0]!.id], outcome: "talked" },
        "bulkz-static-1",
      ),
      await post("/exceptions/bulk/undo", owner.trainer, { bulkId: mine[0]!.id }, "bulkz-static-2"),
    ];
    for (const response of responses) {
      expect(response.status).toBe(404);
      const text = await response.text();
      expect(text).not.toContain(owner.relationshipId);
      expect(text).not.toContain(mine[0]!.id);
    }
  });
});
