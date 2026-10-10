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
  return { cookie: setCookie!.split(";")[0]!, token };
}

async function reachCoachingReady(suffix: string) {
  const trainer = await createTrainerSession(`config-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-config-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `config-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `config-trainee-${suffix}`,
    `config-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-config-${suffix}`,
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
        "Idempotency-Key": `review-config-${suffix}`,
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

const draftBody = {
  expectedVersion: 0,
  goalShort: "Build strength",
  notes: "Focus on lower body recovery",
  workout: { sessionsPerWeek: 4, completionWindowHours: 24 },
  nutrition: {
    mealsPerDay: 3,
    confirmationWindowHours: 6,
    photoRequirement: "selected_meals" as const,
  },
  checkin: { cadence: "weekly" as const, dueWindowHours: 48 },
  tracking: {
    requireBodyWeight: true,
    requireProgressPhotos: false,
    requireSessionRpe: true,
  },
};

describe("coaching configuration", () => {
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

  it("returns 401 for unauthenticated configuration reads", async () => {
    const response = await app.request(
      "/configurations/relationships/00000000-0000-4000-8000-000000000099",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("walks Draft → Configured → Active and rejects edits after activate", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("c1");

    const missing = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(missing.status).toBe(404);

    const draft = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );
    expect(draft.status).toBe(201);
    const draftParsed = (await draft.json()) as {
      data: {
        status: string;
        recordVersion: number;
        versionNumber: number;
        workout: { sessionsPerWeek: number };
      };
    };
    expect(draftParsed.data.status).toBe("draft");
    expect(draftParsed.data.recordVersion).toBe(1);
    expect(draftParsed.data.versionNumber).toBe(1);
    expect(draftParsed.data.workout.sessionsPerWeek).toBe(4);

    const traineeRead = await app.request(
      `/configurations/relationships/${relationshipId}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeRead.status).toBe(200);

    const configure = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-1",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(200);
    const configured = (await configure.json()) as {
      data: { status: string; recordVersion: number; configuredAt: string | null };
    };
    expect(configured.data.status).toBe("configured");
    expect(configured.data.configuredAt).toBeTruthy();

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-1",
        },
        body: JSON.stringify({ expectedVersion: configured.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);
    const activated = (await activate.json()) as {
      data: { status: string; recordVersion: number };
    };
    expect(activated.data.status).toBe("active");

    const locked = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          expectedVersion: activated.data.recordVersion,
          goalShort: "Should fail",
        }),
      },
      testEnv(),
    );
    expect(locked.status).toBe(409);
    const lockedBody = (await locked.json()) as { error: { code: string } };
    expect(lockedBody.error.code).toBe("CONFIGURATION_NOT_EDITABLE");
  });

  it("rejects configure and activate until a short goal is saved", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("goal");
    const saved = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          goalShort: null,
          goalDescription: "A longer description does not satisfy the short goal.",
        }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(201);
    const draft = (await saved.json()) as { data: { recordVersion: number } };
    const configure = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-missing-goal",
        },
        body: JSON.stringify({ expectedVersion: draft.data.recordVersion }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(422);
    const configureBody = (await configure.json()) as { error: { code: string } };
    expect(configureBody.error.code).toBe("CONFIGURATION_INCOMPLETE");
  });

  it("isolates configuration across trainers", async () => {
    const first = await reachCoachingReady("iso-a");
    await app.request(
      `/configurations/relationships/${first.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: first.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(draftBody),
      },
      testEnv(),
    );

    const otherTrainer = await createTrainerSession("other-config@example.com");
    const forbidden = await app.request(
      `/configurations/relationships/${first.relationshipId}`,
      { headers: { Cookie: otherTrainer.cookie } },
      testEnv(),
    );
    expect(forbidden.status).toBe(404);
    const forbiddenBody = (await forbidden.json()) as { error: { code: string } };
    expect(forbiddenBody.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });
});
