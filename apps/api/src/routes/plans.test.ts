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
    "0009_sync.sql",
    "0010_notifications.sql",
    "0013_domain_contracts.sql",
  "0014_onboarding_form_templates.sql",
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

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`plan-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-plan-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `plan-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `plan-trainee-${suffix}`,
    `plan-trainee-${suffix}@example.com`,
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
          goals: "Strength",
          relevant_history: "None",
          preferences: "Gym",
          schedule: "Evenings",
          limitations: "Knee",
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
        "Idempotency-Key": `submit-plan-${suffix}`,
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
        "Idempotency-Key": `review-plan-${suffix}`,
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

function sampleContent() {
  return {
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
}

describe("plans and versions", () => {
  let closeDb: () => void;

  beforeEach(async () => {
    const memory = await createMemoryDb();
    closeDb = memory.close;
    setTestDbOverride(memory.db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    closeDb();
  });

  it("returns 401 for unauthenticated plan list", async () => {
    const response = await app.request(
      "/plans/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("creates, previews, publishes, rejects immutable edits, and supersedes", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("c2");

    const created = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-create-1",
        },
        body: JSON.stringify({
          title: "Foundation block",
          content: sampleContent(),
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; status: string; recordVersion: number };
      };
    };
    expect(createdBody.data.version.status).toBe("draft");
    const planId = createdBody.data.plan.id;
    const versionId = createdBody.data.version.id;

    const preview = await app.request(
      `/plans/${planId}/versions/${versionId}/preview`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(preview.status).toBe(200);

    const publish = await app.request(
      `/plans/${planId}/versions/${versionId}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-publish-1",
        },
        body: JSON.stringify({
          expectedRecordVersion: createdBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(publish.status).toBe(200);
    const published = (await publish.json()) as {
      data: { status: string; recordVersion: number };
    };
    expect(published.data.status).toBe("effective");

    const immutableEdit = await app.request(
      `/plans/${planId}/versions/${versionId}`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRecordVersion: published.data.recordVersion,
          content: sampleContent(),
        }),
      },
      testEnv(),
    );
    expect(immutableEdit.status).toBe(409);
    const immutableBody = (await immutableEdit.json()) as {
      error: { code: string };
    };
    expect(immutableBody.error.code).toBe("PLAN_VERSION_IMMUTABLE");

    const traineeEffective = await app.request(
      `/plans/relationships/${relationshipId}/effective`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeEffective.status).toBe(200);
    const effectiveBody = (await traineeEffective.json()) as {
      data: { version: { id: string; status: string } | null };
    };
    expect(effectiveBody.data.version?.id).toBe(versionId);
    expect(effectiveBody.data.version?.status).toBe("effective");

    const nextDraft = await app.request(
      `/plans/${planId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-adjust-1",
        },
        body: JSON.stringify({ sourceVersionId: versionId }),
      },
      testEnv(),
    );
    expect(nextDraft.status).toBe(201);
    const nextDraftBody = (await nextDraft.json()) as {
      data: { id: string; status: string; recordVersion: number };
    };
    expect(nextDraftBody.data.status).toBe("draft");

    const publish2 = await app.request(
      `/plans/${planId}/versions/${nextDraftBody.data.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-publish-2",
        },
        body: JSON.stringify({
          expectedRecordVersion: nextDraftBody.data.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(publish2.status).toBe(200);

    const oldVersion = await app.request(
      `/plans/${planId}/versions/${versionId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(oldVersion.status).toBe(200);
    const oldBody = (await oldVersion.json()) as {
      data: { status: string };
    };
    expect(oldBody.data.status).toBe("superseded");
  });

  it("schedules a future version and promotes it when due", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("sched");
    const created = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-sched-create",
        },
        body: JSON.stringify({
          title: "Scheduled block",
          content: sampleContent(),
        }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; recordVersion: number };
      };
    };

    const future = new Date(Date.now() + 60_000).toISOString();
    const scheduled = await app.request(
      `/plans/${createdBody.data.plan.id}/versions/${createdBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-sched-publish",
        },
        body: JSON.stringify({
          expectedRecordVersion: createdBody.data.version.recordVersion,
          mode: "scheduled",
          effectiveFrom: future,
        }),
      },
      testEnv(),
    );
    expect(scheduled.status).toBe(200);
    const scheduledBody = (await scheduled.json()) as {
      data: { status: string };
    };
    expect(scheduledBody.data.status).toBe("scheduled");

    const effective = await app.request(
      `/plans/relationships/${relationshipId}/effective`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(effective.status).toBe(200);
    const effectiveBody = (await effective.json()) as {
      data: { version: unknown };
    };
    expect(effectiveBody.data.version).toBeNull();
  });
});
