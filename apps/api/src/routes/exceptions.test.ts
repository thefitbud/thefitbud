import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of [
    "0000_identity.sql",
    "0001_relationship_onboarding.sql",
    "0012_invitation_whatsapp.sql",
    "0002_coaching_configuration.sql",
    "0003_plans.sql",
    "0004_workouts.sql",
    "0005_meals.sql",
    "0006_checkins.sql",
    "0007_exceptions.sql",
    "0008_progress_media.sql",
    "0009_sync.sql",
    "0010_notifications.sql",
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return {
    db,
    close: () => sqlite.close(),
  };
}

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
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachActiveConfig(suffix: string) {
  const trainer = await createTrainerSession(`ex-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-ex-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `ex-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `ex-trainee-${suffix}`,
    `ex-trainee-${suffix}@example.com`,
  );
  const accept = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: createdBody.data.token,
        timezone: "Asia/Kolkata",
      }),
    },
    testEnv(),
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string; traineeUserId: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  await app.request(
    `/intake/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
      },
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
  await app.request(
    `/intake/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-ex-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/intake/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-ex-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );

  await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    {
      method: "PUT",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        primaryGoal: "Adherence",
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
  await app.request(
    `/configurations/relationships/${relationshipId}/configure`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-ex-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `act-ex-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    today: formatLocalDate(new Date(), "Asia/Kolkata"),
  };
}

describe("intervention loop", () => {
  let closeDb: () => void;
  let db: Db;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    db = memory.db;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated attention feed", async () => {
    const response = await app.request("/exceptions/attention", {}, testEnv());
    expect(response.status).toBe(401);
  });

  it("rejects trainee exception acknowledge with 403", async () => {
    const { trainerCookie, traineeToken, relationshipId, today } =
      await reachActiveConfig("authz");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-authz",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string } };
    };

    await db
      .update(schema.checkins)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.id, scheduledBody.data.checkin.id));

    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-authz",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);
    const evaluateBody = (await evaluate.json()) as {
      data: { exceptions: Array<{ id: string }> };
    };
    expect(evaluateBody.data.exceptions.length).toBeGreaterThan(0);
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const traineeAck = await app.request(
      `/exceptions/${exceptionId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "trainee-ack",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(traineeAck.status).toBe(403);
  });

  it("detects overdue check-in, surfaces attention, acknowledge/resolve without rewriting source", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveConfig("lifecycle");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-life",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string; recordStatus: string; windowEndsAt: string } };
    };
    const checkinId = scheduledBody.data.checkin.id;
    const originalEnds = scheduledBody.data.checkin.windowEndsAt;

    await db
      .update(schema.checkins)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.id, checkinId));

    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-life",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(evaluate.status).toBe(200);
    const evaluateBody = (await evaluate.json()) as {
      data: {
        created: number;
        activated: number;
        exceptions: Array<{
          id: string;
          type: string;
          status: string;
          sourceEntityId: string;
        }>;
      };
    };
    expect(evaluateBody.data.created).toBeGreaterThanOrEqual(1);
    expect(evaluateBody.data.exceptions[0]?.type).toBe("overdue_checkin");
    expect(evaluateBody.data.exceptions[0]?.status).toBe("active");
    expect(evaluateBody.data.exceptions[0]?.sourceEntityId).toBe(checkinId);
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const again = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-life-2",
        },
        body: "{}",
      },
      testEnv(),
    );
    const againBody = (await again.json()) as { data: { created: number } };
    expect(againBody.data.created).toBe(0);

    const attention = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(attention.status).toBe(200);
    const attentionBody = (await attention.json()) as {
      data: { items: Array<{ exception: { id: string } }> };
    };
    expect(
      attentionBody.data.items.some(
        (item) => item.exception.id === exceptionId,
      ),
    ).toBe(true);

    const context = await app.request(
      `/checkins/${checkinId}/review-context`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(context.status).toBe(200);
    const contextBody = (await context.json()) as {
      data: {
        activeExceptions: Array<{ id: string; type: string }>;
        checkin: { id: string; recordStatus: string };
      };
    };
    expect(contextBody.data.activeExceptions.some((e) => e.id === exceptionId)).toBe(
      true,
    );
    expect(contextBody.data.checkin.recordStatus).toBe("draft");

    const ack = await app.request(
      `/exceptions/${exceptionId}/acknowledge`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "ack-life",
        },
        body: JSON.stringify({ note: "Saw the miss" }),
      },
      testEnv(),
    );
    expect(ack.status).toBe(200);
    const ackBody = (await ack.json()) as {
      data: { status: string };
    };
    expect(ackBody.data.status).toBe("acknowledged");

    const checkinAfterAck = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId))
      .limit(1);
    expect(checkinAfterAck[0]?.recordStatus).toBe("draft");
    expect(checkinAfterAck[0]?.windowEndsAt).toBe("2020-01-02T00:00:00.000Z");
    expect(originalEnds).not.toBe("2020-01-02T00:00:00.000Z");

    const resolveTooEarly = await app.request(
      `/exceptions/${exceptionId}/resolve`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "resolve-early",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    // Already acknowledged — resolve should succeed
    expect(resolveTooEarly.status).toBe(200);
    const resolveBody = (await resolveTooEarly.json()) as {
      data: { status: string };
    };
    expect(resolveBody.data.status).toBe("resolved");

    const checkinAfterResolve = await db
      .select()
      .from(schema.checkins)
      .where(eq(schema.checkins.id, checkinId))
      .limit(1);
    expect(checkinAfterResolve[0]?.recordStatus).toBe("draft");

    const attentionAfter = await app.request(
      "/exceptions/attention",
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const attentionAfterBody = (await attentionAfter.json()) as {
      data: { items: Array<{ exception: { id: string } }> };
    };
    expect(
      attentionAfterBody.data.items.some(
        (item) => item.exception.id === exceptionId,
      ),
    ).toBe(false);
  });

  it("isolates another trainer from exception ownership", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveConfig("iso-a");
    const other = await createTrainerSession("ex-other@example.com");

    const scheduled = await app.request(
      `/checkins/relationships/${relationshipId}/schedule`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "sched-iso",
        },
        body: JSON.stringify({ localDate: today }),
      },
      testEnv(),
    );
    const scheduledBody = (await scheduled.json()) as {
      data: { checkin: { id: string } };
    };
    await db
      .update(schema.checkins)
      .set({
        windowStartsAt: "2020-01-01T00:00:00.000Z",
        windowEndsAt: "2020-01-02T00:00:00.000Z",
      })
      .where(eq(schema.checkins.id, scheduledBody.data.checkin.id));

    const evaluate = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-iso",
        },
        body: "{}",
      },
      testEnv(),
    );
    const evaluateBody = (await evaluate.json()) as {
      data: { exceptions: Array<{ id: string }> };
    };
    const exceptionId = evaluateBody.data.exceptions[0]!.id;

    const otherGet = await app.request(
      `/exceptions/${exceptionId}`,
      { headers: { Cookie: other.cookie } },
      testEnv(),
    );
    expect(otherGet.status).toBe(404);

    const otherEval = await app.request(
      `/exceptions/relationships/${relationshipId}/evaluate`,
      {
        method: "POST",
        headers: {
          Cookie: other.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "eval-other",
        },
        body: "{}",
      },
      testEnv(),
    );
    expect(otherEval.status).toBe(404);
  });
});
