import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import type { Env } from "../types.js";

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
    "0013_domain_contracts.sql",
  "0014_onboarding_form_templates.sql",
    "0011_templates_libraries.sql",
    "0015_iteration_a.sql",
    "0016_food_exercise_libraries.sql",
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

function testEnv(media = createMemoryR2Bucket()): Env {
  return {
    DB: dummyD1(),
    MEDIA: media,
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

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`sync-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-sync-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `sync-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `sync-trainee-${suffix}`,
    `sync-trainee-${suffix}@example.com`,
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
    data: { relationship: { id: string } };
  };
  const relationshipId = acceptBody.data.relationship.id;

  await app.request(
    `/onboarding/relationships/${relationshipId}/draft`,
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
    `/onboarding/relationships/${relationshipId}/submit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "x-fitbud-role": "trainee",
        "Content-Type": "application/json",
        "Idempotency-Key": `submit-sync-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  await app.request(
    `/onboarding/relationships/${relationshipId}/review`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-sync-${suffix}`,
      },
      body: JSON.stringify({ outcome: "coaching_ready" }),
    },
    testEnv(),
  );

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
  };
}

describe("sync routes (D3 offline)", () => {
  let closeDb: (() => void) | undefined;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    setTestDbOverride(memory.db);
    closeDb = memory.close;
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb?.();
  });

  it("returns 401 for unauthenticated sync push", async () => {
    const response = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mutations: [] }),
      },
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects trainer role on sync push", async () => {
    const trainer = await createTrainerSession("sync-trainer-role@example.com");
    const response = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: "00000000-0000-4000-8000-000000000101",
              idempotencyKey: "00000000-0000-4000-8000-000000000101",
              entityType: "measurement",
              recordId: "00000000-0000-4000-8000-000000000102",
              operation: "measurement.create",
              clientOccurredAt: "2026-09-26T12:00:00.000Z",
              payload: {},
            },
          ],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(403);
  });

  it("pushes offline measurement create and pulls the change", async () => {
    const { traineeToken, relationshipId } = await reachCoachingReady("push");
    const measurementId = "00000000-0000-4000-8000-000000000201";
    const mutationId = "00000000-0000-4000-8000-000000000202";

    const push = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [
            {
              mutationId,
              idempotencyKey: mutationId,
              entityType: "measurement",
              recordId: measurementId,
              operation: "measurement.create",
              expectedServerVersion: null,
              clientOccurredAt: "2026-09-26T12:00:00.000Z",
              payload: {
                coachingRelationshipId: relationshipId,
                id: measurementId,
                body: {
                  id: measurementId,
                  type: "body_weight_kg",
                  value: 70,
                  unit: "kg",
                },
              },
            },
          ],
        }),
      },
      testEnv(),
    );
    expect(push.status).toBe(200);
    const pushBody = (await push.json()) as {
      data: {
        results: Array<{
          status: string;
          recordId: string | null;
          mutationId: string;
        }>;
      };
    };
    expect(pushBody.data.results[0]?.status).toBe("applied");
    expect(pushBody.data.results[0]?.recordId).toBe(measurementId);

    const pull = await app.request(
      "/sync/pull",
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(pull.status).toBe(200);
    const pullBody = (await pull.json()) as {
      data: {
        changes: Array<{ entityType: string; recordId: string }>;
        nextCursor: string | null;
        hasMore: boolean;
      };
    };
    expect(
      pullBody.data.changes.some(
        (row) =>
          row.entityType === "measurement" && row.recordId === measurementId,
      ),
    ).toBe(true);
  });

  it("duplicate delivery returns already_applied without a second row", async () => {
    const { traineeToken, relationshipId } = await reachCoachingReady("dup");
    const measurementId = "00000000-0000-4000-8000-000000000301";
    const mutationId = "00000000-0000-4000-8000-000000000302";
    const payload = {
      mutations: [
        {
          mutationId,
          idempotencyKey: mutationId,
          entityType: "measurement",
          recordId: measurementId,
          operation: "measurement.create",
          expectedServerVersion: null,
          clientOccurredAt: "2026-09-26T12:00:00.000Z",
          payload: {
            coachingRelationshipId: relationshipId,
            id: measurementId,
            body: {
              id: measurementId,
              type: "waist_cm",
              value: 80,
              unit: "cm",
            },
          },
        },
      ],
    };

    const first = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);

    const second = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      },
      testEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data: { results: Array<{ status: string; recordId: string | null }> };
    };
    expect(["already_applied", "applied"]).toContain(
      secondBody.data.results[0]?.status,
    );
    expect(secondBody.data.results[0]?.recordId).toBe(measurementId);

    const listed = await app.request(
      `/progress/relationships/${relationshipId}/measurements`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const listedBody = (await listed.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(
      listedBody.data.items.filter((item) => item.id === measurementId),
    ).toHaveLength(1);
  });

  it("rejects plan_version / effective_plan mutation attempts", async () => {
    const { traineeToken } = await reachCoachingReady("plan-immutable");
    const response = await app.request(
      "/sync/push",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mutations: [
            {
              mutationId: "00000000-0000-4000-8000-000000000401",
              idempotencyKey: "00000000-0000-4000-8000-000000000401",
              entityType: "effective_plan",
              recordId: "00000000-0000-4000-8000-000000000402",
              operation: "measurement.create",
              clientOccurredAt: "2026-09-26T12:00:00.000Z",
              payload: {},
            },
          ],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { results: Array<{ status: string; error: { code: string } | null }> };
    };
    expect(body.data.results[0]?.status).toBe("rejected");
    expect(body.data.results[0]?.error?.code).toBe("SYNC_ENTITY_MISMATCH");
  });
});
