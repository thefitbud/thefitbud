import initSqlJs from "sql.js";
import { drizzle } from "drizzle-orm/sql-js";
import { eq } from "drizzle-orm";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import * as schema from "../db/schema.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
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

function sampleMealContent(photoRequired = false) {
  return {
    workoutDays: [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        order: 1,
        name: "Day A",
        exercises: [],
      },
    ],
    mealPrescriptions: [
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        order: 1,
        name: "Breakfast",
        scheduleHint: "Morning",
        instructions: "Oats and eggs",
        photoRequired,
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        order: 2,
        name: "Lunch",
        scheduleHint: "Midday",
        instructions: "Rice and dal",
        photoRequired: false,
      },
    ],
  };
}

async function reachEffectiveMealPlan(
  suffix: string,
  options: {
    photoRequirement?: "none" | "selected_meals" | "all_meals";
    prescriptionPhotoRequired?: boolean;
    confirmationWindowHours?: number;
  } = {},
) {
  const photoRequirement = options.photoRequirement ?? "none";
  const prescriptionPhotoRequired = options.prescriptionPhotoRequired ?? false;
  const confirmationWindowHours = options.confirmationWindowHours ?? 24;

  const trainer = await createTrainerSession(`meal-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-meal-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `meal-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `meal-trainee-${suffix}`,
    `meal-trainee-${suffix}@example.com`,
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
          goals: "Recomp",
          relevant_history: "None",
          preferences: "Home food",
          schedule: "Evenings",
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
        "Idempotency-Key": `submit-meal-${suffix}`,
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
        "Idempotency-Key": `review-meal-${suffix}`,
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
        primaryGoal: "Nutrition adherence",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 2,
          confirmationWindowHours,
          photoRequirement,
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
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-meal-${suffix}`,
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
        "Idempotency-Key": `act-meal-${suffix}`,
      },
      body: JSON.stringify({ expectedVersion: 2 }),
    },
    testEnv(),
  );

  const plan = await app.request(
    `/plans/relationships/${relationshipId}`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `plan-meal-${suffix}`,
      },
      body: JSON.stringify({
        title: "Nutrition foundation",
        content: sampleMealContent(prescriptionPhotoRequired),
      }),
    },
    testEnv(),
  );
  const planBody = (await plan.json()) as {
    data: {
      plan: { id: string };
      version: { id: string; recordVersion: number };
    };
  };
  await app.request(
    `/plans/${planBody.data.plan.id}/versions/${planBody.data.version.id}/publish`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `pub-meal-${suffix}`,
      },
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const toDate = addDaysToLocalDate(today, 1);
  const generated = await app.request(
    `/meals/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-meal-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );
  expect(generated.status).toBe(200);

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    today,
    toDate,
  };
}

describe("meal assignment and compliance", () => {
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

  it("returns 401 for unauthenticated assignment list", async () => {
    const response = await app.request(
      "/meals/relationships/00000000-0000-4000-8000-000000000099/assignments",
      {},
      testEnv(),
    );
    expect(response.status).toBe(401);
  });

  it("rejects trainer confirming a trainee meal", async () => {
    const { trainerCookie, relationshipId, today, toDate } =
      await reachEffectiveMealPlan("auth");
    const listed = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${toDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      data: { items: Array<{ id: string }> };
    };
    expect(listBody.data.items.length).toBeGreaterThan(0);

    const confirm = await app.request(
      `/meals/assignments/${listBody.data.items[0]!.id}/confirm`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "trainer-confirm",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirm.status).toBe(403);
  });

  it("runs confirm → deviate → skip; trainer compliance matches", async () => {
    const { trainerCookie, traineeToken, relationshipId, today, toDate } =
      await reachEffectiveMealPlan("loop");

    const listed = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listBody = (await listed.json()) as {
      data: {
        items: Array<{ id: string; status: string; mealName: string }>;
      };
    };
    expect(listBody.data.items.length).toBe(2);
    expect(listBody.data.items.every((item) => item.status === "pending")).toBe(
      true,
    );

    const breakfast = listBody.data.items.find(
      (item) => item.mealName === "Breakfast",
    )!;
    const lunch = listBody.data.items.find((item) => item.mealName === "Lunch")!;

    const confirmed = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "confirm-1",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status).toBe(200);
    const confirmedBody = (await confirmed.json()) as {
      data: { outcome: string };
    };
    expect(confirmedBody.data.outcome).toBe("confirmed");

    const duplicate = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "confirm-2",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(duplicate.status).toBe(409);

    const skipped = await app.request(
      `/meals/assignments/${lunch.id}/skip`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "skip-1",
        },
        body: JSON.stringify({ notes: "Not hungry" }),
      },
      testEnv(),
    );
    expect(skipped.status).toBe(200);

    const tomorrowListed = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${toDate}&toDate=${toDate}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const tomorrowBody = (await tomorrowListed.json()) as {
      data: { items: Array<{ id: string; mealName: string }> };
    };
    const tomorrowBreakfast = tomorrowBody.data.items.find(
      (item) => item.mealName === "Breakfast",
    )!;
    const deviate = await app.request(
      `/meals/assignments/${tomorrowBreakfast.id}/deviate`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "deviate-1",
        },
        body: JSON.stringify({
          deviationKind: "restaurant",
          notes: "Ordered grilled chicken",
        }),
      },
      testEnv(),
    );
    expect(deviate.status).toBe(200);

    const compliance = await app.request(
      `/meals/relationships/${relationshipId}/compliance?fromDate=${today}&toDate=${toDate}`,
      { headers: { Cookie: trainerCookie } },
      testEnv(),
    );
    expect(compliance.status).toBe(200);
    const complianceBody = (await compliance.json()) as {
      data: {
        totals: {
          confirmed: number;
          skipped: number;
          modified: number;
        };
        items: Array<{ status: string; mealName: string }>;
      };
    };
    expect(complianceBody.data.totals.confirmed).toBe(1);
    expect(complianceBody.data.totals.skipped).toBe(1);
    expect(complianceBody.data.totals.modified).toBe(1);
  });

  it("requires photo intent when configured; allows confirm without photo when not required", async () => {
    const required = await reachEffectiveMealPlan("photo-req", {
      photoRequirement: "selected_meals",
      prescriptionPhotoRequired: true,
    });
    const listed = await app.request(
      `/meals/relationships/${required.relationshipId}/assignments?fromDate=${required.today}&toDate=${required.today}`,
      {
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const listBody = (await listed.json()) as {
      data: {
        items: Array<{ id: string; mealName: string; photoRequired: boolean }>;
      };
    };
    const breakfast = listBody.data.items.find(
      (item) => item.mealName === "Breakfast",
    )!;
    expect(breakfast.photoRequired).toBe(true);

    const blocked = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "photo-block",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(blocked.status).toBe(422);

    const target = await app.request(
      "/files/upload-targets",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "meal-photo-target",
        },
        body: JSON.stringify({
          coachingRelationshipId: required.relationshipId,
          mediaType: "meal_photo",
          contentType: "image/png",
        }),
      },
      testEnv(),
    );
    expect(target.status).toBe(200);
    const targetBody = (await target.json()) as {
      data: { mediaAsset: { id: string }; uploadUrl: string };
    };
    const uploaded = await app.request(
      targetBody.data.uploadUrl,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "image/png",
        },
        body: Uint8Array.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00,
          0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00,
          0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde,
          0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63,
          0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05,
          0xfe, 0xd4, 0xef, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44,
          0xae, 0x42, 0x60, 0x82,
        ]),
      },
      testEnv(),
    );
    expect(uploaded.status).toBe(200);

    const withIntent = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "photo-ok",
        },
        body: JSON.stringify({
          photoIntent: {
            notedAt: new Date().toISOString(),
            mediaAssetId: targetBody.data.mediaAsset.id,
            contentType: "image/png",
            clientRef: "local-draft-1",
          },
        }),
      },
      testEnv(),
    );
    expect(withIntent.status).toBe(200);

    const lunch = listBody.data.items.find((item) => item.mealName === "Lunch")!;
    expect(lunch.photoRequired).toBe(false);
    const lunchConfirm = await app.request(
      `/meals/assignments/${lunch.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${required.traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "lunch-ok",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(lunchConfirm.status).toBe(200);
  });

  it("derives overdue and logged_later from window + compliance", async () => {
    const { traineeToken, relationshipId, today } =
      await reachEffectiveMealPlan("overdue", {
        confirmationWindowHours: 1,
      });

    const listed = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const listBody = (await listed.json()) as {
      data: { items: Array<{ id: string; mealName: string }> };
    };
    const breakfast = listBody.data.items.find(
      (item) => item.mealName === "Breakfast",
    )!;
    const lunch = listBody.data.items.find((item) => item.mealName === "Lunch")!;

    await db
      .update(schema.mealAssignments)
      .set({
        windowEndsAt: "2020-01-01T00:00:00.000Z",
      })
      .where(eq(schema.mealAssignments.id, breakfast.id));
    await db
      .update(schema.mealAssignments)
      .set({
        windowEndsAt: "2020-01-01T00:00:00.000Z",
      })
      .where(eq(schema.mealAssignments.id, lunch.id));

    const overdueList = await app.request(
      `/meals/relationships/${relationshipId}/assignments?fromDate=${today}&toDate=${today}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const overdueBody = (await overdueList.json()) as {
      data: { items: Array<{ id: string; status: string }> };
    };
    expect(
      overdueBody.data.items.every((item) => item.status === "overdue"),
    ).toBe(true);

    const lateConfirm = await app.request(
      `/meals/assignments/${breakfast.id}/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
          "Idempotency-Key": "late-confirm",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(lateConfirm.status).toBe(200);

    const after = await app.request(
      `/meals/assignments/${breakfast.id}`,
      {
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
        },
      },
      testEnv(),
    );
    const afterBody = (await after.json()) as {
      data: { status: string };
    };
    expect(afterBody.data.status).toBe("logged_later");
  });
});
