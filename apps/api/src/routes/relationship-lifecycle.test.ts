import { and, eq, gte } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDaysToLocalDate, formatLocalDate } from "@fitbud/core";
import { app } from "../index.js";
import {
  getTestDbOverride,
  setTestDbOverride,
  type Db,
} from "../db/client.js";
import * as schema from "../db/schema.js";
import { createTestIdToken } from "../auth/firebase.js";
import { handleScheduledReplenishment } from "../jobs/replenishment.js";
import type { Env } from "../types.js";
import { createMemoryR2Bucket } from "../lib/memory-r2.js";
import { createMemoryDb as createSharedMemoryDb } from "../test-support/memory-db.js";

async function createMemoryDb(): Promise<{ db: Db; close: () => void }> {
  const handle = await createSharedMemoryDb();
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

function sampleContent() {
  return {
    workoutDays: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        order: 1,
        name: "Day A",
        weekday: 1,
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
                loadLabel: "60kg",
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
        mealType: "lunch",
        applicableWeekdays: [0, 1, 2, 3, 4, 5, 6],
        localTime: "13:00",
        scheduleHint: "Midday",
        instructions: "Rice and dal",
        photoRequired: false,
      },
    ],
  };
}

async function reachActiveWithSchedule(suffix: string) {
  const trainer = await createTrainerSession(`life-coach-${suffix}@example.com`);
  const created = await app.request(
    "/invitations",
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `inv-life-${suffix}`,
      },
      body: JSON.stringify({
        recipientEmail: `life-trainee-${suffix}@example.com`,
      }),
    },
    testEnv(),
  );
  const createdBody = (await created.json()) as { data: { token: string } };
  const traineeToken = createTestIdToken(
    `life-trainee-${suffix}`,
    `life-trainee-${suffix}@example.com`,
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
        "Idempotency-Key": `submit-life-${suffix}`,
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
        "Idempotency-Key": `review-life-${suffix}`,
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
        goalShort: "Strength",
        workout: { sessionsPerWeek: 3, completionWindowHours: 24 },
        nutrition: {
          mealsPerDay: 3,
          confirmationWindowHours: 6,
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
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `cfg-life-${suffix}`,
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
        "Idempotency-Key": `act-life-${suffix}`,
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
        "Idempotency-Key": `plan-life-${suffix}`,
      },
      body: JSON.stringify({
        title: "Foundation",
        content: sampleContent(),
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
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `pub-life-${suffix}`,
      },
      body: JSON.stringify({
        expectedRecordVersion: planBody.data.version.recordVersion,
        mode: "immediate",
      }),
    },
    testEnv(),
  );
  expect(published.status).toBe(200);

  const today = formatLocalDate(new Date(), "Asia/Kolkata");
  const toDate = addDaysToLocalDate(today, 13);
  await app.request(
    `/workouts/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-wo-life-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );
  await app.request(
    `/meals/relationships/${relationshipId}/assignments/generate`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `gen-meal-life-${suffix}`,
      },
      body: JSON.stringify({ fromDate: today, toDate }),
    },
    testEnv(),
  );

  const scheduled = await app.request(
    `/checkins/relationships/${relationshipId}/schedule`,
    {
      method: "POST",
      headers: {
        Cookie: trainer.cookie,
        "Content-Type": "application/json",
        "Idempotency-Key": `chk-life-${suffix}`,
      },
      body: JSON.stringify({ localDate: today }),
    },
    testEnv(),
  );
  expect(scheduled.status).toBe(200);

  return {
    trainerCookie: trainer.cookie,
    traineeToken,
    relationshipId,
    planId: planBody.data.plan.id,
    versionId: planBody.data.version.id,
    today,
  };
}

describe("TW-30 end and reactivate scheduling", () => {
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

  it("ends coaching by stopping today+future workouts, meals, check-ins and pending reminders", async () => {
    const { trainerCookie, relationshipId, today } =
      await reachActiveWithSchedule("end-stop");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();

    const beforeWorkouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(beforeWorkouts.length).toBeGreaterThan(0);

    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "end-stop",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const workouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(workouts).toHaveLength(0);

    const meals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(meals).toHaveLength(0);

    const draftCheckins = await db!
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.coachingRelationshipId, relationshipId),
          eq(schema.checkins.recordStatus, "draft"),
          gte(schema.checkins.localDate, today),
        ),
      );
    expect(draftCheckins).toHaveLength(0);

    const pendingNotes = await db!
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.coachingRelationshipId, relationshipId),
          eq(schema.notifications.state, "pending"),
        ),
      );
    expect(pendingNotes).toHaveLength(0);

    await handleScheduledReplenishment(testEnv());
    const afterReplenish = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(afterReplenish).toHaveLength(0);

    const nudge = await app.request(
      `/notifications/relationships/${relationshipId}/nudges`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          activityType: "workout",
          activityId: beforeWorkouts[0]!.id,
        }),
      },
      testEnv(),
    );
    expect(nudge.status).toBe(409);
    expect(((await nudge.json()) as { error: { code: string } }).error.code).toBe(
      "RELATIONSHIP_ENDED",
    );
  });

  it("after reactivate confirm keeps nothing scheduled until a plan is assigned", async () => {
    const { trainerCookie, traineeToken, relationshipId, planId, versionId, today } =
      await reachActiveWithSchedule("react-empty");
    const db = getTestDbOverride();
    expect(db).toBeTruthy();

    const ended = await app.request(
      `/relationships/${relationshipId}/end`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-end",
        },
        body: JSON.stringify({ reason: "paused" }),
      },
      testEnv(),
    );
    expect(ended.status).toBe(200);

    const reactivate = await app.request(
      `/relationships/${relationshipId}/reactivate`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-req",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(reactivate.status).toBe(200);

    const confirmed = await app.request(
      `/relationships/${relationshipId}/reactivate/confirm`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${traineeToken}`,
          "x-fitbud-role": "trainee",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      testEnv(),
    );
    expect(confirmed.status).toBe(200);

    await handleScheduledReplenishment(testEnv());

    const workouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    expect(workouts).toHaveLength(0);

    const meals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(meals).toHaveLength(0);

    const draftCheckins = await db!
      .select()
      .from(schema.checkins)
      .where(
        and(
          eq(schema.checkins.coachingRelationshipId, relationshipId),
          eq(schema.checkins.recordStatus, "draft"),
          gte(schema.checkins.localDate, today),
        ),
      );
    expect(draftCheckins).toHaveLength(0);

    // Assigning a plan restores scheduling for the chosen window.
    const assigned = await app.request(
      `/plans/${planId}/versions/${versionId}/assign`,
      {
        method: "POST",
        headers: {
          Cookie: trainerCookie,
          "Content-Type": "application/json",
          "Idempotency-Key": "react-empty-assign",
        },
        body: JSON.stringify({
          effectiveFrom: new Date(`${today}T00:00:00.000+05:30`).toISOString(),
          window: 7,
          dietChangeScope: "today_onward",
          notifyClient: false,
        }),
      },
      testEnv(),
    );
    expect(assigned.status).toBe(200);
    const assignedBody = (await assigned.json()) as {
      data: { created: { workouts: number; meals: number }; dates: string[] };
    };
    expect(
      assignedBody.data.created.workouts + assignedBody.data.created.meals,
    ).toBeGreaterThan(0);

    const afterWorkouts = await db!
      .select()
      .from(schema.workoutAssignments)
      .where(
        and(
          eq(schema.workoutAssignments.coachingRelationshipId, relationshipId),
          eq(schema.workoutAssignments.scheduleStatus, "scheduled"),
          gte(schema.workoutAssignments.localDate, today),
        ),
      );
    const afterMeals = await db!
      .select()
      .from(schema.mealAssignments)
      .where(
        and(
          eq(schema.mealAssignments.coachingRelationshipId, relationshipId),
          eq(schema.mealAssignments.scheduleStatus, "scheduled"),
          gte(schema.mealAssignments.localDate, today),
        ),
      );
    expect(afterWorkouts.length + afterMeals.length).toBeGreaterThan(0);
  });
});
