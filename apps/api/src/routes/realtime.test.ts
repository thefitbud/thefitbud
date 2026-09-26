import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SAFE_REALTIME_EVENT_KEYS,
  relationshipRealtimeChannel,
  type RealtimeEvent,
} from "@fitbud/contracts";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { emitRealtimeHint } from "../realtime/emit.js";
import type { Env } from "../types.js";

const drizzleDir = join(dirname(fileURLToPath(import.meta.url)), "../../drizzle");

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const SQL = await initSqlJs();
  const sqlite = new SQL.Database();
  for (const file of [
    "0000_identity.sql",
    "0001_relationship_onboarding.sql",
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

function testEnv(sink?: RealtimeEvent[]): Env {
  return {
    DB: dummyD1(),
    MEDIA: createMemoryR2Bucket(),
    FIREBASE_PROJECT_ID: "fitbud-local",
    SESSION_COOKIE_NAME: "fitbud_session",
    AUTH_MODE: "test",
    MEDIA_SIGNING_SECRET: "fitbud-local-file-signing-secret",
    REALTIME_TEST_SINK: sink,
  };
}

async function createTrainerSession(email: string, env: Env = testEnv()) {
  const token = createTestIdToken(`trainer-${email}`, email);
  const sessionResponse = await app.request(
    "/auth/session",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token, timezone: "Asia/Kolkata" }),
    },
    env,
  );
  expect(sessionResponse.status).toBe(200);
  const setCookie = sessionResponse.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachCoachingReady(suffix: string, env: Env = testEnv()) {
  const trainer = await createTrainerSession(`rt-coach-${suffix}@example.com`, env);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-rt-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `rt-trainee-${suffix}@example.com`,
      }),
    },
    env,
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `rt-trainee-${suffix}`,
    `rt-trainee-${suffix}@example.com`,
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
    env,
  );
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string } };
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
    env,
  );
  await app.request(
    `/intake/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-rt-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    env,
  );
  await app.request(
    `/intake/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-rt-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    env,
  );

  return { trainer, traineeToken, relationshipId };
}

describe("realtime authorization and hints", () => {
  let closeDb: (() => void) | undefined;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    closeDb = memory.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
    closeDb = undefined;
  });

  it("rejects unauthenticated connection targets", async () => {
    const response = await app.request(
      "/realtime/relationships/00000000-0000-4000-8000-000000000099/connection",
      { method: "GET" },
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("hides unauthorized relationships on connection and ws routes", async () => {
    const env = testEnv();
    const owned = await reachCoachingReady("own", env);
    const other = await createTrainerSession("rt-other@example.com", env);

    const connection = await app.request(
      `/realtime/relationships/${owned.relationshipId}/connection`,
      { method: "GET", headers: { Cookie: other.cookie } },
      env,
    );
    expect(connection.status).toBe(404);

    const ws = await app.request(
      `/realtime/relationships/${owned.relationshipId}/ws`,
      {
        method: "GET",
        headers: {
          Cookie: other.cookie,
          Upgrade: "websocket",
          Connection: "Upgrade",
        },
      },
      env,
    );
    expect(ws.status).toBe(404);
  });

  it("returns an authorized subscription target for relationship members", async () => {
    const env = testEnv();
    const { trainer, traineeToken, relationshipId } =
      await reachCoachingReady("conn", env);

    const trainerConn = await app.request(
      `/realtime/relationships/${relationshipId}/connection`,
      { method: "GET", headers: { Cookie: trainer.cookie } },
      env,
    );
    expect(trainerConn.status).toBe(200);
    const trainerBody = (await trainerConn.json()) as {
      data: {
        coachingRelationshipId: string;
        channel: string;
        path: string;
        protocol: string;
      };
    };
    expect(trainerBody.data).toEqual({
      coachingRelationshipId: relationshipId,
      channel: relationshipRealtimeChannel(relationshipId),
      path: `/realtime/relationships/${relationshipId}/ws`,
      protocol: "websocket",
      authority: "rest_and_sync",
    });

    const traineeConn = await app.request(
      `/realtime/relationships/${relationshipId}/connection`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      env,
    );
    expect(traineeConn.status).toBe(200);
  });

  it("requires WebSocket upgrade and remains correct without DO binding", async () => {
    const env = testEnv();
    const { trainer, relationshipId } = await reachCoachingReady("ws", env);

    const missingUpgrade = await app.request(
      `/realtime/relationships/${relationshipId}/ws`,
      { method: "GET", headers: { Cookie: trainer.cookie } },
      env,
    );
    expect(missingUpgrade.status).toBe(426);

    const noHub = await app.request(
      `/realtime/relationships/${relationshipId}/ws`,
      {
        method: "GET",
        headers: {
          Cookie: trainer.cookie,
          Upgrade: "websocket",
          Connection: "Upgrade",
        },
      },
      env,
    );
    expect(noHub.status).toBe(503);
  });

  it("records compact hints on the test sink without sensitive fields", async () => {
    const sink: RealtimeEvent[] = [];
    const env = testEnv(sink);
    const event = await emitRealtimeHint(env, {
      eventType: "meal_compliance_changed",
      entityType: "meal_compliance",
      entityId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      coachingRelationshipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      serverVersion: 0,
    });
    expect(event).not.toBeNull();
    expect(sink).toHaveLength(1);
    expect(Object.keys(sink[0]!).sort()).toEqual(
      [...SAFE_REALTIME_EVENT_KEYS].sort(),
    );
    expect(sink[0]).not.toHaveProperty("summary");
    expect(sink[0]?.eventType).toBe("meal_compliance_changed");
  });

  it("emits effective_plan_changed when a plan becomes effective", async () => {
    const sink: RealtimeEvent[] = [];
    const env = testEnv(sink);
    const { trainer, relationshipId } = await reachCoachingReady("plan", env);

    const sampleContent = {
      workoutDays: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          order: 1,
          name: "Day A",
          exercises: [
            {
              id: "22222222-2222-4222-8222-222222222222",
              order: 1,
              name: "Squat",
              instructions: "Depth to parallel",
              setTargets: [
                {
                  id: "33333333-3333-4333-8333-333333333333",
                  order: 1,
                  reps: 5,
                  loadLabel: "RPE 7",
                  rpe: 7,
                },
              ],
            },
          ],
        },
      ],
      mealPrescriptions: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          order: 1,
          name: "Lunch",
          scheduleHint: "12:30",
          instructions: "Dal + rice",
          photoRequired: false,
        },
      ],
    };

    const created = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-rt-create",
        },
        body: JSON.stringify({
          title: "Realtime plan",
          content: sampleContent,
        }),
      },
      env,
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; recordVersion: number };
      };
    };

    sink.length = 0;
    const published = await app.request(
      `/plans/${createdBody.data.plan.id}/versions/${createdBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-rt-publish",
        },
        body: JSON.stringify({
          mode: "immediate",
          expectedRecordVersion: createdBody.data.version.recordVersion,
        }),
      },
      env,
    );
    expect(published.status).toBe(200);
    expect(
      sink.some((event) => event.eventType === "effective_plan_changed"),
    ).toBe(true);
    expect(
      sink.every((event) =>
        SAFE_REALTIME_EVENT_KEYS.every((key) => key in event),
      ),
    ).toBe(true);
  });
});
