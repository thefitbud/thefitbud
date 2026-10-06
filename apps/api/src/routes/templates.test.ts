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
    "0011_templates_libraries.sql",
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
  const trainer = await createTrainerSession(`tmpl-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-tmpl-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `tmpl-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `tmpl-trainee-${suffix}`,
    `tmpl-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-tmpl-${suffix}`,
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
        "Idempotency-Key": `review-tmpl-${suffix}`,
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

function workoutContent() {
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
    mealPrescriptions: [] as never[],
  };
}

describe("templates and libraries", () => {
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

  it("rejects unauthenticated template and library access", async () => {
    const templates = await app.request("/templates", {}, testEnv());
    expect(templates.status).toBe(401);

    const exercises = await app.request("/libraries/exercises", {}, testEnv());
    expect(exercises.status).toBe(401);

    const foods = await app.request("/libraries/foods", {}, testEnv());
    expect(foods.status).toBe(401);
  });

  it("isolates trainer-owned templates and blocks trainee access", async () => {
    const a = await reachCoachingReady("a");
    const b = await createTrainerSession("other-tmpl@example.com");

    const created = await app.request(
      "/templates",
      {
        method: "POST",
        headers: {
          Cookie: a.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "tmpl-create-a",
        },
        body: JSON.stringify({
          title: "Beginner A",
          templateType: "workout",
          content: workoutContent(),
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { id: string; content: { workoutDays: Array<{ id: string }> } };
    };
    const templateId = createdBody.data.id;
    const sourceDayId = createdBody.data.content.workoutDays[0]!.id;

    const otherList = await app.request(
      "/templates",
      { headers: { Cookie: b.cookie } },
      testEnv(),
    );
    expect(otherList.status).toBe(200);
    const otherBody = (await otherList.json()) as {
      data: { items: unknown[] };
    };
    expect(otherBody.data.items).toHaveLength(0);

    const otherGet = await app.request(
      `/templates/${templateId}`,
      { headers: { Cookie: b.cookie } },
      testEnv(),
    );
    expect(otherGet.status).toBe(404);

    const traineeList = await app.request(
      "/templates",
      {
        headers: {
          Authorization: `Bearer ${a.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeList.status).toBe(403);

    const apply = await app.request(
      `/plans/relationships/${a.relationshipId}/from-template`,
      {
        method: "POST",
        headers: {
          Cookie: a.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "apply-tmpl-a",
        },
        body: JSON.stringify({ templateId }),
      },
      testEnv(),
    );
    expect(apply.status).toBe(201);
    const applyBody = (await apply.json()) as {
      data: {
        version: {
          creationSource: string;
          content: { workoutDays: Array<{ id: string; name: string }> };
        };
        updatedExistingDraft: boolean;
      };
    };
    expect(applyBody.data.version.creationSource).toBe("template");
    expect(applyBody.data.updatedExistingDraft).toBe(false);
    expect(applyBody.data.version.content.workoutDays[0]!.name).toBe("Day A");
    expect(applyBody.data.version.content.workoutDays[0]!.id).not.toBe(
      sourceDayId,
    );

    // Mutating the template must not change the already-copied draft.
    await app.request(
      `/templates/${templateId}`,
      {
        method: "PUT",
        headers: {
          Cookie: a.trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          expectedRecordVersion: 1,
          title: "Beginner A renamed",
          content: {
            workoutDays: [
              {
                id: "aaaaaaaa-1111-4111-8111-111111111111",
                order: 1,
                name: "Day Z",
                exercises: [],
              },
            ],
            mealPrescriptions: [],
          },
        }),
      },
      testEnv(),
    );

    const plans = await app.request(
      `/plans/relationships/${a.relationshipId}`,
      { headers: { Cookie: a.trainerCookie } },
      testEnv(),
    );
    const plansBody = (await plans.json()) as {
      data: {
        items: Array<{
          plan: { id: string };
          versions: Array<{ id: string }>;
        }>;
      };
    };
    const planId = plansBody.data.items[0]!.plan.id;
    const versionId = plansBody.data.items[0]!.versions[0]!.id;
    const version = await app.request(
      `/plans/${planId}/versions/${versionId}`,
      { headers: { Cookie: a.trainerCookie } },
      testEnv(),
    );
    const versionBody = (await version.json()) as {
      data: { content: { workoutDays: Array<{ name: string }> } };
    };
    expect(versionBody.data.content.workoutDays[0]!.name).toBe("Day A");
  });

  it("updates an existing draft when re-applying a template", async () => {
    const ctx = await reachCoachingReady("reapply");
    const created = await app.request(
      "/templates",
      {
        method: "POST",
        headers: {
          Cookie: ctx.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "tmpl-reapply",
        },
        body: JSON.stringify({
          title: "Reapply block",
          templateType: "workout",
          content: workoutContent(),
        }),
      },
      testEnv(),
    );
    const createdBody = (await created.json()) as { data: { id: string } };

    const first = await app.request(
      `/plans/relationships/${ctx.relationshipId}/from-template`,
      {
        method: "POST",
        headers: {
          Cookie: ctx.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "apply-1",
        },
        body: JSON.stringify({ templateId: createdBody.data.id }),
      },
      testEnv(),
    );
    expect(first.status).toBe(201);

    const second = await app.request(
      `/plans/relationships/${ctx.relationshipId}/from-template`,
      {
        method: "POST",
        headers: {
          Cookie: ctx.trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "apply-2",
        },
        body: JSON.stringify({ templateId: createdBody.data.id }),
      },
      testEnv(),
    );
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data: { updatedExistingDraft: boolean; version: { recordVersion: number } };
    };
    expect(secondBody.data.updatedExistingDraft).toBe(true);
    expect(secondBody.data.version.recordVersion).toBe(2);
  });

  it("lists seeded global exercise and Indian food libraries", async () => {
    const trainer = await createTrainerSession("lib@example.com");
    const exercises = await app.request(
      "/libraries/exercises",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(exercises.status).toBe(200);
    const exerciseBody = (await exercises.json()) as {
      data: { items: Array<{ ownership: string; name: string }> };
    };
    expect(exerciseBody.data.items.length).toBeGreaterThanOrEqual(6);
    expect(exerciseBody.data.items.every((i) => i.ownership === "global")).toBe(
      true,
    );

    const foods = await app.request(
      "/libraries/foods",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(foods.status).toBe(200);
    const foodBody = (await foods.json()) as {
      data: {
        items: Array<{ cuisineRegion: string; name: string; ownership: string }>;
      };
    };
    expect(foodBody.data.items.length).toBeGreaterThanOrEqual(8);
    expect(
      foodBody.data.items.every(
        (i) => i.cuisineRegion === "indian" && i.ownership === "global",
      ),
    ).toBe(true);

    const addExercise = await app.request(
      "/libraries/exercises",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Cable face pull",
          instructions: "Pull toward the face.",
          defaultReps: 12,
        }),
      },
      testEnv(),
    );
    expect(addExercise.status).toBe(201);

    const listed = await app.request(
      "/libraries/exercises",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const listedBody = (await listed.json()) as {
      data: { items: Array<{ name: string; ownership: string }> };
    };
    expect(
      listedBody.data.items.some(
        (i) => i.name === "Cable face pull" && i.ownership === "trainer",
      ),
    ).toBe(true);
  });

  it("rejects global library mutation by trainers", async () => {
    const trainer = await createTrainerSession("lib-mut@example.com");
    const update = await app.request(
      "/libraries/exercises/e1000001-0000-4000-8000-000000000001",
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Hacked squat" }),
      },
      testEnv(),
    );
    expect(update.status).toBe(404);

    const del = await app.request(
      "/libraries/foods/f1000001-0000-4000-8000-000000000001",
      {
        method: "DELETE",
        headers: { Cookie: trainer.cookie },
      },
      testEnv(),
    );
    expect(del.status).toBe(404);
  });
});
