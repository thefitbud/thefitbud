import initSqlJs from "sql.js";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/sql-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deriveAge, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { nowIso } from "../lib/crypto.js";
import type { Env } from "../types.js";
import { checkins, exceptions, planVersions } from "../db/schema.js";

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
    "0017_plan_template_ownership.sql",

    "0018_assignment_schedule_status.sql",
  ]) {
    sqlite.exec(readFileSync(join(drizzleDir, file), "utf8"));
  }
  const db = drizzle(sqlite, { schema }) as unknown as Db;
  return { db, close: () => sqlite.close() };
}

function testEnv(): Env {
  return {
    DB: {
      prepare() {
        throw new Error("D1 should not be used when test DB override is set");
      },
      dump: async () => new ArrayBuffer(0),
      batch: async () => [],
      exec: async () => ({ count: 0, duration: 0 }),
    } as unknown as D1Database,
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

async function invite(
  cookie: string,
  suffix: string,
  displayName: string,
) {
  const response = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-a-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `trainee-${suffix}@example.com`,
        recipientDisplayName: displayName,
      }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as {
    data: { id: string; token: string };
  };
}

async function acceptInvite(suffix: string, token: string) {
  const traineeToken = createTestIdToken(
    `trainee-${suffix}`,
    `trainee-${suffix}@example.com`,
  );
  const response = await app.request(
    "/invitations/accept",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${traineeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token, timezone: "Asia/Kolkata" }),
    },
    testEnv(),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as {
    data: { relationship: { id: string } };
  };
  return { traineeToken, relationshipId: body.data.relationship.id };
}

async function activateCoaching(
  cookie: string,
  traineeToken: string,
  relationshipId: string,
  suffix: string,
  goalShort: string,
) {
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
          goals: "A long onboarding goal that must not become the short label",
          relevant_history: "None",
          preferences: "Gym",
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
        "Idempotency-Key": `submit-a-${suffix}`,
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
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `review-a-${suffix}`,
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
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        expectedVersion: 0,
        goalShort,
        goalDescription: "Supporting description stays off the directory row.",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 12,
          photoRequirement: "none",
        },
        checkin: { cadence: "weekly", dueWindowHours: 48 },
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
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-a-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 1 }),
    },
    testEnv(),
  );
  const activated = await app.request(
    `/configurations/relationships/${relationshipId}/activate`,
    {
      method: "POST",
      headers: {
        Cookie: cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `act-a-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );
  expect(activated.status).toBe(200);
}

type DirectoryItem = {
  relationshipId: string | null;
  invitationId: string | null;
  traineeDisplayName: string;
  status: string;
  goalShort: string | null;
  adherenceState: string;
  effectivePlan: { id: string; title: string } | null;
  nextCheckin: { id: string } | null;
};

async function listClients(cookie: string, query = "") {
  const response = await app.request(
    `/clients${query}`,
    { headers: { Cookie: cookie } },
    testEnv(),
  );
  const body = (await response.json()) as {
    data?: { items: DirectoryItem[]; nextCursor: string | null };
    error?: { code: string };
  };
  return { status: response.status, body };
}

describe("iteration A directory, profile, and libraries", () => {
  let db: Db;
  let closeDb: () => void;

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

  it("pages, filters, and hides other trainers and non-pending invitations", async () => {
    const trainer = await createTrainerSession("directory-a@example.com");
    const other = await createTrainerSession("directory-b@example.com");
    const pendingA = await invite(trainer.cookie, "ada", "Ada Lovelace");
    const pendingB = await invite(trainer.cookie, "grace", "Grace Hopper");
    const accepted = await invite(trainer.cookie, "asha", "Asha Menon");
    const client = await acceptInvite("asha", accepted.data.token);
    await activateCoaching(
      trainer.cookie,
      client.traineeToken,
      client.relationshipId,
      "asha",
      "Build strength",
    );
    await invite(other.cookie, "other", "Other Client");

    const traineeList = await app.request(
      "/clients",
      {
        headers: {
          Authorization: `Bearer ${client.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(traineeList.status).toBe(403);

    const first = await listClients(trainer.cookie, "?limit=1");
    expect(first.status).toBe(200);
    expect(first.body.data?.items).toHaveLength(1);
    expect(first.body.data?.nextCursor).toBeTruthy();
    const seen = new Set<string>();
    let cursor: string | null = first.body.data?.nextCursor ?? null;
    seen.add(
      first.body.data!.items[0]!.relationshipId ??
        first.body.data!.items[0]!.invitationId!,
    );
    while (cursor) {
      const page = await listClients(
        trainer.cookie,
        `?limit=1&cursor=${encodeURIComponent(cursor)}`,
      );
      expect(page.status).toBe(200);
      for (const item of page.body.data?.items ?? []) {
        const id = item.relationshipId ?? item.invitationId;
        expect(seen.has(id!)).toBe(false);
        seen.add(id!);
      }
      cursor = page.body.data?.nextCursor ?? null;
    }
    expect(seen).toEqual(
      new Set([pendingA.data.id, pendingB.data.id, client.relationshipId]),
    );
    expect(seen.has(accepted.data.id)).toBe(false);

    const otherList = await listClients(other.cookie);
    expect(otherList.body.data?.items.map((item) => item.relationshipId)).not.toContain(
      client.relationshipId,
    );
    expect(
      otherList.body.data?.items.every((item) => item.traineeDisplayName === "Other Client"),
    ).toBe(true);

    const byGoal = await listClients(
      trainer.cookie,
      "?goal=Build%20strength&status=active&adherenceState=no_recent_data",
    );
    expect(byGoal.body.data?.items).toEqual([
      expect.objectContaining({
        relationshipId: client.relationshipId,
        goalShort: "Build strength",
        status: "active",
        adherenceState: "no_recent_data",
        effectivePlan: null,
      }),
    ]);

    const byName = await listClients(trainer.cookie, "?q=grace.hopper");
    expect(byName.body.data?.items).toHaveLength(0);
    const byEmail = await listClients(trainer.cookie, "?q=trainee-grace@example.com");
    expect(byEmail.body.data?.items).toEqual([
      expect.objectContaining({
        invitationId: pendingB.data.id,
        relationshipId: null,
        status: "invited",
        adherenceState: "not_available",
      }),
    ]);

    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    const timestamp = nowIso();
    await db.insert(checkins).values({
      id: "12121212-1212-4121-8121-121212121212",
      coachingRelationshipId: client.relationshipId,
      localDate: today,
      windowStartsAt: timestamp,
      windowEndsAt: timestamp,
      recordStatus: "submitted",
      recordVersion: 1,
      definitionVersion: 1,
      submittedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const onTrack = await listClients(trainer.cookie, "?status=active");
    expect(onTrack.body.data?.items[0]?.adherenceState).toBe("on_track");

    await db.insert(exceptions).values({
      id: "13131313-1313-4131-8131-131313131313",
      coachingRelationshipId: client.relationshipId,
      type: "missed_workout",
      status: "detected",
      ruleVersion: "1",
      sourceEntityType: "workout_assignment",
      sourceEntityId: "14141414-1414-4141-8141-141414141414",
      summary: "Missed session",
      detectedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const attention = await listClients(trainer.cookie, "?status=active");
    expect(attention.body.data?.items[0]?.adherenceState).toBe("needs_attention");

    await db
      .update(exceptions)
      .set({ status: "acknowledged", acknowledgedAt: timestamp })
      .where(eq(exceptions.id, "13131313-1313-4131-8131-131313131313"));
    const afterAck = await listClients(trainer.cookie, "?status=active");
    expect(afterAck.body.data?.items[0]?.adherenceState).toBe("on_track");
  });

  it("does not publish a draft when the directory is read", async () => {
    const trainer = await createTrainerSession("plans-a@example.com");
    const invited = await invite(trainer.cookie, "plan", "Plan Client");
    const client = await acceptInvite("plan", invited.data.token);
    await activateCoaching(
      trainer.cookie,
      client.traineeToken,
      client.relationshipId,
      "plan",
      "Stay consistent",
    );
    const created = await app.request(
      `/plans/relationships/${client.relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "plan-draft-a",
        },
        body: JSON.stringify({
          title: "Draft only",
          content: {
            workoutDays: [
              {
                id: "15151515-1515-4151-8151-151515151515",
                order: 1,
                name: "Day A",
                exercises: [],
              },
            ],
            mealPrescriptions: [],
          },
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { version: { id: string; status: string } };
    };
    const listed = await listClients(trainer.cookie, "?status=active");
    expect(listed.body.data?.items[0]?.effectivePlan).toBeNull();
    const [version] = await db
      .select({ status: planVersions.status })
      .from(planVersions)
      .where(eq(planVersions.id, createdBody.data.version.id));
    expect(version?.status).toBe("draft");
  });

  it("stores trainee age inputs and derives workspace age without exposing the birth date", async () => {
    const trainer = await createTrainerSession("profile-a@example.com");
    const invited = await invite(trainer.cookie, "profile", "Profile Client");
    const client = await acceptInvite("profile", invited.data.token);
    const denied = await app.request(
      "/me/trainee-profile",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(denied.status).toBe(403);

    const future = await app.request(
      "/me/trainee-profile",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${client.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dateOfBirth: "2999-01-01", gender: "female" }),
      },
      testEnv(),
    );
    expect(future.status).toBe(400);

    const saved = await app.request(
      "/me/trainee-profile",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${client.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dateOfBirth: "1990-05-15", gender: "female" }),
      },
      testEnv(),
    );
    expect(saved.status).toBe(200);
    const profile = (await saved.json()) as {
      data: { dateOfBirth: string; gender: string; displayName: string };
    };
    expect(profile.data).toMatchObject({
      dateOfBirth: "1990-05-15",
      gender: "female",
    });

    const workspace = await app.request(
      `/workspaces/relationships/${client.relationshipId}`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(workspace.status).toBe(200);
    const workspaceBody = (await workspace.json()) as {
      data: {
        header: {
          adherenceState: string;
          traineeProfile: {
            displayName: string;
            age: number | null;
            gender: string | null;
          };
        };
      };
    };
    const today = formatLocalDate(new Date(), "Asia/Kolkata");
    expect(workspaceBody.data.header.adherenceState).toBe("not_available");
    expect(workspaceBody.data.header.traineeProfile).toEqual({
      displayName: profile.data.displayName,
      age: deriveAge("1990-05-15", today),
      gender: "female",
    });
    expect(JSON.stringify(workspaceBody.data.header)).not.toContain("1990-05-15");
  });

  it("filters library metadata and keeps meal snapshots independent of later library edits", async () => {
    const trainer = await createTrainerSession("library-a@example.com");
    const press = await app.request(
      "/libraries/exercises",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Dumbbell bench press",
          primaryMuscles: ["chest"],
          secondaryMuscles: ["triceps"],
          equipment: ["dumbbell"],
          difficulty: "beginner",
        }),
      },
      testEnv(),
    );
    expect(press.status).toBe(201);
    const row = await app.request(
      "/libraries/exercises",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Barbell row",
          primaryMuscles: ["upper back"],
          secondaryMuscles: ["biceps"],
          equipment: ["barbell"],
          difficulty: "advanced",
        }),
      },
      testEnv(),
    );
    expect(row.status).toBe(201);

    const filtered = await app.request(
      "/libraries/exercises?q=press&muscleGroup=chest&equipment=dumbbell&difficulty=beginner",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as {
      data: { items: Array<{ name: string }> };
    };
    expect(filteredBody.data.items.map((item) => item.name)).toEqual([
      "Dumbbell bench press",
    ]);

    const food = await app.request(
      "/libraries/foods",
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Dal tadka",
          classification: "prepared_food",
          basis: "per_100_g",
          description: "Home style",
          energyKcal: 180,
          proteinGrams: 9,
          carbsGrams: 22,
          fatGrams: 6,
          servings: [
            { label: "1 katori", unit: "katori", conversion: 180 },
            { label: "100 g", unit: "g", conversion: 100 },
          ],
        }),
      },
      testEnv(),
    );
    expect(food.status).toBe(201);
    const foodBody = (await food.json()) as {
      data: {
        id: string;
        servings: Array<{ id: string; label: string }>;
      };
    };
    const hundredGram = foodBody.data.servings.find(
      (serving) => serving.label === "100 g",
    );
    expect(hundredGram).toBeTruthy();
    const found = await app.request(
      "/libraries/foods?q=tadka",
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    const foundBody = (await found.json()) as {
      data: { items: Array<{ id: string; calories: number }> };
    };
    expect(foundBody.data.items.map((item) => item.id)).toContain(foodBody.data.id);

    const invited = await invite(trainer.cookie, "meal", "Meal Client");
    const client = await acceptInvite("meal", invited.data.token);
    await activateCoaching(
      trainer.cookie,
      client.traineeToken,
      client.relationshipId,
      "meal",
      "Eat consistently",
    );
    const mealId = "16161616-1616-4161-8161-161616161616";
    const created = await app.request(
      `/plans/relationships/${client.relationshipId}`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "meal-snapshot",
        },
        body: JSON.stringify({
          title: "Lunch pattern",
          content: {
            workoutDays: [],
            mealPrescriptions: [
              {
                id: mealId,
                order: 1,
                name: "Lunch",
                scheduleHint: "13:00",
                instructions: null,
                photoRequired: false,
                items: [
                  {
                    snapshotKind: "calculated",
                    sourceFoodLibraryItemId: foodBody.data.id,
                    sourceServingId: hundredGram!.id,
                    name: "Dal tadka",
                    classification: "prepared_food",
                    basis: "per_100_g",
                    canonical: {
                      energyKcalScaled: 1,
                      proteinScaled: 1,
                      carbsScaled: 1,
                      fatScaled: 1,
                    },
                    serving: {
                      label: "100 g",
                      unit: "g",
                      conversionScaled: 100_000_000,
                    },
                    quantityScaled: 1_000_000,
                    calculated: {
                      energyKcalScaled: 1,
                      proteinScaled: 1,
                      carbsScaled: 1,
                      fatScaled: 1,
                      partial: false,
                    },
                  },
                ],
              },
            ],
          },
        }),
      },
      testEnv(),
    );
    expect(created.status).toBe(201);
    const createdBody = (await created.json()) as {
      data: { plan: { id: string }; version: { id: string; recordVersion: number } };
    };
    await app.request(
      `/libraries/foods/${foodBody.data.id}`,
      {
        method: "PUT",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Dal tadka",
          classification: "prepared_food",
          basis: "per_100_g",
          energyKcal: 999,
          proteinGrams: 1,
          carbsGrams: 1,
          fatGrams: 1,
          servings: [
            { label: "1 katori", unit: "katori", conversion: 180 },
            { label: "100 g", unit: "g", conversion: 100 },
          ],
        }),
      },
      testEnv(),
    );
    const published = await app.request(
      `/plans/${createdBody.data.plan.id}/versions/${createdBody.data.version.id}/publish`,
      {
        method: "POST",
        headers: {
          Cookie: trainer.cookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "meal-publish",
        },
        body: JSON.stringify({
          expectedRecordVersion: createdBody.data.version.recordVersion,
          mode: "immediate",
        }),
      },
      testEnv(),
    );
    expect(published.status).toBe(200);

    const beforeEditRead = await app.request(
      `/plans/relationships/${client.relationshipId}/effective`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(beforeEditRead.status).toBe(200);
    const beforeEditBody = (await beforeEditRead.json()) as {
      data: {
        version: {
          content: {
            mealPrescriptions: Array<{
              items: Array<{
                sourceFoodLibraryItemId?: string;
                calculated: { energyKcalScaled: number };
              }>;
            }>;
          };
        };
      };
    };
    expect(beforeEditBody.data.version.content.mealPrescriptions[0]?.items).toEqual([
      expect.objectContaining({
        snapshotKind: "calculated",
        sourceFoodLibraryItemId: foodBody.data.id,
        sourceServingId: hundredGram!.id,
        calculated: expect.objectContaining({
          energyKcalScaled: 180_000_000,
          proteinScaled: 9_000_000,
        }),
      }),
    ]);
    expect(
      beforeEditBody.data.version.content.mealPrescriptions[0]?.items[0]
        ?.calculated.energyKcalScaled,
    ).not.toBe(999_000_000);

    await db
      .update(planVersions)
      .set({
        contentJson: JSON.stringify({
          workoutDays: [],
          mealPrescriptions: [
            {
              id: mealId,
              order: 1,
              name: "Lunch",
              scheduleHint: "13:00",
              instructions: null,
              photoRequired: false,
            },
          ],
        }),
      })
      .where(eq(planVersions.id, createdBody.data.version.id));

    const effective = await app.request(
      `/plans/relationships/${client.relationshipId}/effective`,
      { headers: { Cookie: trainer.cookie } },
      testEnv(),
    );
    expect(effective.status).toBe(200);
    const effectiveBody = (await effective.json()) as {
      data: {
        version: {
          status: string;
          content: {
            mealPrescriptions: Array<{ items: unknown[] }>;
          };
        };
      };
    };
    expect(effectiveBody.data.version.status).toBe("effective");
    expect(effectiveBody.data.version.content.mealPrescriptions[0]?.items).toEqual(
      [],
    );
  });
});
