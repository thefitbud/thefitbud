import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { app } from "../index.js";
import { setTestDbOverride, type Db } from "../db/client.js";
import { createTestIdToken } from "../auth/firebase.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { nowIso } from "../lib/crypto.js";
import type { Env } from "../types.js";
import { createMemoryDb } from "../test-support/memory-db.js";
import * as schema from "../db/schema.js";

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
  const setCookie = sessionResponse.headers.get("set-cookie");
  return { cookie: setCookie!.split(";")[0]! };
}

async function reachActiveTrainee(suffix: string) {
  const trainer = await createTrainerSession(`mealtime-coach-${suffix}@example.com`);
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
        recipientEmail: `mealtime-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `mealtime-trainee-${suffix}`,
    `mealtime-trainee-${suffix}@example.com`,
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
  expect(accept.status).toBe(200);
  const acceptBody = (await accept.json()) as {
    data: { relationship: { id: string; trainerUserId: string } };
  };
  return {
    traineeToken,
    trainerCookie: trainer.cookie,
    relationshipId: acceptBody.data.relationship.id,
    trainerUserId: acceptBody.data.relationship.trainerUserId,
  };
}

describe("me meal times", () => {
  let db: Db;
  let close: () => void;

  beforeEach(async () => {
    const handle = await createMemoryDb();
    db = handle.db;
    close = handle.close;
    setTestDbOverride(db);
  });

  afterEach(() => {
    setTestDbOverride(null);
    close();
  });

  it("rejects times outside 05:00–22:00", async () => {
    const { traineeToken } = await reachActiveTrainee("bounds");
    const response = await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides: [{ slotKey: "breakfast", dayPattern: "all", time: "04:30" }],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_TIME");
  });

  it("rejects meal times closer than 60 minutes apart", async () => {
    const { traineeToken } = await reachActiveTrainee("gap");
    const response = await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides: [
            { slotKey: "breakfast", dayPattern: "all", time: "08:00" },
            { slotKey: "lunch", dayPattern: "all", time: "08:30" },
          ],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("INVALID_MEAL_TIME_GAP");
  });

  it("blocks updates when the relationship has ended", async () => {
    const { traineeToken } = await reachActiveTrainee("ended");
    const [rel] = await db.select().from(schema.coachingRelationships).limit(1);
    const endedAt = nowIso();
    await db
      .update(schema.coachingRelationships)
      .set({ status: "ended", endedAt, updatedAt: endedAt })
      .where(eq(schema.coachingRelationships.id, rel!.id));

    const response = await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          overrides: [{ slotKey: "breakfast", dayPattern: "all", time: "08:00" }],
        }),
      },
      testEnv(),
    );
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("RELATIONSHIP_NOT_FOUND");
  });

  it("notifies the trainer once for two quick meal-time edits and reschedules assignments", async () => {
    const ctx = await reachActiveTrainee("notify");
    const today = new Date().toISOString().slice(0, 10);
    const planId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    const versionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
    const assignmentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
    const now = nowIso();
    await db.insert(schema.plans).values({
      id: planId,
      coachingRelationshipId: ctx.relationshipId,
      title: "Meal times plan",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.planVersions).values({
      id: versionId,
      planId,
      versionNumber: 1,
      recordVersion: 0,
      status: "published",
      contentJson: JSON.stringify({ workoutDays: [], mealPrescriptions: [] }),
      creationSource: "blank",
      publishedAt: now,
      effectiveFrom: today,
      effectiveTo: null,
      createdAt: now,
      updatedAt: now,
    });
    const prescription = {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      order: 1,
      name: "Breakfast",
      mealType: "breakfast",
      applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
      localTime: "08:00",
      scheduleHint: null,
      instructions: null,
      photoRequired: false,
      items: [],
    };
    await db.insert(schema.mealAssignments).values({
      id: assignmentId,
      coachingRelationshipId: ctx.relationshipId,
      planId,
      planVersionId: versionId,
      mealPrescriptionId: prescription.id,
      mealName: "Breakfast",
      mealPrescriptionJson: JSON.stringify(prescription),
      localDate: today,
      windowStartsAt: now,
      windowEndsAt: now,
      photoRequired: false,
      scheduleStatus: "scheduled",
      createdAt: now,
      updatedAt: now,
    });

    const putHeaders = {
      Authorization: `Bearer ${ctx.traineeToken}`,
      "x-fitbud-role": "trainee",
      "Content-Type": "application/json",
    };
    const first = await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: putHeaders,
        body: JSON.stringify({
          overrides: [{ slotKey: "breakfast", dayPattern: "all", time: "09:00" }],
        }),
      },
      testEnv(),
    );
    expect(first.status).toBe(200);
    const second = await app.request(
      "/me/meal-times",
      {
        method: "PUT",
        headers: putHeaders,
        body: JSON.stringify({
          overrides: [{ slotKey: "breakfast", dayPattern: "all", time: "09:15" }],
        }),
      },
      testEnv(),
    );
    expect(second.status).toBe(200);

    const trainerNotes = await db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.recipientUserId, ctx.trainerUserId));
    const mealTimeAlerts = trainerNotes.filter(
      (row) => row.notificationType === "trainer_meal_times_changed",
    );
    expect(mealTimeAlerts).toHaveLength(1);

    const [rel] = await db
      .select({ traineeUserId: schema.coachingRelationships.traineeUserId })
      .from(schema.coachingRelationships)
      .where(eq(schema.coachingRelationships.id, ctx.relationshipId));
    await db
      .update(schema.traineeProfiles)
      .set({ displayName: "Priya Shah" })
      .where(eq(schema.traineeProfiles.userId, rel!.traineeUserId));

    const listed = await app.request(
      "/notifications",
      { headers: { Cookie: ctx.trainerCookie } },
      testEnv(),
    );
    expect(listed.status).toBe(200);
    const listedBody = (await listed.json()) as {
      data: {
        items: Array<{ type: string; clientDisplayName?: string }>;
      };
    };
    const listedAlert = listedBody.data.items.find(
      (item) => item.type === "trainer_meal_times_changed",
    );
    expect(listedAlert?.clientDisplayName).toBe("Priya Shah");

    const [assignment] = await db
      .select()
      .from(schema.mealAssignments)
      .where(eq(schema.mealAssignments.id, assignmentId));
    const updatedPrescription = JSON.parse(assignment!.mealPrescriptionJson) as {
      localTime: string;
    };
    expect(updatedPrescription.localTime).toBe("09:15");
  });
});
