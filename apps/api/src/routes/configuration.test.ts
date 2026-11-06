import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, asc, eq } from "drizzle-orm";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";



import {
  createMemoryDb as createSharedMemoryDb,
  type SqlJsCompatDatabase,
} from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";
import { coachingConfigurationStatusSchema } from "@fitbud/contracts";
import { allLabelEntries } from "@fitbud/core";

/** Raw SQLite of the current test DB, for injecting failures with triggers. */
let currentSqlite: SqlJsCompatDatabase | null = null;
let currentDb: Db | null = null;

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
  currentSqlite = handle.sqlite;
  currentDb = handle.db;
  return { db: handle.db, close: handle.close };
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

type TestDb = Db;

function trainerJson(cookie: string, idempotencyKey?: string) {
  return {
    Cookie: cookie,
    "Content-Type": "application/json",
    ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
  };
}

async function saveDraft(
  cookie: string,
  relationshipId: string,
  body: Record<string, unknown>,
) {
  const response = await app.request(
    `/configurations/relationships/${relationshipId}/draft`,
    { method: "PUT", headers: trainerJson(cookie), body: JSON.stringify(body) },
    testEnv(),
  );
  expect([200, 201]).toContain(response.status);
  return ((await response.json()) as {
    data: { id: string; recordVersion: number; versionNumber: number };
  }).data;
}

async function activateConfiguration(
  cookie: string,
  relationshipId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  return app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: trainerJson(cookie, idempotencyKey),
      body: JSON.stringify({ expectedVersion }),
    },
    testEnv(),
  );
}

async function openNextVersion(
  cookie: string,
  relationshipId: string,
  expectedVersion: number,
  idempotencyKey: string,
) {
  const response = await app.request(
    `/configurations/relationships/${relationshipId}/versions`,
    {
      method: "POST",
      headers: trainerJson(cookie, idempotencyKey),
      body: JSON.stringify({ expectedVersion }),
    },
    testEnv(),
  );
  expect(response.status).toBe(201);
  return ((await response.json()) as {
    data: { id: string; recordVersion: number; versionNumber: number };
  }).data;
}

/** A plan with a workout on every weekday and one daily meal, published now. */
async function publishDailyPlan(cookie: string, relationshipId: string, key: string) {
  const plan = await app.request(
    `/plans/relationships/${relationshipId}`,
    {
      method: "POST",
      headers: trainerJson(cookie, `plan-${key}`),
      body: JSON.stringify({
        title: "Daily foundation",
        content: {
          workoutDays: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
            id: `3333333${weekday}-3333-4333-8333-33333333333${weekday}`,
            order: weekday + 1,
            name: `Day ${weekday + 1}`,
            weekday,
            exercises: [],
          })),
          mealPrescriptions: [
            {
              id: "44444444-4444-4444-8444-444444444444",
              order: 1,
              name: "Breakfast",
              mealType: "breakfast",
              applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
              localTime: "08:00",
              scheduleHint: "Morning",
              instructions: null,
              photoRequired: false,
            },
          ],
        },
      }),
    },
    testEnv(),
  );
  expect(plan.status).toBe(201);
  const planBody = (await plan.json()) as {
    data: { plan: { id: string }; version: { id: string; recordVersion: number } };
  };
  const published = await app.request(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    {
      method: "POST",
      headers: trainerJson(cookie, `publish-${key}`),
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );
  expect(published.status).toBe(200);
}

async function configurationRows(db: TestDb, relationshipId: string) {
  return db
    .select()
    .from(schema.coachingConfigurations)
    .where(eq(schema.coachingConfigurations.coachingRelationshipId, relationshipId))
    .orderBy(asc(schema.coachingConfigurations.versionNumber));
}

async function workoutRows(db: TestDb, relationshipId: string) {
  return db
    .select()
    .from(schema.workoutAssignments)
    .where(
      and(
        eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
        eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
      ),
    )
    .orderBy(asc(schema.workoutAssignments.localDate));
}

async function mealRows(db: TestDb, relationshipId: string) {
  return db
    .select()
    .from(schema.mealAssignments)
    .where(
      and(
        eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
        eq(schema.mealAssignments.scheduleStatus, "scheduled"),
      ),
    )
    .orderBy(asc(schema.mealAssignments.localDate));
}

async function setTraineeTimezone(db: TestDb, relationshipId: string, timezone: string) {
  const [relationship] = await db
    .select()
    .from(schema.coachingRelationships)
    .where(eq(schema.coachingRelationships.id, relationshipId));
  await db
    .update(schema.users)
    .set({ timezone })
    .where(eq(schema.users.id, relationship!.traineeUserId));
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

  it("walks Draft → Active directly and rejects edits after activate", async () => {
    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("c1");

    const missing = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(missing.status).toBe(200);
    const missingBody = (await missing.json()) as { data: unknown };
    expect(missingBody.data).toBeNull();

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
        missingSections: string[];
      };
    };
    expect(draftParsed.data.status).toBe("draft");
    expect(draftParsed.data.recordVersion).toBe(1);
    expect(draftParsed.data.versionNumber).toBe(1);
    expect(draftParsed.data.workout.sessionsPerWeek).toBe(4);
    expect(draftParsed.data.missingSections).toEqual([]);

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
    const traineeBody = (await traineeRead.json()) as {
      data: { missingSections: string[] };
    };
    expect(traineeBody.data.missingSections).toEqual([]);

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
    expect(configured.data.status).toBe("draft");
    expect(configured.data.recordVersion).toBe(1);
    expect(configured.data.configuredAt).toBeNull();

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
      data: { status: string; recordVersion: number; missingSections: string[] };
    };
    expect(activated.data.status).toBe("active");
    expect(activated.data.missingSections).toEqual([]);

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

  it("never accepts or returns the retired configured status (D12)", async () => {
    expect(coachingConfigurationStatusSchema.options).toEqual([
      "draft",
      "active",
      "superseded",
    ]);
    expect(coachingConfigurationStatusSchema.safeParse("configured").success).toBe(false);
    expect(
      allLabelEntries()
        .filter((entry) => entry.namespace === "coaching_configuration_status")
        .map((entry) => entry.value),
    ).toEqual(["draft", "active", "superseded"]);

    const { trainerCookie, traineeToken, relationshipId } =
      await reachCoachingReady("no-configured");

    const saved = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "PUT",
        headers: { Cookie: trainerCookie, "Content-Type": "application/json" },
        body: JSON.stringify({ ...draftBody, status: "configured" }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(201);
    const savedText = await saved.text();
    expect(savedText).not.toContain('"configured"');
    const savedBody = JSON.parse(savedText) as {
      data: { status: string; recordVersion: number };
    };
    expect(savedBody.data.status).toBe("draft");

    const configure = await app.request(
      `/configurations/relationships/${relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-no-configured",
        },
        body: JSON.stringify({ expectedVersion: savedBody.data.recordVersion }),
      },
      testEnv(),
    );
    expect(configure.status).toBe(200);
    expect(await configure.text()).not.toContain('"configured"');

    const reads: Array<{ headers: Record<string, string> }> = [
      { headers: { Cookie: trainerCookie } },
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
    ];
    for (const init of reads) {
      const read = await app.request(
        `/configurations/relationships/${relationshipId}`,
        init,
        testEnv(),
      );
      expect(read.status).toBe(200);
      const text = await read.text();
      expect(text).not.toContain('"configured"');
      const body = JSON.parse(text) as {
        data: { status: string; configuredAt: string | null };
      };
      expect(body.data.status).toBe("draft");
      expect(body.data.configuredAt).toBeNull();
    }
  });

  it("returns missingSections on GET and rejects activate until a short goal is saved", async () => {
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
    const draft = (await saved.json()) as {
      data: { recordVersion: number; missingSections: string[] };
    };
    expect(draft.data.missingSections).toEqual(["goal"]);

    const get = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(get.status).toBe(200);
    const getBody = (await get.json()) as {
      data: { missingSections: string[] };
    };
    expect(getBody.data.missingSections).toEqual(["goal"]);

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
    expect(configure.status).toBe(200);
    const configureBody = (await configure.json()) as {
      data: { status: string; recordVersion: number; missingSections: string[] };
    };
    expect(configureBody.data.status).toBe("draft");
    expect(configureBody.data.recordVersion).toBe(draft.data.recordVersion);
    expect(configureBody.data.missingSections).toEqual(["goal"]);

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-missing-goal",
        },
        body: JSON.stringify({ expectedVersion: draft.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(409);
    const activateBody = (await activate.json()) as {
      error: { code: string; details: { missingSections: string[] } };
    };
    expect(activateBody.error.code).toBe("CONFIGURATION_INCOMPLETE");
    expect(activateBody.error.details.missingSections).toEqual(["goal"]);
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

  it("creates a draft from core defaults and copies settings into a new draft", async () => {
    const source = await reachCoachingReady("defaults");
    const created = await app.request(
      `/configurations/relationships/${source.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 0,
          goalShort: "Build strength",
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: {
        id: string;
        workout: { sessionsPerWeek: number; completionWindowHours: number };
        nutrition: {
          mealsPerDay: number;
          confirmationWindowHours: number;
          photoRequirement: string;
        };
        checkin: { cadence: string; dueWindowHours: number };
        tracking: {
          requireBodyWeight: boolean;
          requireProgressPhotos: boolean;
          requireSessionRpe: boolean;
        };
      };
    };
    expect(createdBody.data.workout).toEqual({
      sessionsPerWeek: 3,
      completionWindowHours: 24,
    });
    expect(createdBody.data.nutrition).toEqual({
      mealsPerDay: 3,
      confirmationWindowHours: 6,
      photoRequirement: "none",
    });
    expect(createdBody.data.checkin).toEqual({
      cadence: "weekly",
      dueWindowHours: 48,
      formVersionId: null,
    });
    expect(createdBody.data.tracking).toEqual({
      requireBodyWeight: false,
      requireProgressPhotos: false,
      requireSessionRpe: false,
    });

    const configured = await app.request(
      `/configurations/relationships/${source.relationshipId}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draftBody,
          expectedVersion: 1,
          goalShort: "Build strength",
        }),
      },
      testEnv(),
    );
    expect(configured.status).toBe(200);
    const saved = (await configured.json()) as { data: { recordVersion: number } };
    const mark = await app.request(
      `/configurations/relationships/${source.relationshipId}/configure`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "configure-copy-source",
        },
        body: JSON.stringify({ expectedVersion: saved.data.recordVersion }),
      },
      testEnv(),
    );
    expect(mark.status).toBe(200);
    const marked = (await mark.json()) as { data: { recordVersion: number } };
    const activate = await app.request(
      `/configurations/relationships/${source.relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-copy-source",
        },
        body: JSON.stringify({ expectedVersion: marked.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);

    const other = await reachCoachingReady("copy-other");
    const unownedSource = await app.request(
      `/configurations/relationships/${source.relationshipId}/copy`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "copy-unowned-source",
        },
        body: JSON.stringify({ sourceRelationshipId: other.relationshipId }),
      },
      testEnv(),
    );
    expect(unownedSource.status).toBe(404);

    const createdInvite = await app.request(
      "/invitations",
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "inv-copy-second",
        },
        body: JSON.stringify({
          recipientEmail: "config-trainee-copy-second@example.com",
        }),
      },
      testEnv(),
    );
    const createdInviteBody = (await createdInvite.json()) as {
      data: { token: string };
    };
    const traineeToken = createTestIdToken(
      "config-trainee-copy-second",
      "config-trainee-copy-second@example.com",
    );
    const accept = await app.request(
      "/invitations/accept",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: createdInviteBody.data.token }),
      },
      testEnv(),
    );
    const acceptBody = (await accept.json()) as {
      data: { relationship: { id: string } };
    };
    const second = acceptBody.data.relationship.id;
    await app.request(
      `/onboarding/relationships/${second}/draft`,
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
    const intake = await app.request(
      `/onboarding/relationships/${second}/submit`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "submit-copy-second",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(intake.status).toBe(200);
    const review = await app.request(
      `/onboarding/relationships/${second}/review`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "review-copy-second",
        },
        body: JSON.stringify({ outcome: "coaching_ready" }),
      },
      testEnv(),
    );
    expect(review.status).toBe(200);

    const copied = await app.request(
      `/configurations/relationships/${second}/copy`,
      {
        method: "POST",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "copy-settings",
        },
        body: JSON.stringify({ sourceRelationshipId: source.relationshipId }),
      },
      testEnv(),
    );
    expect(copied.status).toBe(201);
    const copiedBody = (await copied.json()) as {
      data: {
        id: string;
        status: string;
        coachingRelationshipId: string;
        workout: { sessionsPerWeek: number };
      };
    };
    expect(copiedBody.data.id).not.toBe(createdBody.data.id);
    expect(copiedBody.data.status).toBe("draft");
    expect(copiedBody.data.coachingRelationshipId).toBe(second);
    expect(copiedBody.data.workout.sessionsPerWeek).toBe(4);

    const edited = await app.request(
      `/configurations/relationships/${second}/draft`,
      {
        method: "PUT",
        headers: {
          Cookie: source.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedVersion: 1,
          workout: { sessionsPerWeek: 2, completionWindowHours: 24 },
        }),
      },
      testEnv(),
    );
    expect(edited.status).toBe(200);

    const sourceAfter = await app.request(
      `/configurations/relationships/${source.relationshipId}`,
      { headers: { Cookie: source.trainerCookie } },
      testEnv(),
    );
    const sourceAfterBody = (await sourceAfter.json()) as {
      data: { id: string; status: string; workout: { sessionsPerWeek: number } };
    };
    expect(sourceAfterBody.data.status).toBe("active");
    expect(sourceAfterBody.data.id).not.toBe(copiedBody.data.id);
    expect(sourceAfterBody.data.workout.sessionsPerWeek).toBe(4);

    const presets = await app.request(
      "/configurations/presets",
      { headers: { Cookie: source.trainerCookie } },
      testEnv(),
    );
    expect(presets.status).toBe(404);
  });

  it("rolls back activate on version conflict and keeps the previous active row", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("conflict");
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
    const first = (await draft.json()) as {
      data: { id: string; recordVersion: number };
    };
    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-conflict-v1",
        },
        body: JSON.stringify({ expectedVersion: first.data.recordVersion }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);
    const active = (await activate.json()) as {
      data: { id: string; recordVersion: number; status: string };
    };
    expect(active.data.status).toBe("active");

    const opened = await app.request(
      `/configurations/relationships/${relationshipId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "versions-conflict-1",
        },
        body: JSON.stringify({ expectedVersion: active.data.recordVersion }),
      },
      testEnv(),
    );
    expect(opened.status).toBe(201);
    const next = (await opened.json()) as {
      data: { id: string; recordVersion: number; versionNumber: number };
    };
    expect(next.data.versionNumber).toBe(2);

    const stale = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-stale-version",
        },
        body: JSON.stringify({ expectedVersion: 0 }),
      },
      testEnv(),
    );
    expect(stale.status).toBe(409);
    const staleBody = (await stale.json()) as { error: { code: string } };
    expect(staleBody.error.code).toBe("CONFIGURATION_VERSION_CONFLICT");

    const after = await app.request(
      `/configurations/relationships/${relationshipId}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const afterBody = (await after.json()) as {
      data: { id: string; status: string; versionNumber: number };
    };
    expect(afterBody.data.status).toBe("draft");
    expect(afterBody.data.id).toBe(next.data.id);
    expect(afterBody.data.versionNumber).toBe(2);
  });

  it("discards an open vN+1 draft and returns the active configuration", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("discard");
    await app.request(
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
    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-for-discard",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    const active = (await activate.json()) as {
      data: { id: string; recordVersion: number };
    };
    const opened = await app.request(
      `/configurations/relationships/${relationshipId}/versions`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "versions-for-discard",
        },
        body: JSON.stringify({ expectedVersion: active.data.recordVersion }),
      },
      testEnv(),
    );
    expect(opened.status).toBe(201);
    const draft = (await opened.json()) as { data: { id: string } };
    expect(draft.data.id).not.toBe(active.data.id);

    const discarded = await app.request(
      `/configurations/relationships/${relationshipId}/draft`,
      {
        method: "DELETE",
        headers: { Cookie: trainerCookie },
      },
      testEnv(),
    );
    expect(discarded.status).toBe(200);
    const discardedBody = (await discarded.json()) as {
      data: { id: string; status: string; versionNumber: number };
    };
    expect(discardedBody.data.id).toBe(active.data.id);
    expect(discardedBody.data.status).toBe("active");
    expect(discardedBody.data.versionNumber).toBe(1);
  });

  it("materialises assignments immediately after activate when a plan is published", async () => {
    const { trainerCookie, relationshipId } = await reachCoachingReady("schedule");
    await app.request(
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

    const plan = await app.request(
      `/plans/relationships/${relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-before-activate",
        },
        body: JSON.stringify({
          title: "Foundation",
          content: {
            workoutDays: [
              {
                id: "11111111-1111-4111-8111-111111111111",
                order: 1,
                name: "Day A",
                weekday: 1,
                exercises: [],
              },
            ],
            mealPrescriptions: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                order: 1,
                name: "Breakfast",
                mealType: "breakfast",
                applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
                localTime: "08:00",
                scheduleHint: "Morning",
                instructions: null,
                photoRequired: false,
              },
            ],
          },
        }),
      },
      testEnv(),
    );
    expect(plan.status).toBe(201);
    const planBody = (await plan.json()) as {
      data: {
        plan: { id: string };
        version: { id: string; recordVersion: number };
      };
    };
    const published = await app.request(
      `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "pub-before-activate",
        },
        body: JSON.stringify({
          expectedRecordVersion: planBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);

    const before = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    const beforeBody = (await before.json()) as { data: { items: unknown[] } };
    expect(beforeBody.data.items).toHaveLength(0);

    const activate = await app.request(
      `/configurations/relationships/${relationshipId}/activate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "activate-with-plan",
        },
        body: JSON.stringify({ expectedVersion: 1 }),
      },
      testEnv(),
    );
    expect(activate.status).toBe(200);

    const workouts = await app.request(
      `/workouts/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(workouts.status).toBe(200);
    const workoutBody = (await workouts.json()) as { data: { items: unknown[] } };
    expect(workoutBody.data.items.length).toBeGreaterThan(0);

    const meals = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=2020-01-01&toDate=2099-01-01`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(meals.status).toBe(200);
    const mealBody = (await meals.json()) as { data: { items: unknown[] } };
    expect(mealBody.data.items.length).toBeGreaterThan(0);
  });

  it("activates a draft and writes its schedule in one batch: an injected failure leaves the draft unchanged", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("atomic-first");
    const draft = await saveDraft(trainerCookie, relationshipId, draftBody);
    await publishDailyPlan(trainerCookie, relationshipId, "atomic-first");
    expect(await workoutRows(db, relationshipId)).toHaveLength(0);
    const configsBefore = await configurationRows(db, relationshipId);

    // Meal inserts are the last statements of the batch, after the status
    // change and the workout inserts: all of them must roll back.
    currentSqlite!.run(
      "CREATE TRIGGER z52_fail_meal_insert BEFORE INSERT ON meal_assignments BEGIN SELECT RAISE(ABORT, 'z52 injected failure'); END",
    );
    const failed = await activateConfiguration(
      trainerCookie,
      relationshipId,
      draft.recordVersion,
      "activate-atomic-first",
    );
    currentSqlite!.run("DROP TRIGGER z52_fail_meal_insert");
    expect(failed.status).toBe(500);
    expect(await configurationRows(db, relationshipId)).toEqual(configsBefore);
    expect(configsBefore.map((row) => row.status)).toEqual(["draft"]);
    expect(await workoutRows(db, relationshipId)).toHaveLength(0);
    expect(await mealRows(db, relationshipId)).toHaveLength(0);

    // Nothing was recorded for the failed attempt: the same retry succeeds.
    const retried = await activateConfiguration(
      trainerCookie,
      relationshipId,
      draft.recordVersion,
      "activate-atomic-first",
    );
    expect(retried.status).toBe(200);
    const configsAfter = await configurationRows(db, relationshipId);
    expect(configsAfter.map((row) => [row.status, row.recordVersion])).toEqual([
      ["active", draft.recordVersion + 1],
    ]);
    // First activation: the schedule starts today (7-day horizon).
    expect(await workoutRows(db, relationshipId)).toHaveLength(7);
    expect(await mealRows(db, relationshipId)).toHaveLength(7);
  });

  it("Save as vN+1 rolls back with the schedule: vN stays active and vN+1 stays a draft", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("atomic-next");
    await publishDailyPlan(trainerCookie, relationshipId, "atomic-next");
    const v1 = await saveDraft(trainerCookie, relationshipId, draftBody);
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, v1.recordVersion, "act-next-v1"))
        .status,
    ).toBe(200);
    const active = (await configurationRows(db, relationshipId))[0]!;
    const opened = await openNextVersion(
      trainerCookie,
      relationshipId,
      active.recordVersion,
      "versions-atomic-next",
    );
    const v2 = await saveDraft(trainerCookie, relationshipId, {
      ...draftBody,
      expectedVersion: opened.recordVersion,
      workout: { sessionsPerWeek: 4, completionWindowHours: 48 },
    });
    const configsBefore = await configurationRows(db, relationshipId);
    const workoutsBefore = await workoutRows(db, relationshipId);
    expect(workoutsBefore.length).toBeGreaterThan(1);

    // Re-timing tomorrow's rows is the last part of the batch.
    currentSqlite!.run(
      "CREATE TRIGGER z52_fail_retime BEFORE UPDATE OF window_ends_at ON workout_assignments BEGIN SELECT RAISE(ABORT, 'z52 injected failure'); END",
    );
    const failed = await activateConfiguration(
      trainerCookie,
      relationshipId,
      v2.recordVersion,
      "act-next-v2",
    );
    currentSqlite!.run("DROP TRIGGER z52_fail_retime");
    expect(failed.status).toBe(500);
    expect(await configurationRows(db, relationshipId)).toEqual(configsBefore);
    expect(configsBefore.map((row) => row.status)).toEqual(["active", "draft"]);
    expect(await workoutRows(db, relationshipId)).toEqual(workoutsBefore);

    const retried = await activateConfiguration(
      trainerCookie,
      relationshipId,
      v2.recordVersion,
      "act-next-v2",
    );
    expect(retried.status).toBe(200);
    expect((await configurationRows(db, relationshipId)).map((row) => row.status)).toEqual([
      "superseded",
      "active",
    ]);
  });

  it("returns 409 and writes no schedule when the draft changes between read and batch", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("race");
    await publishDailyPlan(trainerCookie, relationshipId, "race");
    const v1 = await saveDraft(trainerCookie, relationshipId, draftBody);
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, v1.recordVersion, "race-v1"))
        .status,
    ).toBe(200);
    const active = (await configurationRows(db, relationshipId))[0]!;
    const opened = await openNextVersion(
      trainerCookie,
      relationshipId,
      active.recordVersion,
      "race-versions",
    );
    const v2 = await saveDraft(trainerCookie, relationshipId, {
      ...draftBody,
      expectedVersion: opened.recordVersion,
      workout: { sessionsPerWeek: 4, completionWindowHours: 48 },
    });
    const workoutsBefore = await workoutRows(db, relationshipId);

    // Another tab saves the draft after this request read it but before its
    // batch runs.
    const realBatch = db.batch.bind(db);
    const spy = vi.spyOn(db, "batch").mockImplementationOnce(async (statements) => {
      await db
        .update(schema.coachingConfigurations)
        .set({ recordVersion: v2.recordVersion + 1 })
        .where(eq(schema.coachingConfigurations.id, v2.id));
      return realBatch(statements);
    });
    try {
      const response = await activateConfiguration(
        trainerCookie,
        relationshipId,
        v2.recordVersion,
        "race-v2",
      );
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
        "CONFIGURATION_VERSION_CONFLICT",
      );
    } finally {
      spy.mockRestore();
    }
    expect(
      (await configurationRows(db, relationshipId)).map((row) => [row.status, row.recordVersion]),
    ).toEqual([
      ["active", active.recordVersion],
      ["draft", v2.recordVersion + 1],
    ]);
    expect(await workoutRows(db, relationshipId)).toEqual(workoutsBefore);
  });

  it("Save as vN+1 applies a photo-only change from tomorrow", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("photo-only");
    await publishDailyPlan(trainerCookie, relationshipId, "photo-only");
    const nutrition = { mealsPerDay: 3, confirmationWindowHours: 6 };
    const v1 = await saveDraft(trainerCookie, relationshipId, {
      ...draftBody,
      nutrition: { ...nutrition, photoRequirement: "none" },
    });
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, v1.recordVersion, "photo-v1"))
        .status,
    ).toBe(200);
    const before = await mealRows(db, relationshipId);
    expect(before.map((row) => row.photoRequired)).toEqual(before.map(() => false));
    const v1Row = (await configurationRows(db, relationshipId))[0]!;
    const opened = await openNextVersion(
      trainerCookie,
      relationshipId,
      v1Row.recordVersion,
      "photo-versions",
    );
    const v2 = await saveDraft(trainerCookie, relationshipId, {
      ...draftBody,
      expectedVersion: opened.recordVersion,
      nutrition: { ...nutrition, photoRequirement: "all_meals" },
    });
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, v2.recordVersion, "photo-v2"))
        .status,
    ).toBe(200);
    const after = await mealRows(db, relationshipId);
    // Windows are unchanged; only the photo requirement moves, from tomorrow.
    expect(after.map((row) => row.windowEndsAt)).toEqual(before.map((row) => row.windowEndsAt));
    expect(after.map((row) => row.photoRequired)).toEqual(
      after.map((_, index) => index > 0),
    );
  });

  it("returns 409 naming the missing D17 section and leaves the draft as it was", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("missing-409");
    const draft = await saveDraft(trainerCookie, relationshipId, {
      ...draftBody,
      goalShort: null,
    });
    // Saved drafts always carry valid expectations (the contract rejects
    // anything else), so the goal is the section a real draft can miss; the
    // other sections' rules are covered in packages/core configuration.test.
    const before = await configurationRows(db, relationshipId);

    const response = await activateConfiguration(
      trainerCookie,
      relationshipId,
      draft.recordVersion,
      "activate-missing-409",
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as {
      error: { code: string; message: string; details: { missingSections: string[] } };
    };
    expect(body.error.code).toBe("CONFIGURATION_INCOMPLETE");
    expect(body.error.details.missingSections).toEqual(["goal"]);
    expect(await configurationRows(db, relationshipId)).toEqual(before);
  });

  it("discards a first draft, and refuses to discard when only active or superseded versions remain", async () => {
    const db = currentDb!;
    const { trainerCookie, relationshipId } = await reachCoachingReady("discard-409");
    const discard = (query = "") =>
      app.request(
        `/configurations/relationships/${relationshipId}/draft${query}`,
        { method: "DELETE", headers: { Cookie: trainerCookie } },
        testEnv(),
      );

    const first = await saveDraft(trainerCookie, relationshipId, draftBody);
    // A stale version never discards a draft changed elsewhere.
    const stale = await discard(`?expectedVersion=${first.recordVersion + 1}`);
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as { error: { code: string } }).error.code).toBe(
      "CONFIGURATION_VERSION_CONFLICT",
    );
    expect(await configurationRows(db, relationshipId)).toHaveLength(1);

    const removed = await discard(`?expectedVersion=${first.recordVersion}`);
    expect(removed.status).toBe(200);
    expect(((await removed.json()) as { data: unknown }).data).toBeNull();
    expect(await configurationRows(db, relationshipId)).toEqual([]);
    for (const table of [
      schema.workoutExpectations,
      schema.nutritionExpectations,
      schema.checkinSchedules,
      schema.trackingRequirements,
    ]) {
      const children = await db
        .select()
        .from(table)
        .where(eq(table.coachingConfigurationId, first.id));
      expect(children).toEqual([]);
    }
    const none = await discard();
    expect(none.status).toBe(404);

    // v1 active → v2 active (v1 superseded): nothing is a draft any more.
    const v1 = await saveDraft(trainerCookie, relationshipId, draftBody);
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, v1.recordVersion, "discard-v1"))
        .status,
    ).toBe(200);
    const activeOnly = await discard();
    expect(activeOnly.status).toBe(409);
    expect(((await activeOnly.json()) as { error: { code: string } }).error.code).toBe(
      "CONFIGURATION_NOT_DRAFT",
    );
    const v1Row = (await configurationRows(db, relationshipId))[0]!;
    const opened = await openNextVersion(
      trainerCookie,
      relationshipId,
      v1Row.recordVersion,
      "discard-versions",
    );
    expect(
      (await activateConfiguration(trainerCookie, relationshipId, opened.recordVersion, "discard-v2"))
        .status,
    ).toBe(200);
    const history = await configurationRows(db, relationshipId);
    expect(history.map((row) => row.status)).toEqual(["superseded", "active"]);
    const refused = await discard();
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { code: string } }).error.code).toBe(
      "CONFIGURATION_NOT_DRAFT",
    );
    expect(await configurationRows(db, relationshipId)).toEqual(history);
  });

  it("Save as vN+1 goes live now and its targets apply from tomorrow in the trainee's timezone", async () => {
    // Mon 9 Nov 2026, 20:00 UTC = Tue 10 Nov, 01:30 in Asia/Kolkata. A UTC
    // reading would call 10 Nov "tomorrow"; for the trainee it is today.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-09T20:00:00.000Z") });
    try {
      const db = currentDb!;
      const { trainerCookie, relationshipId } = await reachCoachingReady("tomorrow-tz");
      await setTraineeTimezone(db, relationshipId, "Asia/Kolkata");
      await publishDailyPlan(trainerCookie, relationshipId, "tomorrow-tz");
      const v1 = await saveDraft(trainerCookie, relationshipId, {
        ...draftBody,
        workout: { sessionsPerWeek: 4, completionWindowHours: 24 },
        nutrition: { mealsPerDay: 3, confirmationWindowHours: 6, photoRequirement: "none" },
      });
      expect(
        (await activateConfiguration(trainerCookie, relationshipId, v1.recordVersion, "tz-v1"))
          .status,
      ).toBe(200);

      // IST midnight of D is (D - 1) 18:30 UTC.
      const istMidnight = (localDate: string) =>
        new Date(
          Date.parse(`${localDate}T00:00:00.000Z`) - 5.5 * 60 * 60 * 1000,
        ).toISOString();
      const plusHours = (iso: string, hours: number) =>
        new Date(Date.parse(iso) + hours * 60 * 60 * 1000).toISOString();
      const horizon = [
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
        "2026-11-16",
      ];
      const v1Workouts = await workoutRows(db, relationshipId);
      expect(v1Workouts.map((row) => row.localDate)).toEqual(horizon);
      expect(v1Workouts[1]!.windowEndsAt).toBe(plusHours(istMidnight("2026-11-11"), 24));

      const v1Row = (await configurationRows(db, relationshipId))[0]!;
      const opened = await openNextVersion(
        trainerCookie,
        relationshipId,
        v1Row.recordVersion,
        "tz-versions",
      );
      expect(opened.versionNumber).toBe(2);
      const v2 = await saveDraft(trainerCookie, relationshipId, {
        ...draftBody,
        expectedVersion: opened.recordVersion,
        workout: { sessionsPerWeek: 4, completionWindowHours: 48 },
        nutrition: { mealsPerDay: 3, confirmationWindowHours: 12, photoRequirement: "all_meals" },
      });
      const activated = await activateConfiguration(
        trainerCookie,
        relationshipId,
        v2.recordVersion,
        "tz-v2",
      );
      expect(activated.status).toBe(200);
      const activatedBody = (await activated.json()) as {
        data: { id: string; status: string; versionNumber: number };
      };
      expect(activatedBody.data).toMatchObject({ status: "active", versionNumber: 2 });

      // vN+1 is live immediately and vN is superseded.
      const configs = await configurationRows(db, relationshipId);
      expect(configs.map((row) => [row.versionNumber, row.status])).toEqual([
        [1, "superseded"],
        [2, "active"],
      ]);
      expect(configs[1]!.activatedAt).toBe("2026-11-09T20:00:00.000Z");

      const workouts = await workoutRows(db, relationshipId);
      const meals = await mealRows(db, relationshipId);
      // No duplicate rows: the same 7 days, re-timed in place.
      expect(workouts.map((row) => row.localDate)).toEqual(horizon);
      expect(meals.map((row) => row.localDate)).toEqual(horizon);
      expect(workouts.map((row) => row.id)).toEqual(v1Workouts.map((row) => row.id));

      // Today (Tue 10 Nov in the trainee's zone) keeps v1's targets.
      expect(workouts[0]).toMatchObject({
        localDate: "2026-11-10",
        windowStartsAt: istMidnight("2026-11-10"),
        windowEndsAt: plusHours(istMidnight("2026-11-10"), 24),
      });
      expect(meals[0]).toMatchObject({
        localDate: "2026-11-10",
        windowEndsAt: plusHours(istMidnight("2026-11-10"), 6),
        photoRequired: false,
      });
      // From tomorrow, v2's targets.
      for (const [index, localDate] of horizon.entries()) {
        if (index === 0) continue;
        expect(workouts[index]).toMatchObject({
          localDate,
          windowStartsAt: istMidnight(localDate),
          windowEndsAt: plusHours(istMidnight(localDate), 48),
        });
        expect(meals[index]).toMatchObject({
          localDate,
          windowEndsAt: plusHours(istMidnight(localDate), 12),
          photoRequired: true,
        });
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
