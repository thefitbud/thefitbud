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
          primaryMuscles: ["rear delts"],
          secondaryMuscles: ["upper back"],
        }),
      },
      testEnv(),
    );
    expect(addExercise.status).toBe(201);
    const added = (await addExercise.json()) as {
      data: Record<string, unknown>;
    };
    expect(added.data.ownership).toBe("trainer");
    expect(added.data.primaryMuscles).toEqual(["rear delts"]);
    expect(added.data.secondaryMuscles).toEqual(["upper back"]);
    expect(added.data).not.toHaveProperty("defaultReps");
    expect(added.data).not.toHaveProperty("defaultLoadLabel");
    expect(added.data).not.toHaveProperty("parentExerciseId");

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

  it("archives a trainer exercise and refuses a new prescription", async () => {
    const trainer = await createTrainerSession("archive@example.com");
    const created = await app.request(
      "/libraries/exercises",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Paused press",
          instructions: "Pause at the chest.",
          primaryMuscles: ["chest"],
          secondaryMuscles: ["triceps"],
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as { data: { id: string } };

    const template = await app.request(
      "/templates",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "archive-template",
        },
        body: JSON.stringify({
          title: "Press day",
          templateType: "workout",
          content: {
            workoutDays: [
              {
                id: "12121212-1212-4121-8121-121212121212",
                order: 1,
                name: "Day A",
                exercises: [
                  {
                    id: "13131313-1313-4131-8131-131313131313",
                    order: 1,
                    sourceExerciseLibraryItemId: createdBody.data.id,
                    name: "placeholder",
                    instructions: null,
                    setTargets: [
                      {
                        id: "14141414-1414-4141-8141-141414141414",
                        order: 1,
                        reps: 8,
                        loadLabel: "RPE 7",
                        rpe: 7,
                      },
                    ],
                  },
                ],
              },
            ],
            mealPrescriptions: [],
          },
        }),
      },
      testEnv(),
    );
    expect(template.status).toBe(201);
    const templateBody = (await template.json()) as {
      data: { id: string };
    };

    const archived = await app.request(
      `/libraries/exercises/${createdBody.data.id}`,
      { method: "DELETE", headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(archived.status).toBe(200);
    const archivedBody = (await archived.json()) as {
      data: { status: string };
    };
    expect(archivedBody.data.status).toBe("archived");

    const saved = await app.request(
      `/templates/${templateBody.data.id}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(saved.status).toBe(200);
    const savedBody = (await saved.json()) as {
      data: {
        content: {
          workoutDays: Array<{
            exercises: Array<{
              name: string;
              sourceExerciseLibraryItemId?: string;
              setTargets: Array<{ reps: number | null }>;
            }>;
          }>;
        };
      };
    };
    expect(savedBody.data.content.workoutDays[0]?.exercises[0]).toMatchObject({
      name: "Paused press",
      sourceExerciseLibraryItemId: createdBody.data.id,
      primaryMuscles: ["chest"],
      setTargets: [expect.objectContaining({ reps: 8, loadLabel: "RPE 7" })],
    });

    const listed = await app.request(
      "/libraries/exercises",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const listedBody = (await listed.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(
      listedBody.data.items.some((item) => item.id === createdBody.data.id),
    ).toBe(false);

    const rejected = await app.request(
      "/templates",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "archive-template-again",
        },
        body: JSON.stringify({
          title: "Press day again",
          templateType: "workout",
          content: {
            workoutDays: [
              {
                id: "15151515-1515-4151-8151-151515151515",
                order: 1,
                name: "Day B",
                exercises: [
                  {
                    id: "16161616-1616-4161-8161-161616161616",
                    order: 1,
                    sourceExerciseLibraryItemId: createdBody.data.id,
                    name: "Paused press",
                    instructions: null,
                    setTargets: [],
                  },
                ],
              },
            ],
            mealPrescriptions: [],
          },
        }),
      },
      testEnv(),
    );
    expect(rejected.status).toBe(409);
    const rejectedBody = (await rejected.json()) as { error: { code: string } };
    expect(rejectedBody.error.code).toBe("LIBRARY_ITEM_ARCHIVED");
  });
});

describe("food library migration 0016", () => {
  it("clears portion calories and keeps trainer servings without a conversion", async () => {
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
    ]) {
      sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
    }
    sqlite.run(
      `INSERT INTO food_library_items (
         id, ownership, trainer_user_id, name, cuisine_region, portion_label,
         notes, created_at, updated_at, description, calories, protein_grams,
         carbs_grams, fat_grams
       ) VALUES (
         'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', 'trainer', NULL, 'Home dal',
         'indian', '1 katori', NULL, '2026-01-01T00:00:00.000Z',
         '2026-01-01T00:00:00.000Z', NULL, 999, 10, 20, 5
       )`,
    );
    sqlite.exec(readFileSync(join(drizzleDir, "0016_food_exercise_libraries.sql"), "utf8"));

    const foodColumns = sqlite.exec("PRAGMA table_info(food_library_items)")[0]!;
    const foodNameIndex = foodColumns.columns.indexOf("name");
    const foodNames = foodColumns.values.map((row) => row[foodNameIndex]);
    expect(foodNames).not.toContain("calories");
    expect(foodNames).not.toContain("portion_label");
    expect(foodNames).toContain("cuisine_region");
    expect(foodNames).toContain("classification");

    const exerciseColumns = sqlite.exec(
      "PRAGMA table_info(exercise_library_items)",
    )[0]!;
    const exerciseNameIndex = exerciseColumns.columns.indexOf("name");
    const exerciseNames = exerciseColumns.values.map(
      (row) => row[exerciseNameIndex],
    );
    expect(exerciseNames).not.toContain("default_reps");
    expect(exerciseNames).not.toContain("default_load_label");
    expect(exerciseNames).not.toContain("parent_exercise_id");
    expect(exerciseNames).toContain("primary_muscles_json");
    expect(exerciseNames).toContain("secondary_muscles_json");

    const trainerFood = sqlite.exec(
      `SELECT classification, nutrition_basis, energy_kcal_scaled
       FROM food_library_items
       WHERE id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'`,
    )[0]!;
    expect(trainerFood.values[0]).toEqual([null, null, null]);
    const trainerServing = sqlite.exec(
      `SELECT label, unit, conversion_scaled
       FROM food_library_servings
       WHERE food_library_item_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01'`,
    )[0]!;
    expect(trainerServing.values).toEqual([["1 katori", "portion", null]]);

    const roti = sqlite.exec(
      `SELECT classification, nutrition_basis, energy_kcal_scaled, fat_grams_scaled
       FROM food_library_items
       WHERE id = 'f1000001-0000-4000-8000-000000000001'`,
    )[0]!;
    expect(roti.values[0]).toEqual([
      "prepared_food",
      "per_100_g",
      297000000,
      7500000,
    ]);
    const rotiServings = sqlite.exec(
      `SELECT conversion_scaled
       FROM food_library_servings
       WHERE food_library_item_id = 'f1000001-0000-4000-8000-000000000001'
       ORDER BY conversion_scaled`,
    )[0]!;
    expect(rotiServings.values).toEqual([[35000000], [100000000]]);
    sqlite.close();
  });
});
